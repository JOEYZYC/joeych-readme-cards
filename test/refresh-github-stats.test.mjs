import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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

test("writes exact canonical JSON after every GitHub page succeeds", async (t) => {
  const { directory, targetPath } = await fixture(t);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization });
    if (url === FIRST_URL) {
      return jsonResponse([
        repository({ stargazers_count: 2, language: "Rust" }),
        repository({ fork: true, stargazers_count: 99, language: "Zig" }),
      ], { link: `<${SECOND_URL}>; rel="next"` });
    }
    return jsonResponse([
      repository({ archived: true, stargazers_count: 5, language: "C" }),
      repository({ stargazers_count: 1, language: "Rust" }),
    ]);
  };

  const result = await refreshGithubStats({ targetPath, fetchImpl, token: "test-token", now: NOW, timeoutMs: 100 });

  const expected = `{
  "schemaVersion": 1,
  "displayYear": 2031,
  "repositories": 3,
  "stars": 8,
  "languages": [
    "Rust",
    "C"
  ]
}
`;
  assert.deepEqual(await readFile(targetPath), Buffer.from(expected, "utf8"));
  assert.deepEqual(calls, [
    { url: FIRST_URL, authorization: "Bearer test-token" },
    { url: SECOND_URL, authorization: "Bearer test-token" },
  ]);
  assert.deepEqual(result, { changed: true, snapshot: JSON.parse(expected) });
  await assertOnlyTargetRemains(directory);
});

test("atomically replaces an existing snapshot only after complete success", async (t) => {
  const { directory, targetPath } = await fixture(t, SENTINEL);
  const fetchImpl = async () => jsonResponse([repository({ stargazers_count: 4, language: "JavaScript" })]);

  const result = await refreshGithubStats({ targetPath, fetchImpl, now: NOW, timeoutMs: 100 });

  assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(await readFile(targetPath, "utf8")), {
    schemaVersion: 1,
    displayYear: 2031,
    repositories: 1,
    stars: 4,
    languages: ["JavaScript"],
  });
  await assertOnlyTargetRemains(directory);
});

test("leaves an unchanged snapshot file byte-identical without replacing it", async (t) => {
  const bytes = Buffer.from(`{
  "schemaVersion": 1,
  "displayYear": 2031,
  "repositories": 0,
  "stars": 0,
  "languages": []
}
`, "utf8");
  const { directory, targetPath } = await fixture(t, bytes);
  const before = await stat(targetPath);

  const result = await refreshGithubStats({ targetPath, fetchImpl: async () => jsonResponse([]), now: NOW, timeoutMs: 100 });

  const after = await stat(targetPath);
  assert.deepEqual(await readFile(targetPath), bytes);
  assert.equal(result.changed, false);
  assert.equal(after.ino, before.ino);
  assert.equal(after.birthtimeMs, before.birthtimeMs);
  assert.equal(after.mtimeMs, before.mtimeMs);
  await assertOnlyTargetRemains(directory);
});
