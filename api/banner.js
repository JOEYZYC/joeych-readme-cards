export const config = { runtime: "edge" };

const FONT = "'Courier New', Consolas, monospace";
const withAccessibleText = (svg, c) => svg.replace(new RegExp(`(<text\\b[^>]*?)fill="${c.accent}"`, "g"), `$1fill="${c.accentText}"`);

function mobileSvg(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="72" viewBox="0 0 360 72" role="img" aria-labelledby="title desc"><title id="title">JOEYCH terminal card service</title><desc id="desc">View the JOEYZYC-maintained terminal-style GitHub README card source and documentation.</desc><rect width="360" height="72" rx="6" fill="${c.bg}"/><path d="M0 .5H360M0 71.5H360" stroke="${c.border}" stroke-width="1"/><rect x="16" y="10" width="328" height="52" rx="4" fill="${c.panel}" stroke="${c.border}" stroke-width=".5"/><rect width="3" height="72" fill="${c.accent}" opacity=".7"/><text x="30" y="32" font-family="${FONT}" font-size="13" font-weight="700" fill="${c.accent}">&gt;_</text><text x="54" y="32" font-family="${FONT}" font-size="13" font-weight="700" fill="${c.text}">View terminal card source</text><text x="54" y="51" font-family="${FONT}" font-size="11" font-weight="700" fill="${c.dim}">[ SOURCE ]</text></svg>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const dark = url.searchParams.get("theme") !== "light";
  const mobile = url.searchParams.get("layout") === "mobile";
  const c = dark ? { bg: "#0a0c10", panel: "#12151b", border: "#30363d", accent: "#39d353", accentText: "#39d353", text: "#e6edf3", dim: "#7d8590" } : { bg: "#fcfbf9", panel: "#f5f2eb", border: "#e5e1d8", accent: "#16a34a", accentText: "#137333", text: "#1a1a1a", dim: "#59636e" };
  if (mobile) return new Response(withAccessibleText(mobileSvg(c), c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=0, must-revalidate" } });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="44" viewBox="0 0 900 44" role="img" aria-labelledby="title desc"><title id="title">JOEYCH terminal card service</title><desc id="desc">View the JOEYZYC-maintained terminal-style GitHub README card source and documentation.</desc><rect width="900" height="44" fill="${c.bg}"/><path d="M0 .5H900M0 43.5H900" stroke="${c.border}" stroke-width="1"/><rect x="20" y="7" width="860" height="30" rx="4" fill="${c.panel}" stroke="${c.border}" stroke-width=".5"/><rect width="3" height="44" fill="${c.accent}" opacity=".7"/><text x="35" y="26" font-family="${FONT}" font-size="12" font-weight="700" fill="${c.accent}">&gt;_</text><text x="450" y="26" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" letter-spacing="1" fill="${c.text}">View terminal card service docs</text><text x="865" y="26" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="700" fill="${c.dim}">[ SOURCE ]</text></svg>`;
  return new Response(withAccessibleText(svg, c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
