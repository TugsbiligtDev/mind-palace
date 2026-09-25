import { Suspense } from "react";
import { PracticeHub } from "@/components/practice/practice-hub";
import { loadAllTracks, upcomingTracks } from "@/lib/content/load";
import { summarizePractice } from "@/lib/content/practice";

export const metadata = { title: "Practice hub" };

export default function PracticePage() {
  const cases = summarizePractice();
  const topics = loadAllTracks().flatMap((b) =>
    b.levels.flatMap((l) =>
      l.topics
        .filter((t) => cases.some((c) => c.topic === t.key))
        .map((t) => ({ key: t.key, label: `${b.track.title} · Module ${t.topic.module}: ${t.topic.title}` })),
    ),
  );
  return (
    <Suspense fallback={<div className="h-96" />}>
      <PracticeHub cases={cases} topics={topics} upcoming={upcomingTracks()} />
    </Suspense>
  );
}
