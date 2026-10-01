"use client";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { OptionText } from "@/components/quiz/option-text";

// A question inside a lesson. A wrong pick says so without giving the answer away; the
// explanation appears once the right option is chosen.
export function ChoiceStep({
  code,
  options,
  answer,
  explanation,
  done,
  onDone,
}: {
  code?: string;
  options: string[];
  answer: number;
  explanation: string;
  done: boolean;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(done ? answer : null);
  const [wrong, setWrong] = useState<number[]>([]);
  const solved = picked === answer;

  function choose(i: number) {
    if (solved) return;
    setPicked(i);
    if (i === answer) onDone();
    else if (!wrong.includes(i)) setWrong([...wrong, i]);
  }

  return (
    <div className="mt-5 space-y-3">
      {code && <pre className="overflow-x-auto rounded-xl border border-border bg-code p-4 font-mono text-sm">{code}</pre>}
      <div className="space-y-2">
        {options.map((opt, i) => {
          const state = solved && i === answer ? "right" : wrong.includes(i) ? "wrong" : "idle";
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={state === "wrong" || solved}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                state === "right"
                  ? "border-success bg-success/10"
                  : state === "wrong"
                    ? "border-clue/40 bg-clue/5 text-muted line-through"
                    : "border-border hover:bg-subtle"
              }`}
            >
              <span className="mt-0.5 font-mono text-xs text-muted">{String.fromCharCode(65 + i)}</span>
              <span>
                <OptionText text={opt} />
              </span>
            </button>
          );
        })}
      </div>
      {!solved && picked !== null && <p className="rounded-lg bg-xp/10 px-3 py-2 text-sm">Not that one. Think it through again and pick another.</p>}
      {solved && (
        <div className="rounded-xl bg-success/10 px-4 py-3 text-sm">
          <p className="mb-1 font-medium text-success">✓ Right</p>
          <Markdown>{explanation}</Markdown>
        </div>
      )}
    </div>
  );
}
