"use client";
import Link from "next/link";
import type { LevelSummary } from "@/lib/content/load";
import { caseState, useProgress } from "@/lib/progress";

function Dot({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${done ? "bg-success/10 text-success" : "bg-subtle text-muted"}`}>
      {done ? "✓ " : ""}
      {label}
    </span>
  );
}

export function TopicList({ level }: { level: LevelSummary }) {
  const p = useProgress();
  const keys = level.topics.map((t) => t.key);
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {level.topics.map((t, i) => {
        const href = `/courses/${level.trackId}/${level.levelId}/${t.id}`;
        const s = caseState(p, keys, i);
        return (
          <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <span className="w-8 font-mono text-sm text-muted">{String(t.module).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <Link href={href} className="font-medium hover:text-brand">
                {t.title}
              </Link>
              <p className="mt-0.5 font-serif text-sm text-muted italic">Episode {t.episode}: {t.caseTitle}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Dot done={!!p?.lessons[t.key]?.done} label="Lesson" />
              <Dot done={!!p?.quizzes[t.key]?.passed} label="Quiz" />
              <Dot done={s.solved} label="Case" />
            </div>
            <Link
              href={s.unlocked && !s.solved ? `${href}/case` : href}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-subtle"
            >
              {s.solved ? "Review" : s.unlocked ? "Open case" : p?.lessons[t.key] ? "Continue" : "Start"}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
