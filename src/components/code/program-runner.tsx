"use client";
import { useCallback, useEffect } from "react";
import { runJavaScript } from "@/lib/js/client";
import type { JsRunOutput } from "@/lib/js/core";
import { runPython, warmUpPython } from "@/lib/py/client";
import type { PyRunOutput } from "@/lib/py/core";
import { CodeRunner } from "./code-runner";

export type ProgramOutput = JsRunOutput | PyRunOutput;

// A Python or JavaScript exercise: what the program printed, then the error if there was one.
export function ProgramRunner({
  language,
  initial,
  starter,
  slot,
  onRan,
  stdin = [],
  minHeight,
  graded = false,
}: {
  language: "python" | "javascript";
  initial: string;
  starter: string;
  slot?: string;
  onRan?: (code: string, out: ProgramOutput) => void;
  stdin?: string[]; // typed answers handed to Python's input()
  minHeight?: string;
  // A graded exercise: the checker calls the learner's function, so a run that prints nothing
  // is normal and gets no "No output" note (that note would suggest adding print).
  graded?: boolean;
}) {
  const python = language === "python";

  // Start downloading Python as soon as an exercise appears.
  useEffect(() => {
    if (python) warmUpPython().catch(() => {});
  }, [python]);

  const run = useCallback(
    (code: string): Promise<ProgramOutput> => (python ? runPython(code, stdin) : runJavaScript(code)),
    [python, stdin],
  );

  return (
    <CodeRunner
      language={language}
      initial={initial}
      starter={starter}
      slot={slot}
      run={run}
      renderOutput={(out) => (graded && !out.logs.length && !out.error ? null : <Output output={out} python={python} />)}
      onRan={onRan}
      minHeight={minHeight}
      notice={
        stdin.length > 0 && (
          <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
            When your code calls <code className="font-mono">input()</code>, it receives these typed answers in order:{" "}
            <span className="font-mono text-text">{stdin.map((a) => JSON.stringify(a)).join(", ")}</span>
          </p>
        )
      }
    />
  );
}

function Output({ output, python }: { output: ProgramOutput; python: boolean }) {
  const { logs, error } = output;
  if (!logs.length && !error)
    return (
      <p className="font-mono text-xs text-muted">
        {python ? "No output. Use print(...) to show something." : "No output. Use console.log(...) to print something."}
      </p>
    );
  // Python errors come with Python's own traceback.
  const trace = error && "trace" in error ? error.trace : undefined;
  return (
    <div className="space-y-3">
      {logs.length > 0 && <pre className="overflow-x-auto font-mono text-[0.8rem] whitespace-pre-wrap">{logs.join("\n")}</pre>}
      {error && (
        <pre className="overflow-x-auto rounded-lg border border-clue/30 bg-clue/5 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-clue">
          {trace ?? (error.line ? `${error.message}\n(line ${error.line})` : error.message)}
        </pre>
      )}
    </div>
  );
}
