import assert from "node:assert/strict";
import test from "node:test";
import { cleanupOwnedPids, emergencyCleanup, runWithCleanup } from "../test-support/process-test-cleanup.mjs";

test("Windows emergency cleanup surfaces taskkill failure when PID survives", async () => {
  const taskkillError = new Error("taskkill failed");
  await assert.rejects(emergencyCleanup(101, {
    platform: "win32",
    kill(pid, signal) {
      assert.equal(pid, 101);
      assert.equal(signal, 0);
    },
    async taskkill() {
      throw taskkillError;
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, taskkillError.message);
    assert.equal(error.cause, taskkillError);
    assert.equal(error.errors[0], taskkillError);
    assert.match(error.errors[1].message, /still alive/i);
    return true;
  });
});

test("Windows emergency cleanup preserves taskkill failure when confirmation reports the PID dead", async () => {
  const taskkillCause = new Error("taskkill transport failed");
  const taskkillError = new Error("taskkill command failed", { cause: taskkillCause });
  let checks = 0;
  await assert.rejects(emergencyCleanup(105, {
    platform: "win32",
    kill(pid, signal) {
      assert.equal(pid, 105);
      assert.equal(signal, 0);
      checks += 1;
      if (checks === 2) throw Object.assign(new Error("PID is gone"), { code: "ESRCH" });
    },
    async taskkill() {
      throw taskkillError;
    },
  }), (error) => error === taskkillError && error.message === "taskkill command failed" && error.cause === taskkillCause);
  assert.equal(checks, 2);
});

test("Windows emergency cleanup preserves taskkill and confirmation failures in order", async () => {
  const taskkillCause = new Error("taskkill transport failed");
  const confirmationCause = new Error("process probe transport failed");
  const taskkillError = new Error("taskkill command failed", { cause: taskkillCause });
  const confirmationError = new Error("process confirmation failed", { cause: confirmationCause });
  let checks = 0;
  await assert.rejects(emergencyCleanup(106, {
    platform: "win32",
    kill() {
      checks += 1;
      if (checks === 2) throw confirmationError;
    },
    async taskkill() {
      throw taskkillError;
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, taskkillError.message);
    assert.equal(error.cause, taskkillError);
    assert.deepEqual(error.errors, [taskkillError, confirmationError]);
    assert.equal(error.errors[0].cause, taskkillCause);
    assert.equal(error.errors[1].cause, confirmationCause);
    return true;
  });
});

test("Windows emergency cleanup rejects when taskkill returns but PID survives", async () => {
  await assert.rejects(emergencyCleanup(102, {
    platform: "win32",
    kill() {},
    taskkill: async () => {},
  }), /still alive/i);
});

test("emergency cleanup accepts a target that is already dead before termination", async () => {
  let taskkillCalls = 0;
  await emergencyCleanup(109, {
    platform: "win32",
    kill() {
      throw Object.assign(new Error("PID is already gone"), { code: "ESRCH" });
    },
    async taskkill() {
      taskkillCalls += 1;
    },
  });
  assert.equal(taskkillCalls, 0);
});

test("POSIX emergency cleanup surfaces SIGKILL failure when process group survives", async () => {
  const killError = new Error("SIGKILL denied");
  await assert.rejects(emergencyCleanup(103, {
    platform: "linux",
    kill(pid, signal) {
      assert.equal(pid, -103);
      if (signal === "SIGKILL") throw killError;
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, killError.message);
    assert.equal(error.cause, killError);
    assert.equal(error.errors[0], killError);
    assert.match(error.errors[1].message, /still alive/i);
    return true;
  });
});

test("POSIX emergency cleanup preserves SIGKILL failure when confirmation reports the group dead", async () => {
  const killCause = new Error("kill syscall failed");
  const killError = new Error("SIGKILL command failed", { cause: killCause });
  let checks = 0;
  await assert.rejects(emergencyCleanup(107, {
    platform: "linux",
    kill(pid, signal) {
      assert.equal(pid, -107);
      if (signal === "SIGKILL") throw killError;
      assert.equal(signal, 0);
      checks += 1;
      if (checks === 2) throw Object.assign(new Error("group is gone"), { code: "ESRCH" });
    },
  }), (error) => error === killError && error.message === "SIGKILL command failed" && error.cause === killCause);
  assert.equal(checks, 2);
});

test("POSIX emergency cleanup preserves SIGKILL and confirmation failures in order", async () => {
  const killCause = new Error("kill syscall failed");
  const confirmationCause = new Error("group probe transport failed");
  const killError = new Error("SIGKILL command failed", { cause: killCause });
  const confirmationError = new Error("group confirmation failed", { cause: confirmationCause });
  let checks = 0;
  await assert.rejects(emergencyCleanup(108, {
    platform: "linux",
    kill(pid, signal) {
      assert.equal(pid, -108);
      if (signal === "SIGKILL") throw killError;
      checks += 1;
      if (checks === 2) throw confirmationError;
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, killError.message);
    assert.equal(error.cause, killError);
    assert.deepEqual(error.errors, [killError, confirmationError]);
    assert.equal(error.errors[0].cause, killCause);
    assert.equal(error.errors[1].cause, confirmationCause);
    return true;
  });
});

test("POSIX emergency cleanup rejects when process group survives SIGKILL", async () => {
  await assert.rejects(emergencyCleanup(104, {
    platform: "linux",
    kill() {},
  }), /still alive/i);
});

test("owned PID cleanup attempts every PID and aggregates failures", async () => {
  const first = new Error("first cleanup failed");
  const second = new Error("second cleanup failed");
  const attempted = [];
  await assert.rejects(cleanupOwnedPids([201, 202, 203], {
    async cleanup(pid) {
      attempted.push(pid);
      if (pid === 201) throw first;
      if (pid === 203) throw second;
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [first, second]);
    return true;
  });
  assert.deepEqual(attempted, [201, 202, 203]);
});

test("owned PID cleanup aggregates every nested failure after attempting every PID", async () => {
  const first = new Error("termination failed");
  const second = new Error("confirmation failed");
  const third = new Error("second PID cleanup failed");
  const attempted = [];
  await assert.rejects(cleanupOwnedPids([204, 205], {
    async cleanup(pid) {
      attempted.push(pid);
      if (pid === 204) throw new AggregateError([first, second], first.message, { cause: first });
      throw third;
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [first, second, third]);
    return true;
  });
  assert.deepEqual(attempted, [204, 205]);
});

test("cleanup preserves a primary assertion and attaches all cleanup failures", async () => {
  const primary = new assert.AssertionError({ message: "primary assertion failed" });
  const first = new Error("first cleanup failed");
  const second = new Error("second cleanup failed");
  await assert.rejects(runWithCleanup(async () => { throw primary; }, async () => {
    throw new AggregateError([first, second], "owned PID cleanup failed");
  }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, primary.message);
    assert.equal(error.cause, primary);
    assert.deepEqual(error.errors, [primary, first, second]);
    return true;
  });
});

test("owned PID cleanup never targets an unrelated PID", async () => {
  const attempted = [];
  await cleanupOwnedPids([301, 302], {
    async cleanup(pid) { attempted.push(pid); },
  });
  assert.deepEqual(attempted, [301, 302]);
  assert.equal(attempted.includes(303), false);
});
