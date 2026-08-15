import { fetchGithubStats } from "../lib/github-stats.js";

export const config = { runtime: "edge" };

export const USERNAME = "JOEYZYC";
export const PREVIEW_STATS = { repositories: null, stars: null, languages: [], unavailable: true, snapshot: true };
const UNAVAILABLE_STATS = { repositories: null, stars: null, languages: [], unavailable: true };

const FONT = "'Courier New', Consolas, monospace";
const XML_TEXT_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" };
const escapeXmlText = (value) => value.replace(/[&<>"']/g, (character) => XML_TEXT_ENTITIES[character]);
const withAccessibleText = (svg, c) => svg.replace(new RegExp(`(<text\\b[^>]*?)fill="${c.accent}"`, "g"), `$1fill="${c.accentText}"`);
const withAvailabilityColor = (svg, c, unavailable, marker) => svg.replace(`fill="${c.warning}">${marker}</text>`, `fill="${unavailable ? c.warning : c.dim}">${marker}</text>`);

async function fetchLiveStats(now) {
  try {
    const token = typeof process === "undefined" ? undefined : process.env.GITHUB_TOKEN;
    return await fetchGithubStats({ token, now });
  } catch (error) {
    console.error("Unable to load GitHub repository statistics", error);
    return UNAVAILABLE_STATS;
  }
}

function statValue(value) {
  return value === null ? "Unavailable" : String(value);
}

function mobileSvg(c, stats, year) {
  const W = 360;
  const H = 500;
  const unavailable = stats.unavailable;
  const rows = [["Original repos", stats.repositories], ["Stars earned", stats.stars]].map(([label, value], index) => {
    const y = 322 + index * 44;
    const color = value === null ? c.warning : c.accent;
    return `<circle cx="24" cy="${y - 5}" r="3.5" fill="${color}"/><text x="38" y="${y}" font-family="${FONT}" font-size="13" fill="${c.muted}">${label}</text><text x="336" y="${y}" text-anchor="end" font-family="${FONT}" font-size="${value === null ? 14 : 22}" font-weight="700" fill="${color}">${statValue(value)}</text>`;
  }).join("");
  const languageText = stats.languages.length === 0 ? "Language data unavailable" : stats.languages.map(escapeXmlText).join(" · ");
  const availability = stats.snapshot ? "Static preview omits live GitHub data" : unavailable ? "GitHub REST unavailable" : "Owner repos only; forks excluded";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">JOEYCH mobile profile and GitHub statistics</title><desc id="desc">Mobile-friendly embedded systems profile and GitHub REST statistics for original non-fork repositories.</desc><rect width="${W}" height="${H}" fill="${c.bg}"/><path d="M0 .5H360M0 ${H - .5}H360" stroke="${c.border}" stroke-width="1"/><text x="20" y="24" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5" fill="${c.dim}">// ABOUT</text><path d="M20 34H340" stroke="${c.border}" stroke-width=".5"/><text x="20" y="62" font-family="${FONT}" font-size="15" font-weight="700" fill="${c.text}">Practical embedded systems engineering.</text><text x="20" y="91" font-family="${FONT}" font-size="13" fill="${c.muted}">From MCU firmware to flight control,</text><text x="20" y="114" font-family="${FONT}" font-size="13" fill="${c.muted}">building verifiable systems on real hardware.</text><text x="20" y="151" font-family="${FONT}" font-size="13" fill="${c.muted}">C/C++ · Python · STM32 · PX4</text><text x="20" y="174" font-family="${FONT}" font-size="13" fill="${c.muted}">Raspberry Pi Pico · PCB · AI / CV</text><path d="M20 201H340" stroke="${c.subtle}" stroke-width=".5"/><circle cx="25" cy="221" r="3" fill="${c.accent}"/><text x="38" y="226" font-family="${FONT}" font-size="13" fill="${c.dim}">Location · SuZhou · UTC+8</text><circle cx="25" cy="247" r="3" fill="${c.accent}"/><text x="38" y="252" font-family="${FONT}" font-size="13" fill="${c.dim}">Original project · eFlyDrone-Boards</text><rect x="12" y="274" width="336" height="208" rx="6" fill="${c.panel}" opacity=".72"/><text x="20" y="294" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5" fill="${c.dim}">// GITHUB REST STATS</text><path d="M20 303H340" stroke="${c.border}" stroke-width=".5"/>${rows}<path d="M20 405H340" stroke="${c.border}" stroke-width=".5"/><text x="20" y="427" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.2" fill="${c.dim}">TOP LANGUAGES</text><text x="20" y="450" font-family="${FONT}" font-size="13" fill="${c.muted}">${languageText}</text><rect x="242" y="419" width="98" height="22" rx="11" fill="${c.soft}" stroke="${c.border}" stroke-width=".5"/><text x="291" y="434" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="700" fill="${c.accent}">UTC ${year}</text><text x="20" y="477" font-family="${FONT}" font-size="10.5" fill="${unavailable ? c.warning : c.dim}">${availability}</text><rect width="3" height="${H}" fill="${c.accent}" opacity=".7"/></svg>`;
  return svg.replace("Practical embedded systems engineering.", "Embedded systems engineering.").replace("building verifiable systems on real hardware.", "verified systems on real hardware.");
}

export function renderProfileSvg({ theme, layout, stats, displayYear }) {
  const dark = theme !== "light";
  const mobile = layout === "mobile";
  const c = dark
    ? { bg: "#0a0c10", panel: "#0d1015", text: "#e6edf3", muted: "#8b949e", dim: "#7d8590", border: "#30363d", subtle: "#21262d", accent: "#39d353", accentText: "#39d353", warning: "#d29922", soft: "#0d2114" }
    : { bg: "#fcfbf9", panel: "#f0ead6", text: "#1a1a1a", muted: "#57606a", dim: "#59636e", border: "#e5e1d8", subtle: "#d4cdbc", accent: "#16a34a", accentText: "#137333", warning: "#7a4d00", soft: "#dcfce7" };
  if (mobile) return withAccessibleText(mobileSvg(c, stats, displayYear), c);
  const statRows = [["Original repos", stats.repositories], ["Stars earned", stats.stars]].map(([label, value], index) => {
    const y = 52 + index * 46;
    const color = value === null ? c.warning : c.accent;
    return `<circle cx="484" cy="${y - 4}" r="3" fill="${color}"/><text x="496" y="${y}" font-family="${FONT}" font-size="10" fill="${c.muted}">${label}</text><text x="876" y="${y}" text-anchor="end" font-family="${FONT}" font-size="${value === null ? 13 : 20}" font-weight="700" fill="${color}">${statValue(value)}</text>`;
  }).join("");
  const languageText = stats.languages.length === 0 ? "Language data unavailable" : stats.languages.map(escapeXmlText).join(" · ");
  const availability = stats.snapshot ? "Static preview omits live GitHub data" : stats.unavailable ? "GitHub REST unavailable; no estimates shown" : "Owner repos only; forks excluded";
  const about = [["Practical embedded systems engineering.", true], ["From MCU firmware and flight control", false], ["to hardware schematics and real devices.", false], ["", false], ["Working with C/C++, Python, and STM32,", false], ["Raspberry Pi Pico, PX4, and PCB design,", false], ["plus AI and computer vision.", false]].map(([text, bold], index) => text ? `<text x="24" y="${44 + index * 20}" font-family="${FONT}" font-size="${bold ? 12 : 11}" font-weight="${bold ? 700 : 400}" fill="${bold ? c.text : c.muted}">${text}</text>` : "").join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="292" viewBox="0 0 900 292" role="img" aria-labelledby="title desc"><title id="title">JOEYCH profile and GitHub statistics</title><desc id="desc">Embedded systems profile and GitHub REST statistics for original non-fork repositories.</desc><defs><linearGradient id="divider" x1="0" x2="0" y2="1"><stop stop-color="${c.accent}" stop-opacity=".6"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></linearGradient></defs><rect width="900" height="292" fill="${c.bg}"/><rect x="456" width="444" height="292" fill="${c.panel}" opacity=".65"/><path d="M0 .5H900M0 291.5H900" stroke="${c.border}" stroke-width="1"/><text x="24" y="16" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="2" fill="${c.dim}">// ABOUT</text><path d="M24 24H436" stroke="${c.border}" stroke-width=".5"/>${about}<path d="M24 198H436" stroke="${c.subtle}" stroke-width=".5"/><circle cx="29" cy="213" r="2.5" fill="${c.accent}" opacity=".75"/><text x="40" y="218" font-family="${FONT}" font-size="11" fill="${c.dim}">Location · SuZhou · UTC+8</text><circle cx="29" cy="235" r="2.5" fill="${c.accent}" opacity=".75"/><text x="40" y="240" font-family="${FONT}" font-size="11" fill="${c.dim}">Original project · eFlyDrone-Boards</text><rect x="456" y="24" width="1" height="244" fill="url(#divider)"/><text x="480" y="16" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="2" fill="${c.dim}">// GITHUB REST STATS</text><path d="M480 24H876" stroke="${c.border}" stroke-width=".5"/>${statRows}<path d="M480 122H876" stroke="${c.border}" stroke-width=".5"/><text x="480" y="145" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="1.5" fill="${c.dim}">TOP LANGUAGES</text><text x="480" y="166" font-family="${FONT}" font-size="11" fill="${c.muted}">${languageText}</text><rect x="480" y="188" width="152" height="20" rx="10" fill="${c.soft}" stroke="${c.border}" stroke-width=".5"/><text x="556" y="201.5" text-anchor="middle" font-family="${FONT}" font-size="9.5" font-weight="700" fill="${c.accent}">UTC ${displayYear}</text><text x="480" y="235" font-family="${FONT}" font-size="10" fill="${c.warning}">${availability}</text><rect width="3" height="292" fill="${c.accent}" opacity=".7"/></svg>`;
  return withAvailabilityColor(withAccessibleText(svg, c), c, stats.unavailable, availability);
}

export default async function handler(req) {
  const url = new URL(req.url);
  const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
  const layout = url.searchParams.get("layout") === "mobile" ? "mobile" : "desktop";
  const preview = url.searchParams.get("preview") === "1";
  const now = new Date();
  const stats = preview ? PREVIEW_STATS : await fetchLiveStats(now);
  const displayYear = preview ? 2026 : now.getUTCFullYear();
  const svg = renderProfileSvg({ theme, layout, stats, displayYear });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
