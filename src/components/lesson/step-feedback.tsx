"use client";
import { useCallback, useState } from "react";
import { Markdown } from "@/components/markdown";

type Feedback = { ok: boolean; text: string } | null;

// The grading state every exercise shares: the message under the editor and how many wrong
// attempts there were (a hint shows after the first, an answer after the third). A run that ends
// in an error counts as a wrong attempt too. The count is kept in this browser per step, so
// leaving the step and coming back doesn't start it over.
const missKey = (slot: string) => `mp:misses:${slot}`;

function readMisses(slot: string) {
  try {
    return Number(localStorage.getItem(missKey(slot))) || 0;
  } catch {
    return 0;
  }
}

export function useStepFeedback(slot: string, onDone: () => void) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [misses, setCount] = useState(() => readMisses(slot));
  const setMisses = useCallback(
    (next: (m: number) => number) =>
      setCount((m) => {
        const n = next(m);
        try {
          localStorage.setItem(missKey(slot), String(n));
        } catch {}
        return n;
      }),
    [slot],
  );
  const pass = useCallback(
    (text: string) => {
      setFeedback({ ok: true, text });
      onDone();
    },
    [onDone],
  );
  const miss = useCallback(
    (text: string) => {
      setMisses((m) => m + 1);
      setFeedback({ ok: false, text });
    },
    [setMisses],
  );
  // A wrong attempt that already shows its own message (a terminal command that failed).
  const stumble = useCallback(() => setMisses((m) => m + 1), [setMisses]);
  return { feedback, setFeedback, misses, pass, miss, stumble };
}

export function StepFeedback({
  feedback,
  misses,
  done,
  hint,
  answer,
  answerLabel,
}: {
  feedback: Feedback;
  misses: number;
  done: boolean;
  hint?: string;
  answer?: string;
  answerLabel: string;
}) {
  return (
    <>
      {feedback && (
        <p className={`rounded-lg px-3 py-2 text-sm ${feedback.ok ? "bg-success/10 text-success" : "bg-xp/10 text-text"}`}>
          {feedback.ok ? "✓ " : ""}
          {feedback.text}
        </p>
      )}
      {done && !feedback && <p className="text-sm text-success">✓ Step complete</p>}
      {!done && <HelpPanel hint={hint} answer={answer} answerLabel={answerLabel} misses={misses} />}
    </>
  );
}

// "Need a hint?" after the first miss, "Show one working answer" after three.
function HelpPanel({ hint, answer, answerLabel, misses }: { hint?: string; answer?: string; answerLabel: string; misses: number }) {
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <>
      {hint && misses >= 1 && (
        <div className="text-sm">
          {showHint ? (
            <div className="rounded-lg border border-border px-3 py-2">
              <Markdown>{hint}</Markdown>
            </div>
          ) : (
            <button onClick={() => setShowHint(true)} className="rounded-lg border border-border px-3 py-1.5 font-medium transition-colors hover:bg-subtle">
              Need a hint?
            </button>
          )}
        </div>
      )}
      {answer && misses >= 3 && (
        <div className="text-sm">
          {showAnswer ? (
            <div className="space-y-1">
              <pre className="overflow-x-auto rounded-lg border border-border bg-code p-3 font-mono text-xs">{answer}</pre>
              <p className="text-xs text-muted">Type it in yourself (don&apos;t just copy it) and run it to finish the step.</p>
            </div>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="rounded-lg border border-border px-3 py-1.5 font-medium transition-colors hover:bg-subtle">
              {answerLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
