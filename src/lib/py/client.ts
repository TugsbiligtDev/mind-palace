// Browser-side handle to the Python worker (see ../worker-client.ts). The first run downloads
// Python (~10 MB, cached afterwards), so that wait has its own, longer limit.
import { workerClient } from "../worker-client";
import type { PyCheck, PyRunOutput, PyVerdict } from "./core";

const TIMEOUT_MS = 8000;
const LOAD_TIMEOUT_MS = 90000;
const stopped = `Stopped: your code ran longer than ${TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?`;
// Grading runs the model answer and then yours, on every test, so it gets twice as long.
const GRADE_TIMEOUT_MS = TIMEOUT_MS * 2;
const gradeStopped = `Stopped: checking your code took longer than ${GRADE_TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?`;

let warmed: Promise<unknown> | null = null;

const call = workerClient(
  () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  "The Python runner was restarted.",
  () => (warmed = null),
);

export function warmUpPython() {
  warmed ??= call<null>({ type: "warm" }, LOAD_TIMEOUT_MS, "Python took too long to load. Check your connection and try again.").catch((e) => {
    warmed = null;
    throw e;
  });
  return warmed;
}

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
    return await call<PyVerdict>({ type: "grade", code, check }, GRADE_TIMEOUT_MS, gradeStopped);
  } catch (e) {
    const message = (e as Error).message;
    return { correct: false, output: failed(message), message, passed: 0, total: check.tests.length };
  }
}
