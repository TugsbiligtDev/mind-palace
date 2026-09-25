"use client";
import { useState } from "react";
import type { UpcomingTrack } from "@/lib/content/load";
import type { Difficulty } from "@/lib/progress";

export const DIFFICULTIES: { id: Difficulty; label: string; dot: string }[] = [
  { id: "easy", label: "Easy", dot: "bg-success" },
  { id: "medium", label: "Medium", dot: "bg-xp" },
  { id: "hard", label: "Hard", dot: "bg-clue" },
];

export type Filters = { track: string; difficulty: string; topic: string; status: string; q: string };

export function PracticeFilters({
  filters,
  tracks,
  upcoming,
  topics,
  onChange,
  onClear,
}: {
  filters: Filters;
  tracks: { id: string; title: string; color: string }[];
  upcoming: UpcomingTrack[];
  topics: { key: string; label: string }[];
  onChange: (key: keyof Filters, value: string) => void;
  onClear: () => void;
}) {
  // The search box keeps its own text so typing stays smooth; the URL follows it.
  const [text, setText] = useState(filters.q);
  const active = Object.values(filters).some(Boolean);

  return (
    <div className="mt-8 space-y-3 rounded-2xl border border-border bg-card p-4">
      <Row label="Course">
        <Chip active={!filters.track} onClick={() => onChange("track", "")}>
          All
        </Chip>
        {tracks.map((t) => (
          <Chip key={t.id} active={filters.track === t.id} onClick={() => onChange("track", t.id)}>
            <span className="size-2 rounded-full" style={{ background: t.color }} />
            {t.title}
          </Chip>
        ))}
        {upcoming.map((t) => (
          <span
            key={t.id}
            title="Case files coming soon"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted opacity-70"
          >
            <span className="size-2 rounded-full opacity-60" style={{ background: t.color }} />
            {t.title}
            <span className="text-xs">· soon</span>
          </span>
        ))}
      </Row>
      <Row label="Difficulty">
        <Chip active={!filters.difficulty} onClick={() => onChange("difficulty", "")}>
          All
        </Chip>
        {DIFFICULTIES.map((d) => (
          <Chip key={d.id} active={filters.difficulty === d.id} onClick={() => onChange("difficulty", d.id)}>
            <span className={`size-2 rounded-full ${d.dot}`} />
            {d.label}
          </Chip>
        ))}
      </Row>
      <Row label="Status">
        {[
          ["", "All"],
          ["unsolved", "Unsolved"],
          ["solved", "Solved"],
        ].map(([v, label]) => (
          <Chip key={v} active={filters.status === v} onClick={() => onChange("status", v)}>
            {label}
          </Chip>
        ))}
      </Row>
      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
        <label className="sr-only" htmlFor="topic">
          Module
        </label>
        <select
          id="topic"
          value={filters.topic}
          onChange={(e) => onChange("topic", e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand sm:w-80"
        >
          <option value="">Any module</option>
          {topics.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="q">
          Search
        </label>
        <input
          id="q"
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange("q", e.target.value);
          }}
          placeholder="Search titles and concepts, e.g. HAVING"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {active && (
          <button
            onClick={() => {
              setText("");
              onClear();
            }}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-subtle hover:text-text"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? "border-brand bg-brand/10 font-medium text-brand" : "border-border text-muted hover:bg-subtle hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
