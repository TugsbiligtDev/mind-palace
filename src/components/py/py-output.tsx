import type { PyRunOutput } from "@/lib/py/core";

// What a run printed, then the error if there was one (as Python's own traceback).
export function PyOutput({ output }: { output: PyRunOutput }) {
  const { logs, error } = output;
  if (!logs.length && !error) return <p className="font-mono text-xs text-muted">No output. Use print(...) to show something.</p>;
  return (
    <div className="space-y-3">
      {logs.length > 0 && <pre className="overflow-x-auto font-mono text-[0.8rem] whitespace-pre-wrap">{logs.join("\n")}</pre>}
      {error && (
        <pre className="overflow-x-auto rounded-lg border border-clue/30 bg-clue/5 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-clue">
          {error.trace ?? (error.line ? `${error.message}\n(line ${error.line})` : error.message)}
        </pre>
      )}
    </div>
  );
}
