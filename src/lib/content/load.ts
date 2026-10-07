// Reads and validates course files from /content. Server-only (uses the filesystem).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  lessonSchema,
  levelSchema,
  quizSchema,
  storySchema,
  topicLabel,
  topicSchema,
  trackSchema,
  type Lesson,
  type Level,
  type Quiz,
  type Topic,
  type Track,
} from "./schema";

const CONTENT_DIR = path.join(process.cwd(), "content");

function readYaml<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  const parsed = schema.safeParse(YAML.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid content file ${path.relative(process.cwd(), file)}:\n${issues}`);
  }
  return parsed.data;
}

// What the in-browser SQL engine needs: `key` names the loaded database (one per dataset),
// `setup` is the SQL that builds it.
export type Engine = { key: string; setup: string };

type TopicBundle = {
  id: string;
  key: string; // "track/level/topic", used for progress
  topic: Topic;
  lesson: Lesson;
  quiz: Quiz;
  engine: Engine;
};

type LevelBundle = { level: Level; topics: TopicBundle[] };

type TrackBundle = {
  track: Track;
  /** Engine for a named dataset; no name means the course's default. */
  engine: (dataset?: string) => Engine;
  setup?: string;
  levels: LevelBundle[];
};

const DOWNLOADS_DIR = path.join(process.cwd(), "public", "downloads");

// The dataset files are written for real psql (`psql -f file.sql`). The browser engine is
// a single database, so drop the lines only psql understands: creating and switching
// databases, backslash commands (\c, \echo, \set, \if … \endif blocks) and `\gset`.
function browserSql(text: string): string {
  const out: string[] = [];
  let depth = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^\\if\b/.test(t)) depth++;
    else if (/^\\endif\b/.test(t)) depth--;
    else if (depth === 0 && !t.startsWith("\\") && !/^(DROP|CREATE) DATABASE\b/i.test(t))
      out.push(line.replace(/\s*\\gset\s*$/, ";"));
  }
  return out.join("\n");
}

function datasetEngines(track: Track) {
  const cache = new Map<string, Engine>();
  return (name = track.dataset): Engine => {
    if (!name) return { key: track.id, setup: "" };
    const ds = track.datasets[name];
    if (!ds) throw new Error(`${track.id}: there's no dataset called "${name}" in track.yaml`);
    let engine = cache.get(name);
    if (!engine) {
      const sql = ds.files.map((f) => browserSql(fs.readFileSync(path.join(DOWNLOADS_DIR, track.id, f), "utf8")));
      // Remember which database this pretends to be, for psql's \l, \c and prompt messages.
      sql.push(`DO $mp$ BEGIN EXECUTE format('ALTER DATABASE %I SET mindpalace.database = %L', current_database(), '${ds.database}'); END $mp$;`);
      engine = { key: `${track.id}/${name}`, setup: sql.join("\n") };
      cache.set(name, engine);
    }
    return engine;
  };
}

export function loadStory() {
  return readYaml(path.join(CONTENT_DIR, "story", "bible.yaml"), storySchema);
}

export function listTrackIds(): string[] {
  return fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT_DIR, d.name, "track.yaml")))
    .map((d) => d.name);
}

// A production build renders hundreds of pages from the same files, so read each course once.
// In development, read every time so content edits show up on reload.
const trackCache = new Map<string, TrackBundle>();

export function loadTrack(id: string): TrackBundle {
  if (process.env.NODE_ENV !== "production") return readTrack(id);
  let bundle = trackCache.get(id);
  if (!bundle) trackCache.set(id, (bundle = readTrack(id)));
  return bundle;
}

function readTrack(id: string): TrackBundle {
  const dir = path.join(CONTENT_DIR, id);
  const track = readYaml(path.join(dir, "track.yaml"), trackSchema);
  const engine = datasetEngines(track);
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
        lesson: withFixtures(readYaml(path.join(t, "lesson.yaml"), lessonSchema), dir, `${id}/${levelId}/${topicId}`),
        quiz: readYaml(path.join(t, "quiz.yaml"), quizSchema),
      };
    });
    return { level, topics: topics.map((t) => ({ ...t, engine: engine(t.topic.dataset ?? level.dataset) })) };
  });

  return { track, engine, setup, levels };
}

// A practice-terminal step may start from shared set-up scripts (content/<course>/fixtures/
// <name>.sh), such as Inkwell's back-office files. They run before the step's own set-up.
function withFixtures(lesson: Lesson, trackDir: string, where: string): Lesson {
  return {
    steps: lesson.steps.map((step) => {
      if (step.kind !== "shell" || !step.fixture) return step;
      const parts = (Array.isArray(step.fixture) ? step.fixture : [step.fixture]).map((name) => {
        const file = path.join(trackDir, "fixtures", `${name}.sh`);
        if (!fs.existsSync(file)) throw new Error(`${where}: there's no fixture called "${name}" (${path.relative(process.cwd(), file)})`);
        return fs.readFileSync(file, "utf8");
      });
      if (step.setup.trim()) parts.push(step.setup);
      return { ...step, fixture: undefined, setup: parts.join("\n") };
    }),
  };
}

export function loadAllTracks(): TrackBundle[] {
  return listTrackIds().map(loadTrack);
}

function findTopic(trackId: string, levelId: string, topicId: string) {
  const bundle = loadTrack(trackId);
  const levelIndex = bundle.levels.findIndex((l) => l.level.id === levelId);
  const level = bundle.levels[levelIndex];
  const index = level?.topics.findIndex((t) => t.id === topicId) ?? -1;
  if (!level || index === -1) return undefined;
  return { bundle, level, index, topic: level.topics[index] };
}

// A compact, serializable summary of a level for client components.
export type LevelSummary = {
  trackId: string;
  trackTitle: string;
  color: string;
  levelId: string;
  levelTitle: string;
  seasonTitle: string;
  status: Level["status"];
  topics: { id: string; key: string; title: string; summary: string; module: number; kind: Topic["kind"]; minutes: number; steps: number }[];
};

export function summarize(bundle: TrackBundle): LevelSummary[] {
  return bundle.levels.map(({ level, topics }) => ({
    trackId: bundle.track.id,
    trackTitle: bundle.track.title,
    color: bundle.track.color,
    levelId: level.id,
    levelTitle: level.title,
    seasonTitle: level.season_title,
    status: level.status,
    topics: topics.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.topic.title,
      summary: t.topic.summary,
      module: t.topic.module,
      kind: t.topic.kind,
      minutes: t.topic.minutes,
      steps: t.lesson.steps.length,
    })),
  }));
}

function topicHref(trackId: string, levelId: string, topicId: string) {
  return `/courses/${trackId}/${levelId}/${topicId}`;
}

// Everything a lesson or quiz page needs, resolved from its URL params.
export function topicContext(trackId: string, levelId: string, topicId: string) {
  const found = findTopic(trackId, levelId, topicId);
  if (!found) return undefined;
  const { bundle, level, index, topic } = found;
  const base = topicHref(trackId, levelId, topicId);
  const next = level.topics[index + 1];
  return {
    bundle,
    level,
    index,
    topic,
    href: base,
    levelHref: `/courses/${trackId}/${levelId}`,
    quizHref: `${base}/quiz`,
    nextHref: next ? topicHref(trackId, levelId, next.id) : `/courses/${trackId}/${levelId}`,
    nextLabel: next ? `Next: ${topicLabel(next.topic)}, ${next.topic.title} →` : "Level complete, back to the level →",
  };
}

export function allTopicParams() {
  return loadAllTracks().flatMap((b) =>
    b.levels.flatMap((l) => l.topics.map((t) => ({ track: b.track.id, level: l.level.id, topic: t.id }))),
  );
}

export function allLevelParams() {
  return loadAllTracks().flatMap((b) => b.levels.map((l) => ({ track: b.track.id, level: l.level.id })));
}
