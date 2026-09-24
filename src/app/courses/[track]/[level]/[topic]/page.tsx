import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/lesson/lesson-player";
import { allTopicParams, topicContext } from "@/lib/content/load";

export const dynamicParams = false;
export const generateStaticParams = allTopicParams;

export async function generateMetadata({ params }: PageProps<"/courses/[track]/[level]/[topic]">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  return { title: ctx ? `Module ${ctx.topic.topic.module}: ${ctx.topic.topic.title}` : "Lesson" };
}

export default async function LessonPage({ params }: PageProps<"/courses/[track]/[level]/[topic]">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  if (!ctx) notFound();
  return (
    <LessonPlayer
      topicKey={ctx.topic.key}
      title={ctx.topic.topic.title}
      module={ctx.topic.topic.module}
      steps={ctx.topic.lesson.steps}
      engine={ctx.lessonEngine}
      href={ctx.href}
      quizHref={ctx.quizHref}
    />
  );
}
