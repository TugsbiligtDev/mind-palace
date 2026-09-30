// Browser-side handle to the JavaScript worker. Runaway code (an endless loop) is stopped
// by restarting the worker after TIMEOUT_MS.
import type { JsCheck, JsRunOutput, JsVerdict } from "./core";

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

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      worker?.terminate();
      worker = null;
      pending.forEach((p) => p.reject(new Error("The code runner was restarted.")));
      pending.clear();
      reject(new Error(`Stopped: your code ran longer than ${TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?`));
    }, TIMEOUT_MS);
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

const failed = (message: string): JsRunOutput => ({ logs: [], results: [], error: { message } });

export async function runJavaScript(code: string): Promise<JsRunOutput> {
  try {
    return await call<JsRunOutput>({ type: "run", code });
  } catch (e) {
    return failed((e as Error).message);
  }
}

export async function gradeJavaScript(code: string, check: JsCheck): Promise<JsVerdict> {
  try {
    return await call<JsVerdict>({ type: "grade", code, check });
  } catch (e) {
    const message = (e as Error).message;
    return { correct: false, output: failed(message), message, passed: 0, total: check.tests.length };
  }
}
