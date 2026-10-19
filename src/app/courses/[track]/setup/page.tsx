import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { listTrackIds, loadTrack } from "@/lib/content/load";

export const dynamicParams = false;
export const generateStaticParams = () =>
  listTrackIds()
    .filter((t) => loadTrack(t).setup)
    .map((track) => ({ track }));

export const metadata = { title: "Take it to your Mac" };

export default async function SetupPage({ params }: PageProps<"/courses/[track]/setup">) {
  const { track } = await params;
  const bundle = loadTrack(track);
  if (!bundle.setup) notFound();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href={`/courses/${track}`} className="text-sm text-muted hover:text-text">
        ← {bundle.track.title}
      </Link>
      <article className="mt-6 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <Markdown>{bundle.setup}</Markdown>
      </article>
    </div>
  );
}
