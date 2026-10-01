import Link from "next/link";
import { loadAllTracks } from "@/lib/content/load";

// Every course, shared by the landing and Courses pages.
export function CourseCards() {
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
            {levels.filter((l) => l.level.status === "open").length} of 3 levels open
          </p>
        </Link>
      ))}
    </div>
  );
}
