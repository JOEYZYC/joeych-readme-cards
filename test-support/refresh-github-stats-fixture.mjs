import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIRST_URL = "https://api.github.com/users/JOEYZYC/repos?per_page=100&type=owner";
export const SECOND_URL = `${FIRST_URL}&page=2`;
export const SENTINEL = Buffer.from("last-good-snapshot\n", "utf8");
export const NOW = new Date("2031-04-05T23:59:59.000Z");

export function repository(overrides = {}) {
  return { fork: false, stargazers_count: 0, language: null, ...overrides };
}

export function jsonResponse(body, { status = 200, link } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (link !== undefined) headers.Link = link;
  return new Response(JSON.stringify(body), { status, headers });
}

export function mockedResponse(json, { link } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLowerCase() === "link" ? link ?? null : null },
    json,
  };
}

export async function fixture(t, initialBytes = null) {
  const directory = await mkdtemp(join(tmpdir(), "readme-cards-refresh-"));
  const targetPath = join(directory, "github-stats.json");
  if (initialBytes !== null) await writeFile(targetPath, initialBytes);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, targetPath };
}

export async function assertOnlyTargetRemains(directory) {
  assert.deepEqual(await readdir(directory), ["github-stats.json"]);
}
