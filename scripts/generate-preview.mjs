import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import header from "../api/header.js";
import { renderProfileSvg } from "../api/profile.js";
import skills from "../api/skills.js";
import footer from "../api/footer.js";
import banner from "../api/banner.js";
import { validateGithubStatsSnapshot } from "../lib/github-stats.js";
import { runArtifactTransaction } from "./artifact-transaction.mjs";

const defaultOutputDirectory = fileURLToPath(new URL("../preview/svgs/", import.meta.url));
const defaultIndexFile = fileURLToPath(new URL("../preview/index.html", import.meta.url));
const defaultSnapshotFile = fileURLToPath(new URL("../data/github-stats.json", import.meta.url));
const defaultFileSystem = { mkdir, readFile, readdir, rename, rm, writeFile };
const cards = { header, profile: null, skills, footer, banner };
const themes = ["light", "dark"];
const layouts = ["desktop", "mobile"];

async function render(handler, theme, layout) {
  const suffix = layout === "mobile" ? "&layout=mobile" : "";
  const response = await handler(new Request(`https://preview.local/api/card?theme=${theme}&preview=1${suffix}`));
  if (!response.ok) throw new Error(`Preview handler returned ${response.status}`);
  return response.text();
}

function filePath(path) {
  return path instanceof URL ? fileURLToPath(path) : path;
}

export async function readGithubStatsSnapshot(snapshotFile = defaultSnapshotFile, fileSystem = defaultFileSystem) {
  return validateGithubStatsSnapshot(JSON.parse(await fileSystem.readFile(snapshotFile, "utf8")));
}

export const expectedSvgFilenames = Object.keys(cards).flatMap((name) => layouts.flatMap((layout) => themes.map((theme) => {
  const suffix = layout === "mobile" ? `_mobile_${theme}` : `_${theme}`;
  return `${name}${suffix}.svg`;
})));

export async function renderPreviewSvgs(inputSnapshot) {
  const snapshot = inputSnapshot ?? await readGithubStatsSnapshot();
  const rendered = new Map();
  for (const [name, handler] of Object.entries(cards)) {
    for (const layout of layouts) {
      for (const theme of themes) {
        const suffix = layout === "mobile" ? `_mobile_${theme}` : `_${theme}`;
        const svg = name === "profile"
          ? renderProfileSvg({ theme, layout, stats: snapshot, displayYear: snapshot.displayYear })
          : await render(handler, theme, layout);
        rendered.set(`${name}${suffix}.svg`, svg);
      }
    }
  }
  return rendered;
}

export function buildIndexHtml() {
  const groups = Object.keys(cards).map((name) => `<section><h2>// ${name.toUpperCase()} · DESKTOP</h2><div class="themes"><figure><figcaption>DARK</figcaption><img src="svgs/${name}_dark.svg" alt="${name} desktop dark preview"></figure><figure><figcaption>LIGHT</figcaption><img src="svgs/${name}_light.svg" alt="${name} desktop light preview"></figure></div><h2>// ${name.toUpperCase()} · MOBILE</h2><div class="mobile-themes"><figure><figcaption>DARK</figcaption><img src="svgs/${name}_mobile_dark.svg" alt="${name} mobile dark preview"></figure><figure><figcaption>LIGHT</figcaption><img src="svgs/${name}_mobile_light.svg" alt="${name} mobile light preview"></figure></div></section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JOEYCH Terminal Cards Preview</title><style>:root{--bg:#0a0c10;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#39d353}html{scrollbar-width:none}html::-webkit-scrollbar{display:none}*{box-sizing:border-box}body{margin:0;padding:32px;min-width:320px;background:var(--bg);color:var(--text);font-family:Consolas, Menlo, 'DejaVu Sans Mono', 'Courier New', monospace}main{max-width:1880px;margin:auto}h1{margin:0;font-size:28px}p{color:var(--muted);line-height:1.6}.intro{white-space:nowrap}section{margin-top:40px}h2{font-size:11px;letter-spacing:1.5px;color:var(--accent)}.themes,.mobile-themes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.mobile-themes{max-width:760px}figure{margin:0}figcaption{padding:0 0 8px;font-size:10px;letter-spacing:1px;color:var(--muted)}img{display:block;width:100%;height:auto;border:1px solid var(--border);border-radius:8px}@media(max-width:760px){body{padding:16px}.themes,.mobile-themes{grid-template-columns:1fr}.intro{font-size:13px}}</style></head><body><main><h1>JOEYCH Terminal Cards</h1><p class="intro">Deterministic fixtures generated offline.</p>${groups}</main></body></html>`;
}

export async function writePreviewTree({
  previewDirectory,
  snapshotFile = defaultSnapshotFile,
  fileSystem = defaultFileSystem,
}) {
  const snapshot = await readGithubStatsSnapshot(snapshotFile, fileSystem);
  const rendered = await renderPreviewSvgs(snapshot);
  const svgDirectory = join(previewDirectory, "svgs");
  await fileSystem.mkdir(svgDirectory, { recursive: true });
  for (const [filename, svg] of rendered) await fileSystem.writeFile(join(svgDirectory, filename), svg, "utf8");
  const indexHtml = buildIndexHtml();
  await fileSystem.writeFile(join(previewDirectory, "index.html"), indexHtml, "utf8");

  const actualFilenames = (await fileSystem.readdir(svgDirectory)).sort();
  const expectedFilenames = [...expectedSvgFilenames].sort();
  if (actualFilenames.length !== expectedFilenames.length || actualFilenames.some((filename, index) => filename !== expectedFilenames[index])) {
    throw new Error("Staged preview SVG set is incomplete");
  }
  for (const [filename, svg] of rendered) {
    if (!Buffer.from(await fileSystem.readFile(join(svgDirectory, filename))).equals(Buffer.from(svg, "utf8"))) {
      throw new Error(`Staged preview validation failed for ${filename}`);
    }
  }
  if (!Buffer.from(await fileSystem.readFile(join(previewDirectory, "index.html"))).equals(Buffer.from(indexHtml, "utf8"))) {
    throw new Error("Staged preview validation failed for index.html");
  }
}

export async function generatePreview({
  outputDirectory = defaultOutputDirectory,
  indexFile = defaultIndexFile,
  snapshotFile = defaultSnapshotFile,
  transactionId,
  fileSystem = defaultFileSystem,
} = {}) {
  const resolvedOutputDirectory = resolve(filePath(outputDirectory));
  const resolvedIndexFile = resolve(filePath(indexFile));
  const previewDirectory = dirname(resolvedIndexFile);
  if (resolvedOutputDirectory !== join(previewDirectory, "svgs")) throw new TypeError("outputDirectory must be the svgs directory beside indexFile");

  await runArtifactTransaction({
    parentPath: dirname(previewDirectory),
    name: `${basename(previewDirectory)}-publication`,
    transactionId,
    fileSystem,
    stage: async (workspacePath) => {
      const stagedPreview = join(workspacePath, "staged-preview");
      await writePreviewTree({ previewDirectory: stagedPreview, snapshotFile: filePath(snapshotFile), fileSystem });
      return [{ name: "preview", stagedPath: stagedPreview, targetPath: previewDirectory }];
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generatePreview();
  console.log("Generated deterministic SVG previews in preview/svgs/");
}
