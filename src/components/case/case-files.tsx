"use client";
import Link from "next/link";
import type { LevelSummary } from "@/lib/content/load";
import { RANKS, rankFor, resetProgress, useProgress } from "@/lib/progress";

export function CaseFiles({ seasons }: { seasons: LevelSummary[] }) {
  const p = useProgress();
  if (!p) return <div className="h-96" />;
  const rank = rankFor(p.xp);
  const allKeys = seasons.flatMap((s) => s.topics.map((t) => t.key));
  const stats = [
    { label: "XP", value: p.xp },
    { label: "Cases solved", value: allKeys.filter((k) => p.cases[k]?.solved).length },
    { label: "Quizzes passed", value: allKeys.filter((k) => p.quizzes[k]?.passed).length },
    { label: "Longest streak", value: `${p.streak.longest} day${p.streak.longest === 1 ? "" : "s"}` },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Case files</h1>
      <p className="mt-2 text-muted">
        {p.profile?.name ?? "Detective"}, {rank.title}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-medium">Rank ladder</p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-4">
          {RANKS.map((r) => (
            <li
              key={r.title}
              className={`rounded-xl px-3 py-2 text-sm ${p.xp >= r.min ? "bg-xp/10 text-text" : "bg-subtle text-muted"}`}
            >
              <p className="font-medium">{r.title}</p>
              <p className="text-xs">{r.min} XP</p>
            </li>
          ))}
        </ol>
      </div>

      {seasons.map((s) => (
        <section key={`${s.trackId}-${s.levelId}`} className="mt-10">
          <p className="text-sm text-muted">
            {s.trackTitle} · {s.levelTitle}
          </p>
          <h2 className="mt-1 font-serif text-2xl">{s.seasonTitle}</h2>
          <ul className="mt-4 space-y-2">
            {s.topics.map((t) => {
              const c = p.cases[t.key];
              return (
                <li key={t.key} className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
                  <span className="font-mono text-xs text-muted">EP {t.episode}</span>
                  <Link href={`/courses/${s.trackId}/${s.levelId}/${t.id}/case`} className="flex-1 font-serif hover:text-brand">
                    {t.caseTitle}
                  </Link>
                  {c?.solved ? (
                    <span className="text-sm text-success">
                      Solved{c.hints ? ` · ${c.hints} hint${c.hints === 1 ? "" : "s"}` : " · no hints"}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">Open</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="mt-16 border-t border-border pt-6 text-sm text-muted">
        Progress is saved in this browser.{" "}
        <button
          onClick={() => {
            if (window.confirm("Erase all progress in this browser? This can't be undone.")) resetProgress();
          }}
          className="underline underline-offset-4 hover:text-clue"
        >
          Reset progress
        </button>
      </div>
    </div>
  );
}
