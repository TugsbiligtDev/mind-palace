"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { saveCode } from "@/lib/progress";
import { useAsyncAction } from "@/lib/use-async-action";
import { CodeEditor, type EditorLanguage } from "./code-editor";

const SLOW_MS = 3000;

// An editor with Run and Reset buttons and a result panel. `run` does the work for the
// course's language; `renderOutput` shows its result.
export function CodeRunner<Output>({
  language,
  initial,
  starter,
  slot,
  run: runCode,
  renderOutput,
  onRan,
  notice,
  status = <kbd className="font-mono">⌘ + Enter</kbd>,
  minHeight,
}: {
  language: EditorLanguage;
  initial: string;
  starter: string;
  slot?: string; // where typed code is remembered
  run: (code: string) => Promise<Output>;
  renderOutput: (output: Output) => ReactNode; // null shows no output box
  onRan?: (code: string, out: Output) => void | Promise<void>; // awaited, so Run stays blocked while it grades
  notice?: ReactNode; // shown between the editor and the buttons
  status?: ReactNode; // shown at the right of the buttons
  minHeight?: string;
}) {
  const [code, setCode] = useState(initial);
  const [output, setOutput] = useState<Output | null>(null);
  // "run" while the code runs, then "check" while onRan grades it (that can take several seconds).
  const { phase: busy, start } = useAsyncAction<"run" | "check">();
  const codeRef = useRef(code);
  const [slow, setSlow] = useState(false);

  const change = (v: string) => {
    setCode(v);
    codeRef.current = v;
    if (slot) saveCode(slot, v);
  };

  // ⌘ + Enter can fire while a run or check is still going; `start` ignores it then, since
  // starting another would restart the runner.
  const run = useCallback(
    () =>
      start("run", async (setPhase) => {
        const input = codeRef.current;
        // A long wait with no sign of life looks like a freeze, so say it's still working.
        const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
        try {
          const out = await runCode(input);
          setOutput(out);
          setPhase("check");
          await onRan?.(input, out);
        } finally {
          clearTimeout(slowTimer);
          setSlow(false);
        }
      }),
    [start, runCode, onRan],
  );
  const shown = output && renderOutput(output);

  return (
    <div className="space-y-3">
      <CodeEditor language={language} value={code} onChange={change} onRun={run} minHeight={minHeight} />
      {notice}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={run}
          disabled={busy !== null}
          className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "run" ? "Running…" : busy === "check" ? "Checking…" : "Run"}
        </button>
        <button
          onClick={() => {
            change(starter);
            setOutput(null);
          }}
          // Greyed out while running or checking, like Run: otherwise the old run's output and
          // grade would turn up after the editor was reset.
          disabled={busy !== null}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-text disabled:opacity-50"
        >
          Reset
        </button>
        {slow && <span className="text-xs text-muted">Still working…</span>}
        <span className="ml-auto text-xs text-muted">{status}</span>
      </div>
      {shown && <div className="rounded-xl border border-border bg-card p-3">{shown}</div>}
    </div>
  );
}
