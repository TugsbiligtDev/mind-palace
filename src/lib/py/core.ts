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

export type CallResult = { call: string; value: string; threw: boolean };

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

def _mp_fmt(v, unordered=False, depth=0):
    if depth > 30:
        return "..."
    d = depth + 1
    if isinstance(v, (list, tuple)):
        items = [_mp_fmt(x, unordered, d) for x in v]
        if unordered:
            items.sort()
        inner = ", ".join(items)
        if isinstance(v, list):
            return "[" + inner + "]"
        return "(" + inner + ("," if len(items) == 1 else "") + ")"
    if isinstance(v, (set, frozenset)):
        items = sorted(_mp_fmt(x, unordered, d) for x in v)
        return "{" + ", ".join(items) + "}" if items else "set()"
    if isinstance(v, dict):
        items = [_mp_fmt(k, unordered, d) + ": " + _mp_fmt(x, unordered, d) for k, x in v.items()]
        if unordered:
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

    def tracer(frame, event, arg):
        if time.monotonic() > deadline:
            raise TimeoutError("your code ran for too long (is there a loop that never ends?)")
        return tracer

    try:
        linecache.cache["main.py"] = (len(code), None, code.splitlines(True), "main.py")
        if deadline:
            sys.settrace(tracer)
        try:
            exec(compile(code, "main.py", "exec"), ns)
        except BaseException as e:
            sys.settrace(None)
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
                if deadline:
                    sys.settrace(tracer)  # Python turns tracing off after the tracer raises
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
                    out["results"].append({"call": t, "value": _mp_fmt(value, unordered), "threw": False})
                except BaseException as e:
                    out["results"].append({"call": t, "value": type(e).__name__, "threw": True})
    finally:
        sys.settrace(None)
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
  const same = (r: CallResult, i: number) => r.value === ref.results[i].value && r.threw === ref.results[i].threw;
  const bad = output.results.findIndex((r, i) => !same(r, i));
  const passed = output.results.filter((r, i) => same(r, i)).length;
  if (bad < 0) return { correct: true, output, passed, total, message: `All ${total} tests pass.` };
  const mine = output.results[bad];
  const want = ref.results[bad];
  const show = (r: CallResult) => (r.threw ? `an error (${r.value})` : r.value);
  const first = mine.call.includes("\n") ? "a multi-line test" : mine.call;
  return {
    correct: false,
    output,
    passed,
    total,
    message: `${passed} of ${total} tests pass. First miss: ${first} should give ${show(want)}, but gave ${show(mine)}.`,
  };
}

// Text form of a run used by "predict the output" questions: everything the program printed.
export function logText(output: PyRunOutput): string {
  return output.logs.join("\n");
}
