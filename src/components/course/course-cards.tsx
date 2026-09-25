import Link from "next/link";
import { loadAllTracks, upcomingTracks } from "@/lib/content/load";
import { loadPractice } from "@/lib/content/practice";

// Every course (live ones link in; upcoming ones are dimmed), shared by the landing and Courses pages.
export function CourseCards() {
  const cases = loadPractice();
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {loadAllTracks().map(({ track, levels }) => (
        <Link
          key={track.id}
          href={`/courses/${track.id}`}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-brand/50"
        >
          <span className="inline-block size-9 rounded-xl" style={{ background: track.color }} />
          <h3 className="mt-4 text-lg font-semibold">{track.title}</h3>
          <p className="mt-1 text-sm text-muted">{track.tagline}</p>
          <p className="mt-4 text-sm font-medium">
            {levels.filter((l) => l.level.status === "open").length} of 3 levels open ·{" "}
            {cases.filter((c) => c.track === track.id).length} case files
          </p>
        </Link>
      ))}
      {upcomingTracks().map((c) => (
        <div key={c.id} className="rounded-2xl border border-dashed border-border p-6 opacity-70">
          <span className="inline-block size-9 rounded-xl opacity-60" style={{ background: c.color }} />
          <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
          <p className="mt-1 text-sm text-muted">{c.tagline}</p>
          <p className="mt-4 text-sm text-muted">Coming soon</p>
        </div>
      ))}
    </div>
  );
}
