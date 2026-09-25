import { Profile } from "@/components/profile/profile";
import { loadAllTracks, summarize } from "@/lib/content/load";
import { summarizePractice } from "@/lib/content/practice";

export const metadata = { title: "Your profile" };

export default function ProfilePage() {
  const levels = loadAllTracks()
    .flatMap(summarize)
    .filter((l) => l.status === "open");
  return <Profile levels={levels} cases={summarizePractice()} />;
}
