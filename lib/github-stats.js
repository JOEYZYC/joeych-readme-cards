export const SNAPSHOT_SCHEMA_VERSION = 1;

const FIRST_PAGE_URL = "https://api.github.com/users/JOEYZYC/repos?per_page=100&type=owner";
const SNAPSHOT_KEYS = ["schemaVersion", "displayYear", "repositories", "stars", "languages"];
const MAX_PAGES = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonnegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a nonnegative safe integer`);
}

function assertDisplayYear(displayYear) {
  if (!Number.isInteger(displayYear) || displayYear < 1970 || displayYear > 9999) {
    throw new TypeError("displayYear must be a reasonable positive integer UTC year");
  }
}

function assertLanguage(language, name) {
  if (typeof language !== "string" || language.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function compareCodePoints(left, right) {
  const leftPoints = [...left].map((character) => character.codePointAt(0));
  const rightPoints = [...right].map((character) => character.codePointAt(0));
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function repositoryValues(repository, index) {
  if (!isRecord(repository)) throw new TypeError(`repository ${index} must be an object`);
  if (typeof repository.fork !== "boolean") throw new TypeError(`repository ${index}.fork must be a boolean`);

  const stars = repository.stargazers_count ?? 0;
  assertNonnegativeSafeInteger(stars, `repository ${index}.stargazers_count`);

  const language = repository.language ?? null;
  if (language !== null) assertLanguage(language, `repository ${index}.language`);
  return { fork: repository.fork, stars, language };
}

function nextPageUrl(linkHeader) {
  if (linkHeader === null) return null;

  let nextUrl = null;
  for (const section of linkHeader.split(",")) {
    const relation = section.match(/;\s*rel\s*=\s*(?:"([^"]*)"|([^;\s,]+))/i);
    const relations = (relation?.[1] ?? relation?.[2] ?? "").split(/\s+/);
    if (!relations.includes("next")) continue;

    const target = section.match(/^\s*<([^>]+)>/);
    if (target === null || nextUrl !== null) throw new TypeError("GitHub pagination contains an invalid next link");

    let parsed;
    try {
      parsed = new URL(target[1]);
    } catch {
      throw new TypeError("GitHub pagination contains an invalid next URL");
    }
    if (parsed.origin !== "https://api.github.com" || parsed.pathname !== "/users/JOEYZYC/repos") {
      throw new TypeError("GitHub pagination contains an invalid next URL");
    }
    nextUrl = parsed.href;
  }
  return nextUrl;
}

export function validateGithubStatsSnapshot(snapshot) {
  if (!isRecord(snapshot)) throw new TypeError("snapshot must be an object");
  const ownKeys = Reflect.ownKeys(snapshot);
  if (ownKeys.length !== SNAPSHOT_KEYS.length || !SNAPSHOT_KEYS.every((key) => ownKeys.includes(key))) {
    throw new TypeError("snapshot must contain exactly the canonical keys");
  }
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new TypeError("snapshot schemaVersion is unsupported");
  assertDisplayYear(snapshot.displayYear);
  assertNonnegativeSafeInteger(snapshot.repositories, "snapshot.repositories");
  assertNonnegativeSafeInteger(snapshot.stars, "snapshot.stars");
  if (!Array.isArray(snapshot.languages) || snapshot.languages.length > 3) {
    throw new TypeError("snapshot.languages must be an array containing at most three values");
  }
  const uniqueLanguages = new Set();
  for (const language of snapshot.languages) {
    assertLanguage(language, "snapshot language");
    if (uniqueLanguages.has(language)) throw new TypeError("snapshot languages must be unique");
    uniqueLanguages.add(language);
  }
  return snapshot;
}

export function aggregateRepositories(repositories, displayYear) {
  if (!Array.isArray(repositories)) throw new TypeError("GitHub repository data must be an array");
  assertDisplayYear(displayYear);

  let repositoryCount = 0;
  let starCount = 0;
  const languageCounts = new Map();
  for (const [index, repository] of repositories.entries()) {
    const values = repositoryValues(repository, index);
    if (values.fork) continue;
    repositoryCount += 1;
    starCount += values.stars;
    assertNonnegativeSafeInteger(repositoryCount, "aggregated repository count");
    assertNonnegativeSafeInteger(starCount, "aggregated star count");
    if (values.language !== null) languageCounts.set(values.language, (languageCounts.get(values.language) ?? 0) + 1);
  }

  const languages = [...languageCounts]
    .sort(([leftName, leftCount], [rightName, rightCount]) => rightCount - leftCount || compareCodePoints(leftName, rightName))
    .slice(0, 3)
    .map(([language]) => language);
  return validateGithubStatsSnapshot({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    displayYear,
    repositories: repositoryCount,
    stars: starCount,
    languages,
  });
}

export function buildGithubApiHeaders(token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "joeyzyc-readme-cards" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchGithubStats({ fetchImpl = globalThis.fetch, token, now = new Date(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive safe integer");
  const headers = buildGithubApiHeaders(token);
  const repositories = [];
  const visited = new Set();
  let pageUrl = FIRST_PAGE_URL;

  async function fetchPage(url) {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`GitHub repository request failed with HTTP ${response.status}`);
    return { response, repositories: await response.json() };
  }

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (visited.has(pageUrl)) throw new TypeError("GitHub pagination cycle detected");
    visited.add(pageUrl);

    const { response, repositories: pageRepositories } = await fetchPage(pageUrl);
    if (!Array.isArray(pageRepositories)) throw new TypeError(`GitHub repository page ${page} must be a JSON array`);
    repositories.push(...pageRepositories);

    const nextUrl = nextPageUrl(response.headers.get("Link"));
    if (nextUrl === null) return aggregateRepositories(repositories, now.getUTCFullYear());
    pageUrl = nextUrl;
  }
  throw new Error(`GitHub pagination exceeded ${MAX_PAGES} pages`);
}
