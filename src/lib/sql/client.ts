// Browser-side handle to the SQL worker. Runaway queries are stopped by restarting
// the worker after TIMEOUT_MS.
import type { CaseCheck, RunOutput, Verdict } from "./core";

const TIMEOUT_MS = 8000;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function call<T>(msg: Record<string, unknown>, timeout = TIMEOUT_MS): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ ...msg, id });
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      worker?.terminate();
      worker = null;
      pending.forEach((p) => p.reject(new Error("The database was restarted.")));
      pending.clear();
      reject(new Error(`Stopped: the query ran longer than ${TIMEOUT_MS / 1000} seconds.`));
    }, timeout);
  });
}

// First load downloads the database engine (~10 MB, cached afterwards), so give it longer.
export const warmUp = (key: string, setup: string) => call<null>({ type: "warm", key, setup }, 60000);

export async function runSql(key: string, setup: string, input: string): Promise<RunOutput> {
  try {
    await warmUp(key, setup);
    return await call<RunOutput>({ type: "run", key, setup, input });
  } catch (e) {
    return { blocks: [], error: { message: (e as Error).message } };
  }
}

export async function gradeSql(key: string, setup: string, input: string, check: CaseCheck): Promise<Verdict> {
  try {
    await warmUp(key, setup);
    return await call<Verdict>({ type: "grade", key, setup, input, check });
  } catch (e) {
    const message = (e as Error).message;
    return { correct: false, output: { blocks: [], error: { message } }, message };
  }
}
