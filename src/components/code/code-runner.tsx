"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { saveCode } from "@/lib/progress";
import { CodeEditor, type EditorLanguage } from "./code-editor";

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
  const [busy, setBusy] = useState<"run" | "check" | null>(null);
  const codeRef = useRef(code);
  const busyRef = useRef(false);

  const change = (v: string) => {
    setCode(v);
    codeRef.current = v;
    if (slot) saveCode(slot, v);
  };

  const run = useCallback(async () => {
    // ⌘ + Enter can fire while a run or check is still going; starting another would restart the runner.
    if (busyRef.current) return;
    busyRef.current = true;
    const input = codeRef.current;
    setBusy("run");
    try {
      const out = await runCode(input);
      setOutput(out);
      setBusy("check");
      await onRan?.(input, out);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [runCode, onRan]);
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
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-text"
        >
          Reset
        </button>
        <span className="ml-auto text-xs text-muted">{status}</span>
      </div>
      {shown && <div className="rounded-xl border border-border bg-card p-3">{shown}</div>}
    </div>
  );
}
