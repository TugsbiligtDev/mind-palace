// The shape of every course file in /content. A file that doesn't match fails the
// build (and `pnpm check:content`) instead of breaking the live site.
import { z } from "zod";

const md = z.string().min(1);

export const trackSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  engine: z.enum(["postgres", "python", "javascript"]),
  engine_version: z.string(),
  last_reviewed: z.string(),
  // Named practice databases. Each is a list of SQL files in public/downloads/<track>/, run in
  // order, so learners can download the exact files the lessons use. `database` is the name
  // the in-browser psql pretends to be connected to (the files create it on a real server).
  datasets: z.record(z.string(), z.object({ database: z.string(), files: z.array(z.string()).min(1) })).default({}),
  // The dataset used when a level, topic or case doesn't name one.
  dataset: z.string().optional(),
  levels: z.array(z.string()).length(3),
});

export const levelSchema = z.object({
  id: z.string(),
  title: z.string(),
  season: z.number().int(),
  season_title: z.string(),
  season_pitch: md,
  status: z.enum(["open", "coming_soon"]),
  topics: z.array(z.string()),
  planned: z.array(z.string()).default([]),
  dataset: z.string().optional(),
});

export const topicSchema = z.object({
  title: z.string(),
  module: z.number().int(),
  summary: z.string(),
  minutes: z.number().int(),
  dataset: z.string().optional(),
  // "review" and "capstone" lessons sit between modules without taking a module number
  // (`module` is then the module they follow, and isn't shown).
  kind: z.enum(["module", "review", "capstone"]).default("module"),
});

// "Module 14", "Case review" or "Capstone", wherever a lesson is named.
export function topicLabel(t: { module: number; kind: Topic["kind"] }) {
  return t.kind === "review" ? "Case review" : t.kind === "capstone" ? "Capstone" : `Module ${t.module}`;
}

const step = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("explain"), title: z.string(), body: md }),
  z.object({
    kind: z.literal("try"),
    title: z.string(),
    body: md,
    sql: z.string(),
    // When set, the step only counts as done once the learner's result matches this query's result.
    expect: z.string().optional(),
    ordered: z.boolean().default(false),
    // Grade the database afterwards instead of the result: after both the learner's SQL and
    // `expect` run, this query's rows must match (for UPDATE/DELETE/DDL tasks).
    state_query: z.string().optional(),
    // Shown on request after the first wrong attempt, before the full answer is offered.
    hint: md.optional(),
    // Known wrong answers. The content check proves each one is rejected by the grader.
    reject: z.array(z.string()).default([]),
    expect_error: z.boolean().default(false),
    // A "fix this" exercise: the starter SQL is deliberately broken.
    broken_starter: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("info"), title: z.string(), body: md }),
  z.object({
    kind: z.literal("mac"),
    title: z.string(),
    body: md,
    commands: z.string(),
    // A Mac checkpoint: the learner pastes what Terminal printed, and it must contain each of these.
    expect_output: z.array(z.string()).optional(),
  }),
  z.object({ kind: z.literal("why"), body: md }),
  z.object({ kind: z.literal("recap"), body: md }),
]);

export const lessonSchema = z.object({ steps: z.array(step).min(3) });

const question = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mcq"),
    prompt: md,
    code: z.string().optional(),
    options: z.array(z.string()).min(2).max(5),
    answer: z.number().int(),
    explanation: md,
  }),
  z.object({
    type: z.literal("predict"),
    prompt: md,
    code: z.string(),
    options: z.array(z.string()).min(2).max(5),
    answer: z.number().int(),
    explanation: md,
  }),
  z.object({
    type: z.literal("fill"),
    prompt: md,
    code: z.string().includes("____"),
    answer: z.string(),
    accept: z.array(z.string()).default([]),
    // Checked by running `code` with the blank filled in.
    runnable: z.boolean().default(true),
    explanation: md,
  }),
]);

export const quizSchema = z.object({
  pass: z.number().int(),
  questions: z.array(question).min(3).max(5),
});

// A practice problem ("case file") in the Practice hub. Content lives in
// content/practice/<track>/<id>.yaml, independent of the courses.
export const caseSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  // The course topic whose skills this case practises, e.g. "postgresql/beginner/03-where".
  topic: z.string().optional(),
  concepts: z.array(z.string()).min(1),
  // Story cases belong to a season and are numbered; standalone cases leave this out.
  series: z.object({ name: z.string(), episode: z.number().int() }).optional(),
  // Which of the course's datasets the case runs on (defaults to the course's default).
  dataset: z.string().optional(),
  title: z.string(),
  briefing: md,
  evidence_setup: z.string().default(""),
  clues: z.array(md).default([]),
  task: md,
  starter: z.string(),
  check: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("result"), solution: z.string(), ordered: z.boolean().default(false) }),
    z.object({ mode: z.literal("state"), solution: z.string(), state_query: z.string() }),
  ]),
  hints: z.array(md).length(3),
  reveal: md,
});

export const storySchema = z.object({
  agency: z.string(),
  client: z.string(),
  premise: md,
  cast: z.array(z.object({ name: z.string(), role: z.string(), voice: z.string() })),
});

export type Track = z.infer<typeof trackSchema>;
export type Level = z.infer<typeof levelSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Step = Lesson["steps"][number];
export type Quiz = z.infer<typeof quizSchema>;
export type Question = Quiz["questions"][number];
export type Case = z.infer<typeof caseSchema>;
export type Difficulty = Case["difficulty"];
export type Story = z.infer<typeof storySchema>;
