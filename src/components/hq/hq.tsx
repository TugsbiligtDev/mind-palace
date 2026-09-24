"use client";
import Link from "next/link";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import type { LevelSummary } from "@/lib/content/load";
import { caseState, rankFor, setProfile, useProgress } from "@/lib/progress";

export function Hq({
  agency,
  client,
  premise,
  season,
}: {
  agency: string;
  client: string;
  premise: string;
  season: LevelSummary;
}) {
  const p = useProgress();
  if (!p) return <div className="h-96" />;
  if (!p.profile) return <Onboarding agency={agency} client={client} premise={premise} firstHref={topicHref(season, 0)} />;

  const rank = rankFor(p.xp);
  const keys = season.topics.map((t) => t.key);
  const solved = keys.filter((k) => p.cases[k]?.solved).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm text-muted">{agency}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{p.last ? "Welcome back" : "Welcome to the agency"}, {p.profile.name}.</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Continue</p>
          {p.last ? (
            <>
              <p className="mt-2 text-lg font-medium">{p.last.label}</p>
              <Link href={p.last.href} className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast shadow-sm hover:opacity-90">
                Pick up where you left off →
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-medium">Module 0: {season.topics[0]?.title}</p>
              <Link href={topicHref(season, 0)} className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast shadow-sm hover:opacity-90">
                Start your first lesson →
              </Link>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Rank</p>
          <p className="mt-2 text-lg font-semibold">{rank.title}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-xp" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {p.xp} XP{rank.next ? ` · ${rank.toNext} to ${rank.next}` : " · top rank"}
          </p>
          <p className="mt-3 text-sm">
            🔥 <span className="font-medium">{p.streak.current}-day streak</span>
            <span className="text-muted"> · ❄️ {p.streak.freezes} freeze{p.streak.freezes === 1 ? "" : "s"}</span>
          </p>
        </div>
      </div>

      <div className="mt-12 flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">
            {season.trackTitle} · Season {season.season}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{season.seasonTitle}</h2>
        </div>
        <p className="text-sm text-muted">
          {solved}/{keys.length} cases solved
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {season.topics.map((t, i) => {
          const s = caseState(p, keys, i);
          const href = s.unlocked || s.solved ? `${topicHref(season, i)}/case` : topicHref(season, i);
          return (
            <Link
              key={t.key}
              href={href}
              className={`group rounded-2xl border p-5 transition-colors ${
                s.solved ? "border-success/30 bg-success/5" : s.unlocked ? "border-brand/40 bg-card hover:bg-subtle" : "border-border bg-card hover:bg-subtle"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-mono tracking-widest uppercase">Episode {t.episode}</span>
                <span>{s.solved ? "✓ Solved" : s.unlocked ? "Open" : "🔒"}</span>
              </div>
              <p className="mt-2 font-serif text-lg leading-snug">{t.caseTitle}</p>
              <p className="mt-2 text-sm text-muted">
                Module {t.module} · {t.title}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function topicHref(level: LevelSummary, i: number) {
  return `/courses/${level.trackId}/${level.levelId}/${level.topics[i]?.id}`;
}

function Onboarding({ agency, client, premise, firstHref }: { agency: string; client: string; premise: string; firstHref: string }) {
  const [name, setName] = useState("");
  const valid = name.trim().length >= 2;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <p className="text-sm font-medium tracking-wide text-brand uppercase">{agency}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Learn to code by solving mysteries.</h1>
      <div className="mt-8 rounded-2xl border border-paper-border bg-paper p-6">
        <p className="mb-2 font-mono text-xs tracking-widest text-muted uppercase">New client · {client}</p>
        <Markdown className="font-serif text-[1.05rem]">{premise}</Markdown>
      </div>
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setProfile(name);
        }}
      >
        <label htmlFor="name" className="text-sm font-medium">
          What should the agency call you, detective?
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Tugs"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-brand"
            autoFocus
          />
          <button disabled={!valid} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast disabled:opacity-40">
            Join the agency
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">
          Your progress saves automatically in this browser. First lesson: <Link href={firstHref} className="underline underline-offset-4">Module 0</Link>.
        </p>
      </form>
    </div>
  );
}
