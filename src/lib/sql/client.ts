// Browser-side handle to the SQL worker (see ../worker-client.ts).
import { workerClient } from "../worker-client";
import type { SqlCheck, RunOutput, Verdict } from "./core";

const TIMEOUT_MS = 8000;
const stopped = `Stopped: the query ran longer than ${TIMEOUT_MS / 1000} seconds.`;

const call = workerClient(() => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }), "The database was restarted.");

// First load downloads the database engine (~10 MB, cached afterwards), so give it longer.
export const warmUp = (key: string, setup: string) =>
  call<null>({ type: "warm", key, setup }, 60000, "The database took too long to start. Check your connection and try again.");

export async function runSql(key: string, setup: string, input: string): Promise<RunOutput> {
  try {
    await warmUp(key, setup);
    return await call<RunOutput>({ type: "run", key, setup, input }, TIMEOUT_MS, stopped);
  } catch (e) {
    return { blocks: [], error: { message: (e as Error).message } };
  }
}

export async function gradeSql(key: string, setup: string, input: string, check: SqlCheck): Promise<Verdict> {
  try {
    await warmUp(key, setup);
    return await call<Verdict>({ type: "grade", key, setup, input, check }, TIMEOUT_MS, stopped);
  } catch (e) {
    const message = (e as Error).message;
    return { correct: false, output: { blocks: [], error: { message } }, message };
  }
}
