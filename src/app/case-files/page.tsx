import { CaseFiles } from "@/components/case/case-files";
import { loadAllTracks, summarize } from "@/lib/content/load";

export const metadata = { title: "Case files" };

export default function CaseFilesPage() {
  const seasons = loadAllTracks()
    .flatMap(summarize)
    .filter((l) => l.status === "open");
  return <CaseFiles seasons={seasons} />;
}
