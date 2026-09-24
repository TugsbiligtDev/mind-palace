// Reads and validates course files from /content. Server-only (uses the filesystem).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  caseSchema,
  lessonSchema,
  levelSchema,
  quizSchema,
  storySchema,
  topicSchema,
  trackSchema,
  type Case,
  type Lesson,
  type Level,
  type Quiz,
  type Topic,
  type Track,
} from "./schema";

export const CONTENT_DIR = path.join(process.cwd(), "content");

function readYaml<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  const parsed = schema.safeParse(YAML.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid content file ${path.relative(process.cwd(), file)}:\n${issues}`);
  }
  return parsed.data;
}

export type TopicBundle = {
  id: string;
  key: string; // "track/level/topic", used for progress
  topic: Topic;
  lesson: Lesson;
  quiz: Quiz;
  case: Case;
};

export type LevelBundle = { level: Level; topics: TopicBundle[] };

export type TrackBundle = { track: Track; dataset: string; setup?: string; levels: LevelBundle[] };

export function loadStory() {
  return readYaml(path.join(CONTENT_DIR, "story", "bible.yaml"), storySchema);
}

export function listTrackIds(): string[] {
  return fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT_DIR, d.name, "track.yaml")))
    .map((d) => d.name);
}

export function loadTrack(id: string): TrackBundle {
  const dir = path.join(CONTENT_DIR, id);
  const track = readYaml(path.join(dir, "track.yaml"), trackSchema);
  const dataset = track.dataset ? fs.readFileSync(path.join(dir, track.dataset), "utf8") : "";
  const setupFile = path.join(dir, "setup.md");
  const setup = fs.existsSync(setupFile) ? fs.readFileSync(setupFile, "utf8") : undefined;

  const levels = track.levels.map((levelId) => {
    const levelDir = path.join(dir, levelId);
    const level = readYaml(path.join(levelDir, "level.yaml"), levelSchema);
    const topics = level.topics.map((topicId) => {
      const t = path.join(levelDir, topicId);
      return {
        id: topicId,
        key: `${id}/${levelId}/${topicId}`,
        topic: readYaml(path.join(t, "topic.yaml"), topicSchema),
        lesson: readYaml(path.join(t, "lesson.yaml"), lessonSchema),
        quiz: readYaml(path.join(t, "quiz.yaml"), quizSchema),
        case: readYaml(path.join(t, "case.yaml"), caseSchema),
      };
    });
    return { level, topics };
  });

  return { track, dataset, setup, levels };
}

export function loadAllTracks(): TrackBundle[] {
  return listTrackIds().map(loadTrack);
}

export function findTopic(trackId: string, levelId: string, topicId: string) {
  const bundle = loadTrack(trackId);
  const levelIndex = bundle.levels.findIndex((l) => l.level.id === levelId);
  const level = bundle.levels[levelIndex];
  const index = level?.topics.findIndex((t) => t.id === topicId) ?? -1;
  if (!level || index === -1) return undefined;
  return { bundle, level, index, topic: level.topics[index] };
}

// A compact, serializable summary of a level for client components (unlock logic, HQ).
export type LevelSummary = {
  trackId: string;
  trackTitle: string;
  color: string;
  levelId: string;
  levelTitle: string;
  season: number;
  seasonTitle: string;
  status: Level["status"];
  topics: { id: string; key: string; title: string; module: number; caseTitle: string; episode: number; quizPass: number }[];
};

export function summarize(bundle: TrackBundle): LevelSummary[] {
  return bundle.levels.map(({ level, topics }) => ({
    trackId: bundle.track.id,
    trackTitle: bundle.track.title,
    color: bundle.track.color,
    levelId: level.id,
    levelTitle: level.title,
    season: level.season,
    seasonTitle: level.season_title,
    status: level.status,
    topics: topics.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.topic.title,
      module: t.topic.module,
      caseTitle: t.case.title,
      episode: t.case.episode,
      quizPass: t.quiz.pass,
    })),
  }));
}

export function topicHref(trackId: string, levelId: string, topicId: string) {
  return `/courses/${trackId}/${levelId}/${topicId}`;
}

// Everything a lesson / quiz / case page needs, resolved from its URL params.
export function topicContext(trackId: string, levelId: string, topicId: string) {
  const found = findTopic(trackId, levelId, topicId);
  if (!found) return undefined;
  const { bundle, level, index, topic } = found;
  const base = topicHref(trackId, levelId, topicId);
  const prev = level.topics[index - 1];
  const next = level.topics[index + 1];
  return {
    bundle,
    level,
    index,
    topic,
    topicKeys: level.topics.map((t) => t.key),
    href: base,
    quizHref: `${base}/quiz`,
    caseHref: `${base}/case`,
    prevCaseHref: prev ? `${topicHref(trackId, levelId, prev.id)}/case` : undefined,
    nextHref: next ? topicHref(trackId, levelId, next.id) : `/courses/${trackId}`,
    nextLabel: next ? `Next: Module ${next.topic.module}, ${next.topic.title} →` : "Season complete, back to the course →",
    lessonEngine: { key: trackId, setup: bundle.dataset },
    caseEngine: { key: `${topic.key}#case`, setup: `${bundle.dataset}\n${topic.case.evidence_setup}` },
  };
}

export function allTopicParams() {
  return loadAllTracks().flatMap((b) =>
    b.levels.flatMap((l) => l.topics.map((t) => ({ track: b.track.id, level: l.level.id, topic: t.id }))),
  );
}
