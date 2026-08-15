import { spawn } from "node:child_process";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function defaultTaskkill(pid) {
  await new Promise((resolve, reject) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
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

async function confirmGone(target, kill, wait) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!targetExists(target, kill)) return;
    await wait(50);
  }
  throw new Error(`Process target ${target} is still alive after emergency cleanup`);
}

export async function emergencyCleanup(pid, {
  platform = process.platform,
  kill = process.kill.bind(process),
  taskkill = defaultTaskkill,
  wait = delay,
} = {}) {
  if (!pid) return;
  const target = platform === "win32" ? pid : -pid;
  if (!targetExists(target, kill)) return;
  let cleanupError;
  if (platform === "win32") {
    try { await taskkill(pid); } catch (error) { cleanupError = error; }
  } else {
    try { kill(target, "SIGKILL"); } catch (error) {
      if (error?.code !== "ESRCH") cleanupError = error;
    }
  }
  let confirmationError;
  try { await confirmGone(target, kill, wait); } catch (error) { confirmationError = error; }
  if (cleanupError && confirmationError) {
    throw new AggregateError([cleanupError, confirmationError], cleanupError.message, { cause: cleanupError });
  }
  if (cleanupError) throw cleanupError;
  if (confirmationError) throw confirmationError;
}

export async function cleanupOwnedPids(pids, { cleanup = emergencyCleanup, ...options } = {}) {
  const errors = [];
  for (const pid of new Set(pids.filter(Boolean))) {
    try { await cleanup(pid, options); } catch (error) {
      if (error instanceof AggregateError) errors.push(...error.errors);
      else errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Owned PID cleanup failed");
}

export async function runCleanupActions(actions) {
  const errors = [];
  for (const action of actions) {
    try { await action(); } catch (error) {
      if (error instanceof AggregateError) errors.push(...error.errors);
      else errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Test cleanup failed");
}

export async function runWithCleanup(operation, cleanup) {
  let result;
  let primaryError;
  try {
    result = await operation();
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try { await cleanup(); } catch (error) { cleanupError = error; }
  if (primaryError && cleanupError) {
    const cleanupErrors = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError];
    throw new AggregateError([primaryError, ...cleanupErrors], primaryError.message, { cause: primaryError });
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}
