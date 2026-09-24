import Link from "next/link";
import { loadAllTracks } from "@/lib/content/load";

export const metadata = { title: "Courses" };

const COMING_SOON = [
  { title: "Python", tagline: "From your first variable to real programs.", color: "var(--color-python)" },
  { title: "Data Structures & Algorithms", tagline: "Think like a problem solver, in Python.", color: "var(--color-dsa)" },
];

export default function CoursesPage() {
  const tracks = loadAllTracks();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Courses</h1>
      <p className="mt-2 text-muted">Pick a skill. Each one has three levels, and each level is a season of cases.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {tracks.map(({ track, levels }) => {
          const open = levels.filter((l) => l.level.status === "open");
          const topics = open.reduce((n, l) => n + l.topics.length, 0);
          return (
            <Link
              key={track.id}
              href={`/courses/${track.id}`}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-subtle"
            >
              <span className="inline-block size-9 rounded-xl" style={{ background: track.color }} />
              <h2 className="mt-4 text-lg font-semibold">{track.title}</h2>
              <p className="mt-1 text-sm text-muted">{track.tagline}</p>
              <p className="mt-4 text-sm">
                <span className="font-medium">{topics} modules open</span>
                <span className="text-muted"> · {track.engine === "postgres" ? `PostgreSQL ${track.engine_version} in your browser` : ""}</span>
              </p>
            </Link>
          );
        })}
        {COMING_SOON.map((c) => (
          <div key={c.title} className="rounded-2xl border border-dashed border-border p-6 opacity-70">
            <span className="inline-block size-9 rounded-xl opacity-60" style={{ background: c.color }} />
            <h2 className="mt-4 text-lg font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-muted">{c.tagline}</p>
            <p className="mt-4 text-sm text-muted">Coming soon</p>
          </div>
        ))}
      </div>
    </div>
  );
}
