"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveCode } from "@/lib/progress";
import type { RunOutput } from "@/lib/sql/core";
import { runSql, warmUp } from "@/lib/sql/client";
import { ResultView } from "./result-view";
import { SqlEditor } from "./sql-editor";

export type Engine = { key: string; setup: string };

export function SqlRunner({
  engine,
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
  engine: Engine;
  initial: string;
  starter: string;
  slot?: string; // where typed code is remembered
  onRan?: (input: string, out: RunOutput) => void;
  runLabel?: string;
  onSubmit?: (input: string) => Promise<RunOutput | undefined>; // grading; its output replaces the result panel
  submitLabel?: string;
  busy?: boolean;
  minHeight?: string;
}) {
  const [code, setCode] = useState(initial);
  const [output, setOutput] = useState<RunOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [booting, setBooting] = useState(true);
  const codeRef = useRef(code);

  useEffect(() => {
    let alive = true;
    warmUp(engine.key, engine.setup)
      .catch(() => {})
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, [engine.key, engine.setup]);

  const change = (v: string) => {
    setCode(v);
    codeRef.current = v;
    if (slot) saveCode(slot, v);
  };

  const run = useCallback(async () => {
    const input = codeRef.current;
    setRunning(true);
    const out = await runSql(engine.key, engine.setup, input);
    setOutput(out);
    setRunning(false);
    onRan?.(input, out);
  }, [engine.key, engine.setup, onRan]);

  const busy = running || !!externalBusy;

  return (
    <div className="space-y-3">
      <SqlEditor value={code} onChange={change} onRun={run} minHeight={minHeight} />
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
          {booting ? "Starting PostgreSQL 18…" : <kbd className="font-mono">⌘ + Enter</kbd>}
        </span>
      </div>
      {output && (
        <div className="rounded-xl border border-border bg-card p-3">
          <ResultView output={output} />
        </div>
      )}
    </div>
  );
}
