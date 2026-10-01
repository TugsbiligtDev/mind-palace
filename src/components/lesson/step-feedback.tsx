"use client";
import { useCallback, useState } from "react";
import { Markdown } from "@/components/markdown";

type Feedback = { ok: boolean; text: string } | null;

// The grading state every exercise shares: the message under the editor and how many wrong
// attempts there were (a hint shows after the first, an answer after the third).
export function useStepFeedback(onDone: () => void) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [misses, setMisses] = useState(0);
  const pass = useCallback(
    (text: string) => {
      setFeedback({ ok: true, text });
      onDone();
    },
    [onDone],
  );
  const miss = useCallback((text: string) => {
    setMisses((m) => m + 1);
    setFeedback({ ok: false, text });
  }, []);
  return { feedback, setFeedback, misses, pass, miss };
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
            <button onClick={() => setShowHint(true)} className="text-muted underline underline-offset-4 hover:text-text">
              Need a hint?
            </button>
          )}
        </div>
      )}
      {answer && misses >= 3 && (
        <div className="text-sm">
          {showAnswer ? (
            <pre className="overflow-x-auto rounded-lg border border-border bg-code p-3 font-mono text-xs">{answer}</pre>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="text-muted underline underline-offset-4 hover:text-text">
              {answerLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
