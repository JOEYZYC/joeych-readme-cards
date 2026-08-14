import assert from "node:assert/strict";
import test from "node:test";
import header from "../api/header.js";
import profile from "../api/profile.js";
import skills from "../api/skills.js";
import footer from "../api/footer.js";
import banner from "../api/banner.js";

const handlers = { header, profile, skills, footer, banner };
const dimensions = {
  desktop: { header: [900, 196], profile: [900, 292], skills: [900, 305], footer: [900, 92], banner: [900, 44] },
  mobile: { header: [360, 238], profile: [360, 500], skills: [360, 490], footer: [360, 184], banner: [360, 72] },
};

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

for (const [layout, cards] of Object.entries(dimensions)) {
  for (const theme of ["light", "dark"]) {
    for (const [name, handler] of Object.entries(handlers)) {
      test(`${name} emits ${layout} ${theme} SVG with accessible metadata`, async () => {
        const layoutQuery = layout === "mobile" ? "&layout=mobile" : "";
        const response = await handler(new Request(`https://test.local/api/${name}?theme=${theme}&preview=1${layoutQuery}`));
        const svg = await response.text();
        const [width, height] = cards[name];
        assert.equal(response.headers.get("Content-Type"), "image/svg+xml");
        assert.match(svg, new RegExp(`<svg[^>]*width="${width}" height="${height}"`));
        assert.match(svg, /<title id="title">/);
        assert.match(svg, /<desc id="desc">/);
        assert.doesNotMatch(svg, /Hazy019|Kyrell Santillan|OPEN FOR WORK|\bOFW\b/);
      });
    }
  }
}

test("header desktop cursor ends before prompt text begins", async () => {
  const svg = await (await header(new Request("https://test.local/api/header?theme=dark&preview=1"))).text();
  assert.match(svg, /<rect class="prompt-cursor" x="28" y="168" width="7" height="11"/);
  assert.match(svg, /<text class="prompt" x="44" y="177"/);
  assert.doesNotMatch(svg, /<text[^>]+x="32" y="177"/);
});

for (const [layout, query] of [["desktop", ""], ["mobile", "&layout=mobile"]]) {
  test(`header ${layout} hides rotating prompt parents under reduced motion`, async () => {
    const svg = await (await header(new Request(`https://test.local/api/header?theme=dark&preview=1${query}`))).text();
    assert.match(svg, /<text class="prompt"[^>]*opacity="0">>_Focus:/);
    assert.equal((svg.match(/class="animated-prompt"/g) ?? []).length, 3);
    assert.match(svg, /@media \(prefers-reduced-motion: reduce\)\{\.animated-prompt\{display:none}\.prompt\{opacity:1}/);
    assert.match(svg, /\.prompt-cursor animate\{display:none}/);
  });
}

test("profile light inset uses the documented warm-paper token", async () => {
  const svg = await (await profile(new Request("https://test.local/api/profile?theme=light&preview=1"))).text();
  assert.match(svg, /<rect x="456" width="444" height="292" fill="#f0ead6"/);
});

test("profile live path counts only original repositories and orders languages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { fork: false, stargazers_count: 3, language: "JavaScript" },
    { fork: false, stargazers_count: 10, language: "JavaScript" },
    { fork: false, stargazers_count: 1, language: "Python" },
    { fork: false, stargazers_count: 2, language: undefined },
    { fork: true, stargazers_count: 9999, language: "Rust" },
  ]), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const svg = await (await profile(new Request("https://test.local/api/profile?theme=dark"))).text();
    assert.match(svg, />4</);
    assert.match(svg, />16</);
    assert.match(svg, />JavaScript · Python</);
    assert.match(svg, /仅统计非 fork 的 owner 仓库/);
    assert.match(svg, new RegExp(`UTC ${new Date().getUTCFullYear()}`));
    assert.doesNotMatch(svg, />9999</);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const [name, fetchImpl] of [["HTTP failure", async () => new Response("unavailable", { status: 503 })], ["network failure", async () => { throw new Error("offline"); }]]) {
  test(`profile live path reports ${name.toLowerCase()} without invented statistics`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const svg = await (await profile(new Request("https://test.local/api/profile?theme=dark"))).text();
      assert.match(svg, /GitHub REST 暂不可用/);
      assert.match(svg, /不可用/);
      assert.doesNotMatch(svg, />\d+</);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

for (const query of ["", "&layout=mobile"]) {
  test(`profile preview${query ? " mobile" : " desktop"} never invents live statistics`, async () => {
    const response = await profile(new Request(`https://test.local/api/profile?theme=light&preview=1${query}`));
    const svg = await response.text();
    assert.match(svg, /原创仓库/);
    assert.match(svg, /不可用/);
    assert.match(svg, /静态快照不展示实时 GitHub 数据/);
    assert.match(svg, /语言统计不可用/);
    assert.doesNotMatch(svg, />8</);
    assert.doesNotMatch(svg, />12</);
    assert.doesNotMatch(svg, /C\+\+ · Python · C/);
  });
}

test("profile preview desktop and mobile never invoke fetch", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("preview must not fetch");
  };
  try {
    for (const query of ["", "&layout=mobile"]) {
      const svg = await (await profile(new Request(`https://test.local/api/profile?theme=light&preview=1${query}`))).text();
      assert.match(svg, /静态快照不展示实时 GitHub 数据/);
      assert.doesNotMatch(svg, />\d+</);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("documented small-text tokens meet WCAG AA on declared surfaces", () => {
  const pairs = [
    ["#59636e", "#fcfbf9"], ["#59636e", "#f5f2eb"], ["#59636e", "#f0ead6"], ["#59636e", "#dcfce7"],
    ["#137333", "#fcfbf9"], ["#137333", "#f5f2eb"], ["#137333", "#f0ead6"], ["#137333", "#dcfce7"],
    ["#7d8590", "#0a0c10"], ["#7d8590", "#12151b"], ["#7d8590", "#0d1015"], ["#7d8590", "#0d2114"],
    ["#39d353", "#0a0c10"], ["#39d353", "#12151b"], ["#39d353", "#0d1015"], ["#39d353", "#0d2114"],
    ["#7a4d00", "#fcfbf9"], ["#7a4d00", "#f5f2eb"], ["#7a4d00", "#f0ead6"], ["#7a4d00", "#f3efdf"], ["#7a4d00", "#dcfce7"],
    ["#d29922", "#0a0c10"], ["#d29922", "#0d1015"], ["#d29922", "#0d2114"],
  ];
  assert.ok(contrast("#9a6700", "#f3efdf") < 4.5, "the retired light warning token must fail AA on the actual inset composite");
  for (const [foreground, background] of pairs) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must meet AA`);
});

test("mobile profile keeps the first stat row clear of its heading and divider", async () => {
  const svg = await (await profile(new Request("https://test.local/api/profile?theme=light&preview=1&layout=mobile"))).text();
  assert.match(svg, /<text x="20" y="294"[^>]*>\/\/ GITHUB REST STATS/);
  assert.match(svg, /<path d="M20 303H340"/);
  assert.match(svg, /<circle cx="24" cy="317" r="3.5"/);
  assert.match(svg, /<text x="38" y="322"/);
});

test("mobile skills keeps the final technology pill above the bottom clearance", async () => {
  const svg = await (await skills(new Request("https://test.local/api/skills?theme=dark&preview=1&layout=mobile"))).text();
  assert.match(svg, /<svg[^>]*width="360" height="490"/);
  assert.match(svg, /<rect x="20" y="453" width="156" height="22"/);
  assert.ok(490 - (453 + 22) >= 12);
});
