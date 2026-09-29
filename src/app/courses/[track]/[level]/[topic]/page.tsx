import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/lesson/lesson-player";
import { NoRunnerYet } from "@/components/no-runner-yet";
import { allTopicParams, topicContext } from "@/lib/content/load";
import { topicLabel } from "@/lib/content/schema";

export const dynamicParams = false;
export const generateStaticParams = allTopicParams;

export async function generateMetadata({ params }: PageProps<"/courses/[track]/[level]/[topic]">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  return { title: ctx ? `${topicLabel(ctx.topic.topic)}: ${ctx.topic.topic.title}` : "Lesson" };
}

export default async function LessonPage({ params }: PageProps<"/courses/[track]/[level]/[topic]">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  if (!ctx) notFound();
  if (ctx.bundle.track.engine !== "postgres") return <NoRunnerYet language={ctx.bundle.track.engine} backHref={ctx.levelHref} />;
  return (
    <LessonPlayer
      topicKey={ctx.topic.key}
      title={ctx.topic.topic.title}
      label={topicLabel(ctx.topic.topic)}
      steps={ctx.topic.lesson.steps}
      engine={ctx.lessonEngine}
      href={ctx.href}
      quizHref={ctx.quizHref}
    />
  );
}
