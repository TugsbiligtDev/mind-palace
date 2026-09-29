// Practice-hub case files: content/practice/<course>/<file>.yaml. A case's id is "<course>/<file>".
import fs from "node:fs";
import path from "node:path";
import { CONTENT_DIR, loadAllTracks, loadTrack, readYaml } from "./load";
import { caseSchema, type Case, type Difficulty } from "./schema";

const PRACTICE_DIR = path.join(CONTENT_DIR, "practice");
const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

export type PracticeCase = Case & { id: string; track: string; slug: string };

let cache: PracticeCase[] | undefined;

/** Every case, story episodes first, then by difficulty and title. */
export function loadPractice(): PracticeCase[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  if (!fs.existsSync(PRACTICE_DIR)) return [];
  const all = fs
    .readdirSync(PRACTICE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      fs
        .readdirSync(path.join(PRACTICE_DIR, d.name))
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => {
          const slug = f.replace(/\.yaml$/, "");
          const data = readYaml(path.join(PRACTICE_DIR, d.name, f), caseSchema);
          return { ...data, id: `${d.name}/${slug}`, track: d.name, slug };
        }),
    );
  cache = all.sort(
    (a, b) =>
      Number(!a.series) - Number(!b.series) ||
      (a.series?.episode ?? 0) - (b.series?.episode ?? 0) ||
      DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
      a.title.localeCompare(b.title),
  );
  return cache;
}

export const caseHref = (id: string) => `/practice/${id}`;

export function findPractice(track: string, slug: string) {
  const c = loadPractice().find((p) => p.track === track && p.slug === slug);
  if (!c) return undefined;
  const bundle = loadTrack(c.track);
  const setup = [bundle.engine(c.dataset).setup, c.evidence_setup].filter(Boolean).join("\n");
  return { case: c, bundle, engine: { key: `practice/${c.id}`, setup } };
}

/** Link to the hub filtered to one course topic, if any case practises it. */
export function practiceHrefFor(topicKey: string) {
  return loadPractice().some((c) => c.topic === topicKey) ? `/practice?topic=${encodeURIComponent(topicKey)}` : undefined;
}

// What the hub's list needs, without the heavy SQL setup text.
export type PracticeSummary = {
  id: string;
  track: string;
  trackTitle: string;
  color: string;
  title: string;
  difficulty: Difficulty;
  concepts: string[];
  topic?: string;
  topicTitle?: string;
  series?: { name: string; episode: number };
};

export function summarizePractice(): PracticeSummary[] {
  const tracks = new Map(loadAllTracks().map((b) => [b.track.id, b]));
  const topicTitles = new Map(
    [...tracks.values()].flatMap((b) =>
      b.levels.flatMap((l) => l.topics.map((t) => [t.key, `Module ${t.topic.module}: ${t.topic.title}`] as const)),
    ),
  );
  return loadPractice().map((c) => ({
    id: c.id,
    track: c.track,
    trackTitle: tracks.get(c.track)?.track.title ?? c.track,
    color: tracks.get(c.track)?.track.color ?? "#888888",
    title: c.title,
    difficulty: c.difficulty,
    concepts: c.concepts,
    topic: c.topic,
    topicTitle: c.topic ? topicTitles.get(c.topic) : undefined,
    series: c.series,
  }));
}
