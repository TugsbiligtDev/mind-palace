import Link from "next/link";
import { notFound } from "next/navigation";
import { TopicList } from "@/components/course/topic-list";
import { Markdown } from "@/components/markdown";
import { listTrackIds, loadTrack, summarize } from "@/lib/content/load";

export const dynamicParams = false;
export const generateStaticParams = () => listTrackIds().map((track) => ({ track }));

export async function generateMetadata({ params }: PageProps<"/courses/[track]">) {
  const { track } = await params;
  return { title: loadTrack(track).track.title };
}

export default async function TrackPage({ params }: PageProps<"/courses/[track]">) {
  const { track: trackId } = await params;
  if (!listTrackIds().includes(trackId)) notFound();
  const bundle = loadTrack(trackId);
  const summaries = summarize(bundle);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/courses" className="text-sm text-muted hover:text-text">
        ← Courses
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{bundle.track.title}</h1>
          <p className="mt-2 text-muted">{bundle.track.tagline}</p>
        </div>
        {bundle.setup && (
          <Link href={`/courses/${trackId}/setup`} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-subtle">
            💻 Take it to your Mac (optional)
          </Link>
        )}
      </div>

      <div className="mt-10 space-y-12">
        {bundle.levels.map(({ level }, i) => (
          <section key={level.id}>
            <p className="text-xs font-medium tracking-wide text-brand uppercase">
              {level.title} · Season {level.season}
            </p>
            <h2 className="mt-1 font-serif text-2xl">{level.season_title}</h2>
            <Markdown className="mt-2 text-muted">{level.season_pitch}</Markdown>
            <div className="mt-5">
              {level.status === "open" ? (
                <TopicList level={summaries[i]} />
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-5">
                  <p className="text-sm font-medium">Coming soon</p>
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {level.planned.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
