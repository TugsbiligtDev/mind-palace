"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DifficultyBadge } from "@/components/case/difficulty-badge";
import { Markdown } from "@/components/markdown";
import { NoRunnerYet } from "@/components/no-runner-yet";
import { SqlRunner, type Engine } from "@/components/sql/sql-runner";
import type { Case, Track } from "@/lib/content/schema";
import { caseReward, recordCase, setLast, takeHint, useProgress } from "@/lib/progress";
import { gradeSql } from "@/lib/sql/client";

export function CasePlayer({
  id,
  data,
  language,
  engine,
  informant,
  href,
  trackTitle,
  topicHref,
  topicTitle,
  nextHref,
  nextLabel,
}: {
  id: string;
  data: Case;
  language: Track["engine"];
  engine: Engine;
  informant: string;
  href: string;
  trackTitle: string;
  topicHref?: string;
  topicTitle?: string;
  nextHref: string;
  nextLabel: string;
}) {
  const p = useProgress();
  const [verdict, setVerdict] = useState<{ correct: boolean; message: string; earned: number } | null>(null);
  const [grading, setGrading] = useState(false);

  useEffect(() => setLast(href, `Case: ${data.title}`), [href, data.title]);

  if (!p) return <div className="h-96" />;
  if (language !== "postgres") return <NoRunnerYet language={language} />;

  const record = p.cases[id];
  const hints = record?.hints ?? 0;
  const slot = `case:${id}`;

  async function submit(input: string) {
    setGrading(true);
    const v = await gradeSql(engine.key, engine.setup, input, data.check);
    const earned = recordCase(id, data.difficulty, v.correct);
    setVerdict({ correct: v.correct, message: v.message, earned });
    setGrading(false);
    return v.output;
  }

  const solved = record?.solved || verdict?.correct;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        <Link href="/practice" className="hover:text-text">
          ← Practice hub
        </Link>
        <span aria-hidden>·</span>
        <span>{trackTitle}</span>
        <DifficultyBadge difficulty={data.difficulty} />
        {topicHref && topicTitle && (
          <Link href={topicHref} className="hover:text-text">
            Uses {topicTitle}
          </Link>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <article className="rounded-2xl border border-paper-border bg-paper p-6 shadow-sm sm:p-8">
            <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-paper-border pb-3">
              <p className="font-mono text-xs tracking-widest text-muted uppercase">
                Case file{data.series ? ` · ${data.series.name}, episode ${data.series.episode}` : ""}
              </p>
              {solved && <span className="rotate-[-4deg] rounded border-2 border-success px-2 py-0.5 font-mono text-xs font-bold text-success">SOLVED</span>}
            </div>
            <h1 className="mt-4 font-serif text-3xl leading-tight">{data.title}</h1>
            <Markdown className="mt-4 font-serif text-[1.05rem]">{data.briefing}</Markdown>

            {data.clues.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 font-mono text-xs tracking-widest text-muted uppercase">Evidence</p>
                <ul className="space-y-2">
                  {data.clues.map((c, i) => (
                    <li key={i} className="flex gap-3 rounded-lg border border-paper-border bg-card/60 px-3 py-2 text-sm">
                      <span className="font-mono text-clue">#{i + 1}</span>
                      <Markdown>{c}</Markdown>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>

          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="mb-2 text-xs font-medium tracking-wide text-brand uppercase">Your assignment</p>
            <Markdown>{data.task}</Markdown>
          </div>
        </div>

        <div className="space-y-5">
          <SqlRunner
            engine={engine}
            initial={p.code[slot] ?? data.starter}
            starter={data.starter}
            slot={slot}
            runLabel="Run"
            onSubmit={submit}
            submitLabel={grading ? "Checking…" : "Submit answer"}
            busy={grading}
            minHeight="220px"
          />

          {verdict && !verdict.correct && (
            <p className="rounded-lg bg-xp/10 px-4 py-3 text-sm">{verdict.message}</p>
          )}

          {solved ? (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6">
              <p className="text-xs font-medium tracking-wide text-success uppercase">Case closed</p>
              {verdict?.earned ? <p className="mt-1 text-lg font-semibold text-xp">+{verdict.earned} XP</p> : null}
              <Markdown className="mt-3 font-serif text-[1.05rem]">{data.reveal}</Markdown>
              <Link href={nextHref} className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast">
                {nextLabel}
              </Link>
            </div>
          ) : (
            <HintPanel
              hints={data.hints}
              used={hints}
              informant={informant}
              reward={caseReward(data.difficulty, hints)}
              onTake={() => takeHint(id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HintPanel({
  hints,
  used,
  informant,
  reward,
  onTake,
}: {
  hints: string[];
  used: number;
  informant: string;
  reward: number;
  onTake: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Ask {informant}</p>
        <p className="text-sm text-muted">
          Case reward: <span className="font-medium text-xp">{reward} XP</span>
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {hints.slice(0, used).map((h, i) => (
          <div key={i} className="rounded-lg bg-subtle px-3 py-2 text-sm">
            <span className="mr-2 font-mono text-xs text-muted">Tip {i + 1}</span>
            <Markdown className="inline">{h}</Markdown>
          </div>
        ))}
      </div>
      {used < hints.length ? (
        <button onClick={onTake} className="mt-3 text-sm text-brand underline underline-offset-4">
          {used === 0 ? "Get a nudge" : used === 1 ? "Get a bigger clue" : "Get the near-solution"} (−15 XP)
        </button>
      ) : (
        <p className="mt-3 text-sm text-muted">That&apos;s everything {informant} knows. You&apos;ve got this.</p>
      )}
    </div>
  );
}

