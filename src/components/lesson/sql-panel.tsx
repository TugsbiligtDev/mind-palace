"use client";
import { useCallback } from "react";
import { SqlRunner } from "@/components/sql/sql-runner";
import type { Engine } from "@/lib/content/load";
import type { Step } from "@/lib/content/schema";
import { tryStepCheck } from "@/lib/content/step-check";
import { useProgress } from "@/lib/progress";
import { gradeSql } from "@/lib/sql/client";
import type { RunOutput } from "@/lib/sql/core";
import { StepFeedback, useStepFeedback } from "./step-feedback";

// A PostgreSQL "try" step. Run executes the query; when the step has an expected answer, Run
// also grades it against that answer on a fresh copy of the database.
export function SqlPanel({
  step,
  engine,
  slot,
  done,
  onDone,
}: {
  step: Extract<Step, { kind: "try" }>;
  engine: Engine;
  slot: string;
  done: boolean;
  onDone: () => void;
}) {
  const p = useProgress();
  const { feedback, setFeedback, misses, pass, miss } = useStepFeedback(slot, onDone);

  const onRan = useCallback(
    async (input: string, out: RunOutput) => {
      if (step.expect_error) {
        if (out.error) pass("That's the error we wanted to see. Read it carefully: the ERROR line says what went wrong, and LINE points to where.");
        else miss("No error this time. Run the broken version to see the message.");
        return;
      }
      if (out.error) {
        miss("An error. Read the message, fix the query, and run it again.");
        return;
      }
      const check = tryStepCheck(step);
      if (!check) {
        onDone();
        setFeedback(null);
        return;
      }
      const v = await gradeSql(engine.key, engine.setup, input, check);
      if (v.correct) pass("Correct! That's exactly the result we were after.");
      else miss(v.message);
    },
    [step, engine, onDone, pass, miss, setFeedback],
  );

  return (
    <div className="min-w-0 space-y-3">
      <SqlRunner engine={engine} initial={p?.code[slot] ?? step.sql} starter={step.sql} slot={slot} onRan={onRan} minHeight="160px" />
      <StepFeedback feedback={feedback} misses={misses} done={done} hint={step.hint} answer={step.expect} answerLabel="Stuck? Show one working answer" />
    </div>
  );
}
