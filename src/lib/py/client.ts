// Browser-side handle to the Python worker. Runaway code (an endless loop) is stopped by
// restarting the worker after TIMEOUT_MS. The first run downloads Python (~10 MB, cached
// afterwards), so that wait has its own, longer limit.
import type { PyCheck, PyRunOutput, PyVerdict } from "./core";

const TIMEOUT_MS = 8000;
const LOAD_TIMEOUT_MS = 90000;

let worker: Worker | null = null;
let warmed: Promise<unknown> | null = null;
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

function call<T>(msg: Record<string, unknown>, timeout: number, stoppedMessage: string): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      worker?.terminate();
      worker = null;
      warmed = null;
      pending.forEach((p) => p.reject(new Error("The Python runner was restarted.")));
      pending.clear();
      reject(new Error(stoppedMessage));
    }, timeout);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    getWorker().postMessage({ ...msg, id });
  });
}

export function warmUpPython() {
  warmed ??= call<null>({ type: "warm" }, LOAD_TIMEOUT_MS, "Python took too long to load. Check your connection and try again.").catch((e) => {
    warmed = null;
    throw e;
  });
  return warmed;
}

const stopped = `Stopped: your code ran longer than ${TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?`;
const failed = (message: string): PyRunOutput => ({ logs: [], results: [], error: { message } });

// Libraries that aren't part of Python itself (pydantic, pytest…) are downloaded on first use.
async function loadPackages(sources: string[]) {
  await warmUpPython();
  await call<null>({ type: "packages", sources }, LOAD_TIMEOUT_MS, "A Python library took too long to download. Check your connection and try again.");
}

export async function runPython(code: string, stdin: string[] = []): Promise<PyRunOutput> {
  try {
    await loadPackages([code]);
    return await call<PyRunOutput>({ type: "run", code, stdin }, TIMEOUT_MS, stopped);
  } catch (e) {
    return failed((e as Error).message);
  }
}

export async function gradePython(code: string, check: PyCheck): Promise<PyVerdict> {
  try {
    await loadPackages([code, check.solution, ...check.tests]);
    return await call<PyVerdict>({ type: "grade", code, check }, TIMEOUT_MS * 2, stopped);
  } catch (e) {
    const message = (e as Error).message;
    return { correct: false, output: failed(message), message, passed: 0, total: check.tests.length };
  }
}
