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

export const FRAME_HEIGHT = 600;

// Relative paths in exercises (images/cover-dune.svg) resolve here, on the site itself, so the
// preview can show the course's sample images. The content check serves the same folder.
const ASSET_BASE = "/course-assets/html-css/";
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
//   boxes(sel)             box() for every match, as a list
//   topAt(sel)             what's painted on top at the centre of sel's box: "is on top", or the
//                          class (or tag) of the element covering it
//   edges(sel, outer)      how far sel's box sits inside outer's box: { top, right, bottom, left }
//   scrolled(y, sel)       box(sel) after scrolling the page down y pixels (then scrolls back)
//   contrast(sel)          the WCAG contrast ratio of sel's text color against the background
//                          behind it (the nearest ancestor with a solid background, else white)
//   valid(sel, value)      whether the form field would accept `value` (its built-in validation:
//                          required, type, pattern, min/max…); the field is left as it was
//   scheme(mode, sel, prop) css(sel, prop) with the page forced to the "light" or "dark" color
//                          scheme (works with light-dark(); @media prefers-color-scheme can't be forced)
//   click(sel)             clicks the element (checks run in order, so later checks see the result)
//   text(sel), attr(sel, name), count(sel)
//   rule(selector, prop)   the value a stylesheet rule sets (for :hover, :focus and other states
//                          a check can't trigger), computed so "red" and "#f00" compare equal.
//                          `selector` may be a list of acceptable selectors; the last match wins.
//                          A rule for "a, button" counts as a rule for "a" and for "button", and
//                          nested rules count by their full selector ("&:hover" in ".card" = ".card:hover").
//                          rule(selector, prop, within) only looks inside @media/@supports/@container
//                          rules whose condition contains `within`, e.g. 'prefers-reduced-motion'.
//   declared(selector, prop, within) the value exactly as written in the stylesheet (lowercased),
//                          e.g. to check that a size was given in rem; same matching as rule()
//   layers()               the cascade layer names in the order the browser set them (first mention)
//   keyframes(name)        the steps of @keyframes name, e.g. ["100%: rotate: 360deg;"], or null
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
  function boxes(sel) {
    return $$(sel).map(function (el) {
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
  }
  function topAt(sel) {
    var el = need(sel), r = el.getBoundingClientRect();
    var hit = doc.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!hit) return "nothing (off screen)";
    if (hit === el || el.contains(hit)) return "is on top";
    return "covered by " + (hit.className ? "." + String(hit.className).split(" ")[0] : hit.localName);
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
  var paint = null;
  function rgba(color) {
    paint = paint || doc.createElement("canvas").getContext("2d", { willReadFrequently: true });
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "#000";
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    var d = paint.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function luminance(c) {
    var v = c.slice(0, 3).map(function (x) { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(sel) {
    var el = need(sel), fg = rgba(win.getComputedStyle(el).color), bg = [255, 255, 255, 1];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var c = rgba(win.getComputedStyle(n).backgroundColor);
      if (c[3] > 0.99) { bg = c; break; }
    }
    // A see-through text color shows some of the background through it.
    var mixed = [0, 1, 2].map(function (i) { return fg[i] * fg[3] + bg[i] * (1 - fg[3]); });
    var a = luminance(mixed), b = luminance(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }
  function valid(sel, value) {
    var el = need(sel), before = el.value;
    el.value = value;
    try { return el.checkValidity(); } finally { el.value = before; }
  }
  function scheme(mode, sel, prop) {
    var root = doc.documentElement, before = root.style.colorScheme;
    root.style.colorScheme = mode;
    try { return css(sel, prop); } finally { root.style.colorScheme = before; }
  }
  function click(sel) {
    need(sel).click();
    return "clicked " + sel;
  }
  function text(sel) { return need(sel).textContent.replace(/\s+/g, " ").trim(); }
  function attr(sel, name) { return need(sel).getAttribute(name); }
  function count(sel) { return doc.querySelectorAll(sel).length; }
  // Visits every rule, with the conditions of the @media/@supports/@container rules around it
  // and, for nested rules, the selector written out in full ("&:hover" inside ".card" → ".card:hover").
  function eachRule(fn) {
    function full(sel, parent) {
      if (!parent) return sel;
      var p = parts(parent).length > 1 ? ":is(" + parent + ")" : parent;
      return parts(sel).map(function (one) { return one.indexOf("&") >= 0 ? one.replace(/&/g, p) : p + " " + one; }).join(",");
    }
    function walk(rules, conds, parent) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i], sel = r.selectorText !== undefined ? full(r.selectorText, parent) : undefined;
        fn(r, conds, sel);
        if (r.cssRules) walk(r.cssRules, r.conditionText !== undefined ? conds.concat([r.conditionText]) : conds, sel !== undefined ? sel : parent);
      }
    }
    for (var s = 0; s < doc.styleSheets.length; s++) walk(doc.styleSheets[s].cssRules, [], undefined);
  }
  function selectors() {
    var out = [];
    eachRule(function (r) { if (r.selectorText !== undefined) out.push(squash(r.selectorText)); });
    return out;
  }
  function squash(s) { return s.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").trim(); }
  // "a, b:is(c, d)" → ["a", "b:is(c,d)"]: split on the commas that aren't inside brackets.
  function parts(selectorText) {
    var out = [], depth = 0, cur = "";
    for (var i = 0; i < selectorText.length; i++) {
      var ch = selectorText[i];
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(squash(cur)); cur = ""; } else cur += ch;
    }
    out.push(squash(cur));
    return out;
  }
  function declared(selector, prop, within) {
    var wants = [].concat(selector).map(squash), found = null;
    var inside = within ? within.replace(/\s+/g, "").toLowerCase() : null;
    eachRule(function (r, conds, sel) {
      if (sel === undefined) return;
      if (inside && !conds.some(function (c) { return c.replace(/\s+/g, "").toLowerCase().indexOf(inside) >= 0; })) return;
      var hit = wants.indexOf(squash(sel)) >= 0 || parts(sel).some(function (p) { return wants.indexOf(p) >= 0; });
      if (hit) {
        var v = r.style.getPropertyValue(prop);
        if (v) found = v.trim().toLowerCase();
      }
    });
    return found;
  }
  function rule(selector, prop, within) {
    var found = declared(selector, prop, within);
    if (found === null) return null;
    var probe = doc.createElement("div");
    probe.style.setProperty(prop, found);
    doc.body.appendChild(probe);
    var value = win.getComputedStyle(probe).getPropertyValue(prop).trim();
    probe.remove();
    return value || found.trim();
  }
  function layers() {
    var out = [];
    function add(n) { if (out.indexOf(n) < 0) out.push(n); }
    eachRule(function (r) {
      if (r.nameList) Array.prototype.forEach.call(r.nameList, add);
      else if (r.constructor && r.constructor.name === "CSSLayerBlockRule" && r.name) add(r.name);
    });
    return out;
  }
  function keyframes(name) {
    var found = null;
    eachRule(function (r) {
      if (r.type === 7 && r.name === name) {
        found = Array.prototype.map.call(r.cssRules, function (f) { return f.keyText + ": " + f.style.cssText; });
      }
    });
    return found;
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
      var value = new Function("$", "$$", "css", "cssAll", "box", "boxes", "topAt", "edges", "scrolled", "contrast", "valid", "scheme", "click", "text", "attr", "count", "rule", "declared", "keyframes", "layers", "selectors", "doc", "win",
        '"use strict"; return (' + tests[i] + "\n);")($, $$, css, cssAll, box, boxes, topAt, edges, scrolled, contrast, valid, scheme, click, text, attr, count, rule, declared, keyframes, layers, selectors, doc, win);
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
