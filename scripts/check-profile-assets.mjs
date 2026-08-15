import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expectedSvgFilenames } from "./generate-preview.mjs";

const canonicalBaseUrl = "https://raw.githubusercontent.com/JOEYZYC/joeych-readme-cards/main/preview/svgs/";
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const canonicalFilenames = [
  "banner_dark.svg", "banner_light.svg", "banner_mobile_dark.svg", "banner_mobile_light.svg",
  "footer_dark.svg", "footer_light.svg", "footer_mobile_dark.svg", "footer_mobile_light.svg",
  "header_dark.svg", "header_light.svg", "header_mobile_dark.svg", "header_mobile_light.svg",
  "profile_dark.svg", "profile_light.svg", "profile_mobile_dark.svg", "profile_mobile_light.svg",
  "skills_dark.svg", "skills_light.svg", "skills_mobile_dark.svg", "skills_mobile_light.svg",
];

function sameMembers(left, right) { return left.size === right.size && [...left].every((value) => right.has(value)); }

function assertGeneratedFilenameContract() {
  const canonical = new Set(canonicalFilenames);
  const generated = new Set(expectedSvgFilenames);
  if (canonical.size !== 20 || generated.size !== 20 || !sameMembers(canonical, generated)) {
    throw new Error("Generated SVG filename contract does not match the canonical five-card asset set");
  }
}

export const expectedProfileAssetUrls = canonicalFilenames.map((filename) => `${canonicalBaseUrl}${filename}`);

function isWhitespace(character) { return character === " " || character === "\n" || character === "\r" || character === "\t"; }

function isNameCharacter(character) { return character !== undefined && !isWhitespace(character) && character !== "=" && character !== ">" && character !== "/"; }

function skipComment(readme, index) { const end = readme.indexOf("-->", index + 4); return end === -1 ? readme.length : end + 3; }

function isEscaped(readme, index) {
  let slashes = 0;
  while (readme[index - slashes - 1] === "\\") slashes += 1;
  return slashes % 2 === 1;
}

function isIndentedCode(readme, index) {
  const lineStart = readme.lastIndexOf("\n", index - 1) + 1;
  return readme[lineStart] === "\t" || readme.slice(lineStart, index).startsWith("    ");
}

function skipFence(readme, index) {
  const marker = readme[index];
  const lineStart = readme.lastIndexOf("\n", index - 1) + 1;
  const indentation = readme.slice(lineStart, index);
  if ((marker !== "`" && marker !== "~") || indentation.length > 3 || [...indentation].some((character) => character !== " ")) return index;
  let width = 0;
  while (readme[index + width] === marker) width += 1;
  if (width < 3) return index;
  const openingLineEnd = readme.indexOf("\n", index + width);
  const infoEnd = openingLineEnd === -1 ? readme.length : openingLineEnd;
  if (marker === "`" && readme.slice(index + width, infoEnd).includes("`")) return index;
  if (openingLineEnd === -1) return readme.length;
  let cursor = openingLineEnd + 1;
  while (cursor < readme.length) {
    let candidate = cursor;
    while (candidate < cursor + 3 && readme[candidate] === " ") candidate += 1;
    let closingWidth = 0;
    while (readme[candidate + closingWidth] === marker) closingWidth += 1;
    const lineEnd = readme.indexOf("\n", candidate + closingWidth);
    const physicalRemainder = readme.slice(candidate + closingWidth, lineEnd === -1 ? readme.length : lineEnd);
    const remainder = physicalRemainder.endsWith("\r") ? physicalRemainder.slice(0, -1) : physicalRemainder;
    if (closingWidth >= width && [...remainder].every((character) => character === " " || character === "\t")) {
      return lineEnd === -1 ? readme.length : lineEnd + 1;
    }
    const nextLineEnd = readme.indexOf("\n", cursor);
    if (nextLineEnd === -1) return readme.length;
    cursor = nextLineEnd + 1;
  }
  return readme.length;
}

function skipInlineCode(readme, index) {
  if (readme[index] !== "`") return index;
  let width = 0;
  while (readme[index + width] === "`") width += 1;
  const marker = "`".repeat(width);
  const end = readme.indexOf(marker, index + width);
  return end === -1 ? index + width : end + width;
}

function readTag(readme, index) {
  let cursor = index + 1;
  let closing = false;
  if (readme[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  while (isWhitespace(readme[cursor])) cursor += 1;
  const nameStart = cursor;
  while (isNameCharacter(readme[cursor])) cursor += 1;
  const name = readme.slice(nameStart, cursor).toLowerCase();
  if (name.length === 0) return { end: index + 1, name, closing, attributes: [] };

  const attributes = [];
  while (cursor < readme.length && readme[cursor] !== ">") {
    while (isWhitespace(readme[cursor]) || readme[cursor] === "/") cursor += 1;
    if (readme[cursor] === ">" || cursor >= readme.length) break;
    const attributeStart = cursor;
    while (isNameCharacter(readme[cursor])) cursor += 1;
    const attributeName = readme.slice(attributeStart, cursor).toLowerCase();
    if (attributeName.length === 0) {
      cursor += 1;
      continue;
    }
    while (isWhitespace(readme[cursor])) cursor += 1;
    let value;
    let quoted = false;
    if (readme[cursor] === "=") {
      cursor += 1;
      while (isWhitespace(readme[cursor])) cursor += 1;
      const quote = readme[cursor];
      if (quote === "\"" || quote === "'") {
        quoted = true;
        cursor += 1;
        const valueStart = cursor;
        while (cursor < readme.length && readme[cursor] !== quote) cursor += 1;
        value = readme.slice(valueStart, cursor);
        if (readme[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < readme.length && !isWhitespace(readme[cursor]) && readme[cursor] !== ">") cursor += 1;
        value = readme.slice(valueStart, cursor);
      }
    }
    attributes.push({ name: attributeName, value, quoted });
  }
  return { end: cursor < readme.length ? cursor + 1 : cursor, name, closing, attributes };
}

function skipRawElement(readme, index, name) {
  let cursor = index;
  let depth = 1;
  while (cursor < readme.length) {
    if (readme.startsWith("<!--", cursor)) {
      cursor = skipComment(readme, cursor);
      continue;
    }
    if (readme[cursor] !== "<") {
      cursor += 1;
      continue;
    }
    const tag = readTag(readme, cursor);
    cursor = tag.end;
    if (tag.name !== name) continue;
    if (tag.closing) {
      depth -= 1;
      if (depth === 0) return cursor;
    } else if (name === "template") {
      depth += 1;
    }
  }
  return readme.length;
}

function activeAssetValue(tag) {
  const src = tag.attributes.filter((attribute) => attribute.name === "src");
  const srcset = tag.attributes.filter((attribute) => attribute.name === "srcset");
  if (tag.name === "img") {
    if (src.length !== 1 || srcset.length !== 0 || !src[0].quoted) throw new Error("Profile img tag must have one quoted src and no srcset");
    return src[0].value;
  }
  if (srcset.length !== 1 || src.length !== 0 || !srcset[0].quoted) throw new Error("Profile source tag must have one quoted srcset and no src");
  return srcset[0].value;
}

function activeProfileAssetUrls(readme) {
  const urls = [];
  const parentTags = [];
  let cursor = 0;
  while (cursor < readme.length) {
    if (isEscaped(readme, cursor)) {
      cursor += 1;
      continue;
    }
    const fenceEnd = skipFence(readme, cursor);
    if (fenceEnd !== cursor) {
      cursor = fenceEnd;
      continue;
    }
    if (parentTags.length === 0 && isIndentedCode(readme, cursor)) {
      const lineEnd = readme.indexOf("\n", cursor);
      cursor = lineEnd === -1 ? readme.length : lineEnd + 1;
      continue;
    }
    const inlineEnd = skipInlineCode(readme, cursor);
    if (inlineEnd !== cursor) {
      cursor = inlineEnd;
      continue;
    }
    if (readme.startsWith("<!--", cursor)) {
      cursor = skipComment(readme, cursor);
      continue;
    }
    if (readme[cursor] !== "<") {
      cursor += 1;
      continue;
    }
    const tag = readTag(readme, cursor);
    cursor = tag.end;
    if (tag.closing) {
      if (parentTags.at(-1) === tag.name) parentTags.pop();
      continue;
    }
    if (tag.name === "script" || tag.name === "style" || tag.name === "template" || tag.name === "textarea" || tag.name === "title") {
      cursor = skipRawElement(readme, cursor, tag.name);
      continue;
    }
    if (tag.name === "img" || tag.name === "source") urls.push(activeAssetValue(tag));
    else if (!voidTags.has(tag.name)) parentTags.push(tag.name);
  }
  return urls;
}

export function assertProfileAssetUrls(readme) {
  assertGeneratedFilenameContract();
  const urls = activeProfileAssetUrls(readme);
  const uniqueUrls = new Set(urls);
  const expectedUrls = new Set(expectedProfileAssetUrls);

  if (uniqueUrls.size !== urls.length) throw new Error("Profile README contains duplicate canonical SVG URLs");
  if (urls.length !== 20) throw new Error(`Profile README must contain exactly 20 canonical SVG URLs, found ${urls.length}`);

  for (const url of urls) {
    if (url.startsWith(canonicalBaseUrl) && !expectedUrls.has(url)) {
      throw new Error(`Profile README contains unknown SVG filename: ${url}`);
    }
    if (!expectedUrls.has(url)) throw new Error(`Profile README contains noncanonical SVG URL: ${url}`);
  }
  if (!sameMembers(uniqueUrls, expectedUrls)) throw new Error("Profile README is missing one or more canonical SVG URLs");

  return urls;
}

export async function checkProfileAssets(readmePath) {
  const readme = await readFile(readmePath, "utf8");
  return assertProfileAssetUrls(readme);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (paths.length !== 1) throw new Error("Usage: node scripts/check-profile-assets.mjs <Profile README path>");
  const urls = await checkProfileAssets(paths[0]);
  console.log(`Profile asset invariant passed: ${urls.length} canonical SVG URLs`);
}
