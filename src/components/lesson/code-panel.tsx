"use client";
import { useCallback, useMemo } from "react";
import { ProgramRunner, type ProgramOutput } from "@/components/code/program-runner";
import type { Step } from "@/lib/content/schema";
import { codeStepCheck, pyStepCheck } from "@/lib/content/step-check";
import { gradeJavaScript } from "@/lib/js/client";
import { useProgress } from "@/lib/progress";
import { gradePython } from "@/lib/py/client";
import { StepFeedback, useStepFeedback } from "./step-feedback";

// Is this the untouched starter? Blank lines and spaces at line ends don't count as a change,
// but indentation does: in Python it's part of the code (a step can be "fix the indentation").
const plain = (code: string) =>
  code
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l)
    .join("\n");
const same = (a: string, b: string) => plain(a) === plain(b);

const INDENT_TIP =
  "Tip: after a line that ends in \":\" the editor already indents the next line for you, so don't type extra spaces on top. Lines that belong together must start in exactly the same column, and Backspace moves a line back out.";

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
  const { feedback, setFeedback, misses, pass, miss, note } = useStepFeedback(slot, onDone);
  const check = useMemo(() => (language === "python" ? pyStepCheck(step) : codeStepCheck(step)), [step, language]);

  const onRan = useCallback(
    async (code: string, out: ProgramOutput) => {
      // Running the untouched starter (to see what it does, or because the task says "Run it and
      // read the error") isn't a wrong attempt: the result is shown, but it doesn't count.
      const starter = same(code, step.code);
      if (out.error) {
        const tip = /^(IndentationError|TabError)/.test(out.error.message) ? `\n\n${INDENT_TIP}` : "";
        // On a graded step an error is a wrong attempt; on a "just run it" step it's only a note.
        const text = (starter ? "That's the starting code, and it stops with an error. Read the message above: it says what to fix." : "An error. Read the message, fix the code, and run it again.") + tip;
        if (check && !starter) miss(text);
        else if (starter) note(text);
        else setFeedback({ ok: false, text });
        return;
      }
      if (!check) {
        onDone();
        setFeedback(null);
        return;
      }
      const v = language === "python" ? await gradePython(code, check) : await gradeJavaScript(code, check);
      if (v.correct) pass(v.total === 1 ? "Correct! The test passes." : `Correct! All ${v.total} tests pass.`);
      else if (starter) note(`That's the starting code, so here is what the checker sees. ${v.message}\n\nNow change the code as the task asks, and run it again.`);
      else miss(v.message);
    },
    [step, check, language, onDone, pass, miss, note, setFeedback],
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
        graded={!!check}
      />
      <StepFeedback feedback={feedback} misses={misses} done={done} hint={step.hint} answer={step.solution} answerLabel="Stuck? Show one working solution" />
    </div>
  );
}
