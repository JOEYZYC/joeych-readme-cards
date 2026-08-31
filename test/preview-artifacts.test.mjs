import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildIndexHtml, expectedSvgFilenames, generatePreview, readGithubStatsSnapshot, renderPreviewSvgs } from "../scripts/generate-preview.mjs";
import { renderProfileSvg } from "../api/profile.js";

const svgDirectory = new URL("../preview/svgs/", import.meta.url);
const indexFile = new URL("../preview/index.html", import.meta.url);
const snapshotFile = new URL("../data/github-stats.json", import.meta.url);
const ORIGINAL_FONT = "Consolas, Menlo, 'DejaVu Sans Mono', 'Courier New', monospace";
const RETIRED_FONTS = /Cascadia Mono|Noto Sans Mono CJK SC|Microsoft YaHei UI/;

test("checked-in preview artifacts are byte-exact and complete", async () => {
  const actualFilenames = (await readdir(svgDirectory)).sort();
  assert.deepEqual(actualFilenames, [...expectedSvgFilenames].sort());

  const snapshot = await readGithubStatsSnapshot(snapshotFile);
  const rendered = await renderPreviewSvgs(snapshot);
  for (const filename of expectedSvgFilenames) {
    const svg = rendered.get(filename);
    assert.match(svg, new RegExp(`font-family="${ORIGINAL_FONT}"`), filename);
    assert.doesNotMatch(svg, RETIRED_FONTS, filename);
    assert.doesNotMatch(svg, /[\u3400-\u9fff]/u, filename);
    assert.deepEqual(await readFile(new URL(filename, svgDirectory)), Buffer.from(rendered.get(filename), "utf8"), filename);
  }
  const indexHtml = buildIndexHtml();
  assert.match(indexHtml, /<html lang="en">/);
  assert.match(indexHtml, /Deterministic fixtures generated offline\./);
  assert.match(indexHtml, new RegExp(`font-family:${ORIGINAL_FONT}`));
  assert.doesNotMatch(indexHtml, RETIRED_FONTS);
  assert.doesNotMatch(indexHtml, /[\u3400-\u9fff]/u);
  assert.deepEqual(await readFile(indexFile), Buffer.from(indexHtml, "utf8"), "preview/index.html");

  for (const theme of ["light", "dark"]) {
    for (const layout of ["desktop", "mobile"]) {
      const suffix = layout === "mobile" ? `_mobile_${theme}` : `_${theme}`;
      assert.equal(rendered.get(`profile${suffix}.svg`), renderProfileSvg({ theme, layout, stats: snapshot, displayYear: snapshot.displayYear }));
    }
  }
});

test("two offline generations produce identical artifact hashes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "readme-cards-preview-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputDirectory = join(directory, "svgs");
  const outputIndexFile = join(directory, "index.html");

  const artifactHashes = async () => {
    const paths = [outputIndexFile, ...(await readdir(outputDirectory)).sort().map((filename) => join(outputDirectory, filename))];
    return Promise.all(paths.map(async (path) => createHash("sha256").update(await readFile(path)).digest("hex")));
  };

  await generatePreview({ outputDirectory, indexFile: outputIndexFile, snapshotFile });
  const first = await artifactHashes();
  await generatePreview({ outputDirectory, indexFile: outputIndexFile, snapshotFile });
  assert.deepEqual(await artifactHashes(), first);
});

test("generation rejects malformed snapshot input before writing artifacts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "readme-cards-preview-malformed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const malformedSnapshot = join(directory, "github-stats.json");
  await writeFile(malformedSnapshot, '{"schemaVersion":1,"displayYear":2026,"repositories":-1,"stars":0,"languages":[]}\n');

  await assert.rejects(generatePreview({
    outputDirectory: join(directory, "svgs"),
    indexFile: join(directory, "index.html"),
    snapshotFile: malformedSnapshot,
  }), /repositories/);
  await assert.rejects(readdir(join(directory, "svgs")), /ENOENT/);
});
