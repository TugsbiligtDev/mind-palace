import Link from "next/link";
import { notFound } from "next/navigation";
import { TopicList } from "@/components/course/topic-list";
import { Markdown } from "@/components/markdown";
import { allLevelParams, loadTrack, summarize } from "@/lib/content/load";

export const dynamicParams = false;
export const generateStaticParams = allLevelParams;

export async function generateMetadata({ params }: PageProps<"/courses/[track]/[level]">) {
  const { track, level } = await params;
  const b = loadTrack(track);
  const l = b.levels.find((x) => x.level.id === level);
  return { title: l ? `${b.track.title} ${l.level.title}` : "Level" };
}

export default async function LevelPage({ params }: PageProps<"/courses/[track]/[level]">) {
  const { track: trackId, level: levelId } = await params;
  const bundle = loadTrack(trackId);
  const index = bundle.levels.findIndex((l) => l.level.id === levelId);
  if (index === -1) notFound();
  const { level } = bundle.levels[index];
  const summary = summarize(bundle)[index];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link href={`/courses/${trackId}`} className="text-sm text-muted hover:text-text">
        ← {bundle.track.title}
      </Link>
      <p className="mt-6 text-xs font-medium tracking-wide text-brand uppercase">
        {bundle.track.title} · {level.title}
      </p>
      <h1 className="mt-1 font-serif text-3xl">{level.status === "open" ? level.season_title : `${level.title} level`}</h1>
      <Markdown className="mt-3 text-muted">{level.season_pitch}</Markdown>

      <div className="mt-8">
        {level.status === "open" ? (
          <TopicList level={summary} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6">
            <p className="font-medium">Coming soon</p>
            <p className="mt-1 text-sm text-muted">These modules are planned for this level:</p>
            <ul className="mt-4 space-y-2 text-sm">
              {level.planned.map((m) => (
                <li key={m} className="rounded-lg bg-subtle px-3 py-2">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
