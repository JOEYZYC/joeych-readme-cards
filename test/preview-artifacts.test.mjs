import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { buildIndexHtml, expectedSvgFilenames, renderPreviewSvgs } from "../scripts/generate-preview.mjs";

const svgDirectory = new URL("../preview/svgs/", import.meta.url);
const indexFile = new URL("../preview/index.html", import.meta.url);
const ORIGINAL_FONT = "'Courier New', Consolas, monospace";
const RETIRED_FONTS = /Cascadia Mono|Noto Sans Mono CJK SC|Microsoft YaHei UI/;

test("checked-in preview artifacts are byte-exact and complete", async () => {
  const actualFilenames = (await readdir(svgDirectory)).filter((filename) => filename.endsWith(".svg")).sort();
  assert.deepEqual(actualFilenames, [...expectedSvgFilenames].sort());

  const rendered = await renderPreviewSvgs();
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
});
