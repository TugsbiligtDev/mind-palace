"use client";
import Link from "next/link";
import type { LevelSummary } from "@/lib/content/load";
import { useProgress } from "@/lib/progress";

function Pill({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
        done ? "bg-success/10 text-success" : "bg-subtle text-muted hover:text-text"
      }`}
    >
      {done ? "✓ " : ""}
      {label}
    </Link>
  );
}

export function TopicList({ level }: { level: LevelSummary }) {
  const p = useProgress();
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {level.topics.map((t) => {
        const href = `/courses/${level.trackId}/${level.levelId}/${t.id}`;
        const lesson = p?.lessons[t.key];
        const quiz = p?.quizzes[t.key];
        const action = quiz?.passed ? "Review" : lesson?.done ? "Take quiz" : lesson ? "Continue" : "Start";
        return (
          <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <span className="w-8 font-mono text-sm text-muted">{t.kind === "module" ? String(t.module).padStart(2, "0") : "✦"}</span>
            <div className="min-w-0 flex-1 basis-56">
              <Link href={href} className="font-medium hover:text-brand">
                {t.kind === "review" ? "Case review: " : t.kind === "capstone" ? "Capstone: " : ""}
                {t.title}
              </Link>
              <p className="mt-0.5 text-sm text-muted">{t.summary}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs text-muted">{t.minutes} min</span>
              <Pill done={!!lesson?.done} label="Lesson" href={href} />
              <Pill done={!!quiz?.passed} label="Quiz" href={`${href}/quiz`} />
            </div>
            <Link
              href={action === "Take quiz" ? `${href}/quiz` : href}
              className="w-24 rounded-lg border border-border px-3 py-1.5 text-center text-sm hover:bg-subtle"
            >
              {action}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
