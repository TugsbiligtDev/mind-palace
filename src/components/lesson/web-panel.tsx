"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { WebRunner } from "@/components/web/web-runner";
import type { Step } from "@/lib/content/schema";
import { webStarter, webStepCheck } from "@/lib/content/step-check";
import { useProgress } from "@/lib/progress";
import { gradeWebPage } from "@/lib/web/client";
import type { WebFiles } from "@/lib/web/core";
import { StepFeedback, useStepFeedback } from "./step-feedback";

// An HTML & CSS "web" step: the preview is live, and "Check my page" grades a graded step
// (hidden checks run on the learner's page and on the reference solution).
export function WebPanel({
  step,
  slot,
  done,
  onDone,
}: {
  step: Extract<Step, { kind: "web" }>;
  slot: string;
  done: boolean;
  onDone: () => void;
}) {
  const p = useProgress();
  const { feedback, setFeedback, misses, pass, miss } = useStepFeedback(slot, onDone);
  const [checking, setChecking] = useState(false);
  const check = useMemo(() => webStepCheck(step), [step]);
  const starter = webStarter(step);
  const initial = { html: p?.code[slot] ?? starter.html, css: p?.code[`${slot}:css`] ?? starter.css };

  const running = useRef(false);
  const onCheck = useCallback(
    async (files: WebFiles) => {
      if (!check || running.current) return;
      running.current = true;
      setChecking(true);
      try {
        const v = await gradeWebPage(files, check);
        if (v.correct) pass(v.total === 1 ? "Correct! The check passes." : `Correct! All ${v.total} checks pass.`);
        else miss(v.message);
      } catch (e) {
        setFeedback({ ok: false, text: `The checker couldn't run: ${(e as Error).message}` });
      } finally {
        running.current = false;
        setChecking(false);
      }
    },
    [check, pass, miss, setFeedback],
  );

  const answer = check
    ? [step.solution?.html !== undefined && `<!-- index.html -->\n${check.solution.html.trim()}`, step.solution?.css !== undefined && `/* style.css */\n${check.solution.css.trim()}`]
        .filter(Boolean)
        .join("\n\n")
    : undefined;

  return (
    <div className="min-w-0 space-y-3">
      <WebRunner initial={initial} starter={starter} slot={slot} showCss={step.css !== undefined} onCheck={check ? onCheck : undefined} checking={checking} />
      {/* An ungraded step ("edit and look") has nothing to complete, so it never says "Step complete". */}
      <StepFeedback feedback={feedback} misses={misses} done={done && !!check} hint={step.hint} answer={answer} answerLabel="Stuck? Show one working answer" />
    </div>
  );
}
