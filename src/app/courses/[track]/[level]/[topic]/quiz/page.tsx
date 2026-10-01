import { notFound } from "next/navigation";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import { allTopicParams, topicContext } from "@/lib/content/load";
import { topicLabel } from "@/lib/content/schema";

export const dynamicParams = false;
export const generateStaticParams = allTopicParams;

export async function generateMetadata({ params }: PageProps<"/courses/[track]/[level]/[topic]/quiz">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  return { title: ctx ? `Quiz: ${ctx.topic.topic.title}` : "Quiz" };
}

export default async function QuizPage({ params }: PageProps<"/courses/[track]/[level]/[topic]/quiz">) {
  const { track, level, topic } = await params;
  const ctx = topicContext(track, level, topic);
  if (!ctx) notFound();
  return (
    <QuizPlayer
      topicKey={ctx.topic.key}
      title={ctx.topic.topic.title}
      label={topicLabel(ctx.topic.topic)}
      questions={ctx.topic.quiz.questions}
      pass={ctx.topic.quiz.pass}
      href={ctx.quizHref}
      lessonHref={ctx.href}
      nextHref={ctx.nextHref}
      nextLabel={ctx.nextLabel}
    />
  );
}
