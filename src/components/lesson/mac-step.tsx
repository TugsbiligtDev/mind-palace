"use client";
import { useState } from "react";

// A light self-check for work done on the learner's Mac: the pasted Terminal output must
// contain every expected piece (spaces don't matter).
export function MacCheck({ expected, done, onDone }: { expected: string[]; done: boolean; onDone: () => void }) {
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

export function MacCommands({ commands }: { commands: string }) {
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
      <p className="mt-2 text-xs text-muted">
        Optional. Haven&apos;t installed anything, or not on a Mac? Press Skip for now: everything else in the course works in your browser, and you can come back later.
      </p>
    </div>
  );
}
