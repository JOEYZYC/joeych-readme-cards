import assert from "node:assert/strict";
import test from "node:test";
import {
  SNAPSHOT_SCHEMA_VERSION,
  aggregateRepositories,
  buildGithubApiHeaders,
  fetchGithubStats,
  validateGithubStatsSnapshot,
} from "../lib/github-stats.js";

const FIRST_URL = "https://api.github.com/users/JOEYZYC/repos?per_page=100&type=owner";
const SECOND_URL = `${FIRST_URL}&page=2`;
const NOW = new Date("2026-08-15T00:00:00.000Z");

function repository(overrides = {}) {
  return { fork: false, stargazers_count: 0, language: null, ...overrides };
}

function jsonResponse(body, { status = 200, link } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (link !== undefined) headers.Link = link;
  return new Response(JSON.stringify(body), { status, headers });
}

test("exports schema version one", () => {
  assert.equal(SNAPSHOT_SCHEMA_VERSION, 1);
});

test("validates the exact canonical snapshot", () => {
  const snapshot = { schemaVersion: 1, displayYear: 2026, repositories: 2, stars: 3, languages: ["C", "Rust"] };

  assert.equal(validateGithubStatsSnapshot(snapshot), snapshot);
});

for (const [name, snapshot] of [
  ["null", null],
  ["array", []],
  ["missing key", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0 }],
  ["extra key", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: [], extra: true }],
  ["symbol key", Object.assign({ schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: [] }, { [Symbol("extra")]: true })],
  ["wrong schema", { schemaVersion: 2, displayYear: 2026, repositories: 0, stars: 0, languages: [] }],
  ["year below UTC range", { schemaVersion: 1, displayYear: 1969, repositories: 0, stars: 0, languages: [] }],
  ["year above UTC range", { schemaVersion: 1, displayYear: 10000, repositories: 0, stars: 0, languages: [] }],
  ["fractional year", { schemaVersion: 1, displayYear: 2026.5, repositories: 0, stars: 0, languages: [] }],
  ["negative repositories", { schemaVersion: 1, displayYear: 2026, repositories: -1, stars: 0, languages: [] }],
  ["unsafe repositories", { schemaVersion: 1, displayYear: 2026, repositories: Number.MAX_SAFE_INTEGER + 1, stars: 0, languages: [] }],
  ["fractional stars", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0.5, languages: [] }],
  ["non-array languages", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: "C" }],
  ["too many languages", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: ["C", "Go", "Rust", "Zig"] }],
  ["duplicate languages", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: ["C", "C"] }],
  ["empty language", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: [""] }],
  ["whitespace language", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: [" "] }],
  ["non-string language", { schemaVersion: 1, displayYear: 2026, repositories: 0, stars: 0, languages: [null] }],
]) {
  test(`rejects snapshot with ${name}`, () => {
    assert.throws(() => validateGithubStatsSnapshot(snapshot), TypeError);
  });
}

test("aggregates originals after excluding only forks and keeps archived originals", () => {
  const repositories = [
    repository({ stargazers_count: 4, language: "Rust" }),
    repository({ archived: true, stargazers_count: 3, language: "C" }),
    repository({ fork: true, stargazers_count: 999, language: "Zig" }),
    repository({ stargazers_count: null, language: null }),
    repository({ stargazers_count: undefined, language: "Rust" }),
  ];

  assert.deepEqual(aggregateRepositories(repositories, 2026), {
    schemaVersion: 1,
    displayYear: 2026,
    repositories: 4,
    stars: 7,
    languages: ["Rust", "C"],
  });
});

test("orders language-count ties by ascending Unicode code points and keeps three", () => {
  const repositories = ["ä", "Z", "A", "C"].map((language) => repository({ language }));

  assert.deepEqual(aggregateRepositories(repositories, 2026).languages, ["A", "C", "Z"]);
});

for (const [name, repositories] of [
  ["non-array payload", {}],
  ["null entry", [null]],
  ["array entry", [[]]],
  ["missing fork", [{ stargazers_count: 0, language: null }]],
  ["non-boolean fork", [repository({ fork: "false" })]],
  ["negative stars", [repository({ stargazers_count: -1 })]],
  ["unsafe stars", [repository({ stargazers_count: Number.MAX_SAFE_INTEGER + 1 })]],
  ["fractional stars", [repository({ stargazers_count: 1.5 })]],
  ["empty language", [repository({ language: "" })]],
  ["non-string language", [repository({ language: 1 })]],
]) {
  test(`rejects repository data with ${name}`, () => {
    assert.throws(() => aggregateRepositories(repositories, 2026), TypeError);
  });
}

test("rejects an unsafe aggregate star total", () => {
  const repositories = [
    repository({ stargazers_count: Number.MAX_SAFE_INTEGER }),
    repository({ stargazers_count: 1 }),
  ];

  assert.throws(() => aggregateRepositories(repositories, 2026), TypeError);
});

test("builds required headers without authorization when token is absent", () => {
  assert.deepEqual(buildGithubApiHeaders(), {
    Accept: "application/vnd.github+json",
    "User-Agent": "joeyzyc-readme-cards",
  });
});

test("adds bearer authorization when token is provided", () => {
  assert.deepEqual(buildGithubApiHeaders("secret-token"), {
    Accept: "application/vnd.github+json",
    "User-Agent": "joeyzyc-readme-cards",
    Authorization: "Bearer secret-token",
  });
});

test("fetches every page before returning one normalized snapshot", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === FIRST_URL) {
      return jsonResponse([
        repository({ stargazers_count: 2, language: "Rust" }),
        repository({ fork: true, stargazers_count: 100, language: "Zig" }),
      ], { link: `<${SECOND_URL}>; rel="next"` });
    }
    if (url === SECOND_URL) {
      return jsonResponse([
        repository({ archived: true, stargazers_count: 5, language: "C" }),
        repository({ stargazers_count: 1, language: "Rust" }),
      ]);
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const snapshot = await fetchGithubStats({ fetchImpl, token: "secret-token", now: NOW });

  assert.deepEqual(snapshot, { schemaVersion: 1, displayYear: 2026, repositories: 3, stars: 8, languages: ["Rust", "C"] });
  assert.deepEqual(calls.map(({ url }) => url), [FIRST_URL, SECOND_URL]);
  for (const { options } of calls) assert.deepEqual(options.headers, buildGithubApiHeaders("secret-token"));
});

test("uses unauthenticated headers for every page when token is absent", async () => {
  const seenHeaders = [];
  const fetchImpl = async (_url, options) => {
    seenHeaders.push(options.headers);
    return jsonResponse([]);
  };

  await fetchGithubStats({ fetchImpl, now: NOW });

  assert.deepEqual(seenHeaders, [buildGithubApiHeaders()]);
});

for (const [name, fetchImpl] of [
  ["malformed JSON", async () => new Response("not-json", { status: 200 })],
  ["non-array JSON", async () => jsonResponse({ message: "not an array" })],
  ["malformed repository", async () => jsonResponse([null])],
  ["HTTP 403", async () => jsonResponse({ message: "rate limited" }, { status: 403 })],
  ["HTTP 500", async () => jsonResponse({ message: "unavailable" }, { status: 500 })],
  ["network error", async () => { throw new Error("offline"); }],
]) {
  test(`rejects ${name} without returning empty statistics`, async () => {
    await assert.rejects(fetchGithubStats({ fetchImpl, now: NOW }));
  });
}

test("rejects an invalid next URL", async () => {
  const fetchImpl = async () => jsonResponse([], { link: "<not-a-url>; rel=\"next\"" });

  await assert.rejects(fetchGithubStats({ fetchImpl, now: NOW }), /next/i);
});

test("rejects a cross-origin next URL before sending credentials", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse([], { link: "<https://example.com/repos?page=2>; rel=\"next\"" });
  };

  await assert.rejects(fetchGithubStats({ fetchImpl, token: "secret-token", now: NOW }), /next/i);
  assert.equal(calls, 1);
});

test("rejects a nondefault-port next URL before forwarding credentials", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization });
    return jsonResponse([], { link: "<https://api.github.com:444/users/JOEYZYC/repos?page=2>; rel=\"next\"" });
  };

  await assert.rejects(fetchGithubStats({ fetchImpl, token: "secret-token", now: NOW }), TypeError);
  assert.deepEqual(calls, [{ url: FIRST_URL, authorization: "Bearer secret-token" }]);
});

test("rejects a pagination cycle", async () => {
  const fetchImpl = async (url) => url === FIRST_URL
    ? jsonResponse([], { link: `<${SECOND_URL}>; rel="next"` })
    : jsonResponse([], { link: `<${FIRST_URL}>; rel="next"` });

  await assert.rejects(fetchGithubStats({ fetchImpl, now: NOW }), /cycle/i);
});

test("rejects when page two fails instead of returning page-one statistics", async () => {
  const fetchImpl = async (url) => {
    if (url === FIRST_URL) return jsonResponse([repository({ stargazers_count: 9 })], { link: `<${SECOND_URL}>; rel="next"` });
    throw new Error("page two offline");
  };

  await assert.rejects(fetchGithubStats({ fetchImpl, now: NOW }), /page two offline/);
});
