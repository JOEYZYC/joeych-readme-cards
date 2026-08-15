import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { transactionPaths } from "../scripts/artifact-transaction.mjs";
import { expectedSvgFilenames, generatePreview, writePreviewTree } from "../scripts/generate-preview.mjs";
import { refreshPreview } from "../scripts/refresh-preview.mjs";

const sourcePreview = new URL("../preview/", import.meta.url);
const sourceSnapshot = new URL("../data/github-stats.json", import.meta.url);
const baseFileSystem = { cp, mkdir, readdir, readFile, rename, rm, writeFile };
const fixtureCleanupOptions = { recursive: true, force: true, maxRetries: 3, retryDelay: 10 };
const changedSnapshot = `{
  "schemaVersion": 1,
  "displayYear": 2032,
  "repositories": 8,
  "stars": 13,
  "languages": [
    "Rust"
  ]
}
`;

async function artifactFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "readme-cards-refresh-preview-"));
  registerArtifactFixtureCleanup(t, directory);
  const snapshotPath = join(directory, "github-stats.json");
  const previewPath = join(directory, "preview");
  await cp(sourcePreview, previewPath, { recursive: true });
  await cp(sourceSnapshot, snapshotPath);
  return { directory, snapshotPath, previewPath };
}

function registerArtifactFixtureCleanup(t, directory, remove = rm) {
  t.after(() => remove(directory, fixtureCleanupOptions));
}

async function artifactHashes({ directory, previewPath }) {
  const paths = [
    "github-stats.json",
    "preview/index.html",
    ...expectedSvgFilenames.map((filename) => `preview/svgs/${filename}`),
  ];
  assert.deepEqual((await readdir(join(previewPath, "svgs"))).sort(), [...expectedSvgFilenames].sort());
  return Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(join(directory, path))).digest("hex")]));
}

async function assertClean(directory, allowed = ["github-stats.json", "preview"]) {
  assert.deepEqual((await readdir(directory)).sort(), [...allowed].sort());
}

async function stageChangedSnapshot({ targetPath }) {
  await writeFile(targetPath, changedSnapshot);
}

test("fixture cleanup bounds retries for transient Windows ENOTEMPTY", async () => {
  let cleanup;
  const calls = [];
  registerArtifactFixtureCleanup({ after(callback) { cleanup = callback; } }, "fixture-path", async (...args) => { calls.push(args); });

  await cleanup();

  assert.deepEqual(calls, [["fixture-path", { recursive: true, force: true, maxRetries: 3, retryDelay: 10 }]]);
});

test("refresh failure prevents generation and preserves every artifact byte", async (t) => {
  const fixture = await artifactFixture(t);
  const before = await artifactHashes(fixture);
  let generationCalls = 0;

  await assert.rejects(refreshPreview({
    ...fixture,
    refresh: async () => { throw new Error("GitHub refresh failed"); },
    generate: async () => { generationCalls += 1; },
  }), /GitHub refresh failed/);

  assert.equal(generationCalls, 0);
  assert.deepEqual(await artifactHashes(fixture), before);
  await assertClean(fixture.directory);
});

test("successful refresh stages generation before publishing the complete set", async (t) => {
  const fixture = await artifactFixture(t);
  const events = [];

  await refreshPreview({
    ...fixture,
    refresh: async (options) => { events.push("refresh"); await stageChangedSnapshot(options); },
    generate: async (options) => { events.push("generate"); await writePreviewTree(options); },
  });

  assert.deepEqual(events, ["refresh", "generate"]);
  assert.equal(await readFile(fixture.snapshotPath, "utf8"), changedSnapshot);
  assert.match(await readFile(join(fixture.previewPath, "svgs", "profile_dark.svg"), "utf8"), />8<\/text>.*>13<\/text>/);
  await assertClean(fixture.directory);
});

test("generation write failure after changed refresh preserves all 22 published files", async (t) => {
  const fixture = await artifactFixture(t);
  const before = await artifactHashes(fixture);
  const fileSystem = {
    ...baseFileSystem,
    async writeFile(path, bytes, options) {
      if (String(path).endsWith(expectedSvgFilenames[3])) throw new Error("forced generation write failure");
      return writeFile(path, bytes, options);
    },
  };

  await assert.rejects(refreshPreview({ ...fixture, refresh: stageChangedSnapshot, fileSystem }), /forced generation write failure/);

  assert.deepEqual(await artifactHashes(fixture), before);
  await assertClean(fixture.directory);
});

test("offline preview generation write failure preserves all 22 published files", async (t) => {
  const fixture = await artifactFixture(t);
  const before = await artifactHashes(fixture);
  const fileSystem = {
    ...baseFileSystem,
    async writeFile(path, bytes, options) {
      if (String(path).endsWith(expectedSvgFilenames[5])) throw new Error("offline staged write failed");
      return writeFile(path, bytes, options);
    },
  };

  await assert.rejects(generatePreview({
    outputDirectory: join(fixture.previewPath, "svgs"),
    indexFile: join(fixture.previewPath, "index.html"),
    snapshotFile: fixture.snapshotPath,
    fileSystem,
  }), /offline staged write failed/);

  assert.deepEqual(await artifactHashes(fixture), before);
  await assertClean(fixture.directory);
});

test("snapshot promotion failure rolls back every published byte", async (t) => {
  const fixture = await artifactFixture(t);
  const before = await artifactHashes(fixture);
  const fileSystem = {
    ...baseFileSystem,
    async rename(source, destination) {
      if (String(source).endsWith("staged-github-stats.json") && destination === fixture.snapshotPath) throw new Error("snapshot promotion denied");
      return rename(source, destination);
    },
  };

  await assert.rejects(refreshPreview({ ...fixture, refresh: stageChangedSnapshot, fileSystem }), /snapshot promotion denied/);

  assert.deepEqual(await artifactHashes(fixture), before);
  await assertClean(fixture.directory);
});

test("preview promotion failure after snapshot promotion restores all 22 files", async (t) => {
  const fixture = await artifactFixture(t);
  const before = await artifactHashes(fixture);
  let snapshotPromoted = false;
  const fileSystem = {
    ...baseFileSystem,
    async rename(source, destination) {
      if (String(source).endsWith("staged-github-stats.json") && destination === fixture.snapshotPath) snapshotPromoted = true;
      if (String(source).endsWith("staged-preview") && destination === fixture.previewPath) {
        assert.equal(snapshotPromoted, true);
        throw new Error("preview promotion denied");
      }
      return rename(source, destination);
    },
  };

  await assert.rejects(refreshPreview({ ...fixture, refresh: stageChangedSnapshot, fileSystem }), /preview promotion denied/);

  assert.equal(snapshotPromoted, true);
  assert.deepEqual(await artifactHashes(fixture), before);
  await assertClean(fixture.directory);
});

test("backup namespace collision is preserved and no published path changes", async (t) => {
  const fixture = await artifactFixture(t);
  const before = await artifactHashes(fixture);
  const transactionId = "collision";
  const { workspacePath } = transactionPaths(fixture.directory, "preview-publication", transactionId);
  const markerPath = join(workspacePath, "unrelated.txt");
  await mkdir(workspacePath);
  await writeFile(markerPath, "unrelated collision\n");

  await assert.rejects(refreshPreview({ ...fixture, refresh: stageChangedSnapshot, transactionId }), /EEXIST/);

  assert.deepEqual(await artifactHashes(fixture), before);
  assert.equal(await readFile(markerPath, "utf8"), "unrelated collision\n");
  await assertClean(fixture.directory, ["github-stats.json", "preview", `.preview-publication.${process.pid}.${transactionId}`]);
});
