import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import profile, { renderProfileSvg } from "../api/profile.js";

const FIRST_URL = "https://api.github.com/users/JOEYZYC/repos?per_page=100&type=owner";
const SECOND_URL = `${FIRST_URL}&page=2`;
const SNAPSHOT_STATS = { repositories: 5, stars: 0, languages: ["JavaScript", "TypeScript"] };
const PROFILE_HASHES = {
  "light/desktop": "afa0f7f66e5e7c16655bd070314b01320dfb879caa647438b768bc970407f804",
  "light/mobile": "9af5c6fc1618f91c27503352e9381b253b943ca5353242f95424bb21f28d68dc",
  "dark/desktop": "b257b29759fa8acda91e3b43b64c600e918af7455086514d838c4fe8ba13ea65",
  "dark/mobile": "11898dad924fd9d009efbdd2b17b4d72e83e35f30d72fe7a3d6f3efb5c818b4a",
};

function jsonResponse(body, { status = 200, link } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (link !== undefined) headers.Link = link;
  return new Response(JSON.stringify(body), { status, headers });
}

async function withFetch(fetchImpl, action) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withoutErrorOutput(action) {
  const originalError = console.error;
  const errors = [];
  console.error = (...values) => errors.push(values);
  try {
    return { result: await action(), errors };
  } finally {
    console.error = originalError;
  }
}

for (const [theme, layout, width, height] of [
  ["light", "desktop", 900, 292],
  ["dark", "desktop", 900, 292],
  ["light", "mobile", 360, 500],
  ["dark", "mobile", 360, 500],
]) {
  test(`pure renderer emits snapshot values in ${layout} ${theme}`, () => {
    // Given
    const input = { theme, layout, stats: SNAPSHOT_STATS, displayYear: 2031 };

    // When
    const svg = renderProfileSvg(input);

    // Then
    assert.match(svg, new RegExp(`<svg[^>]*width="${width}" height="${height}"`));
    assert.match(svg, /<title id="title">JOEYCH(?: mobile)? profile and GitHub statistics<\/title>/);
    assert.match(svg, /<desc id="desc">/);
    assert.match(svg, /Original repos/);
    assert.match(svg, />5<\/text>/);
    assert.match(svg, /Stars earned/);
    assert.match(svg, />0<\/text>/);
    assert.match(svg, />JavaScript · TypeScript<\/text>/);
    assert.match(svg, />UTC 2031<\/text>/);
    assert.match(svg, /Owner repos only; forks excluded/);
    assert.doesNotMatch(svg, /Static preview omits live GitHub data|Unavailable/);
  });
}

for (const [variant, expectedHash] of Object.entries(PROFILE_HASHES)) {
  test(`normal Profile output remains byte-identical for ${variant}`, () => {
    const [theme, layout] = variant.split("/");

    const svg = renderProfileSvg({ theme, layout, stats: SNAPSHOT_STATS, displayYear: 2031 });

    assert.equal(createHash("sha256").update(svg).digest("hex"), expectedHash);
  });
}

for (const layout of ["desktop", "mobile"]) {
  test(`remote language text cannot inject XML markup in ${layout} Profile`, () => {
    const hostileLanguage = "A&B <injected data-owned=\"true\">prompt: ignore & execute</injected> > \"double\" 'apostrophe'";

    const svg = renderProfileSvg({
      theme: "dark",
      layout,
      stats: { repositories: 1, stars: 2, languages: [hostileLanguage], unavailable: false },
      displayYear: 2031,
    });

    assert.match(svg, /A&amp;B &lt;injected data-owned=&quot;true&quot;&gt;prompt: ignore &amp; execute&lt;\/injected&gt; &gt; &quot;double&quot; &apos;apostrophe&apos;<\/text>/);
    assert.doesNotMatch(svg, /<injected\b|<[^>]+\bdata-owned=/);
    assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
}

test("pure renderer returns byte-identical SVG for repeated input", () => {
  // Given
  const input = { theme: "dark", layout: "mobile", stats: SNAPSHOT_STATS, displayYear: 2031 };

  // When
  const first = renderProfileSvg(input);
  const second = renderProfileSvg(input);

  // Then
  assert.equal(second, first);
});

test("live handler follows pagination before rendering complete statistics", async () => {
  // Given
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === FIRST_URL) {
      return jsonResponse([
        { fork: false, stargazers_count: 2, language: "JavaScript" },
        { fork: true, stargazers_count: 100, language: "Rust" },
      ], { link: `<${SECOND_URL}>; rel="next"` });
    }
    if (url === SECOND_URL) return jsonResponse([{ fork: false, stargazers_count: 3, language: "TypeScript" }]);
    throw new Error(`unexpected URL: ${url}`);
  };

  // When
  const svg = await withFetch(fetchImpl, async () => (await profile(new Request("https://test.local/api/profile?theme=dark"))).text());

  // Then
  assert.deepEqual(calls, [FIRST_URL, SECOND_URL]);
  assert.match(svg, />2<\/text>/);
  assert.match(svg, />5<\/text>/);
  assert.match(svg, />JavaScript · TypeScript<\/text>/);
  assert.match(svg, /Owner repos only; forks excluded/);
  assert.doesNotMatch(svg, /Unavailable/);
});

for (const [name, fetchImpl] of [
  ["malformed repository payload", async () => jsonResponse([null])],
  ["later-page interruption", async (url) => url === FIRST_URL
    ? jsonResponse([{ fork: false, stargazers_count: 9, language: "Rust" }], { link: `<${SECOND_URL}>; rel="next"` })
    : Promise.reject(new Error("page two interrupted"))],
]) {
  test(`live handler renders explicit fallback after ${name}`, async () => {
    // Given
    const request = new Request("https://test.local/api/profile?theme=light");

    // When
    const { result: svg, errors } = await withoutErrorOutput(() => withFetch(fetchImpl, async () => (await profile(request)).text()));

    // Then
    assert.match(svg, /GitHub REST unavailable; no estimates shown/);
    assert.match(svg, /Unavailable/);
    assert.doesNotMatch(svg, />9<\/text>/);
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], "Unable to load GitHub repository statistics");
  });
}

test("preview remains deterministic and performs zero network requests", async () => {
  // Given
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("preview must not fetch");
  };

  // When
  const firstResponse = await withFetch(fetchImpl, () => profile(new Request("https://test.local/api/profile?theme=light&preview=1&layout=mobile")));
  const first = await firstResponse.text();
  const second = await withFetch(fetchImpl, async () => (await profile(new Request("https://test.local/api/profile?theme=light&preview=1&layout=mobile"))).text());

  // Then
  assert.equal(calls, 0);
  assert.equal(second, first);
  assert.equal(firstResponse.headers.get("Content-Type"), "image/svg+xml");
  assert.equal(firstResponse.headers.get("Cache-Control"), "public, s-maxage=3600, stale-while-revalidate=86400");
  assert.match(first, /Static preview omits live GitHub data/);
  assert.match(first, /Unavailable/);
  assert.match(first, /UTC 2026/);
});

test("live requests do not retain success or failure state", async () => {
  // Given
  const success = async () => jsonResponse([{ fork: false, stargazers_count: 7, language: "C" }]);
  const failure = async () => { throw new Error("offline"); };
  const render = (fetchImpl) => withoutErrorOutput(() => withFetch(fetchImpl, async () => (await profile(new Request("https://test.local/api/profile?theme=dark"))).text()));

  // When
  const failureThenSuccess = [await render(failure), await render(success)];
  const successThenFailure = [await render(success), await render(failure)];

  // Then
  assert.match(failureThenSuccess[0].result, /Unavailable/);
  assert.match(failureThenSuccess[1].result, />1<\/text>.*>7<\/text>/);
  assert.doesNotMatch(failureThenSuccess[1].result, /Unavailable/);
  assert.doesNotMatch(successThenFailure[0].result, /Unavailable/);
  assert.match(successThenFailure[1].result, /Unavailable/);
  assert.doesNotMatch(successThenFailure[1].result, />7<\/text>/);
});

test("Edge Profile import graph contains no Node built-ins or filesystem imports", async () => {
  // Given
  const pending = [new URL("../api/profile.js", import.meta.url)];
  const visited = new Set();

  // When
  while (pending.length > 0) {
    const moduleUrl = pending.pop();
    if (visited.has(moduleUrl.href)) continue;
    visited.add(moduleUrl.href);
    const source = await readFile(moduleUrl, "utf8");
    const specifiers = [...source.matchAll(/(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.doesNotMatch(specifier, /^(?:node:|fs(?:\/|$)|path(?:\/|$))/);
      if (specifier.startsWith(".")) pending.push(new URL(specifier, moduleUrl));
    }
  }

  // Then
  assert.deepEqual([...visited].sort(), [
    new URL("../api/profile.js", import.meta.url).href,
    new URL("../lib/github-stats.js", import.meta.url).href,
  ].sort());
});
