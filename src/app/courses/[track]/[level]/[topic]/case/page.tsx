import { notFound } from "next/navigation";
import { CasePlayer } from "@/components/case/case-player";
import { allTopicParams, loadStory, topicContext } from "@/lib/content/load";

export const dynamicParams = false;
export const generateStaticParams = allTopicParams;

export async function generateMetadata({ params }: PageProps<"/courses/[track]/[level]/[topic]/case">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  return { title: ctx ? `Episode ${ctx.topic.case.episode}: ${ctx.topic.case.title}` : "Case" };
}

export default async function CasePage({ params }: PageProps<"/courses/[track]/[level]/[topic]/case">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  if (!ctx) notFound();
  const informant = loadStory().cast.find((c) => c.role.toLowerCase().includes("informant"))?.name ?? "the informant";
  return (
    <CasePlayer
      topicKey={ctx.topic.key}
      topicKeys={ctx.topicKeys}
      topicIndex={ctx.index}
      data={ctx.topic.case}
      engine={ctx.caseEngine}
      informant={informant}
      href={ctx.caseHref}
      quizHref={ctx.quizHref}
      prevCaseHref={ctx.prevCaseHref}
      nextHref={ctx.nextHref}
      nextLabel={ctx.nextLabel}
    />
  );
}
