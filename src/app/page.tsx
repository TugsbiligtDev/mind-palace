import { Hq } from "@/components/hq/hq";
import { loadStory, loadTrack, summarize } from "@/lib/content/load";

export default function Home() {
  const story = loadStory();
  const season = summarize(loadTrack("postgresql")).find((l) => l.status === "open")!;
  return <Hq agency={story.agency} client={story.client} premise={story.premise} season={season} />;
}
