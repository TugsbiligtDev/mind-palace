// Web Worker that runs learner JavaScript, so a runaway loop can't freeze the page: the
// client terminates this worker when a run takes too long.
import { gradeJs, runJs, type Exec, type JsCheck } from "./core";

type Request =
  | { id: number; type: "run"; code: string }
  | { id: number; type: "grade"; code: string; check: JsCheck };

// Indirect eval runs in the worker's global scope, not this module's.
const exec: Exec = (source) => (0, eval)(source) as string;

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    const result = req.type === "run" ? runJs(exec, req.code) : gradeJs(exec, req.code, req.check);
    self.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
