"use client";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import type { LevelSummary } from "@/lib/content/load";
import { useProgress, type Progress } from "@/lib/progress";

type Level = LevelSummary & { pitch: string; planned: string[] };

// Lessons finished + quizzes passed, out of two per module.
export function levelProgress(p: Progress | null, level: LevelSummary) {
  const total = level.topics.length * 2;
  const done = level.topics.reduce((n, t) => n + Number(!!p?.lessons[t.key]?.done) + Number(!!p?.quizzes[t.key]?.passed), 0);
  return { done, total, ratio: total ? done / total : 0 };
}

export function LevelCards({ levels }: { levels: Level[] }) {
  const p = useProgress();
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {levels.map((l) => {
        const open = l.status === "open";
        const prog = levelProgress(p, l);
        return (
          <Link
            key={l.levelId}
            href={`/courses/${l.trackId}/${l.levelId}`}
            className={`group flex flex-col rounded-2xl border p-6 transition-colors ${
              open ? "border-border bg-card shadow-sm hover:border-brand/50" : "border-dashed border-border hover:bg-subtle"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-brand uppercase">{l.levelTitle}</p>
              {!open && <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">Coming soon</span>}
            </div>
            <h2 className="mt-2 font-serif text-xl">{open ? l.seasonTitle : `${l.levelTitle} level`}</h2>
            <Markdown className="mt-2 line-clamp-4 text-sm text-muted">{l.pitch}</Markdown>
            <div className="mt-auto pt-6">
              {open ? (
                <>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{l.topics.length} modules</span>
                    <span className="tabular-nums">{Math.round(prog.ratio * 100)}% done</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${prog.ratio * 100}%` }} />
                  </div>
                  <p className="mt-4 text-sm font-medium text-brand">
                    {prog.done === 0 ? "Start level →" : prog.done === prog.total ? "Review →" : "Continue →"}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">{l.planned.length} modules planned</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
