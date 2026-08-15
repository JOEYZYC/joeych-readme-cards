import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { getEventListeners } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand, terminateProcessTree } from "../test-support/process-runner.mjs";
import { cleanupOwnedPids, emergencyCleanup, runCleanupActions, runWithCleanup } from "../test-support/process-test-cleanup.mjs";

const timeoutMs = 150;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return false;
  }
}

function waitForLines(path, count) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (existsSync(path) && readFileSync(path, "utf8").trim().split("\n").length >= count) return;
    Atomics.wait(sleeper, 0, 0, 10);
  }
  throw new Error(`Timed out waiting for ${count} PID lines`);
}

async function boundedOutcome(promise) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: "hung" }), 5_000);
    promise.then(
      (value) => { clearTimeout(timer); resolve({ status: "resolved", value }); },
      (error) => { clearTimeout(timer); resolve({ status: "rejected", error }); },
    );
  });
}

test("times out a command that never exits", async () => {
  let pid;
  await runWithCleanup(async () => {
    const outcome = await boundedOutcome(runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), {
      timeoutMs,
      onSpawn(value) { pid = value; },
    }));
    assert.equal(outcome.status, "rejected");
    assert.match(outcome.error.message, /timed out/i);
    assert.equal(isAlive(pid), false);
  }, () => cleanupOwnedPids([pid]));
  console.log(`TIMEOUT_CLEANUP pid=${pid} alive=false`);
});

test("timeout removes a spawned child and grandchild without killing an unrelated process", async () => {
  const root = await mkdtemp(join(tmpdir(), "workflow-process-tree-"));
  const pidFile = join(root, "pids.txt");
  const grandchild = join(root, "grandchild.mjs");
  const child = join(root, "child.mjs");
  const parent = join(root, "parent.mjs");
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true });
  let parentPid;
  let pids;
  await runWithCleanup(async () => {
    await writeFile(grandchild, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(pidFile)}, \`grandchild=\${process.pid}\\n\`);\nsetInterval(() => {}, 1000);\n`);
    await writeFile(child, `import { spawn } from "node:child_process";\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(pidFile)}, \`child=\${process.pid}\\n\`);\nspawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: "ignore" });\nsetInterval(() => {}, 1000);\n`);
    await writeFile(parent, `import { spawn } from "node:child_process";\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(pidFile)}, \`parent=\${process.pid}\\n\`);\nspawn(process.execPath, [${JSON.stringify(child)}], { stdio: "ignore" });\nsetInterval(() => {}, 1000);\n`);
    const pending = runCommand(process.execPath, [parent], root, {
      timeoutMs: 2_000,
      onSpawn(value) { parentPid = value; },
    });
    const outcome = await boundedOutcome(pending);
    assert.equal(outcome.status, "rejected");
    pids = Object.fromEntries((await readFile(pidFile, "utf8")).trim().split("\n").map((line) => {
      const [name, pid] = line.split("=");
      return [name, Number(pid)];
    }));
    await delay(100);
    assert.deepEqual(Object.fromEntries(Object.entries(pids).map(([name, pid]) => [name, isAlive(pid)])), {
      parent: false,
      child: false,
      grandchild: false,
    });
    assert.equal(isAlive(unrelated.pid), true);
    console.log(`TREE_CLEANUP parent=${pids.parent} child=${pids.child} grandchild=${pids.grandchild} unrelated=${unrelated.pid} descendants_alive=false unrelated_alive=true`);
  }, () => runCleanupActions([
    () => cleanupOwnedPids([parentPid]),
    () => emergencyCleanup(unrelated.pid),
    () => rm(root, { recursive: true, force: true }),
  ]));
  await assert.rejects(access(root));
  assert.equal(isAlive(unrelated.pid), false);
  console.log(`TREE_FIXTURE path=${root} exists=false unrelated_alive=false`);
});

test("cancellation during output is bounded and removes listeners", async () => {
  const controller = new AbortController();
  let pid;
  let capturedStdoutBytes;
  const beforeAbortListeners = getEventListeners(controller.signal, "abort").length;
  await runWithCleanup(async () => {
    const pending = runCommand(process.execPath, ["-e", "setInterval(() => process.stdout.write('output\\n'), 1)"], process.cwd(), {
      signal: controller.signal,
      outputLimitBytes: 1024,
      onSpawn(value) { pid = value; },
    });
    await delay(timeoutMs);
    controller.abort();
    controller.abort();
    const outcome = await boundedOutcome(pending);
    assert.equal(outcome.status, "rejected");
    assert.match(outcome.error.message, /aborted/i);
    assert.ok(outcome.error.stdout.length <= 1024);
    assert.equal(getEventListeners(controller.signal, "abort").length, beforeAbortListeners);
    assert.equal(isAlive(pid), false);
    capturedStdoutBytes = Buffer.byteLength(outcome.error.stdout);
  }, () => cleanupOwnedPids([pid]));
  console.log(`CANCEL_CLEANUP pid=${pid} alive=false captured_stdout_bytes=${capturedStdoutBytes} abort_listeners=${beforeAbortListeners}`);
});

test("onSpawn exception preserves the original error and removes the owned tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "workflow-on-spawn-tree-"));
  const pidFile = join(root, "pids.txt");
  const grandchild = join(root, "grandchild.mjs");
  const child = join(root, "child.mjs");
  const parent = join(root, "parent.mjs");
  const callbackError = new Error("onSpawn fixture failure");
  let parentPid;
  let pids;
  await runWithCleanup(async () => {
    await writeFile(grandchild, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(pidFile)}, \`grandchild=\${process.pid}\\n\`);\nsetInterval(() => {}, 1000);\n`);
    await writeFile(child, `import { spawn } from "node:child_process";\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(pidFile)}, \`child=\${process.pid}\\n\`);\nspawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: "ignore" });\nsetInterval(() => {}, 1000);\n`);
    await writeFile(parent, `import { spawn } from "node:child_process";\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(pidFile)}, \`parent=\${process.pid}\\n\`);\nspawn(process.execPath, [${JSON.stringify(child)}], { stdio: "ignore" });\nsetInterval(() => {}, 1000);\n`);
    const outcome = await boundedOutcome(runCommand(process.execPath, [parent], root, {
      timeoutMs: 4_000,
      onSpawn(pid) {
        parentPid = pid;
        waitForLines(pidFile, 3);
        throw callbackError;
      },
    }));
    assert.equal(outcome.status, "rejected");
    assert.equal(outcome.error, callbackError);
    pids = Object.fromEntries(readFileSync(pidFile, "utf8").trim().split("\n").map((line) => {
      const [name, pid] = line.split("=");
      return [name, Number(pid)];
    }));
    await delay(100);
    assert.deepEqual(Object.fromEntries(Object.entries(pids).map(([name, pid]) => [name, isAlive(pid)])), {
      parent: false,
      child: false,
      grandchild: false,
    });
  }, () => runCleanupActions([
    () => cleanupOwnedPids([parentPid]),
    () => rm(root, { recursive: true, force: true }),
  ]));
  await assert.rejects(access(root));
  console.log(`ON_SPAWN_CLEANUP parent=${pids.parent} child=${pids.child} grandchild=${pids.grandchild} original_error_preserved=true temp_exists=false`);
});

test("onSpawn exception aggregates cleanup failure without masking the original", async () => {
  const callbackError = new Error("onSpawn primary failure");
  const cleanupError = new Error("tree cleanup unconfirmed");
  let pid;
  await runWithCleanup(async () => {
    const outcome = await boundedOutcome(runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), {
      onSpawn(value) {
        pid = value;
        throw callbackError;
      },
      async terminateTree(value) {
        await emergencyCleanup(value);
        throw cleanupError;
      },
    }));
    assert.equal(outcome.status, "rejected");
    assert.ok(outcome.error instanceof AggregateError);
    assert.equal(outcome.error.message, callbackError.message);
    assert.equal(outcome.error.cause, callbackError);
    assert.deepEqual(outcome.error.errors, [callbackError, cleanupError]);
    assert.equal(isAlive(pid), false);
  }, () => cleanupOwnedPids([pid]));
});

test("POSIX termination propagates a group kill failure", async () => {
  const killError = new Error("SIGTERM denied");
  const owned = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true });
  await runWithCleanup(async () => {
    await assert.rejects(terminateProcessTree(owned.pid, {
      platform: "linux",
      kill(pid, signal) {
        if (signal === 0) return;
        assert.equal(pid, -owned.pid);
        throw killError;
      },
      wait: async () => {},
    }), (error) => error === killError);
  }, () => cleanupOwnedPids([owned.pid]));
});

test("POSIX termination rejects when group death cannot be confirmed", async () => {
  const signals = [];
  const owned = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true });
  await runWithCleanup(async () => {
    await assert.rejects(terminateProcessTree(owned.pid, {
      platform: "linux",
      kill(pid, signal) {
        assert.equal(pid, -owned.pid);
        signals.push(signal);
      },
      wait: async () => {},
    }), /still alive/i);
    assert.deepEqual(signals, [0, "SIGTERM", 0, "SIGKILL", 0]);
  }, () => cleanupOwnedPids([owned.pid]));
});

test("POSIX termination propagates a wait failure", async () => {
  const waitError = new Error("termination wait failed");
  const owned = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true });
  await runWithCleanup(async () => {
    await assert.rejects(terminateProcessTree(owned.pid, {
      platform: "linux",
      kill(pid, signal) {
        assert.equal(pid, -owned.pid);
        if (signal !== 0) assert.equal(signal, "SIGTERM");
      },
      async wait() {
        throw waitError;
      },
    }), (error) => error === waitError);
  }, () => cleanupOwnedPids([owned.pid]));
});
