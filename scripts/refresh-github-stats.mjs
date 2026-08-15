import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGithubStats, validateGithubStatsSnapshot } from "../lib/github-stats.js";

const DEFAULT_TARGET_PATH = fileURLToPath(new URL("../data/github-stats.json", import.meta.url));
const DEFAULT_TIMEOUT_MS = 30_000;
const defaultFileSystem = { mkdir, readFile, rename, rm, writeFile };

export async function refreshGithubStats({
  targetPath = DEFAULT_TARGET_PATH,
  fetchImpl = globalThis.fetch,
  token,
  now = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fileSystem = defaultFileSystem,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive safe integer");

  const snapshot = validateGithubStatsSnapshot(await fetchGithubStats({
    fetchImpl,
    token,
    now,
    timeoutMs,
  }));
  const bytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  let currentBytes;
  try {
    currentBytes = await fileSystem.readFile(targetPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (currentBytes?.equals(bytes)) return { changed: false, snapshot };

  const targetDirectory = dirname(targetPath);
  const temporaryPath = join(targetDirectory, `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
  await fileSystem.mkdir(targetDirectory, { recursive: true });
  let temporaryFileOwned = false;
  let primaryError;
  try {
    temporaryFileOwned = true;
    try {
      await fileSystem.writeFile(temporaryPath, bytes, { flag: "wx" });
    } catch (error) {
      if (error?.code === "EEXIST") temporaryFileOwned = false;
      throw error;
    }
    await fileSystem.rename(temporaryPath, targetPath);
    temporaryFileOwned = false;
    return { changed: true, snapshot };
  } catch (error) {
    primaryError = error;
  }
  if (temporaryFileOwned) {
    try {
      await fileSystem.rm(temporaryPath, { force: true });
    } catch (cleanupError) {
      throw new AggregateError([primaryError, cleanupError], primaryError.message, { cause: primaryError });
    }
  }
  throw primaryError;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await refreshGithubStats({ token: process.env.GITHUB_TOKEN });
  console.log(result.changed ? "Updated data/github-stats.json" : "GitHub statistics snapshot is unchanged");
}
