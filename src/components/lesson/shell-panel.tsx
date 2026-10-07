"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal, type Ran } from "@/components/shell/terminal";
import type { Step } from "@/lib/content/schema";
import { shellStepCheck } from "@/lib/content/step-check";
import { saveCode, useProgress } from "@/lib/progress";
import type { ShellExpected } from "@/lib/shell/core";
import type { Machine } from "@/lib/shell/machine";
import { StepFeedback, useStepFeedback } from "./step-feedback";

// A Linux & Git "shell" step: the practice terminal. A graded step checks itself quietly after
// every command and completes the moment the task is done; "Check my work" explains what's
// still missing.
export function ShellPanel({ step, slot, done, onDone }: { step: Extract<Step, { kind: "shell" }>; slot: string; done: boolean; onDone: () => void }) {
  const p = useProgress();
  const { feedback, setFeedback, misses, pass, miss } = useStepFeedback(onDone);
  const check = useMemo(() => shellStepCheck(step), [step]);
  const [saved] = useState(() => p?.code[slot] || undefined);
  const [checking, setChecking] = useState(false);
  const expected = useRef<Promise<ShellExpected> | null>(null);
  const machine = useRef<Machine | null>(null);
  const typed = useRef<string[]>([]);
  const last = useRef<string | undefined>(undefined);
  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  const grade = useCallback(
    async (quiet: boolean) => {
      if (!check || !machine.current) return;
      const core = await import("@/lib/shell/core");
      expected.current ??= core.expectedFor(check);
      try {
        const v = await core.gradeShell(machine.current, typed.current, last.current, check, await expected.current);
        if (v.correct) {
          if (!doneRef.current || !quiet) pass("Done! That's exactly it.");
        } else if (!quiet) miss(v.message);
      } catch (e) {
        if (!quiet) setFeedback({ ok: false, text: `The checker couldn't run: ${(e as Error).message}` });
      }
    },
    [check, pass, miss, setFeedback],
  );

  const onRan = useCallback(
    (ran: Ran) => {
      machine.current = ran.machine;
      // What actually ran: `!!` counts as the command it repeated.
      typed.current = [...typed.current, ran.result.echo ?? ran.line];
      last.current = ran.result.stdout + ran.result.stderr;
      if (check && !doneRef.current) grade(true);
    },
    [check, grade],
  );

  const onReady = useCallback(
    (m: Machine, restored: string[]) => {
      machine.current = m;
      typed.current = restored;
      last.current = undefined;
      setFeedback(null);
    },
    [setFeedback],
  );

  const onSave = useCallback((journal: string) => saveCode(slot, journal), [slot]);

  return (
    <div className="min-w-0 space-y-3">
      <Terminal setup={step.setup} saved={saved} onSave={onSave} onRan={onRan} onReady={onReady} />
      {check && !done && (
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setChecking(true);
              await grade(false);
              setChecking(false);
            }}
            disabled={checking}
            className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check my work"}
          </button>
          <span className="text-xs text-muted">The step also checks itself after every command.</span>
        </div>
      )}
      <StepFeedback feedback={feedback} misses={misses} done={done && !!check} hint={step.hint} answer={check?.solution.replace(/\s+# (allow-error|edit:|answers:).*$/gm, "").trim()} answerLabel="Stuck? Show the commands" />
    </div>
  );
}
