"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveCode } from "@/lib/progress";
import type { PyRunOutput } from "@/lib/py/core";
import { runPython, warmUpPython } from "@/lib/py/client";
import { PyEditor } from "./py-editor";
import { PyOutput } from "./py-output";

export function PyRunner({
  initial,
  starter,
  slot,
  onRan,
  runLabel = "Run",
  onSubmit,
  submitLabel,
  busy: externalBusy,
  minHeight,
  stdin = [],
}: {
  initial: string;
  starter: string;
  slot?: string; // where typed code is remembered
  onRan?: (code: string, out: PyRunOutput) => void;
  runLabel?: string;
  onSubmit?: (code: string) => Promise<PyRunOutput | undefined>; // grading; its output replaces the result panel
  submitLabel?: string;
  busy?: boolean;
  minHeight?: string;
  stdin?: string[]; // typed answers handed to input()
}) {
  const [code, setCode] = useState(initial);
  const [output, setOutput] = useState<PyRunOutput | null>(null);
  const [running, setRunning] = useState(false);
  const codeRef = useRef(code);

  // Start downloading Python as soon as an exercise appears.
  useEffect(() => {
    warmUpPython().catch(() => {});
  }, []);

  const change = (v: string) => {
    setCode(v);
    codeRef.current = v;
    if (slot) saveCode(slot, v);
  };

  const run = useCallback(async () => {
    const input = codeRef.current;
    setRunning(true);
    const out = await runPython(input, stdin);
    setOutput(out);
    setRunning(false);
    onRan?.(input, out);
  }, [onRan, stdin]);

  const busy = running || !!externalBusy;

  return (
    <div className="space-y-3">
      <PyEditor value={code} onChange={change} onRun={run} minHeight={minHeight} />
      {stdin.length > 0 && (
        <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
          When your code calls <code className="font-mono">input()</code>, it receives these typed answers in order:{" "}
          <span className="font-mono text-text">{stdin.map((a) => JSON.stringify(a)).join(", ")}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Running…" : runLabel}
        </button>
        {onSubmit && (
          <button
            onClick={async () => {
              const out = await onSubmit(codeRef.current);
              if (out) setOutput(out);
            }}
            disabled={busy}
            className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-brand-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitLabel ?? "Submit"}
          </button>
        )}
        <button
          onClick={() => {
            change(starter);
            setOutput(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-text"
        >
          Reset
        </button>
        <span className="ml-auto text-xs text-muted">
          <kbd className="font-mono">⌘ + Enter</kbd>
        </span>
      </div>
      {output && (
        <div className="rounded-xl border border-border bg-card p-3">
          <PyOutput output={output} />
        </div>
      )}
    </div>
  );
}
