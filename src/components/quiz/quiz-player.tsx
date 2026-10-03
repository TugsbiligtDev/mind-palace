"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/markdown";
import type { Question } from "@/lib/content/schema";
import { OptionText } from "./option-text";
import { recordQuiz, setLast } from "@/lib/progress";

function normalizeFill(s: string, caseSensitive: boolean) {
  const t = s.trim().replace(/;+$/, "").replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLowerCase();
}

function isCorrect(q: Question, choice: number | null, text: string, caseSensitive: boolean) {
  if (q.type === "fill") {
    // Capitals matter in code (`None` vs `none`), but not in plain-word answers that aren't run.
    const exact = caseSensitive && q.runnable;
    return [q.answer, ...q.accept].some((a) => normalizeFill(a, exact) === normalizeFill(text, exact));
  }
  return choice === q.answer;
}

function shuffled<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic shuffle: a small hash of `seed` drives a linear congruential generator.
function seededShuffle<T>(items: T[], seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuizPlayer({
  topicKey,
  title,
  label,
  questions,
  pass,
  caseSensitive,
  href,
  lessonHref,
  nextHref,
  nextLabel,
}: {
  topicKey: string;
  title: string;
  label: string;
  questions: Question[];
  pass: number;
  caseSensitive: boolean;
  href: string;
  lessonHref: string;
  nextHref: string;
  nextLabel: string;
}) {
  const [round, setRound] = useState(0);
  const order = useMemo(
    () => (round === 0 ? questions.map((_, i) => i) : shuffled(questions.map((_, i) => i))),
    [round, questions],
  );
  // Each question's options in the order shown, so the answer's position is never a clue.
  // The shuffle is seeded by quiz, question and retake: the same on the server and in the browser,
  // and different on every retake. `choice` stays an index into q.options, so grading is unchanged.
  const optionOrder = useMemo(
    () =>
      questions.map((q, n) =>
        q.type === "fill" ? [] : seededShuffle(q.options.map((_, i) => i), `${topicKey}#${n}#${round}`),
      ),
    [questions, topicKey, round],
  );
  const [pos, setPos] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<{ score: number; earned: number } | null>(null);

  useEffect(() => setLast(href, `${label}: ${title} · quiz`), [href, label, title]);

  const q = questions[order[pos]];
  const correct = checked && isCorrect(q, choice, text, caseSensitive);
  const canCheck = q.type === "fill" ? text.trim().length > 0 : choice !== null;

  function check() {
    setChecked(true);
    if (isCorrect(q, choice, text, caseSensitive)) setScore((s) => s + 1);
  }

  function next() {
    if (pos === questions.length - 1) {
      const earned = recordQuiz(topicKey, score, questions.length, pass);
      setResult({ score, earned });
      return;
    }
    setPos(pos + 1);
    setChoice(null);
    setText("");
    setChecked(false);
  }

  function retake() {
    setRound((r) => r + 1);
    setPos(0);
    setChoice(null);
    setText("");
    setChecked(false);
    setScore(0);
    setResult(null);
  }

  if (result) {
    const passed = result.score >= pass;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
        <p className="text-5xl">{passed ? "🔎" : "🧩"}</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {passed ? "Knowledge check passed" : "Not quite there yet"}
        </h1>
        <p className="mt-2 text-muted">
          You got <span className="font-medium text-text">{result.score} of {questions.length}</span> right
          {passed ? "." : `. You need ${pass} to pass.`}
        </p>
        {result.earned > 0 && <p className="mt-3 font-medium text-xp">+{result.earned} XP</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={retake} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-subtle">
            Retake quiz
          </button>
          {!passed && (
            <Link href={lessonHref} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-subtle">
              Review the lesson
            </Link>
          )}
          {passed && (
            <Link href={nextHref} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast hover:opacity-90">
              {nextLabel}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between text-sm text-muted">
        <span>
          {label} · Knowledge check
        </span>
        <span className="tabular-nums">
          Question {pos + 1} of {questions.length}
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-xs font-medium tracking-wide text-brand uppercase">
          {q.type === "mcq" ? "Multiple choice" : q.type === "predict" ? "Predict the output" : "Fill in the blank"}
        </p>
        <Markdown className="text-[1.05rem]">{q.prompt}</Markdown>
        {q.code && (
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-code p-4 font-mono text-sm">{q.code}</pre>
        )}

        {q.type === "fill" ? (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canCheck && !checked && check()}
            disabled={checked}
            placeholder="Type the missing part"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-5 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-brand"
            autoFocus
          />
        ) : (
          <div className="mt-5 space-y-2">
            {optionOrder[order[pos]].map((i, shownAt) => {
              const opt = q.options[i];
              const picked = choice === i;
              const state = !checked ? (picked ? "picked" : "idle") : i === q.answer ? "right" : picked ? "wrong" : "idle";
              return (
                <button
                  key={i}
                  onClick={() => !checked && setChoice(i)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    state === "picked"
                      ? "border-brand bg-brand/5"
                      : state === "right"
                        ? "border-success bg-success/10"
                        : state === "wrong"
                          ? "border-clue bg-clue/5"
                          : "border-border hover:bg-subtle"
                  }`}
                >
                  <span className="mt-0.5 font-mono text-xs text-muted">{String.fromCharCode(65 + shownAt)}</span>
                  <span className={q.type === "predict" ? "font-mono whitespace-pre-wrap" : ""}>{q.type === "predict" ? opt : <OptionText text={opt} />}</span>
                </button>
              );
            })}
          </div>
        )}

        {checked && (
          <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${correct ? "bg-success/10" : "bg-xp/10"}`}>
            <p className="mb-1 font-medium">
              {correct ? "✓ Correct" : q.type === "fill" ? `Answer: ${q.answer}` : "Not this time"}
            </p>
            <Markdown>{q.explanation}</Markdown>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        {!checked ? (
          <button
            onClick={check}
            disabled={!canCheck}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-contrast disabled:opacity-40"
          >
            Check
          </button>
        ) : (
          <button onClick={next} className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-contrast">
            {pos === questions.length - 1 ? "See result" : "Next question →"}
          </button>
        )}
      </div>
    </div>
  );
}
