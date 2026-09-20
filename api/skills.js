export const config = { runtime: "edge" };

const FONT = "Consolas, Menlo, 'DejaVu Sans Mono', 'Courier New', monospace";
const withAccessibleText = (svg, c) => svg.replace(new RegExp(`(<text\\b[^>]*?)fill="${c.accent}"`, "g"), `$1fill="${c.accentText}"`);
const FOCUS = [
  ["Embedded Firmware", "RTOS and MCU toolchains; peripheral", "drivers and embedded control."],
  ["PCB and EDA", "KiCad workflows and circuit design;", "board bring-up and fabrication prep."],
  ["Flight Control", "ArduPilot and Crazyflie; MAVLink", "telemetry and simulation."],
  ["Agent Engineering", "Coding agents, MCP servers, and", "reusable agent skills."],
  ["Local AI", "On-device inference and", "small-model fine-tuning."],
  ["Interface Craft", "Design systems, terminal UI, and", "developer-tool typography."],
  ["Electromagnetic Simulation", "CST Studio Suite; metasurface modelling and", "parameter optimization."],
  ["HMI Development", "C#, Qt, and web technologies; monitoring", "systems and data visualization."],
];

function mobileSvg(c) {
  const W = 360;
  const H = 468;
  const rows = FOCUS.map(([label, lineOne, lineTwo], index) => {
    const y = 58 + index * 50;
    return `<circle cx="24" cy="${y - 5}" r="3.5" fill="${index % 2 === 0 ? c.accent : c.info}"/><text x="38" y="${y}" font-family="${FONT}" font-size="13" font-weight="700" fill="${c.text}">${label}</text><text x="38" y="${y + 16}" font-family="${FONT}" font-size="11" fill="${c.muted}">${lineOne}</text><text x="38" y="${y + 30}" font-family="${FONT}" font-size="11" fill="${c.muted}">${lineTwo}</text><path d="M20 ${y + 40}H340" stroke="${c.border}" stroke-width=".5"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">JOEYCH mobile technical focus areas</title><desc id="desc">Mobile-friendly technical categories spanning embedded firmware, PCB and EDA, flight control, agent engineering, local AI, interface craft, electromagnetic simulation, and HMI development.</desc><rect width="${W}" height="${H}" fill="${c.bg}"/><path d="M0 .5H360M0 ${H - .5}H360" stroke="${c.border}" stroke-width="1"/><text x="20" y="25" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5" fill="${c.dim}">// TECHNICAL FOCUS</text><path d="M20 35H340" stroke="${c.border}" stroke-width=".5"/>${rows}<rect width="3" height="${H}" fill="${c.accent}" opacity=".7"/></svg>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const dark = url.searchParams.get("theme") !== "light";
  const mobile = url.searchParams.get("layout") === "mobile";
  const c = dark
    ? { bg: "#0a0c10", panel: "#12151b", text: "#e6edf3", muted: "#8b949e", dim: "#7d8590", border: "#30363d", accent: "#39d353", accentText: "#39d353", info: "#79c0ff" }
    : { bg: "#fcfbf9", panel: "#f5f2eb", text: "#1a1a1a", muted: "#57606a", dim: "#59636e", border: "#e5e1d8", accent: "#16a34a", accentText: "#137333", info: "#0550ae" };
  if (mobile) return new Response(withAccessibleText(mobileSvg(c), c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  const rows = FOCUS.map(([label, lineOne, lineTwo], index) => {
    const y = 55 + index * 36;
    return `<circle cx="28" cy="${y - 4}" r="3" fill="${index % 2 === 0 ? c.accent : c.info}"/><text x="42" y="${y}" font-family="${FONT}" font-size="12" font-weight="700" fill="${c.text}">${label}</text><text x="240" y="${y}" font-family="${FONT}" font-size="11" fill="${c.muted}">${lineOne} ${lineTwo}</text><path d="M24 ${y + 14.5}H876" stroke="${c.border}" stroke-width=".5"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="348" viewBox="0 0 900 348" role="img" aria-labelledby="title desc"><title id="title">JOEYCH technical focus areas</title><desc id="desc">Technical categories spanning embedded firmware, PCB and EDA, flight control, agent engineering, local AI, interface craft, electromagnetic simulation, and HMI development.</desc><rect width="900" height="348" fill="${c.bg}"/><path d="M0 .5H900M0 347.5H900" stroke="${c.border}" stroke-width="1"/><text x="24" y="16" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="2" fill="${c.dim}">// TECHNICAL FOCUS</text><path d="M24 24H876" stroke="${c.border}" stroke-width=".5"/><text x="42" y="40" font-family="${FONT}" font-size="9" letter-spacing="1" fill="${c.dim}">CATEGORY</text><text x="240" y="40" font-family="${FONT}" font-size="9" letter-spacing="1" fill="${c.dim}">FACTUAL FOCUS</text>${rows}<rect width="3" height="348" fill="${c.accent}" opacity=".7"/></svg>`;
  return new Response(withAccessibleText(svg, c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
