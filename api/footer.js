export const config = { runtime: "edge" };

const FONT = "'Courier New', Consolas, monospace";
const withAccessibleText = (svg, c) => svg.replace(new RegExp(`(<text\\b[^>]*?)fill="${c.accent}"`, "g"), `$1fill="${c.accentText}"`);
const LINKS = [["GitHub", "https://github.com/JOEYZYC"], ["Website", "https://joeyzyc.github.io/joeych-pages/"], ["eFlyDrone-Boards", "https://github.com/JOEYZYC/eFlyDrone-Boards"]];

function mobileSvg(c) {
  const pills = LINKS.map(([label, url], index) => `<a href="${url}" target="_blank" rel="noopener"><rect x="20" y="${56 + index * 38}" width="320" height="28" rx="14" fill="${c.bar}" stroke="${c.border}" stroke-width=".5"/><circle cx="34" cy="${70 + index * 38}" r="3" fill="${c.accent}"/><text x="52" y="${74 + index * 38}" font-family="${FONT}" font-size="12" font-weight="700" fill="${c.muted}">${label}</text></a>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="184" viewBox="0 0 360 184" role="img" aria-labelledby="title desc"><title id="title">JOEYCH mobile verified links</title><desc id="desc">GitHub, personal website, and original eFlyDrone-Boards project links.</desc><defs><linearGradient id="bar" x1="0" x2="1"><stop stop-color="${c.bar}"/><stop offset="1" stop-color="${c.bg}"/></linearGradient></defs><style>a:hover rect,a:focus rect{stroke:${c.accent};stroke-width:1}</style><rect width="360" height="184" rx="8" fill="${c.bg}"/><rect width="360" height="34" fill="url(#bar)"/><path d="M0 34.5H360M0 .5H360M359.5 0V184M0 183.5H360" stroke="${c.border}" stroke-width="1" fill="none"/><circle cx="20" cy="17" r="4" fill="#ff5f57"/><circle cx="34" cy="17" r="4" fill="#febc2e"/><circle cx="48" cy="17" r="4" fill="#28c840"/><text x="64" y="21" font-family="${FONT}" font-size="10" font-weight="600" fill="${c.dim}">connect · document · build</text>${pills}<rect width="3" height="184" fill="${c.accent}" opacity=".7"/></svg>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const dark = url.searchParams.get("theme") !== "light";
  const mobile = url.searchParams.get("layout") === "mobile";
  const c = dark ? { bg: "#0a0c10", bar: "#12151b", text: "#e6edf3", muted: "#8b949e", dim: "#7d8590", border: "#30363d", accent: "#39d353", accentText: "#39d353" } : { bg: "#fcfbf9", bar: "#f5f2eb", text: "#1a1a1a", muted: "#57606a", dim: "#59636e", border: "#e5e1d8", accent: "#16a34a", accentText: "#137333" };
  if (mobile) return new Response(withAccessibleText(mobileSvg(c), c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=0, must-revalidate" } });
  let x = 32;
  const pills = LINKS.map(([label, url]) => {
    const width = label.length * 7.2 + 34;
    const result = `<a href="${url}" target="_blank" rel="noopener"><rect x="${x}" y="52" width="${width}" height="26" rx="13" fill="${c.bar}" stroke="${c.border}" stroke-width=".5"/><circle cx="${x + 11}" cy="65" r="2.5" fill="${c.accent}" opacity=".7"/><text x="${x + 22 + (width - 22) / 2}" y="69" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="700" fill="${c.muted}">${label}</text></a>`;
    x += width + 10;
    return result;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="92" viewBox="0 0 900 92" role="img" aria-labelledby="title desc"><title id="title">JOEYCH verified links</title><desc id="desc">GitHub, personal website, and original eFlyDrone-Boards project links.</desc><defs><linearGradient id="bar" x1="0" x2="1"><stop stop-color="${c.bar}"/><stop offset="1" stop-color="${c.bg}"/></linearGradient></defs><style>a:hover rect,a:focus rect{stroke:${c.accent};stroke-width:1}</style><rect width="900" height="92" fill="${c.bg}"/><rect width="900" height="34" fill="url(#bar)"/><path d="M0 34.5H900M0 .5H900M899.5 0V92M0 91.5H900" stroke="${c.border}" stroke-width="1" fill="none"/><circle cx="22" cy="17" r="4.5" fill="#ff5f57"/><circle cx="38" cy="17" r="4.5" fill="#febc2e"/><circle cx="54" cy="17" r="4.5" fill="#28c840"/><text x="74" y="21" font-family="${FONT}" font-size="11" font-weight="600" fill="${c.dim}" letter-spacing=".8">connect · document · build</text>${pills}<text x="872" y="69" text-anchor="end" font-family="${FONT}" font-size="12" font-weight="800" fill="${c.text}">JOEYCH</text><rect width="3" height="92" fill="${c.accent}" opacity=".7"/></svg>`;
  return new Response(withAccessibleText(svg, c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
