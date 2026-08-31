export const config = { runtime: "edge" };

const FONT = "Consolas, Menlo, 'DejaVu Sans Mono', 'Courier New', monospace";
const withAccessibleText = (svg, c) => svg.replace(new RegExp(`(<text\\b[^>]*?)fill="${c.accent}"`, "g"), `$1fill="${c.accentText}"`);
const FOCUS = [
  ["Electromagnetic Simulation", "CST Studio Suite; metasurface modelling and", "parameter optimization."],
  ["Hardware Design", "Circuit and PCB design; soldering and", "board-level debugging."],
  ["MCU Programming", "C and RTOS; peripheral drivers", "and embedded control."],
  ["MPU Applications", "Linux-based development; device", "communication and system integration."],
  ["HMI Development", "C#, Qt, and web technologies; monitoring", "systems and data visualization."],
  ["Computer Vision", "Python, OpenCV, and deep learning; image", "processing and object detection."],
  ["Modelling and Analysis", "MATLAB/Simulink; signal processing,", "validation, and data analysis."],
  ["Teamwork", "Git and GitHub; interdisciplinary", "collaboration and integrated system testing."],
];
const TAGS = ["C", "C++", "Python", "C#", "Qt", "OpenCV", "MATLAB", "Simulink", "RTOS", "Git"];

function mobileSvg(c) {
  const W = 360;
  const H = 652;
  const rows = FOCUS.map(([label, lineOne, lineTwo], index) => {
    const y = 58 + index * 50;
    return `<circle cx="24" cy="${y - 5}" r="3.5" fill="${index % 2 === 0 ? c.accent : c.info}"/><text x="38" y="${y}" font-family="${FONT}" font-size="13" font-weight="700" fill="${c.text}">${label}</text><text x="38" y="${y + 16}" font-family="${FONT}" font-size="11" fill="${c.muted}">${lineOne}</text><text x="38" y="${y + 30}" font-family="${FONT}" font-size="11" fill="${c.muted}">${lineTwo}</text><path d="M20 ${y + 40}H340" stroke="${c.border}" stroke-width=".5"/>`;
  }).join("");
  const tags = TAGS.map((tag, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const x = 20 + col * 164;
    const y = 492 + row * 30;
    return `<rect x="${x}" y="${y}" width="156" height="22" rx="11" fill="${c.panel}" stroke="${c.border}" stroke-width=".5"/><text x="${x + 78}" y="${y + 14.5}" text-anchor="middle" font-family="${FONT}" font-size="9.5" fill="${c.muted}">${tag}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">JOEYCH mobile technical focus areas</title><desc id="desc">Mobile-friendly technical categories spanning electromagnetic simulation, hardware design, embedded software, HMI development, computer vision, modelling, and teamwork.</desc><rect width="${W}" height="${H}" fill="${c.bg}"/><path d="M0 .5H360M0 ${H - .5}H360" stroke="${c.border}" stroke-width="1"/><text x="20" y="25" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5" fill="${c.dim}">// TECHNICAL FOCUS</text><path d="M20 35H340" stroke="${c.border}" stroke-width=".5"/>${rows}<text x="20" y="474" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5" fill="${c.dim}">// TECHNOLOGIES</text><path d="M20 484H340" stroke="${c.border}" stroke-width=".5"/>${tags}<rect width="3" height="${H}" fill="${c.accent}" opacity=".7"/></svg>`;
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
  const tags = TAGS.map((tag, index) => {
    const row = Math.floor(index / 5);
    const col = index % 5;
    const x = 24 + col * 170;
    const y = 369 + row * 32;
    return `<rect x="${x}" y="${y}" width="160" height="24" rx="12" fill="${c.panel}" stroke="${c.border}" stroke-width=".5"/><text x="${x + 80}" y="${y + 15.5}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${c.muted}">${tag}</text>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="452" viewBox="0 0 900 452" role="img" aria-labelledby="title desc"><title id="title">JOEYCH technical focus areas</title><desc id="desc">Technical categories spanning electromagnetic simulation, hardware design, embedded software, HMI development, computer vision, modelling, and teamwork.</desc><rect width="900" height="452" fill="${c.bg}"/><path d="M0 .5H900M0 451.5H900" stroke="${c.border}" stroke-width="1"/><text x="24" y="16" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="2" fill="${c.dim}">// TECHNICAL FOCUS</text><path d="M24 24H876" stroke="${c.border}" stroke-width=".5"/><text x="42" y="40" font-family="${FONT}" font-size="9" letter-spacing="1" fill="${c.dim}">CATEGORY</text><text x="240" y="40" font-family="${FONT}" font-size="9" letter-spacing="1" fill="${c.dim}">FACTUAL FOCUS</text>${rows}<text x="24" y="351" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="2" fill="${c.dim}">// TECHNOLOGIES</text><path d="M24 359H876" stroke="${c.border}" stroke-width=".5"/>${tags}<rect width="3" height="452" fill="${c.accent}" opacity=".7"/></svg>`;
  return new Response(withAccessibleText(svg, c), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
