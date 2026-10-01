// Shared HTML & CSS engine: turns the learner's two files into one page, and grades the page by
// running small check expressions against it and against a reference solution. Used by the
// browser (a hidden iframe) and by the content check (headless Chrome), so both grade alike.
// Nothing here imports browser or Node code: the caller passes in `RunChecks`, which renders
// a page at a given width and runs the checks inside it (see `checkInFrame`).

// The two files of an exercise. `css` is "" when the step has no style.css tab.
export type WebFiles = { html: string; css: string };

// A graded exercise. `tests` are expressions such as "css('h1', 'color')" or "$$('nav a').length",
// run against the learner's page and the solution's page at every width in `widths`.
export type WebCheck = { tests: string[]; solution: WebFiles; widths: number[] };

// One check. `value` is shown to the learner, `key` is what gets compared.
export type CheckResult = { call: string; value: string; key: string; threw: boolean };

export type RunChecks = (page: string, tests: string[], width: number) => Promise<CheckResult[]>;

export type WebVerdict = { correct: boolean; message: string; passed: number; total: number };

export const DEFAULT_WIDTH = 800;
export const FRAME_HEIGHT = 600;

// Relative paths in exercises (images/cover-dune.svg) resolve here, on the site itself, so the
// preview can show the course's sample images. The content check serves the same folder.
export const ASSET_BASE = "/course-assets/html-css/";
const BASE_TAG = `<base href="${ASSET_BASE}" data-preview>`;

// A link tag that loads style.css from any folder (style.css, ./style.css, css/style.css…),
// in any attribute order.
const STYLE_LINK = /<link\b[^>]*\bhref\s*=\s*["']?(?:[^"'\s>]*\/)?style\.css["']?[^>]*>/gi;

// A snippet is wrapped in a ready-made page that already links style.css. A full document is
// used as written, so its CSS only applies if it links style.css itself, like a real site.
export function buildPage({ html, css }: WebFiles): string {
  const full = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
  const doc = full
    ? html
    : `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Preview</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n${html}\n</body>\n</html>`;
  const style = `<style data-file="style.css">\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`;
  const withCss = doc.replace(STYLE_LINK, () => style);
  // The base tag goes first in <head> (or straight after <html> or the doctype), before
  // anything that loads a file. Never before the doctype, which would switch on quirks mode.
  const at = /<head\b[^>]*>/i.exec(withCss) ?? /<html\b[^>]*>/i.exec(withCss) ?? /<!doctype[^>]*>/i.exec(withCss);
  const cut = at ? at.index + at[0].length : 0;
  return withCss.slice(0, cut) + BASE_TAG + withCss.slice(cut);
}

// The checks' little toolkit, run against the rendered page. It is a string so the content
// check can send it into headless Chrome unchanged. Helpers:
//   $(sel), $$(sel)        querySelector / querySelectorAll (as an array)
//   css(sel, prop, pseudo) the computed value, e.g. css('h1', 'color') or css('li', 'content', '::before')
//   cssAll(sel, prop, pseudo) the same for every match, as a list
//   box(sel)               rounded position and size: { x, y, width, height }
//   edges(sel, outer)      how far sel's box sits inside outer's box: { top, right, bottom, left }
//   scrolled(y, sel)       box(sel) after scrolling the page down y pixels (then scrolls back)
//   text(sel), attr(sel, name), count(sel)
//   rule(selector, prop)   the value a stylesheet rule sets (for :hover, :focus and other states
//                          a check can't trigger), computed so "red" and "#f00" compare equal.
//                          `selector` may be a list of acceptable selectors; the last match wins.
//   declared(selector, prop) the value exactly as written in the stylesheet (lowercased), e.g. to
//                          check that a size was given in rem; same selector rules as rule()
//   selectors()            the selector of every style rule in the page's stylesheets
//   doc, win               the page's document and window
export const CHECK_RUNTIME = String.raw`
(function (doc, tests) {
  var win = doc.defaultView;
  function need(sel) {
    var el = doc.querySelector(sel);
    if (!el) throw new Error("nothing on the page matches " + sel);
    return el;
  }
  function $(sel) { return doc.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); }
  function css(sel, prop, pseudo) { return win.getComputedStyle(need(sel), pseudo || null).getPropertyValue(prop).trim(); }
  function cssAll(sel, prop, pseudo) {
    return $$(sel).map(function (el) { return win.getComputedStyle(el, pseudo || null).getPropertyValue(prop).trim(); });
  }
  function box(sel) {
    var r = need(sel).getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }
  function edges(sel, outer) {
    var a = need(sel).getBoundingClientRect(), b = need(outer).getBoundingClientRect();
    return { top: Math.round(a.top - b.top), right: Math.round(b.right - a.right), bottom: Math.round(b.bottom - a.bottom), left: Math.round(a.left - b.left) };
  }
  function scrolled(y, sel) {
    var root = doc.scrollingElement, before = root.scrollTop;
    root.scrollTop = y;
    try { return box(sel); } finally { root.scrollTop = before; }
  }
  function text(sel) { return need(sel).textContent.replace(/\s+/g, " ").trim(); }
  function attr(sel, name) { return need(sel).getAttribute(name); }
  function count(sel) { return doc.querySelectorAll(sel).length; }
  function eachRule(fn) {
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        fn(rules[i]);
        if (rules[i].cssRules) walk(rules[i].cssRules);
      }
    }
    for (var s = 0; s < doc.styleSheets.length; s++) walk(doc.styleSheets[s].cssRules);
  }
  function selectors() {
    var out = [];
    eachRule(function (r) { if (r.selectorText !== undefined) out.push(squash(r.selectorText)); });
    return out;
  }
  function squash(s) { return s.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").trim(); }
  function declared(selector, prop) {
    var wants = [].concat(selector).map(squash), found = null;
    eachRule(function (r) {
      if (r.selectorText !== undefined && wants.indexOf(squash(r.selectorText)) >= 0) {
        var v = r.style.getPropertyValue(prop);
        if (v) found = v.trim().toLowerCase();
      }
    });
    return found;
  }
  function rule(selector, prop) {
    var found = declared(selector, prop);
    if (found === null) return null;
    var probe = doc.createElement("div");
    probe.style.setProperty(prop, found);
    doc.body.appendChild(probe);
    var value = win.getComputedStyle(probe).getPropertyValue(prop).trim();
    probe.remove();
    return value || found.trim();
  }
  function shown(v) {
    if (v === undefined) return "undefined";
    if (v && v.nodeType === 1) return "<" + v.localName + ">";
    if (Array.isArray(v)) return "[" + v.map(shown).join(", ") + "]";
    if (typeof v === "string") return JSON.stringify(v);
    if (v && typeof v === "object") {
      if (typeof v.length === "number" && typeof v.item === "function") return shown(Array.prototype.slice.call(v));
      return "{ " + Object.keys(v).map(function (k) { return k + ": " + shown(v[k]); }).join(", ") + " }";
    }
    return String(v);
  }
  var out = [];
  for (var i = 0; i < tests.length; i++) {
    try {
      var value = new Function("$", "$$", "css", "cssAll", "box", "edges", "scrolled", "text", "attr", "count", "rule", "declared", "selectors", "doc", "win",
        '"use strict"; return (' + tests[i] + "\n);")($, $$, css, cssAll, box, edges, scrolled, text, attr, count, rule, declared, selectors, doc, win);
      var s = shown(value);
      out.push({ call: tests[i], value: s, key: s, threw: false });
    } catch (err) {
      var msg = err && err.message ? err.message : String(err);
      out.push({ call: tests[i], value: msg, key: "!" + msg, threw: true });
    }
  }
  return out;
})
`;

// Renders `page` in a fresh, hidden, script-free iframe `width` pixels wide and runs the checks.
// It only uses the DOM, and nothing from outside its own body, so the content check can send
// its source text into headless Chrome and both sides render and measure the same way.
export async function checkInFrame(page: string, tests: string[], width: number, height: number, runtime: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden;`;
  const loaded = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  frame.srcdoc = page;
  document.body.appendChild(frame);
  try {
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 4000))]);
    const doc = frame.contentDocument!;
    await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    const run = new Function(`return (${runtime});`)() as (doc: Document, tests: string[]) => CheckResult[];
    return run(doc, tests);
  } finally {
    frame.remove();
  }
}

// Run the checks on the learner's page and the reference page, at every width, and compare.
export async function gradeWeb(run: RunChecks, files: WebFiles, check: WebCheck): Promise<WebVerdict> {
  const mine = buildPage(files);
  const ref = buildPage(check.solution);
  const per = check.tests.length;
  const total = per * check.widths.length;
  let passed = 0;
  let firstMiss = "";
  for (const width of check.widths) {
    const want = await run(ref, check.tests, width);
    const missing = want.find((r) => r.threw);
    if (missing) throw new Error(`Reference solution fails a check at ${width}px: ${missing.call} → ${missing.value}`);
    const got = await run(mine, check.tests, width);
    got.forEach((r, i) => {
      if (r.key === want[i].key) passed++;
      else if (!firstMiss) {
        const at = check.widths.length > 1 ? ` (on a screen ${width}px wide)` : "";
        firstMiss = `First miss${at}: ${r.call} should give ${want[i].value}, but ${r.threw ? `hit a problem: ${r.value}` : `gave ${r.value}`}.`;
      }
    });
  }
  if (passed === total) return { correct: true, passed, total, message: `All ${total} checks pass.` };
  return { correct: false, passed, total, message: `${passed} of ${total} checks pass. ${firstMiss}` };
}
