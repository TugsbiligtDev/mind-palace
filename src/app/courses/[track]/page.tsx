import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelCards } from "@/components/course/level-cards";
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
  const levels = summarize(bundle).map((s, i) => ({
    ...s,
    pitch: bundle.levels[i].level.season_pitch,
    planned: bundle.levels[i].level.planned,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/courses" className="text-sm text-muted hover:text-text">
        ← Courses
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="size-11 shrink-0 rounded-xl" style={{ background: bundle.track.color }} />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{bundle.track.title}</h1>
            <p className="mt-1 text-muted">{bundle.track.tagline}</p>
          </div>
        </div>
        {bundle.setup && (
          <Link href={`/courses/${trackId}/setup`} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-subtle">
            💻 Take it to your computer (optional)
          </Link>
        )}
      </div>
      {bundle.track.before_you_start && (
        <section className="mt-8 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <h2 className="text-sm font-medium tracking-wide text-brand uppercase">Before you start</h2>
          <Markdown className="mt-2 text-sm">{bundle.track.before_you_start}</Markdown>
        </section>
      )}
      <p className="mt-8 text-sm text-muted">Choose a level. Each one is a set of short lessons, each followed by a quick quiz.</p>
      <LevelCards levels={levels} />
    </div>
  );
}
