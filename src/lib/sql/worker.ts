// Web Worker that owns the in-browser PostgreSQL (PGlite). Each setup (course dataset,
// or dataset + a case's evidence) is loaded once; every run gets a fresh clone, so a
// learner's DELETE or DROP never leaks into the next attempt.
import { PGlite } from "@electric-sql/pglite";
import { grade, rawTextParsers, runInput, type CaseCheck } from "./core";

type Request =
  | { id: number; type: "run"; key: string; setup: string; input: string }
  | { id: number; type: "grade"; key: string; setup: string; input: string; check: CaseCheck }
  | { id: number; type: "warm"; key: string; setup: string };

let assets: Promise<{ pgliteWasmModule: WebAssembly.Module; initdbWasmModule: WebAssembly.Module; fsBundle: Blob }> | null =
  null;

function loadAssets() {
  assets ??= Promise.all([
    WebAssembly.compileStreaming(fetch("/pglite/pglite.wasm")),
    WebAssembly.compileStreaming(fetch("/pglite/initdb.wasm")),
    fetch("/pglite/pglite.data").then((r) => r.blob()),
  ]).then(([pgliteWasmModule, initdbWasmModule, fsBundle]) => ({ pgliteWasmModule, initdbWasmModule, fsBundle }));
  return assets;
}

const bases = new Map<string, Promise<PGlite>>();

function base(key: string, setup: string) {
  let db = bases.get(key);
  if (!db) {
    db = loadAssets().then(async (a) => {
      const pg = await PGlite.create({ ...a, parsers: rawTextParsers });
      if (setup.trim()) await pg.exec(setup);
      return pg;
    });
    bases.set(key, db);
    db.catch(() => bases.delete(key));
  }
  return db;
}

async function withClones<T>(key: string, setup: string, fn: (fresh: () => Promise<PGlite>) => Promise<T>) {
  const origin = await base(key, setup);
  const clones: PGlite[] = [];
  try {
    return await fn(async () => {
      const c = (await origin.clone()) as PGlite;
      clones.push(c);
      return c;
    });
  } finally {
    await Promise.all(clones.map((c) => c.close()));
  }
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    if (req.type === "warm") {
      await base(req.key, req.setup);
      self.postMessage({ id: req.id, ok: true, result: null });
    } else if (req.type === "run") {
      const result = await withClones(req.key, req.setup, async (fresh) => runInput(await fresh(), req.input));
      self.postMessage({ id: req.id, ok: true, result });
    } else {
      const result = await withClones(req.key, req.setup, (fresh) => grade(fresh, req.input, req.check));
      self.postMessage({ id: req.id, ok: true, result });
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
