// Browser-side handle to a Web Worker that runs learner code (SQL, Python or JavaScript), so a
// runaway loop can't freeze the page. A call that takes too long restarts the worker: that call
// fails with its own `stopped` message, any others in flight with `restartedMessage`.
type Reply = { id: number; ok: boolean; result?: unknown; error?: string };

export function workerClient(create: () => Worker, restartedMessage: string, onRestart?: () => void) {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  function getWorker() {
    if (!worker) {
      worker = create();
      worker.onmessage = (e: MessageEvent<Reply>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error));
      };
    }
    return worker;
  }

  return function call<T>(msg: Record<string, unknown>, timeout: number, stopped: string): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        worker?.terminate();
        worker = null;
        onRestart?.();
        pending.forEach((p) => p.reject(new Error(restartedMessage)));
        pending.clear();
        reject(new Error(stopped));
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
  };
}
