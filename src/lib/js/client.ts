// Browser-side handle to the JavaScript worker (see ../worker-client.ts).
import { workerClient } from "../worker-client";
import type { JsCheck, JsRunOutput, JsVerdict } from "./core";

const TIMEOUT_MS = 8000;
const stopped = `Stopped: your code ran longer than ${TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?`;

const call = workerClient(() => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }), "The code runner was restarted.");

const failed = (message: string): JsRunOutput => ({ logs: [], results: [], error: { message } });

export async function runJavaScript(code: string): Promise<JsRunOutput> {
  try {
    return await call<JsRunOutput>({ type: "run", code }, TIMEOUT_MS, stopped);
  } catch (e) {
    return failed((e as Error).message);
  }
}

export async function gradeJavaScript(code: string, check: JsCheck): Promise<JsVerdict> {
  try {
    return await call<JsVerdict>({ type: "grade", code, check }, TIMEOUT_MS, stopped);
  } catch (e) {
    const message = (e as Error).message;
    return { correct: false, output: failed(message), message, passed: 0, total: check.tests.length };
  }
}
