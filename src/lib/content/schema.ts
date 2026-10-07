// The shape of every course file in /content. A file that doesn't match fails the
// build (and `pnpm check:content`) instead of breaking the live site.
import { z } from "zod";

const md = z.string().min(1);

export const trackSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  // "none" is a knowledge-based course (e.g. Ethical Hacking): lessons are reading and safe
  // "on your Mac" steps, quizzes are multiple-choice. No code runs in the browser, so these
  // courses never use `try`/`code` lesson steps or `predict` quiz questions.
  // "web" is HTML & CSS: lessons use `web` steps (an editor plus a live preview of the page).
  // "shell" is the Linux & Git course: lessons use `shell` steps (a practice terminal).
  engine: z.enum(["postgres", "python", "javascript", "none", "web", "shell"]),
  engine_version: z.string(),
  // Shown at the top of the course page: what a learner needs before starting, and how the
  // course's practice works.
  before_you_start: md.optional(),
  last_reviewed: z.string(),
  // Named practice databases. Each is a list of SQL files in public/downloads/<track>/, run in
  // order, so learners can download the exact files the lessons use. `database` is the name
  // the in-browser psql pretends to be connected to (the files create it on a real server).
  datasets: z.record(z.string(), z.object({ database: z.string(), files: z.array(z.string()).min(1) })).default({}),
  // The dataset used when a level or topic doesn't name one.
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
  // The JavaScript version of "try". `tests` are expressions such as "twoSum([2, 7], 9)" that
  // are run against both the learner's code and `solution`; the results must match.
  // Without tests and solution the step is a plain "run it and read the output" step.
  z.object({
    kind: z.literal("code"),
    title: z.string(),
    body: md,
    code: z.string(),
    tests: z.array(z.string()).default([]),
    solution: z.string().optional(),
    // True when the order of items in arrays and sets doesn't matter for the answer.
    unordered: z.boolean().default(false),
    hint: md.optional(),
    // Known wrong answers. The content check proves each one is rejected by the grader.
    reject: z.array(z.string()).default([]),
    // A "find the bug" exercise: the starter code is deliberately wrong.
    broken_starter: z.boolean().default(false),
    // Python only: the typed answers handed to input() when the code runs.
    stdin: z.array(z.string()).default([]),
  }),
  // The HTML & CSS version of "try": two editor tabs (index.html and, when `css` is set,
  // style.css) and a live preview. `tests` are check expressions such as "css('h1', 'color')"
  // run on the learner's page and on `solution` (see src/lib/web/core.ts); the results must
  // match at every width in `widths`. Without tests and solution the step is "edit and look".
  z.object({
    kind: z.literal("web"),
    title: z.string(),
    body: md,
    html: z.string(),
    css: z.string().optional(),
    tests: z.array(z.string()).default([]),
    solution: z.object({ html: z.string().optional(), css: z.string().optional() }).optional(),
    widths: z.array(z.number().int().min(280).max(1600)).min(1).default([800]),
    hint: md.optional(),
    // Known wrong answers (each file left out is the starter's). The content check proves each is rejected.
    reject: z.array(z.object({ html: z.string().optional(), css: z.string().optional() })).default([]),
    broken_starter: z.boolean().default(false),
  }),
  // The Linux & Git version of "try": a practice terminal (a simulated Linux computer, see
  // src/lib/shell). `setup` is a bash script run as root before the learner starts (its last
  // `cd` is where the terminal opens); `fixture` names one or more shared set-ups in
  // content/<course>/fixtures/ that run first, in order. A graded step has `solution` (commands, one per line) and `tests` (commands
  // whose output must match between the learner's computer and one where the solution was typed)
  // and/or `output: true` (the learner's last command must print what the solution's last one did).
  // Without them the step is "try things out".
  z.object({
    kind: z.literal("shell"),
    title: z.string(),
    body: md,
    fixture: z.union([z.string(), z.array(z.string())]).optional(),
    setup: z.string().default(""),
    tests: z.array(z.string()).default([]),
    output: z.boolean().default(false),
    solution: z.string().optional(),
    // A command the learner must use (e.g. a pipe), with the reason shown when they didn't.
    uses: z.array(z.object({ match: z.string(), why: z.string() })).default([]),
    hint: md.optional(),
    // Known wrong answers (command lines). The content check proves each one is rejected.
    reject: z.array(z.string()).default([]),
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
  // A question inside the lesson, for any course (nothing runs): the learner picks an option and
  // sees the explanation once they choose the right one. `code` is something to read, such as
  // a scan result.
  z.object({
    kind: z.literal("choice"),
    title: z.string(),
    body: md,
    code: z.string().optional(),
    options: z.array(z.string()).min(2).max(5),
    answer: z.number().int(),
    explanation: md,
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
    // Python only: typed answers handed to input().
    stdin: z.array(z.string()).default([]),
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
    stdin: z.array(z.string()).default([]),
    explanation: md,
  }),
]);

export const quizSchema = z.object({
  pass: z.number().int(),
  questions: z.array(question).min(3).max(5),
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
