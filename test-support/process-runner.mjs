import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const defaultTimeoutMs = 30_000;
const defaultOutputLimitBytes = 1024 * 1024;

export class CommandTerminationError extends Error {
  constructor(reason, result, options = {}) {
    super(`Command ${reason}: ${result.executable}`, options);
    this.name = "CommandTerminationError";
    Object.assign(this, result, { reason });
  }
}

export function formatCommand(executable, args) {
  return [executable, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return false;
  }
}

async function runTaskkill(pid) {
  await new Promise((resolve, reject) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    const finish = (error) => {
      clearTimeout(timer);
      killer.off("error", onError);
      killer.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(error);
    const onClose = (code) => finish(code === 0 ? null : new Error(`taskkill failed for PID ${pid} with exit ${code}`));
    const timer = setTimeout(() => {
      killer.kill();
      finish(new Error(`taskkill timed out for PID ${pid}`));
    }, 5_000);
    killer.once("error", onError);
    killer.once("close", onClose);
  });
}

function targetExists(target, kill) {
  try {
    kill(target, 0);
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return false;
  }
}

function signalTarget(target, signal, kill) {
  try {
    kill(target, signal);
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return false;
  }
}

export async function terminateProcessTree(pid, {
  platform = process.platform,
  kill = process.kill.bind(process),
  wait = delay,
  taskkill = runTaskkill,
} = {}) {
  if (!pid) return;
  if (platform === "win32") {
    if (!processExists(pid)) return;
    await taskkill(pid);
    return;
  }
  const group = -pid;
  if (!targetExists(group, kill)) return;
  if (!signalTarget(group, "SIGTERM", kill)) return;
  await wait(250);
  if (!targetExists(group, kill)) return;
  if (!signalTarget(group, "SIGKILL", kill)) return;
  await wait(50);
  if (targetExists(group, kill)) throw new Error(`Process group ${pid} is still alive after SIGKILL`);
}

function outputCollector(limitBytes) {
  const chunks = [];
  let bytes = 0;
  return {
    append(chunk) {
      if (bytes >= limitBytes) return;
      const buffer = Buffer.from(chunk);
      const kept = buffer.subarray(0, limitBytes - bytes);
      chunks.push(kept);
      bytes += kept.length;
    },
    text() {
      return Buffer.concat(chunks, bytes).toString("utf8");
    },
  };
}

export async function runCommand(executable, args, cwd, {
  env = process.env,
  allowFailure = false,
  timeoutMs = defaultTimeoutMs,
  outputLimitBytes = defaultOutputLimitBytes,
  signal,
  onSpawn = () => {},
  terminateTree = terminateProcessTree,
} = {}) {
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, "timeoutMs must be positive");
  assert.ok(Number.isInteger(outputLimitBytes) && outputLimitBytes > 0, "outputLimitBytes must be a positive integer");
  const stdout = outputCollector(outputLimitBytes);
  const stderr = outputCollector(outputLimitBytes);
  let child;
  let terminationReason;
  let terminationFailure;
  let terminationPromise;
  let timeout;
  let onChildError;
  let onChildClose;
  let primaryFailure;
  const onAbort = () => requestTermination("aborted");
  signal?.addEventListener("abort", onAbort, { once: true });

  function requestTermination(reason) {
    if (terminationPromise) return terminationPromise;
    terminationReason = reason;
    terminationPromise = (async () => {
      if (!child?.pid) return;
      try {
        await terminateTree(child.pid);
      } catch (error) {
        terminationFailure = error;
        child.kill("SIGKILL");
      }
    })();
    return terminationPromise;
  }

  if (signal?.aborted) {
    signal.removeEventListener("abort", onAbort);
    throw new CommandTerminationError("aborted", { executable, pid: null, stdout: "", stderr: "" });
  }

  const result = await new Promise((resolveResult, reject) => {
    child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    timeout = setTimeout(() => requestTermination(`timed out after ${timeoutMs}ms`), timeoutMs);
    child.stdout.on("data", stdout.append);
    child.stderr.on("data", stderr.append);
    onChildError = reject;
    onChildClose = (code, closeSignal) => resolveResult({ code, signal: closeSignal, pid: child.pid });
    child.once("error", onChildError);
    child.once("close", onChildClose);
    try {
      onSpawn(child.pid);
    } catch (error) {
      primaryFailure = error;
      void requestTermination("onSpawn callback failed");
    }
  }).finally(() => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    child?.stdout.off("data", stdout.append);
    child?.stderr.off("data", stderr.append);
    child?.off("error", onChildError);
    child?.off("close", onChildClose);
  });
  await terminationPromise;
  Object.assign(result, { executable, stdout: stdout.text(), stderr: stderr.text() });
  if (primaryFailure && terminationFailure) {
    throw new AggregateError([primaryFailure, terminationFailure], primaryFailure.message, { cause: primaryFailure });
  }
  if (primaryFailure) throw primaryFailure;
  if (terminationReason) throw new CommandTerminationError(terminationReason, result, { cause: terminationFailure });
  if (!allowFailure) assert.equal(result.code, 0, `${executable} failed`);
  return result;
}
