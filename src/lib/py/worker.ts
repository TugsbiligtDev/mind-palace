// Web Worker that runs learner Python (Pyodide), so a runaway loop can't freeze the page:
// the client terminates this worker when a run takes too long.
import { gradePy, packageSources, runPy, type PyCheck, type PyodideLike } from "./core";

type Request =
  | { id: number; type: "warm" }
  | { id: number; type: "packages"; sources: string[] }
  | { id: number; type: "run"; code: string; stdin: string[] }
  | { id: number; type: "grade"; code: string; check: PyCheck };

// Python itself is served from a CDN and loaded outside the bundler. Keep this version in
// step with the `pyodide` package in package.json (the content check uses that copy).
const PYODIDE_VERSION = "314.0.7";
const BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let engine: Promise<PyodideLike> | null = null;

type Loader = (opts: { indexURL: string }) => Promise<PyodideLike>;

function loadEngine() {
  engine ??= (async () => {
    // The bundler makes this a classic worker, and Pyodide's module build refuses to start in
    // one. It decides that by trying importScripts while it loads, so hide that function first.
    Object.defineProperty(self, "importScripts", { value: undefined, configurable: true, writable: true });
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}pyodide.mjs`)) as { loadPyodide: Loader };
    return mod.loadPyodide({ indexURL: BASE });
  })();
  return engine;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    const py = await loadEngine();
    let result: unknown = null;
    if (req.type === "packages") await py.loadPackagesFromImports(packageSources(req.sources));
    else if (req.type === "run") result = await runPy(py, req.code, req.stdin);
    else if (req.type === "grade") result = await gradePy(py, req.code, req.check);
    self.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    engine = null; // let the next request try loading again
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
