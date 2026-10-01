"use client";
import { useCallback } from "react";
import { ProgramRunner, type ProgramOutput } from "@/components/code/program-runner";
import type { Step } from "@/lib/content/schema";
import { codeStepCheck, pyStepCheck } from "@/lib/content/step-check";
import { gradeJavaScript } from "@/lib/js/client";
import { useProgress } from "@/lib/progress";
import { gradePython } from "@/lib/py/client";
import { StepFeedback, useStepFeedback } from "./step-feedback";

// A Python or JavaScript "code" step. Run executes the code; when the step has tests, Run also
// grades it (hidden test calls run on the learner's code and on the reference solution).
export function CodePanel({
  step,
  language,
  slot,
  done,
  onDone,
}: {
  step: Extract<Step, { kind: "code" }>;
  language: "python" | "javascript";
  slot: string;
  done: boolean;
  onDone: () => void;
}) {
  const p = useProgress();
  const { feedback, setFeedback, misses, pass, miss } = useStepFeedback(onDone);

  const onRan = useCallback(
    async (code: string, out: ProgramOutput) => {
      if (out.error) {
        setFeedback({ ok: false, text: "An error. Read the message, fix the code, and run it again." });
        return;
      }
      const check = language === "python" ? pyStepCheck(step) : codeStepCheck(step);
      if (!check) {
        onDone();
        setFeedback(null);
        return;
      }
      const v = language === "python" ? await gradePython(code, check) : await gradeJavaScript(code, check);
      if (v.correct) pass(v.total === 1 ? "Correct! The test passes." : `Correct! All ${v.total} tests pass.`);
      else miss(v.message);
    },
    [step, language, onDone, pass, miss, setFeedback],
  );

  return (
    <div className="min-w-0 space-y-3">
      <ProgramRunner
        language={language}
        initial={p?.code[slot] ?? step.code}
        starter={step.code}
        slot={slot}
        onRan={onRan}
        stdin={step.stdin}
        minHeight="200px"
      />
      <StepFeedback feedback={feedback} misses={misses} done={done} hint={step.hint} answer={step.solution} answerLabel="Stuck? Show one working solution" />
    </div>
  );
}
