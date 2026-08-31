import assert from "node:assert/strict";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { refreshGithubStats } from "../scripts/refresh-github-stats.mjs";
import {
  assertOnlyTargetRemains,
  FIRST_URL,
  fixture,
  jsonResponse,
  NOW,
  repository,
  SECOND_URL,
  SENTINEL,
} from "../test-support/refresh-github-stats-fixture.mjs";

for (const [name, expectedError, fetchImpl] of [
  ["HTTP failure", /HTTP 503/, async () => jsonResponse({ message: "unavailable" }, { status: 503 })],
  ["network failure", /offline/, async () => { throw new Error("offline"); }],
  ["malformed JSON", /JSON|Unexpected token/, async () => new Response("not-json", { status: 200 })],
  ["malformed repository", /repository 0/, async () => jsonResponse([null])],
  ["later-page failure", /page two offline/, async (url) => url === FIRST_URL
    ? jsonResponse([repository({ stargazers_count: 9 })], { link: `<${SECOND_URL}>; rel="next"` })
    : Promise.reject(new Error("page two offline"))],
]) {
  test(`preserves last-good bytes and cleans temp files after ${name}`, async (t) => {
    const { directory, targetPath } = await fixture(t, SENTINEL);

    await assert.rejects(refreshGithubStats({ targetPath, fetchImpl, now: NOW, timeoutMs: 100 }), expectedError);

    assert.deepEqual(await readFile(targetPath), SENTINEL);
    await assertOnlyTargetRemains(directory);
  });
}

test("times out a fetch that never settles without touching the target", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  const startedAt = performance.now();
  let requestSignal;
  const fetchImpl = async (_url, options) => {
    requestSignal = options.signal;
    return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("GitHub repository request timed out")));
    });
  };

  await assert.rejects(refreshGithubStats({ targetPath, fetchImpl, now: NOW, timeoutMs: 10 }), /timed out/i);

  assert.ok(performance.now() - startedAt < 1000);
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(await readFile(targetPath), SENTINEL);
  await assertOnlyTargetRemains(directory);
});

function stalledBody(options) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("GitHub repository request timed out")));
    }),
  };
}

test("times out a response body that never settles without touching the target", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  let requestSignal;
  const refresh = refreshGithubStats({
    targetPath,
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      return stalledBody(options);
    },
    now: NOW,
    timeoutMs: 10,
  });

  const outcome = await Promise.race([
    refresh.then(() => "resolved", () => "rejected"),
    new Promise((resolve) => setTimeout(() => resolve("still pending"), 100)),
  ]);

  assert.equal(outcome, "rejected");
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(await readFile(targetPath), SENTINEL);
  await assertOnlyTargetRemains(directory);
});

test("times out a stalled page-two response body without publishing page one", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  const fetchImpl = async (url, options) => url === FIRST_URL
    ? jsonResponse([repository({ stargazers_count: 9 })], { link: `<${SECOND_URL}>; rel="next"` })
    : stalledBody(options);
  const refresh = refreshGithubStats({ targetPath, fetchImpl, now: NOW, timeoutMs: 10 });

  const outcome = await Promise.race([
    refresh.then(() => "resolved", (error) => error.message),
    new Promise((resolve) => setTimeout(() => resolve("still pending"), 100)),
  ]);

  assert.match(outcome, /timed out/i);
  assert.deepEqual(await readFile(targetPath), SENTINEL);
  await assertOnlyTargetRemains(directory);
});

test("cleans a partial temp file after a write failure and preserves the target", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  const fileSystem = {
    mkdir,
    readFile,
    rename,
    rm,
    async writeFile(path, bytes) {
      await writeFile(path, bytes.subarray(0, 8));
      throw new Error("disk full");
    },
  };

  await assert.rejects(refreshGithubStats({
    targetPath,
    fetchImpl: async () => jsonResponse([]),
    now: NOW,
    timeoutMs: 100,
    fileSystem,
  }), /disk full/);

  assert.deepEqual(await readFile(targetPath), SENTINEL);
  await assertOnlyTargetRemains(directory);
});

test("preserves an unrelated colliding temp file after exclusive create reports EEXIST", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  const collisionBytes = Buffer.from("unrelated-collision\n", "utf8");
  let collisionPath;
  const fileSystem = {
    mkdir,
    readFile,
    rename,
    rm,
    async writeFile(path) {
      collisionPath = path;
      await writeFile(path, collisionBytes, { flag: "wx" });
      const error = new Error("exclusive create collision");
      error.code = "EEXIST";
      throw error;
    },
  };

  await assert.rejects(refreshGithubStats({
    targetPath,
    fetchImpl: async () => jsonResponse([]),
    now: NOW,
    timeoutMs: 100,
    fileSystem,
  }), /exclusive create collision/);

  assert.deepEqual(await readFile(targetPath), SENTINEL);
  assert.deepEqual(await readFile(collisionPath), collisionBytes);
  assert.deepEqual((await readdir(directory)).sort(), ["github-stats.json", collisionPath.split(/[\\/]/).at(-1)].sort());
});

test("cleans the temp file after a rename failure and preserves the target", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  const fileSystem = {
    mkdir,
    readFile,
    writeFile,
    rm,
    async rename() {
      throw new Error("rename denied");
    },
  };

  await assert.rejects(refreshGithubStats({
    targetPath,
    fetchImpl: async () => jsonResponse([]),
    now: NOW,
    timeoutMs: 100,
    fileSystem,
  }), /rename denied/);

  assert.deepEqual(await readFile(targetPath), SENTINEL);
  await assertOnlyTargetRemains(directory);
});

for (const [stage, createFailureOperations] of [
  ["write", (primaryError) => ({
    async writeFile(path, bytes, options) {
      await writeFile(path, bytes.subarray(0, 8), options);
      throw primaryError;
    },
    rename,
  })],
  ["rename", (primaryError) => ({
    writeFile,
    async rename() {
      throw primaryError;
    },
  })],
]) {
  test(`preserves the primary ${stage} error when owned-temp cleanup also fails`, async (t) => {
    const { directory, targetPath } = await fixture(t, SENTINEL);
    const unrelatedPath = join(directory, "unrelated.txt");
    const unrelatedBytes = Buffer.from("unrelated\n", "utf8");
    await writeFile(unrelatedPath, unrelatedBytes);
    const primaryError = new Error(`${stage} primary failure`);
    const cleanupError = new Error(`${stage} cleanup failure`);
    let temporaryPath;
    const fileSystem = {
      mkdir,
      readFile,
      ...createFailureOperations(primaryError),
      async rm(path) {
        temporaryPath = path;
        throw cleanupError;
      },
    };

    const outcome = await refreshGithubStats({
      targetPath,
      fetchImpl: async () => jsonResponse([]),
      now: NOW,
      timeoutMs: 100,
      fileSystem,
    }).then(() => null, (error) => error);

    assert.ok(outcome instanceof AggregateError);
    assert.equal(outcome.message, primaryError.message);
    assert.equal(outcome.cause, primaryError);
    assert.deepEqual(outcome.errors, [primaryError, cleanupError]);
    assert.deepEqual(await readFile(targetPath), SENTINEL);
    assert.deepEqual(await readFile(unrelatedPath), unrelatedBytes);
    assert.deepEqual((await readdir(directory)).sort(), ["github-stats.json", basename(temporaryPath), "unrelated.txt"].sort());
  });
}
