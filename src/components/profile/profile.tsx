"use client";
import Link from "next/link";
import { useState } from "react";
import { DifficultyBadge } from "@/components/case/difficulty-badge";
import { levelProgress } from "@/components/course/level-cards";
import { signOut, useAuth } from "@/lib/auth";
import { Avatar } from "./avatar";
import type { LevelSummary } from "@/lib/content/load";
import type { PracticeSummary } from "@/lib/content/practice";
import { liveStreak, RANKS, rankFor, resetProgress, setProfile, useProgress, type Difficulty } from "@/lib/progress";

const DIFFS: { id: Difficulty; label: string; bar: string }[] = [
  { id: "easy", label: "Easy", bar: "bg-success" },
  { id: "medium", label: "Medium", bar: "bg-xp" },
  { id: "hard", label: "Hard", bar: "bg-clue" },
];

export function Profile({ levels, cases }: { levels: LevelSummary[]; cases: PracticeSummary[] }) {
  const p = useProgress();
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!p) return <div className="h-96" />;

  const rank = rankFor(p.xp);
  const name = p.profile?.name ?? "Detective";
  const allKeys = levels.flatMap((l) => l.topics.map((t) => t.key));
  const solvedCases = cases.filter((c) => p.cases[c.id]?.solved);
  const recent = solvedCases
    .map((c) => ({ ...c, at: p.cases[c.id].solvedAt, hints: p.cases[c.id].hints }))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 6);

  const stats = [
    { label: "Total XP", value: p.xp, accent: "text-xp" },
    { label: "Current streak", value: `${liveStreak(p)} day${liveStreak(p) === 1 ? "" : "s"}`, sub: `❄️ ${p.streak.freezes} freeze${p.streak.freezes === 1 ? "" : "s"} saved` },
    { label: "Longest streak", value: `${p.streak.longest} day${p.streak.longest === 1 ? "" : "s"}` },
    { label: "Cases solved", value: `${solvedCases.length}/${cases.length}` },
    { label: "Lessons done", value: `${allKeys.filter((k) => p.lessons[k]?.done).length}/${allKeys.length}` },
    { label: "Quizzes passed", value: `${allKeys.filter((k) => p.quizzes[k]?.passed).length}/${allKeys.length}` },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={p.profile?.name} size={72} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim().length >= 2) setProfile(draft);
                setEditing(false);
              }}
            >
              <label htmlFor="name" className="sr-only">
                Detective name
              </label>
              <input
                id="name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={24}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xl font-semibold outline-none focus:border-brand"
              />
              <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast">Save</button>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="truncate text-3xl font-semibold tracking-tight">{name}</h1>
              <button
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-subtle hover:text-text"
              >
                Rename
              </button>
            </div>
          )}
          <p className="mt-1 text-muted">
            {rank.title}
            {auth.user && ` · ${auth.user.email}`}
          </p>
        </div>
        {auth.status === "signed-in" && (
          <button onClick={() => signOut()} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-subtle">
            Sign out
          </button>
        )}
      </div>

      {auth.status === "signed-out" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <p className="text-sm">
            <span className="font-medium">Your progress only lives in this browser.</span>{" "}
            <span className="text-muted">Sign in to keep it on every device.</span>
          </p>
          <Link href="/login?next=/profile" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast shadow-sm hover:opacity-90">
            Sign in
          </Link>
        </div>
      )}

      {p.last && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Continue where you left off</p>
            <p className="mt-1 font-medium">{p.last.label}</p>
          </div>
          <Link href={p.last.href} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast shadow-sm hover:opacity-90">
            Continue →
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.accent ?? ""}`}>{s.value}</p>
            {s.sub && <p className="mt-1 text-xs text-muted">{s.sub}</p>}
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Rank: {rank.title}</h2>
          <p className="text-sm text-muted">{rank.next ? `${rank.toNext} XP to ${rank.next}` : "You've reached the top rank."}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle">
          <div className="h-full rounded-full bg-xp" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {RANKS.map((r) => (
            <li key={r.title} className={`rounded-xl px-3 py-2 text-sm ${p.xp >= r.min ? "bg-xp/10" : "bg-subtle text-muted"}`}>
              <p className="font-medium">{r.title}</p>
              <p className="text-xs">{r.min} XP</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Courses</h2>
          <ul className="mt-4 space-y-4">
            {levels.map((l) => {
              const prog = levelProgress(p, l);
              return (
                <li key={`${l.trackId}/${l.levelId}`}>
                  <Link href={`/courses/${l.trackId}/${l.levelId}`} className="group block">
                    <div className="flex justify-between text-sm">
                      <span className="group-hover:text-brand">
                        {l.trackTitle} · {l.levelTitle}
                      </span>
                      <span className="text-muted tabular-nums">{Math.round(prog.ratio * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${prog.ratio * 100}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted">Counts finished lessons and passed quizzes.</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Practice hub</h2>
          <ul className="mt-4 space-y-4">
            {DIFFS.map((d) => {
              const all = cases.filter((c) => c.difficulty === d.id);
              const done = all.filter((c) => p.cases[c.id]?.solved).length;
              return (
                <li key={d.id}>
                  <Link href={`/practice?difficulty=${d.id}`} className="group block">
                    <div className="flex justify-between text-sm">
                      <span className="group-hover:text-brand">{d.label}</span>
                      <span className="text-muted tabular-nums">
                        {done}/{all.length}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                      <div className={`h-full rounded-full ${d.bar}`} style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="font-medium">Recently solved</h2>
        {recent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
            No cases closed yet.{" "}
            <Link href="/practice?difficulty=easy" className="text-brand underline underline-offset-4">
              Try an easy one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/practice/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-subtle">
                  <span className="text-success">✓</span>
                  <span className="flex-1 font-serif">{c.title}</span>
                  <span className="hidden text-xs text-muted sm:inline">{c.hints ? `${c.hints} hint${c.hints === 1 ? "" : "s"}` : "no hints"}</span>
                  <DifficultyBadge difficulty={c.difficulty} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-16 border-t border-border pt-6 text-sm text-muted">
        {auth.status === "signed-in" ? "Progress is saved to your account." : "Progress is saved in this browser."}{" "}
        <button
          onClick={() => {
            if (window.confirm("Erase all your progress? This can't be undone.")) resetProgress();
          }}
          className="underline underline-offset-4 hover:text-clue"
        >
          Reset progress
        </button>
      </div>
    </div>
  );
}
