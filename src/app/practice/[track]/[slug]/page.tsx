import { notFound } from "next/navigation";
import { CasePlayer } from "@/components/case/case-player";
import { loadStory, topicHref } from "@/lib/content/load";
import { caseHref, findPractice, loadPractice, summarizePractice } from "@/lib/content/practice";

export const dynamicParams = false;
export const generateStaticParams = () => loadPractice().map((c) => ({ track: c.track, slug: c.slug }));

export async function generateMetadata({ params }: PageProps<"/practice/[track]/[slug]">) {
  const { track, slug } = await params;
  return { title: findPractice(track, slug)?.case.title ?? "Case" };
}

export default async function PracticeCasePage({ params }: PageProps<"/practice/[track]/[slug]">) {
  const { track, slug } = await params;
  const found = findPractice(track, slug);
  if (!found) notFound();
  const id = found.case.id;
  const sameTrack = summarizePractice().filter((c) => c.track === track);
  const me = sameTrack.find((c) => c.id === id)!;
  const next = sameTrack[sameTrack.indexOf(me) + 1];
  const informant = loadStory().cast.find((c) => c.role.toLowerCase().includes("informant"))?.name ?? "the informant";
  const [topicTrack, topicLevel, topic] = me.topic?.split("/") ?? [];

  return (
    <CasePlayer
      key={id}
      id={id}
      data={found.case}
      language={found.bundle.track.engine}
      engine={found.engine}
      informant={informant}
      href={caseHref(id)}
      trackTitle={me.trackTitle}
      topicHref={me.topic ? topicHref(topicTrack, topicLevel, topic) : undefined}
      topicTitle={me.topicTitle}
      nextHref={next ? caseHref(next.id) : "/practice"}
      nextLabel={next ? `Next case: ${next.title} →` : "Back to the Practice hub →"}
    />
  );
}
