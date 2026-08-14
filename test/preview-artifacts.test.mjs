import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { buildIndexHtml, expectedSvgFilenames, renderPreviewSvgs } from "../scripts/generate-preview.mjs";

const svgDirectory = new URL("../preview/svgs/", import.meta.url);
const indexFile = new URL("../preview/index.html", import.meta.url);

test("checked-in preview artifacts are byte-exact and complete", async () => {
  const actualFilenames = (await readdir(svgDirectory)).filter((filename) => filename.endsWith(".svg")).sort();
  assert.deepEqual(actualFilenames, [...expectedSvgFilenames].sort());

  const rendered = await renderPreviewSvgs();
  for (const filename of expectedSvgFilenames) {
    assert.deepEqual(await readFile(new URL(filename, svgDirectory)), Buffer.from(rendered.get(filename), "utf8"), filename);
  }
  assert.deepEqual(await readFile(indexFile), Buffer.from(buildIndexHtml(), "utf8"), "preview/index.html");
});
