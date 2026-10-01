import { Profile } from "@/components/profile/profile";
import { loadAllTracks, summarize } from "@/lib/content/load";

export const metadata = { title: "Your profile" };

export default function ProfilePage() {
  const levels = loadAllTracks()
    .flatMap(summarize)
    .filter((l) => l.status === "open");
  return <Profile levels={levels} />;
}
