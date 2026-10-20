// Shared Python engine: runs learner code and grades it against a reference solution.
// Used by the browser worker and by the content check script, so both grade the same way.
// Nothing here loads Pyodide itself: the caller passes it in (the worker loads it from a CDN,
// the check script from node_modules).

// A graded exercise: `tests` are Python expressions that call the learner's code, e.g.
// "two_sum([2, 7, 11], 9)". The same expressions run against `solution`, and the printed
// results must match. A test that needs statements can assign to `result`:
// "a = [3, 1, 2]\nsort_it(a)\nresult = a". `given_input(["3", "4"], main)` runs `main` with
// those typed answers and returns everything it printed.
export type PyCheck = { tests: string[]; solution: string; unordered?: boolean; stdin?: string[] };

export type PyError = { message: string; line?: number; trace?: string };

// `printed` is the text a given_input(...) test printed; `detail` and `line` describe an error
// (Python's message, and the line of the learner's code it happened on).
export type CallResult = { call: string; value: string; key: string; threw: boolean; printed?: string; detail?: string; line?: number | null };

export type PyRunOutput = { logs: string[]; error?: PyError; results: CallResult[] };

export type PyVerdict = { correct: boolean; output: PyRunOutput; message: string; passed: number; total: number };

// The small part of Pyodide this file uses.
export type PyodideLike = {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => unknown };
  loadPackagesFromImports: (code: string) => Promise<unknown>;
};

const MAX_LOG_LINES = 300;
const MAX_LOG_CHARS = 2000;

// Runs inside Pyodide. `_mp_run` runs one program (with fake typed answers for input()),
// then evaluates the test expressions, and returns everything as JSON text.
const HARNESS = String.raw`
import builtins, contextlib, importlib, io, json, linecache, os, shutil, sys, tempfile, time, traceback

# The time limit. It's a BaseException (named like Python's own, which is what learners see), so
# a learner's "except Exception" can't swallow it. It's raised from sys.monitoring callbacks on
# every loop jump and function start: unlike sys.settrace, raising there doesn't switch the
# watcher off, so even a bare "except:" inside an endless loop is stopped on the next pass.
class TimeoutError(BaseException):
    pass

_MP_TOOL = 4
_MP_EVENTS = sys.monitoring.events.JUMP | sys.monitoring.events.PY_START

def _mp_limit_on(deadline):
    def check(code, *args):
        # The harness's own loops (this file) aren't limited, only the code it runs.
        if time.monotonic() > deadline and code.co_filename != _MP_HERE:
            raise TimeoutError("your code ran for too long (is there a loop that never ends?)")
    if sys.monitoring.get_tool(_MP_TOOL) is None:
        sys.monitoring.use_tool_id(_MP_TOOL, "time limit")
    sys.monitoring.register_callback(_MP_TOOL, sys.monitoring.events.JUMP, check)
    sys.monitoring.register_callback(_MP_TOOL, sys.monitoring.events.PY_START, check)
    sys.monitoring.set_events(_MP_TOOL, _MP_EVENTS)

_MP_HERE = _mp_limit_on.__code__.co_filename

def _mp_limit_off():
    if sys.monitoring.get_tool(_MP_TOOL) is not None:
        sys.monitoring.set_events(_MP_TOOL, 0)
        sys.monitoring.free_tool_id(_MP_TOOL)

def _mp_fmt(v, unordered=False, depth=0, canon=False):
    # canon=True gives the form used for comparing results: dictionaries are compared like
    # Python's ==, which ignores the order keys were added in.
    if depth > 30:
        return "..."
    d = depth + 1
    if isinstance(v, (list, tuple)):
        items = [_mp_fmt(x, unordered, d, canon) for x in v]
        if unordered:
            items.sort()
        inner = ", ".join(items)
        if isinstance(v, list):
            return "[" + inner + "]"
        return "(" + inner + ("," if len(items) == 1 else "") + ")"
    if isinstance(v, (set, frozenset)):
        items = sorted(_mp_fmt(x, unordered, d, canon) for x in v)
        return "{" + ", ".join(items) + "}" if items else "set()"
    if isinstance(v, dict):
        items = [_mp_fmt(k, unordered, d, canon) + ": " + _mp_fmt(x, unordered, d, canon) for k, x in v.items()]
        if unordered or canon:
            items.sort()
        return "{" + ", ".join(items) + "}"
    return repr(v)

def _mp_run(code, tests, unordered, stdin, limit, max_lines, max_chars):
    out = {"logs": [], "results": []}
    buf = io.StringIO()
    answers = list(stdin)

    def fake_input(prompt=""):
        buf.write(str(prompt))
        if not answers:
            raise EOFError("EOF when reading a line")
        a = answers.pop(0)
        buf.write(a + "\n")
        return a

    def given_input(typed, func, *args, **kwargs):
        saved_answers = list(answers)
        answers[:] = list(typed)
        inner = io.StringIO()
        try:
            with contextlib.redirect_stdout(inner):
                func(*args, **kwargs)
        finally:
            answers[:] = saved_answers
        return inner.getvalue()

    def pytest_run(files, source_as=None):
        # Runs real pytest on the given {filename: text} files (plus the learner's own code saved
        # under the name source_as) and returns its one-line summary, like "2 passed" or "1 failed, 1 passed".
        import re
        import pytest

        files = dict(files)
        if source_as:
            files[source_as] = code
        for name in list(files):
            sys.modules.pop(name.removesuffix(".py"), None)
        for name, text in files.items():
            with open(name, "w", encoding="utf-8") as fh:
                fh.write(text)
        importlib.invalidate_caches()
        tests = [n for n in files if n.startswith("test_")]
        sink = io.StringIO()
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            pytest.main(["-q", "-p", "no:cacheprovider", "--no-header", *tests])
        for name in files:
            sys.modules.pop(name.removesuffix(".py"), None)
        lines = [ln for ln in sink.getvalue().splitlines() if ln.strip()]
        return re.sub(r" in [0-9.]+s.*", "", lines[-1]) if lines else "no output"

    workdir = tempfile.mkdtemp()
    old_cwd = os.getcwd()
    old_modules = set(sys.modules)
    old_argv, old_input = sys.argv, builtins.input
    old_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    old_out, old_err = sys.stdout, sys.stderr
    os.chdir(workdir)
    sys.path.insert(0, workdir)
    sys.argv = ["main.py"]
    builtins.input = fake_input
    sys.stdout = sys.stderr = buf
    ns = {"__name__": "__main__", "__builtins__": builtins}
    deadline = time.monotonic() + limit if limit else None

    try:
        linecache.cache["main.py"] = (len(code), None, code.splitlines(True), "main.py")
        if deadline:
            _mp_limit_on(deadline)
        try:
            exec(compile(code, "main.py", "exec"), ns)
        except BaseException as e:
            _mp_limit_off()
            tb = e.__traceback__
            while tb is not None and tb.tb_frame.f_code.co_filename != "main.py":
                tb = tb.tb_next
            line = e.lineno if isinstance(e, SyntaxError) and e.filename == "main.py" else None
            if line is None:
                last = None
                t = tb
                while t is not None:
                    if t.tb_frame.f_code.co_filename == "main.py":
                        last = t.tb_lineno
                    t = t.tb_next
                line = last
            text = "".join(traceback.format_exception(type(e), e, tb if not isinstance(e, SyntaxError) else None))
            out["error"] = {"message": type(e).__name__ + (": " + str(e) if str(e) else ""), "line": line, "trace": text.strip()}
        else:
            ns["given_input"] = given_input
            ns["pytest_run"] = pytest_run
            for t in tests:
                try:
                    try:
                        compiled = compile(t, "<test>", "eval")
                    except SyntaxError:
                        compiled = None
                    if compiled is not None:
                        value = eval(compiled, ns)
                    else:
                        local = dict(ns)
                        exec(compile(t, "<test>", "exec"), local)
                        value = local["result"]
                    r = {
                        "call": t,
                        "value": _mp_fmt(value, unordered),
                        "key": _mp_fmt(value, unordered, canon=True),
                        "threw": False,
                    }
                    # What a given_input(...) test printed, as text, so feedback can show the lines.
                    if t.startswith("given_input(") and isinstance(value, str):
                        r["printed"] = value
                    out["results"].append(r)
                except BaseException as e:
                    name = type(e).__name__
                    # The error's own message and the line of the learner's code it happened on, so
                    # feedback can show what Python said (the traceback a learner is taught to read).
                    line = None
                    tb = e.__traceback__
                    while tb is not None:
                        if tb.tb_frame.f_code.co_filename == "main.py":
                            line = tb.tb_lineno
                        tb = tb.tb_next
                    detail = name + (": " + str(e) if str(e) else "")
                    out["results"].append({"call": t, "value": name, "key": name, "threw": True, "detail": detail, "line": line})
    finally:
        _mp_limit_off()
        sys.stdout, sys.stderr = old_out, old_err
        builtins.input, sys.argv = old_input, old_argv
        sys.dont_write_bytecode = old_bytecode
        os.chdir(old_cwd)
        if workdir in sys.path:
            sys.path.remove(workdir)
        for name in set(sys.modules) - old_modules:
            f = getattr(sys.modules[name], "__file__", None) or ""
            if f.startswith(workdir):
                del sys.modules[name]
        importlib.invalidate_caches()
        shutil.rmtree(workdir, ignore_errors=True)
        linecache.cache.pop("main.py", None)

    lines = buf.getvalue().splitlines()
    clip = lambda s: s[:max_chars] + "…" if len(s) > max_chars else s
    logs = [clip(s) for s in lines[:max_lines]]
    if len(lines) > max_lines:
        logs.append("… more output hidden")
    out["logs"] = logs
    return json.dumps(out)
`;

const ready = new WeakSet<object>();

function prepare(py: PyodideLike) {
  if (!ready.has(py)) {
    py.runPython(HARNESS);
    ready.add(py);
  }
}

// The text handed to Pyodide to find which extra packages to download. `zoneinfo` is part of
// Python but needs the `tzdata` package in the browser, and the `pytest_run` test helper needs
// pytest; neither is an import Pyodide can see.
export function packageSources(sources: string[]): string {
  const text = sources.join("\n");
  const extra = [/\bzoneinfo\b/.test(text) && "import tzdata", /\bpytest_run\b/.test(text) && "import pytest"].filter(Boolean);
  return [text, ...extra].join("\n");
}

async function runProgram(py: PyodideLike, code: string, tests: string[], unordered: boolean, stdin: string[], limit: number): Promise<PyRunOutput> {
  prepare(py);
  // Libraries that aren't part of Python itself (pydantic, pytest…) are fetched when imported.
  await py.loadPackagesFromImports(packageSources([code, ...tests])).catch(() => {});
  const run = py.globals.get("_mp_run") as (...args: unknown[]) => string;
  return JSON.parse(run(code, tests, unordered, stdin, limit, MAX_LOG_LINES, MAX_LOG_CHARS)) as PyRunOutput;
}

// Just run the code and show what it printed (the Run button). `limit` is a time limit in
// seconds inside Python; the browser passes 0 and stops the whole worker instead.
export function runPy(py: PyodideLike, code: string, stdin: string[] = [], limit = 0) {
  return runProgram(py, code, [], false, stdin, limit);
}

// Run the learner's code and the reference on the same test calls and compare (Submit).
export async function gradePy(py: PyodideLike, code: string, check: PyCheck, limit = 0): Promise<PyVerdict> {
  const unordered = check.unordered ?? false;
  const stdin = check.stdin ?? [];
  const ref = await runProgram(py, check.solution, check.tests, unordered, stdin, limit);
  if (ref.error) throw new Error(`Reference solution failed: ${ref.error.message}`);
  const output = await runProgram(py, code, check.tests, unordered, stdin, limit);
  const total = check.tests.length;
  if (output.error) {
    return { correct: false, output, passed: 0, total, message: "Your code hit an error before the tests could run, so fix that first." };
  }
  const same = (r: CallResult, i: number) => r.key === ref.results[i].key && r.threw === ref.results[i].threw;
  const bad = output.results.findIndex((r, i) => !same(r, i));
  const passed = output.results.filter((r, i) => same(r, i)).length;
  if (bad < 0) return { correct: true, output, passed, total, message: `All ${total} tests pass.` };
  return { correct: false, output, passed, total, message: `${passed} of ${total} tests pass. First miss: ${describeMiss(output.results[bad], ref.results[bad])}` };
}

// A test can carry a plain-English description, so feedback never shows test machinery
// (lambdas, tuple tricks, try blocks): a comment after two spaces ("expr  # what it checks"),
// or a first line "# what it checks" in a multi-line test.
export function testLabel(call: string): string | undefined {
  const lines = call.split("\n");
  if (lines.length > 1) return /^#\s*(.+)$/.exec(lines[0].trim())?.[1];
  const at = call.lastIndexOf("  # ");
  return at >= 0 ? call.slice(at + 4).trim() : undefined;
}

// "given_input(['3', '4'], add_two)" reads as "add_two() with the typed answers "3", "4"".
function givenInputCall(call: string): string | undefined {
  const m = /^given_input\(\[(.*?)\],\s*(?:lambda:\s*)?(.+)\)$/.exec(call.trim());
  if (!m) return undefined;
  const fn = /^[A-Za-z_]\w*$/.test(m[2]) ? `${m[2]}()` : m[2];
  return m[1].trim() ? `${fn} with the typed answers ${m[1].replace(/'/g, '"')}` : fn;
}

function printedLines(text: string) {
  const lines = text.replace(/\n$/, "").split("\n");
  return text ? lines.map((l) => `    ${l}`).join("\n") : "    (nothing)";
}

// The sentence after "First miss:" for one failed test.
function describeMiss(mine: CallResult, want: CallResult): string {
  const label = testLabel(mine.call);
  const what = label ?? givenInputCall(mine.call) ?? (mine.call.includes("\n") ? "one of the checks" : mine.call);
  if (mine.threw && !want.threw) {
    const where = mine.line ? ` on line ${mine.line} of your code` : "";
    return `${what} stopped with an error${where}:\n    ${mine.detail ?? mine.value}`;
  }
  if (want.printed !== undefined && mine.printed !== undefined) {
    return `${what} should print:\n${printedLines(want.printed)}\nbut it printed:\n${printedLines(mine.printed)}`;
  }
  const show = (r: CallResult) => (r.threw ? `an error (${r.value})` : r.value);
  if (label) return `${label}. Expected ${show(want)}, but got ${show(mine)}.`;
  return `${what} should give ${show(want)}, but gave ${show(mine)}.`;
}

// Text form of a run used by "predict the output" questions: everything the program printed.
export function logText(output: PyRunOutput): string {
  return output.logs.join("\n");
}
