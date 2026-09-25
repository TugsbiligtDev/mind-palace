"use client";
// Every case file in one list. Filters live in the URL (?track=…&difficulty=…) so a view can be linked to.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DifficultyBadge } from "@/components/case/difficulty-badge";
import type { UpcomingTrack } from "@/lib/content/load";
import type { PracticeSummary } from "@/lib/content/practice";
import { useProgress } from "@/lib/progress";
import { DIFFICULTIES, PracticeFilters, type Filters } from "./practice-filters";

export function PracticeHub({
  cases,
  topics,
  upcoming,
}: {
  cases: PracticeSummary[];
  topics: { key: string; label: string }[];
  upcoming: UpcomingTrack[];
}) {
  const p = useProgress();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: Filters = {
    track: params.get("track") ?? "",
    difficulty: params.get("difficulty") ?? "",
    topic: params.get("topic") ?? "",
    status: params.get("status") ?? "",
    q: params.get("q") ?? "",
  };

  function setFilter(key: keyof Filters, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  const solved = (id: string) => !!p?.cases[id]?.solved;
  const tried = (id: string) => !!p?.cases[id] && !p.cases[id].solved;
  const needle = filters.q.trim().toLowerCase();

  const shown = cases.filter(
    (c) =>
      (!filters.track || c.track === filters.track) &&
      (!filters.difficulty || c.difficulty === filters.difficulty) &&
      (!filters.topic || c.topic === filters.topic) &&
      (!filters.status || (filters.status === "solved") === solved(c.id)) &&
      (!needle || [c.title, ...c.concepts, c.topicTitle ?? ""].some((s) => s.toLowerCase().includes(needle))),
  );

  const tracks = [...new Map(cases.map((c) => [c.track, { id: c.track, title: c.trackTitle, color: c.color }])).values()];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight">Practice hub</h1>
          <p className="mt-2 text-muted">
            Every case file in one place. Pick a course and a difficulty, and sharpen a skill on its own, with no
            course order and nothing locked.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-border bg-card p-4 sm:w-72">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Solved</p>
            <p className="text-sm text-muted tabular-nums">
              <span className="font-semibold text-text">{p ? cases.filter((c) => solved(c.id)).length : "–"}</span> / {cases.length}
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {DIFFICULTIES.map((d) => {
              const all = cases.filter((c) => c.difficulty === d.id);
              const done = all.filter((c) => solved(c.id)).length;
              return (
                <div key={d.id} className="flex items-center gap-3 text-xs">
                  <span className="w-14 text-muted">{d.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div className={`h-full rounded-full ${d.dot}`} style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-10 text-right text-muted tabular-nums">
                    {done}/{all.length}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <PracticeFilters
        filters={filters}
        tracks={tracks}
        upcoming={upcoming}
        topics={topics}
        onChange={setFilter}
        onClear={() => router.replace(pathname, { scroll: false })}
      />

      <p className="mt-6 mb-3 text-sm text-muted">
        {shown.length} case{shown.length === 1 ? "" : "s"}
      </p>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">No cases match these filters.</div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/practice/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-subtle">
                <StatusIcon solved={solved(c.id)} tried={tried(c.id)} />
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">
                    {c.series && <span className="mr-2 font-mono text-xs text-muted">EP {c.series.episode}</span>}
                    {c.title}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {c.concepts.map((k) => (
                      <span key={k} className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {k}
                      </span>
                    ))}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="size-2 rounded-full" style={{ background: c.color }} />
                  {c.trackTitle}
                </span>
                <span className="w-16 text-right">
                  <DifficultyBadge difficulty={c.difficulty} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ solved, tried }: { solved: boolean; tried: boolean }) {
  if (solved)
    return (
      <span className="grid size-6 place-items-center rounded-full bg-success/15 text-xs text-success" title="Solved">
        ✓
      </span>
    );
  return <span className={`size-6 rounded-full border-2 ${tried ? "border-xp" : "border-border"}`} title={tried ? "Attempted" : "Not started"} />;
}
