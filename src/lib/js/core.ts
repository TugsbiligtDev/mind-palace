// Shared JavaScript engine: runs learner code and grades it against a reference solution.
// Used by the browser worker and by the content check script, so both grade the same way.
// Nothing here touches the browser or Node: the caller passes in `exec`, a function that
// runs a script and returns its text result (the worker uses eval, the check script uses
// Node's `vm`, which also enforces a time limit).

// A graded exercise: `tests` are expressions that call the learner's code, e.g.
// "twoSum([2, 7, 11], 9)". The same expressions run against `solution`, and the results
// must match. An in-place exercise can use a small function: "(() => { const a = [3, 1]; sortIt(a); return a; })()".
export type JsCheck = { tests: string[]; solution: string; unordered?: boolean };

export type JsError = { message: string; line?: number };

// One test call. `got` is the printed value, `error` the error name if the call threw.
export type CallResult = { call: string; value: string; threw: boolean };

export type JsRunOutput = { logs: string[]; error?: JsError; results: CallResult[] };

export type JsVerdict = { correct: boolean; output: JsRunOutput; message: string; passed: number; total: number };

export type Exec = (source: string) => string;

const MAX_LOG_LINES = 300;
const MAX_LOG_CHARS = 2000;

// Runs inside the sandbox, so it is a string. It defines `format` (a printer that also
// serves as the canonical form used for comparing results) and returns a function that
// runs one program. The learner's code is compiled by `new Function`, so it sees only the
// global scope plus a replacement `console`, never these helpers.
const RUNTIME = String.raw`
(function () {
  function format(v, sortAll, seen, depth) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    var t = typeof v;
    if (t === "string") return sortAll || depth > 0 ? "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'" : v;
    if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
    if (t === "bigint") return String(v) + "n";
    if (t === "boolean" || t === "symbol") return String(v);
    if (t === "function") return "[Function" + (v.name ? ": " + v.name : "") + "]";
    seen = seen || [];
    if (seen.indexOf(v) >= 0) return "[Circular]";
    if (depth > 60) return "[Too deep]";
    seen = seen.concat([v]);
    var d = depth + 1;
    var f = function (x) { return format(x, sortAll, seen, d); };
    var q = function (x) { return typeof x === "string" ? format(x, true, seen, d) : f(x); };
    var wrap = function (open, items, close) { return items.length ? open + " " + items.join(", ") + " " + close : open + close; };
    if (Array.isArray(v)) {
      var items = [];
      for (var i = 0; i < v.length && i < 1000; i++) items.push(i in v ? f(v[i]) : "<empty>");
      if (v.length > 1000) items.push("… " + (v.length - 1000) + " more");
      if (sortAll) items.sort();
      return wrap("[", items, "]");
    }
    if (v instanceof Map) {
      var m = [];
      v.forEach(function (val, key) { m.push(q(key) + " => " + f(val)); });
      if (sortAll) m.sort();
      return "Map(" + v.size + ") " + wrap("{", m, "}");
    }
    if (v instanceof Set) {
      var s = [];
      v.forEach(function (val) { s.push(f(val)); });
      if (sortAll) s.sort();
      return "Set(" + v.size + ") " + wrap("{", s, "}");
    }
    if (v instanceof Error) return v.name + ": " + v.message;
    if (ArrayBuffer.isView(v)) return v.constructor.name + "(" + v.length + ") " + wrap("[", Array.prototype.slice.call(v, 0, 1000).map(String), "]");
    var proto = Object.getPrototypeOf(v);
    var name = proto && proto.constructor && proto.constructor !== Object ? proto.constructor.name + " " : "";
    var keys = Object.keys(v);
    if (sortAll) keys.sort();
    var body = keys.map(function (k) { return k + ": " + f(v[k]); });
    return name + wrap("{", body, "}");
  }

  function lineOf(err) {
    var m = err && typeof err.stack === "string" && /, <anonymous>:(\d+):\d+\)/.exec(err.stack);
    // A function made by new Function starts two lines above its body.
    return m ? Math.max(1, Number(m[1]) - 2) : undefined;
  }

  return function (code, tests, unordered, maxLines, maxChars) {
    var logs = [];
    var clip = function (s) { return s.length > maxChars ? s.slice(0, maxChars) + "…" : s; };
    var push = function () {
      var line = Array.prototype.map.call(arguments, function (a) { return format(a, false, null, 0); }).join(" ");
      if (logs.length < maxLines) logs.push(clip(line));
      else if (logs.length === maxLines) logs.push("… more output hidden");
    };
    var fake = { log: push, info: push, warn: push, error: push, debug: push, table: push, group: function () {}, groupEnd: function () {} };
    var out = { logs: logs, results: [] };
    var thunks;
    try {
      var body = '"use strict";' + code + "\n;return [" +
        tests.map(function (t) { return "function () { return (" + t + "\n); }"; }).join(",") + "];";
      thunks = new Function("console", body)(fake);
    } catch (err) {
      out.error = { message: err instanceof Error ? err.name + ": " + err.message : String(err), line: lineOf(err) };
      return JSON.stringify(out);
    }
    for (var i = 0; i < thunks.length; i++) {
      try {
        out.results.push({ call: tests[i], value: format(thunks[i](), unordered, null, 0), threw: false });
      } catch (err) {
        out.results.push({ call: tests[i], value: err instanceof Error ? err.name : "Error", threw: true });
      }
    }
    return JSON.stringify(out);
  };
})()
`;

function runProgram(exec: Exec, code: string, tests: string[], unordered: boolean): JsRunOutput {
  const source = `(${RUNTIME})(${JSON.stringify(code)}, ${JSON.stringify(tests)}, ${unordered}, ${MAX_LOG_LINES}, ${MAX_LOG_CHARS})`;
  return JSON.parse(exec(source)) as JsRunOutput;
}

// Just run the code and show what it printed (the Run button).
export function runJs(exec: Exec, code: string): JsRunOutput {
  return runProgram(exec, code, [], false);
}

// Run the learner's code and the reference on the same test calls and compare (Submit).
export function gradeJs(exec: Exec, code: string, check: JsCheck): JsVerdict {
  const unordered = check.unordered ?? false;
  const ref = runProgram(exec, check.solution, check.tests, unordered);
  if (ref.error) throw new Error(`Reference solution failed: ${ref.error.message}`);
  const output = runProgram(exec, code, check.tests, unordered);
  const total = check.tests.length;
  if (output.error) {
    return { correct: false, output, passed: 0, total, message: "Your code hit an error before the tests could run, so fix that first." };
  }
  const bad = output.results.findIndex((r, i) => r.value !== ref.results[i].value || r.threw !== ref.results[i].threw);
  const passed = output.results.filter((r, i) => r.value === ref.results[i].value && r.threw === ref.results[i].threw).length;
  if (bad < 0) return { correct: true, output, passed, total, message: `All ${total} tests pass.` };
  const mine = output.results[bad];
  const want = ref.results[bad];
  const show = (r: CallResult) => (r.threw ? `an error (${r.value})` : r.value);
  return {
    correct: false,
    output,
    passed,
    total,
    message: `${passed} of ${total} tests pass. First miss: ${mine.call} should give ${show(want)}, but gave ${show(mine)}.`,
  };
}

// Text form of a run used by "predict the output" questions: one line per console.log call.
export function logText(output: JsRunOutput): string {
  return output.logs.join("\n");
}
