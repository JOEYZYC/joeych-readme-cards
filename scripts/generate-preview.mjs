import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import header from "../api/header.js";
import profile from "../api/profile.js";
import skills from "../api/skills.js";
import footer from "../api/footer.js";
import banner from "../api/banner.js";

const outputDirectory = new URL("../preview/svgs/", import.meta.url);
const cards = { header, profile, skills, footer, banner };
const themes = ["light", "dark"];
const layouts = ["desktop", "mobile"];

async function render(handler, theme, layout) {
  const suffix = layout === "mobile" ? "&layout=mobile" : "";
  const response = await handler(new Request(`https://preview.local/api/card?theme=${theme}&preview=1${suffix}`));
  if (!response.ok) throw new Error(`Preview handler returned ${response.status}`);
  return response.text();
}

export const expectedSvgFilenames = Object.keys(cards).flatMap((name) => layouts.flatMap((layout) => themes.map((theme) => {
  const suffix = layout === "mobile" ? `_mobile_${theme}` : `_${theme}`;
  return `${name}${suffix}.svg`;
})));

export async function renderPreviewSvgs() {
  const rendered = new Map();
  for (const [name, handler] of Object.entries(cards)) {
    for (const layout of layouts) {
      for (const theme of themes) {
        const suffix = layout === "mobile" ? `_mobile_${theme}` : `_${theme}`;
        rendered.set(`${name}${suffix}.svg`, await render(handler, theme, layout));
      }
    }
  }
  return rendered;
}

export function buildIndexHtml() {
  const groups = Object.keys(cards).map((name) => `<section><h2>// ${name.toUpperCase()} · DESKTOP</h2><div class="themes"><figure><figcaption>DARK</figcaption><img src="svgs/${name}_dark.svg" alt="${name} desktop dark preview"></figure><figure><figcaption>LIGHT</figcaption><img src="svgs/${name}_light.svg" alt="${name} desktop light preview"></figure></div><h2>// ${name.toUpperCase()} · MOBILE</h2><div class="mobile-themes"><figure><figcaption>DARK</figcaption><img src="svgs/${name}_mobile_dark.svg" alt="${name} mobile dark preview"></figure><figure><figcaption>LIGHT</figcaption><img src="svgs/${name}_mobile_light.svg" alt="${name} mobile light preview"></figure></div></section>`).join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JOEYCH Terminal Cards Preview</title><style>:root{--bg:#0a0c10;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#39d353}html{scrollbar-width:none}html::-webkit-scrollbar{display:none}*{box-sizing:border-box}body{margin:0;padding:32px;min-width:320px;background:var(--bg);color:var(--text);font-family:'Cascadia Mono','Noto Sans Mono CJK SC','Microsoft YaHei UI',Consolas,monospace}main{max-width:1880px;margin:auto}h1{margin:0;font-size:28px}p{color:var(--muted);line-height:1.6}.intro{white-space:nowrap}section{margin-top:40px}h2{font-size:11px;letter-spacing:1.5px;color:var(--accent)}.themes,.mobile-themes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.mobile-themes{max-width:760px}figure{margin:0}figcaption{padding:0 0 8px;font-size:10px;letter-spacing:1px;color:var(--muted)}img{display:block;width:100%;height:auto;border:1px solid var(--border);border-radius:8px}@media(max-width:760px){body{padding:16px}.themes,.mobile-themes{grid-template-columns:1fr}.intro{font-size:13px}}</style></head><body><main><h1>JOEYCH Terminal Cards</h1><p class="intro">固定 fixture，离线生成。</p>${groups}</main></body></html>`;
}

export async function generatePreview() {
  await mkdir(outputDirectory, { recursive: true });
  const rendered = await renderPreviewSvgs();
  for (const [filename, svg] of rendered) await writeFile(new URL(filename, outputDirectory), svg, "utf8");
  await writeFile(new URL("../preview/index.html", import.meta.url), buildIndexHtml(), "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generatePreview();
  console.log("Generated deterministic SVG previews in preview/svgs/");
}
