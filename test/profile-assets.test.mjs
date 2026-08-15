import assert from "node:assert/strict";
import test from "node:test";
import { assertProfileAssetUrls, expectedProfileAssetUrls } from "../scripts/check-profile-assets.mjs";

const fixture = expectedProfileAssetUrls.map((url) => `<img src="${url}">`).join("\n");
const mixedQuoteFixture = expectedProfileAssetUrls.map((url, index) => index % 2 === 0
  ? `<img\n  src='${url}'\n>`
  : `<source\n  srcset="${url}"\n>`).join("\n");
const caseInsensitiveFixture = expectedProfileAssetUrls.map((url, index) => index % 2 === 0
  ? `<IMG SRC="${url}">`
  : `<SOURCE SRCSET="${url}">`).join("\n");

test("accepts the exact canonical Profile asset set", () => {
  assert.doesNotThrow(() => assertProfileAssetUrls(fixture));
});

test("accepts active source attributes with normal whitespace and either quote style", () => {
  assert.doesNotThrow(() => assertProfileAssetUrls(mixedQuoteFixture));
});

test("accepts case-insensitive active tag and attribute names", () => {
  assert.doesNotThrow(() => assertProfileAssetUrls(caseInsensitiveFixture));
});

test("accepts active assets after an escaped opening backtick", () => {
  assert.doesNotThrow(() => assertProfileAssetUrls(`\\\`${fixture.replaceAll("\n", " ")}\``));
});

for (const indentation of ["", " ", "  ", "   "]) {
  test(`accepts active img and source tags with ${indentation.length}-space indentation`, () => {
    assert.doesNotThrow(() => assertProfileAssetUrls(caseInsensitiveFixture.split("\n").map((line) => `${indentation}${line}`).join("\n")));
  });
}

for (const [indentationName, indentation] of [["four-space", "    "], ["tab", "\t"]]) {
  for (const [delimiterName, opening, later] of [
    ["matched single", "`", "`"],
    ["matched triple", "```", "```"],
    ["unmatched triple", "```", "``"],
  ]) {
    test(`accepts active img and source tags after ${indentationName}-indented ${delimiterName} backticks with a later delimiter`, () => {
      assert.doesNotThrow(() => assertProfileAssetUrls(`${indentation}${opening}\n${mixedQuoteFixture}\n${later}`));
    });
  }

  test(`rejects canonical img and source text on ${indentationName}-indented backtick lines with a later delimiter`, () => {
    const source = caseInsensitiveFixture.split("\n").map((line) => `${indentation}\`${line}`).join("\n");
    assert.throws(() => assertProfileAssetUrls(`${source}\n\``));
  });
}

test("rejects canonical img and source text inside normal inline code", () => {
  assert.throws(() => assertProfileAssetUrls(`\`${caseInsensitiveFixture.replaceAll("\n", " ")}\``));
});

test("accepts canonical img and source tags after an unmatched normal inline backtick", () => {
  assert.doesNotThrow(() => assertProfileAssetUrls(`\`\n${caseInsensitiveFixture}`));
});

for (const [name, marker] of [["backtick", "`"], ["tilde", "~"]]) {
  const fence = marker.repeat(3);

  for (const indentation of ["    ", "\t"]) {
    test(`rejects assets after a ${JSON.stringify(indentation)}-indented apparent ${name} fence closer`, () => {
      assert.throws(() => assertProfileAssetUrls(`${fence}html\n${indentation}${fence}\n${fixture}\n${fence}`));
    });

    test(`accepts assets after a ${JSON.stringify(indentation)}-indented apparent ${name} fence opener`, () => {
      assert.doesNotThrow(() => assertProfileAssetUrls(`${indentation}${fence}\n${fixture}`));
    });
  }

  for (const indentation of ["", " ", "  ", "   "]) {
    for (const trailingWhitespace of ["", " ", "\t", " \t "]) {
      test(`accepts a ${indentation.length}-space ${name} fence closer with ${JSON.stringify(trailingWhitespace)} trailing whitespace`, () => {
        assert.doesNotThrow(() => assertProfileAssetUrls(`${fence}html\n${indentation}${fence}${trailingWhitespace}\n${fixture}`));
      });
    }
  }

  for (const [lineEndingName, lineEnding] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
    for (const trailingWhitespace of ["   ", "\t\t"]) {
      test(`accepts a ${name} fence closer with trailing ${JSON.stringify(trailingWhitespace)} before ${lineEndingName}`, () => {
        assert.doesNotThrow(() => assertProfileAssetUrls(`${fence}html${lineEnding}   ${fence}${trailingWhitespace}${lineEnding}${fixture}`));
      });
    }
  }
}

for (const info of ["html`preview", "html preview`"]) {
  test(`accepts active assets after invalid backtick fence info ${JSON.stringify(info)}`, () => {
    assert.doesNotThrow(() => assertProfileAssetUrls(`\`\`\`${info}\n${fixture}`));
  });

  test(`rejects assets inside a tilde fence with allowed info ${JSON.stringify(info)}`, () => {
    assert.throws(() => assertProfileAssetUrls(`~~~${info}\n${fixture}\n~~~`));
  });
}

for (const [name, source] of [
  ["wrong repository", fixture.replace("JOEYZYC/joeych-readme-cards", "other/cards")],
  ["wrong branch", fixture.replace("/main/preview/", "/feature/preview/")],
  ["wrong path", fixture.replace("preview/svgs/header_dark.svg", "preview/header_dark.svg")],
  ["missing URL", fixture.replace(/<img src="[^"]+">\n?$/, "")],
  ["duplicate URL", `${fixture}\n<img src="${expectedProfileAssetUrls[0]}">`],
  ["unknown filename", fixture.replace("header_dark.svg", "unknown_dark.svg")],
  ["query suffix", fixture.replace("header_dark.svg", "header_dark.svg?cache=1")],
  ["fragment suffix", fixture.replace("header_dark.svg", "header_dark.svg#card")],
  ["HTML comments", `<!--\n${fixture}\n-->`],
  ["unrelated data attributes", expectedProfileAssetUrls.map((url) => `<div data-asset="${url}"></div>`).join("\n")],
  ["source src instead of srcset", fixture.replaceAll("<img src=", "<source src=")],
  ["script tags", expectedProfileAssetUrls.map((url) => `<script>const asset = "${url}";</script>`).join("\n")],
  ["img alt attributes", expectedProfileAssetUrls.map((url) => `<img alt="${url}">`).join("\n")],
  ["img srcset instead of src", fixture.replaceAll("<img src=", "<img srcset=")],
  ["source data-srcset instead of srcset", fixture.replaceAll("<img src=", "<source data-srcset=")],
  ["img data-src instead of src", fixture.replaceAll("<img src=", "<img data-src=")],
  ["unquoted source value", fixture.replaceAll("<img src=\"", "<source srcset=").replaceAll("\">", ">")],
  ["padded source value", fixture.replace("header_dark.svg\">", "header_dark.svg \">")],
  ["srcset descriptor", fixture.replace("header_dark.svg\">", "header_dark.svg 1x\">")],
  ["script raw text", `<script>${fixture}</script>`],
  ["style raw text", `<style>${fixture}</style>`],
  ["template contents", `<template>${fixture}</template>`],
  ["backtick fenced code", `\`\`\`html\n${fixture}\n\`\`\``],
  ["tilde fenced code", `~~~html\n${fixture}\n~~~`],
  ["inline code", `\`${fixture.replaceAll("\n", " ")}\``],
  ["quoted outer attribute", `<div data-template='${fixture.replaceAll("\n", " ")}'></div>`],
  ["duplicate img src", fixture.replace(`<img src="${expectedProfileAssetUrls[0]}">`, `<img src="${expectedProfileAssetUrls[0]}" src="${expectedProfileAssetUrls[0]}">`)],
  ["duplicate source srcset", fixture.replace(`<img src="${expectedProfileAssetUrls[0]}">`, `<source srcset="${expectedProfileAssetUrls[0]}" srcset="${expectedProfileAssetUrls[0]}">`)],
  ["competing img srcset", fixture.replace(`<img src="${expectedProfileAssetUrls[0]}">`, `<img src="${expectedProfileAssetUrls[0]}" srcset="${expectedProfileAssetUrls[0]}">`)],
  ["unclosed HTML comment", `<!--${fixture}`],
  ["uppercase script raw text", `<SCRIPT>${fixture}</SCRIPT>`],
  ["nested template contents", `<template><template>${fixture}</template></template>`],
  ["four-backtick fenced code", `\`\`\`\`html\n${fixture}\n\`\`\`\``],
  ["four-tilde fenced code", `~~~~html\n${fixture}\n~~~~`],
  ["double-backtick inline code", `\`\`${fixture.replaceAll("\n", " ")}\`\``],
  ["competing source src", fixture.replace(`<img src="${expectedProfileAssetUrls[0]}">`, `<source srcset="${expectedProfileAssetUrls[0]}" src="${expectedProfileAssetUrls[0]}">`)],
  ["case-insensitive duplicate img src", fixture.replace(`<img src="${expectedProfileAssetUrls[0]}">`, `<IMG SRC="${expectedProfileAssetUrls[0]}" sRc="${expectedProfileAssetUrls[0]}">`)],
  ["backtick fence closer with trailing text", `\`\`\`html\n${fixture}\n\`\`\` trailing\n${fixture}`],
  ["tilde fence closer with trailing text", `~~~html\n${fixture}\n~~~ trailing\n${fixture}`],
  ["escaped img delimiters", fixture.replaceAll("<img", "\\<img")],
  ["four-space indented img tags", fixture.replaceAll("<img", "    <img")],
  ["tab-indented img tags", fixture.replaceAll("<img", "\t<img")],
  ["textarea raw text", `<textarea>${fixture}</textarea>`],
  ["title raw text", `<title>${fixture}</title>`],
]) {
  test(`rejects Profile assets with ${name}`, () => {
    assert.throws(() => assertProfileAssetUrls(source));
  });
}
