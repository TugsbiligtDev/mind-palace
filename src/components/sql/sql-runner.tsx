"use client";
import { useCallback, useEffect, useState } from "react";
import { CodeRunner } from "@/components/code/code-runner";
import type { Engine } from "@/lib/content/load";
import type { RunOutput } from "@/lib/sql/core";
import { runSql, warmUp } from "@/lib/sql/client";
import { ResultView } from "./result-view";

// A SQL exercise, run on the course's database in the browser.
export function SqlRunner({
  engine,
  initial,
  starter,
  slot,
  onRan,
  minHeight = "96px",
}: {
  engine: Engine;
  initial: string;
  starter: string;
  slot?: string;
  onRan?: (input: string, out: RunOutput) => void;
  minHeight?: string;
}) {
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let alive = true;
    warmUp(engine.key, engine.setup)
      .catch(() => {})
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, [engine.key, engine.setup]);

  const run = useCallback((input: string) => runSql(engine.key, engine.setup, input), [engine.key, engine.setup]);

  return (
    <CodeRunner
      language="sql"
      initial={initial}
      starter={starter}
      slot={slot}
      run={run}
      renderOutput={(out) => <ResultView output={out} />}
      onRan={onRan}
      minHeight={minHeight}
      status={booting ? "Starting PostgreSQL 18…" : undefined}
    />
  );
}
