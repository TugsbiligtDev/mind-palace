"use client";
import { useCallback, useRef, useState } from "react";
import { saveCode } from "@/lib/progress";
import type { JsRunOutput } from "@/lib/js/core";
import { runJavaScript } from "@/lib/js/client";
import { JsEditor } from "./js-editor";
import { JsOutput } from "./js-output";

export function JsRunner({
  initial,
  starter,
  slot,
  onRan,
  runLabel = "Run",
  onSubmit,
  submitLabel,
  busy: externalBusy,
  minHeight,
}: {
  initial: string;
  starter: string;
  slot?: string; // where typed code is remembered
  onRan?: (code: string, out: JsRunOutput) => void;
  runLabel?: string;
  onSubmit?: (code: string) => Promise<JsRunOutput | undefined>; // grading; its output replaces the result panel
  submitLabel?: string;
  busy?: boolean;
  minHeight?: string;
}) {
  const [code, setCode] = useState(initial);
  const [output, setOutput] = useState<JsRunOutput | null>(null);
  const [running, setRunning] = useState(false);
  const codeRef = useRef(code);

  const change = (v: string) => {
    setCode(v);
    codeRef.current = v;
    if (slot) saveCode(slot, v);
  };

  const run = useCallback(async () => {
    const input = codeRef.current;
    setRunning(true);
    const out = await runJavaScript(input);
    setOutput(out);
    setRunning(false);
    onRan?.(input, out);
  }, [onRan]);

  const busy = running || !!externalBusy;

  return (
    <div className="space-y-3">
      <JsEditor value={code} onChange={change} onRun={run} minHeight={minHeight} />
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
          <JsOutput output={output} />
        </div>
      )}
    </div>
  );
}
