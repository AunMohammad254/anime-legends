import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const dist = new URL("../dist/", import.meta.url);
const site = new URL("https://example.invalid/games/anime-legends/");

function artifact(reference, base) {
  assert.ok(reference?.trim(), `Empty asset reference in ${base}`);
  const url = new URL(reference, base);
  assert.ok(url.origin === site.origin && url.pathname.startsWith(site.pathname),
    `${reference} escapes the deployment directory when loaded from ${base}`);
  // Filesystem URL support preserves escaped filenames on Windows and POSIX.
  const file = new URL("./" + url.pathname.slice(site.pathname.length), dist);
  assert.ok(statSync(file, { throwIfNoEntry: false })?.isFile(), `Missing build artifact: ${file.href}`);
  return { file, url };
}

function checkStylesheet(window, stylesheet) {
  const sheet = new window.CSSStyleSheet();
  sheet.replaceSync(readFileSync(stylesheet.file, "utf8"));
  let hasFont = false;
  for (const rule of sheet.cssRules) {
    // CSSOM serializes URL values consistently, including filenames with spaces.
    for (const match of rule.cssText.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
      const reference = match[1] ?? match[2] ?? match[3];
      if (!reference.startsWith("data:") && !reference.startsWith("#")) artifact(reference, stylesheet.url);
      if (rule.type === window.CSSRule.FONT_FACE_RULE) hasFont = true;
    }
  }
  return hasFont;
}

for (const [page, destination] of [["index.html", "game.html"], ["game.html", "index.html"]]) {
  test(`${page} and its assets work under a deployment subdirectory`, () => {
    const entry = artifact(page, site);
    const dom = new JSDOM(readFileSync(entry.file, "utf8"), { url: entry.url.href });
    const { document } = dom.window;
    const target = new URL(destination, site);
    assert.ok([...document.links].some(link => link.origin === target.origin && link.pathname === target.pathname),
      `${page} must link to ${destination}`);

    for (const selector of ['script[type="module"][src]', 'link[rel~="stylesheet"][href]', "img[src]"]) {
      assert.ok(document.querySelector(selector), `No ${selector} in ${page}`);
    }
    if (page === "index.html") assert.ok(document.querySelector("video[src], video source[src]"), "Missing gameplay trailer");

    let hasFont = false;
    for (const element of document.querySelectorAll("[src], video[poster], link[href]")) {
      for (const attr of ["src", "poster", "href"]) {
        if (!element.hasAttribute(attr)) continue;
        const asset = artifact(element.getAttribute(attr), document.baseURI);
        if (element.matches('link[rel~="stylesheet"]')) {
          if (checkStylesheet(dom.window, asset)) hasFont = true;
        }
      }
    }
    assert.ok(hasFont, `No bundled font referenced by ${page}`);
    dom.window.close();
  });
}
