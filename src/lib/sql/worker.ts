// Web Worker that owns the in-browser PostgreSQL (PGlite). Each setup (course dataset,
// or dataset + a case's evidence) is loaded once; every run gets a fresh clone, so a
// learner's DELETE or DROP never leaks into the next attempt.
import type { PGlite } from "@electric-sql/pglite";
import { freshCopy, grade, rawTextParsers, runInput, type CaseCheck } from "./core";

type Request =
  | { id: number; type: "run"; key: string; setup: string; input: string }
  | { id: number; type: "grade"; key: string; setup: string; input: string; check: CaseCheck }
  | { id: number; type: "warm"; key: string; setup: string };

type PGliteModule = typeof import("@electric-sql/pglite");

// PGlite is served as-is from /public/pglite (copied by scripts/copy-pglite.mjs) and loaded
// outside the bundler: minifying it breaks its WebAssembly startup code.
const ENGINE_URL = "/pglite/index.js";
let engine: Promise<PGliteModule> | null = null;

function loadEngine() {
  engine ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ENGINE_URL) as Promise<PGliteModule>;
  return engine;
}

const bases = new Map<string, Promise<PGlite>>();

function base(key: string, setup: string) {
  let db = bases.get(key);
  if (!db) {
    // Keep only one database in memory: the Intermediate one alone is tens of megabytes.
    for (const [k, old] of bases) {
      bases.delete(k);
      old.then((pg) => pg.close()).catch(() => {});
    }
    db = loadEngine().then(async ({ PGlite, types }) => {
      const pg = await PGlite.create({ parsers: rawTextParsers(types) });
      if (setup.trim()) await pg.exec(setup);
      // Flush to disk so copies don't restart ID sequences 32 numbers ahead.
      await pg.exec("CHECKPOINT");
      return pg;
    });
    bases.set(key, db);
    db.catch(() => bases.delete(key));
  }
  return db;
}

async function withClones<T>(key: string, setup: string, fn: (fresh: () => Promise<PGlite>) => Promise<T>) {
  const origin = await base(key, setup);
  const pglite = await loadEngine();
  const clones: PGlite[] = [];
  try {
    return await fn(async () => {
      const c = (await freshCopy(origin, pglite)) as PGlite;
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
