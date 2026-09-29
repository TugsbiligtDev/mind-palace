"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { SqlRunner, type Engine } from "@/components/sql/sql-runner";
import type { Step } from "@/lib/content/schema";
import { tryStepCheck } from "@/lib/content/step-check";
import { completeLesson, completeStep, setLast, setLessonStep, useProgress } from "@/lib/progress";
import type { RunOutput } from "@/lib/sql/core";
import { gradeSql } from "@/lib/sql/client";

const KIND_LABEL: Record<Step["kind"], string> = {
  explain: "Learn",
  try: "Try it",
  info: "Good to know",
  mac: "On your Mac",
  why: "Why this matters",
  recap: "Recap",
};

export function LessonPlayer({
  topicKey,
  title,
  label,
  steps,
  engine,
  href,
  quizHref,
}: {
  topicKey: string;
  title: string;
  label: string;
  steps: Step[];
  engine: Engine;
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
  const needsAction = (step.kind === "try" || step.kind === "mac") && !done;
  const last = index === steps.length - 1;

  function next() {
    if (step.kind !== "try" && step.kind !== "mac") completeStep(topicKey, index!);
    advance();
  }

  function advance() {
    if (last) {
      completeLesson(topicKey);
      router.push(quizHref);
    } else setIndex(index! + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-4">
        <p className="text-sm text-muted">
          {label} · <span className="text-text">{title}</span>
        </p>
        <div className="flex flex-1 gap-1" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i === index ? "bg-brand" : saved?.stepsDone.includes(i) ? "bg-brand/40" : "bg-border"
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-muted tabular-nums">
          {index + 1}/{steps.length}
        </p>
      </div>

      <div className={step.kind === "try" ? "grid gap-6 lg:grid-cols-2" : "mx-auto max-w-2xl"}>
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="mb-2 text-xs font-medium tracking-wide text-brand uppercase">{KIND_LABEL[step.kind]}</p>
          {"title" in step && <h1 className="mb-4 text-2xl font-semibold tracking-tight">{step.title}</h1>}
          <Markdown>{step.body}</Markdown>
          {step.kind === "mac" && <MacCommands commands={step.commands} />}
          {step.kind === "mac" && step.expect_output && (
            <MacCheck key={`${topicKey}-${index}`} expected={step.expect_output} done={done} onDone={() => completeStep(topicKey, index)} />
          )}
        </article>

        {step.kind === "try" && (
          <TryPanel key={`${topicKey}-${index}`} step={step} engine={engine} slot={`${topicKey}#step-${index}`} done={done} onDone={() => completeStep(topicKey, index)} />
        )}
      </div>

      <div className={`mt-6 flex items-center gap-3 ${step.kind === "try" ? "" : "mx-auto max-w-2xl"}`}>
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
          {needsAction && step.kind === "try" && <span className="text-sm text-muted">Run the query to continue</span>}
          <button
            onClick={next}
            disabled={needsAction}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-contrast shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {last ? "Finish · take the quiz →" : "Continue →"}
          </button>
        </div>
      </div>
      <p className="mt-10 text-center text-sm text-muted">
        Already confident? <Link href={quizHref} className="text-brand underline underline-offset-4">Jump to the quiz</Link>
      </p>
    </div>
  );
}

function TryPanel({
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
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [misses, setMisses] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const onRan = useCallback(
    async (input: string, out: RunOutput) => {
      if (step.expect_error) {
        if (out.error) {
          setFeedback({ ok: true, text: "That's the error we wanted to see. Read it carefully: the ERROR line says what went wrong, and LINE points to where." });
          onDone();
        } else setFeedback({ ok: false, text: "No error this time. Run the broken version to see the message." });
        return;
      }
      if (out.error) {
        setFeedback({ ok: false, text: "An error. Read the message, fix the query, and run it again." });
        return;
      }
      const check = tryStepCheck(step);
      if (!check) {
        onDone();
        setFeedback(null);
        return;
      }
      const v = await gradeSql(engine.key, engine.setup, input, check);
      if (v.correct) {
        setFeedback({ ok: true, text: "Correct! That's exactly the result we were after." });
        onDone();
      } else {
        setMisses((m) => m + 1);
        setFeedback({ ok: false, text: v.message });
      }
    },
    [step, engine, onDone],
  );

  return (
    <div className="space-y-3">
      <SqlRunner
        engine={engine}
        initial={p?.code[slot] ?? step.sql}
        starter={step.sql}
        slot={slot}
        onRan={onRan}
        minHeight="160px"
      />
      {feedback && (
        <p className={`rounded-lg px-3 py-2 text-sm ${feedback.ok ? "bg-success/10 text-success" : "bg-xp/10 text-text"}`}>
          {feedback.ok ? "✓ " : ""}
          {feedback.text}
        </p>
      )}
      {done && !feedback && <p className="text-sm text-success">✓ Step complete</p>}
      {step.hint && misses >= 1 && !done && (
        <div className="text-sm">
          {showHint ? (
            <div className="rounded-lg border border-border px-3 py-2">
              <Markdown>{step.hint}</Markdown>
            </div>
          ) : (
            <button onClick={() => setShowHint(true)} className="text-muted underline underline-offset-4 hover:text-text">
              Need a hint?
            </button>
          )}
        </div>
      )}
      {step.expect && misses >= 3 && !done && (
        <div className="text-sm">
          {showAnswer ? (
            <pre className="overflow-x-auto rounded-lg border border-border bg-code p-3 font-mono text-xs">{step.expect}</pre>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="text-muted underline underline-offset-4 hover:text-text">
              Stuck? Show one working answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A light self-check for work done on the learner's Mac: the pasted Terminal output must
// contain every expected piece (spaces don't matter).
function MacCheck({ expected, done, onDone }: { expected: string[]; done: boolean; onDone: () => void }) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  function check() {
    const missing = expected.filter((e) => !squash(text).includes(squash(e)));
    if (missing.length === 0) {
      setFeedback(null);
      onDone();
    } else setFeedback("That doesn't look like the expected output yet. Did every command run without an error?");
  }
  if (done) return <p className="mt-5 text-sm text-success">✓ Checkpoint passed</p>;
  return (
    <div className="mt-5 space-y-2">
      <label className="block text-sm font-medium" htmlFor="mac-output">
        Checkpoint: paste what your Terminal printed
      </label>
      <textarea
        id="mac-output"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        className="w-full rounded-lg border border-border bg-code p-3 font-mono text-xs"
      />
      <button onClick={check} className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-subtle">
        Check my output
      </button>
      {feedback && <p className="rounded-lg bg-xp/10 px-3 py-2 text-sm">{feedback}</p>}
    </div>
  );
}

function MacCommands({ commands }: { commands: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>Terminal</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(commands).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="hover:text-text"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-[#0b0f19] p-4 font-mono text-[0.82rem] leading-relaxed text-[#e5e7eb]">{commands}</pre>
    </div>
  );
}
