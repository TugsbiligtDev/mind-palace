import type { Difficulty } from "@/lib/content/schema";

const LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const TONE: Record<Difficulty, string> = {
  easy: "bg-success/10 text-success",
  medium: "bg-xp/10 text-xp",
  hard: "bg-clue/10 text-clue",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[difficulty]}`}>{LABEL[difficulty]}</span>;
}
