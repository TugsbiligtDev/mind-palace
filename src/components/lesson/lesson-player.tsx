"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import type { Engine } from "@/lib/content/load";
import type { Step, Track } from "@/lib/content/schema";
import { shellStepCheck, webStepCheck } from "@/lib/content/step-check";
import { completeLesson, completeStep, setLast, setLessonStep, useProgress } from "@/lib/progress";
import { ChoiceStep } from "./choice-step";
import { CodePanel } from "./code-panel";
import { MacCheck, MacCommands } from "./mac-step";
import { ShellPanel } from "./shell-panel";
import { SqlPanel } from "./sql-panel";
import { WebPanel } from "./web-panel";

// Steps the learner must do (not just read) before the lesson counts as finished: exercises,
// except an ungraded HTML & CSS "edit and look" step or terminal "try things out" step, and
// in-lesson questions. "On your Mac" steps stay optional, since not everyone is on a Mac.
function isGraded(step: Step) {
  if (step.kind === "web") return !!webStepCheck(step);
  if (step.kind === "shell") return !!shellStepCheck(step);
  return true;
}

function mustDo(step: Step) {
  if (step.kind === "web" || step.kind === "shell") return isGraded(step);
  return step.kind === "try" || step.kind === "code" || step.kind === "choice";
}

const KIND_LABEL: Record<Step["kind"], string> = {
  explain: "Learn",
  try: "Try it",
  code: "Try it",
  web: "Try it",
  shell: "Try it",
  info: "Good to know",
  mac: "On your Mac",
  choice: "Your call",
  why: "Why this matters",
  recap: "Recap",
};

export function LessonPlayer({
  topicKey,
  title,
  label,
  steps,
  engine,
  language,
  href,
  quizHref,
}: {
  topicKey: string;
  title: string;
  label: string;
  steps: Step[];
  engine: Engine;
  language: Track["engine"];
  href: string;
  quizHref: string;
}) {
  const router = useRouter();
  const p = useProgress();
  const saved = p?.lessons[topicKey];
  // Resume at the saved step until the learner picks one.
  const [chosen, setIndex] = useState<number | null>(null);
  const index = chosen ?? (p ? Math.min(saved?.step ?? 0, steps.length - 1) : null);

  useEffect(() => {
    if (index !== null) {
      setLessonStep(topicKey, index);
      setLast(href, `${label}: ${title} · step ${index + 1}`);
    }
  }, [index, topicKey, href, label, title]);

  if (!p || index === null) return <div className="h-96" />;

  const step = steps[index];
  const done = saved?.stepsDone.includes(index) ?? false;
  const isExercise = step.kind === "try" || step.kind === "code" || step.kind === "web" || step.kind === "shell";
  // An ungraded HTML & CSS or terminal step is "try things out": nothing to pass, so Continue stays open.
  const graded = isGraded(step);
  const needsAction = ((isExercise && graded) || step.kind === "mac" || step.kind === "choice") && !done;
  const last = index === steps.length - 1;
  // Steps skipped with the step bar. The lesson only counts as finished once they're done.
  const skipped = steps.flatMap((st, i) => (i !== index && mustDo(st) && !saved?.stepsDone.includes(i) ? [i] : []));

  function next() {
    if ((!isExercise || !graded) && step.kind !== "mac" && step.kind !== "choice") completeStep(topicKey, index!);
    advance();
  }

  function advance() {
    if (last) {
      if (skipped.length === 0) completeLesson(topicKey);
      router.push(quizHref);
    } else setIndex(index! + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* On phones the step bar gets its own full-width row; side by side it would be squeezed to nothing. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="min-w-0 flex-1 text-sm text-muted sm:flex-none">
          {label} · <span className="text-text">{title}</span>
        </p>
        <div className="order-last flex w-full gap-1 sm:order-none sm:w-auto sm:flex-1" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to step ${i + 1}`}
              className="flex h-6 flex-1 items-center"
            >
              {/* A thin bar inside a taller button, so it's easy to tap on a phone. */}
              <span
                className={`h-1.5 w-full rounded-full transition-colors ${
                  i === index ? "bg-brand" : saved?.stepsDone.includes(i) ? "bg-brand/40" : "bg-border"
                }`}
              />
            </button>
          ))}
        </div>
        <p className="text-sm text-muted tabular-nums">
          {index + 1}/{steps.length}
        </p>
      </div>

      <div className={isExercise ? "grid items-start gap-6 lg:grid-cols-2" : "mx-auto max-w-2xl"}>
        <article className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="mb-2 text-xs font-medium tracking-wide text-brand uppercase">{KIND_LABEL[step.kind]}</p>
          {"title" in step && <h1 className="mb-4 text-2xl font-semibold tracking-tight">{step.title}</h1>}
          <Markdown>{step.body}</Markdown>
          {step.kind === "mac" && <MacCommands commands={step.commands} />}
          {step.kind === "choice" && (
            <ChoiceStep
              key={`${topicKey}-${index}`}
              code={step.code}
              options={step.options}
              answer={step.answer}
              explanation={step.explanation}
              done={done}
              onDone={() => completeStep(topicKey, index)}
            />
          )}
          {step.kind === "mac" && step.expect_output && (
            <MacCheck key={`${topicKey}-${index}`} expected={step.expect_output} done={done} onDone={() => completeStep(topicKey, index)} />
          )}
        </article>

        {step.kind === "try" && (
          <SqlPanel key={`${topicKey}-${index}`} step={step} engine={engine} slot={`${topicKey}#step-${index}`} done={done} onDone={() => completeStep(topicKey, index)} />
        )}
        {step.kind === "code" && (language === "python" || language === "javascript") && (
          <CodePanel key={`${topicKey}-${index}`} step={step} language={language} slot={`${topicKey}#step-${index}`} done={done} onDone={() => completeStep(topicKey, index)} />
        )}
        {step.kind === "shell" && <ShellPanel key={`${topicKey}-${index}`} step={step} slot={`${topicKey}#step-${index}`} done={done} onDone={() => completeStep(topicKey, index)} />}
        {step.kind === "web" && (
          <WebPanel key={`${topicKey}-${index}`} step={step} slot={`${topicKey}#step-${index}`} done={done} onDone={() => completeStep(topicKey, index)} />
        )}
      </div>

      <div className={`mt-6 flex items-center gap-3 ${isExercise ? "" : "mx-auto max-w-2xl"}`}>
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-subtle hover:text-text disabled:opacity-40"
        >
          ← Back
        </button>
        <div className="ml-auto flex items-center gap-3">
          {step.kind === "mac" && !done && (
            <button onClick={advance} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-subtle hover:text-text">
              Skip for now
            </button>
          )}
          {step.kind === "mac" && !step.expect_output && !done && (
            <button
              onClick={() => completeStep(topicKey, index)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-subtle"
            >
              I ran it ✓
            </button>
          )}
          {needsAction && step.kind === "choice" && <span className="text-sm text-muted">Pick the right answer to continue</span>}
          {needsAction && isExercise && (
            <span className="text-sm text-muted">
              {step.kind === "web" ? "Pass the check to continue" : step.kind === "shell" ? "Do the task to continue" : `Run the ${step.kind === "code" ? "code" : "query"} to continue`}
            </span>
          )}
          <button
            onClick={next}
            disabled={needsAction}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-contrast shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {last ? (skipped.length > 0 ? "Take the quiz →" : "Finish · take the quiz →") : "Continue →"}
          </button>
        </div>
      </div>
      {last && skipped.length > 0 && (
        <p className={`mt-4 text-sm text-muted ${isExercise ? "text-right" : "mx-auto max-w-2xl text-right"}`}>
          The lesson counts as finished once you&apos;ve done every exercise. Still to do:{" "}
          {skipped.map((i, n) => (
            <span key={i}>
              {n > 0 && ", "}
              <button onClick={() => setIndex(i)} className="text-brand underline underline-offset-4">
                step {i + 1}
              </button>
            </span>
          ))}
          .
        </p>
      )}
      <p className="mt-10 text-center text-sm text-muted">
        Already confident? <Link href={quizHref} className="text-brand underline underline-offset-4">Jump to the quiz</Link>
      </p>
    </div>
  );
}
