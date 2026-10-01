// Content checks: every file must match its schema, and every piece of SQL must really
// work on PostgreSQL. Runs before each build, so broken content never goes live.
//   pnpm check:content            everything
//   pnpm check:content 19-ctes    only lessons whose key contains "19-ctes" (skips the Practice hub)
import { PGlite, types } from "@electric-sql/pglite";
import vm from "node:vm";
import { loadPyodide } from "pyodide";
import { gradeJs, logText, runJs, type Exec } from "../src/lib/js/core";
import { gradePy, logText as pyLogText, runPy, type PyodideLike } from "../src/lib/py/core";
import { loadAllTracks, loadStory, loadTrack } from "../src/lib/content/load";
import { loadPractice } from "../src/lib/content/practice";
import { codeStepCheck, pyStepCheck, tryStepCheck } from "../src/lib/content/step-check";
import { freshCopy, grade, lastRows, rawTextParsers, resultText, runInput } from "../src/lib/sql/core";

const only = process.argv[2];
const problems: string[] = [];
let checks = 0;

function fail(where: string, msg: string) {
  problems.push(`✗ ${where}: ${msg}`);
}

async function makeBase(setup: string) {
  const db = await PGlite.create({ parsers: rawTextParsers(types) });
  if (setup.trim()) await db.exec(setup);
  await db.exec("CHECKPOINT"); // same as the browser worker: keeps ID sequences exact in copies
  return db;
}

async function main() {
  loadStory();
  for (const bundle of loadAllTracks()) {
    if (bundle.track.engine === "javascript" || bundle.track.engine === "python") {
      await checkCodeTrack(bundle);
      continue;
    }
    if (bundle.track.engine === "none") {
      checkReadingTrack(bundle);
      continue;
    }
    if (bundle.track.engine !== "postgres") {
      if (bundle.levels.some((l) => l.topics.length))
        fail(bundle.track.id, `there's no automatic checker for ${bundle.track.engine} lessons yet, so they can't go live`);
      continue;
    }
    // One base database per dataset, built the first time a lesson needs it.
    const bases = new Map<string, PGlite>();
    let lessonBase: PGlite;
    let copies: PGlite[] = [];
    const fresh = async () => {
      const copy = (await freshCopy(lessonBase, { PGlite, types }, "none")) as PGlite;
      copies.push(copy);
      return copy;
    };

    for (const { level, topics } of bundle.levels) {
      for (const t of topics) {
        if (only && !t.key.includes(only)) continue;
        await Promise.all(copies.map((c) => c.close()));
        copies = [];
        if (!bases.has(t.engine.key)) bases.set(t.engine.key, await makeBase(t.engine.setup));
        lessonBase = bases.get(t.engine.key)!;
        for (const [i, step] of t.lesson.steps.entries()) {
          if (step.kind === "code") {
            fail(`${t.key} lesson step ${i + 1}`, 'a SQL course uses "try" steps, not "code" (JavaScript/Python) steps');
            continue;
          }
          if (step.kind !== "try") continue;
          const where = `${t.key} lesson step ${i + 1}`;
          const out = await runInput(await fresh(), step.sql);
          checks++;
          const shouldError = step.expect_error || step.broken_starter;
          if (shouldError && !out.error) fail(where, "expected the starter SQL to error, but it ran fine");
          if (!shouldError && out.error) fail(where, `starter SQL errors: ${out.error.message}`);
          const check = tryStepCheck(step);
          if (check) {
            const exp = await runInput(await fresh(), check.solution);
            checks++;
            if (exp.error) fail(where, `expected-answer SQL errors: ${exp.error.message}`);
            else if (check.mode === "result" && !lastRows(exp)) fail(where, "expected-answer SQL returns no rows to compare");
            else {
              if (!(await grade(fresh, check.solution, check)).correct) fail(where, "the expected answer doesn't pass its own check");
              if (!out.error && (await grade(fresh, step.sql, check)).correct) fail(where, "the starter SQL already passes, so pressing Run completes it");
              for (const [j, wrong] of step.reject.entries()) {
                checks++;
                if ((await grade(fresh, wrong, check)).correct) fail(where, `wrong answer ${j + 1} is accepted by the grader`);
              }
            }
          }
        }

        if (t.quiz.pass > t.quiz.questions.length) fail(`${t.key} quiz`, "pass mark is higher than the number of questions");
        for (const [i, q] of t.quiz.questions.entries()) {
          const where = `${t.key} quiz Q${i + 1}`;
          checks++;
          if (q.type !== "fill" && (q.answer < 0 || q.answer >= q.options.length)) {
            fail(where, "answer index is out of range");
            continue;
          }
          if (q.type === "predict") {
            const out = await runInput(await fresh(), q.code);
            if (out.error) fail(where, `code errors: ${out.error.message}`);
            else {
              const actual = resultText(lastRows(out)).trim();
              const expected = q.options[q.answer].trim();
              if (actual !== expected) fail(where, `the marked answer is wrong.\n    marked: ${JSON.stringify(expected)}\n    actual: ${JSON.stringify(actual)}`);
              q.options.forEach((o, j) => {
                if (j !== q.answer && o.trim() === actual) fail(where, `option ${j + 1} is also correct`);
              });
            }
          }
          if (q.type === "fill" && q.runnable) {
            const out = await runInput(await fresh(), q.code.replace("____", q.answer));
            if (out.error) fail(where, `code with the answer filled in errors: ${out.error.message}`);
          }
        }

      }
      console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
    }
    await Promise.all(copies.map((c) => c.close()));
    await Promise.all([...bases.values()].map((b) => b.close()));
  }

  if (!only) await checkPractice();

  if (problems.length) {
    console.error(`\nContent check failed: ${problems.length} problem(s)\n\n${problems.join("\n")}\n`);
    process.exit(1);
  }
  console.log(`Content check passed (${checks} checks).`);
  process.exit(0);
}

// JavaScript and Python: the same rules as SQL. JavaScript runs in Node's `vm` (5-second limit
// per run, like the browser's 8); Python runs in Pyodide, the same engine as the browser, with
// a 5-second limit inside Python. A graded step's reference solution must pass its own tests,
// the starter code must not, and every listed wrong answer must be rejected.
const exec: Exec = (source) => vm.runInNewContext(source, {}, { timeout: 5000 }) as string;

type Verdict = { correct: boolean; output: { results: { threw: boolean }[]; error?: { message: string } } };
type Program = { logs: string[]; error?: { message: string } };
type Check = { tests: string[]; solution: string; unordered?: boolean; stdin?: string[] };
// What the checker needs from a language.
type Runner = {
  run: (code: string, stdin: string[]) => Promise<Program>;
  grade: (code: string, check: Check) => Promise<Verdict>;
  text: (out: Program) => string;
};

let pyodide: Promise<PyodideLike> | undefined;
const loadPy = () => (pyodide ??= loadPyodide() as unknown as Promise<PyodideLike>);

const jsRunner: Runner = {
  run: async (code) => runJs(exec, code),
  grade: async (code, check) => gradeJs(exec, code, check),
  text: (out) => logText(out as ReturnType<typeof runJs>),
};
const pyRunner: Runner = {
  run: async (code, stdin) => runPy(await loadPy(), code, stdin, 5),
  grade: async (code, check) => gradePy(await loadPy(), code, check, 5),
  text: (out) => pyLogText(out as Awaited<ReturnType<typeof runPy>>),
};

async function safely<T>(where: string, what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    fail(where, `${what}: ${(e as Error).message}`);
    return undefined;
  }
}

async function checkGraded(r: Runner, where: string, starter: string, check: Check, reject: string[]) {
  checks++;
  const good = await safely(where, "the reference solution", () => r.grade(check.solution, check));
  if (!good) return;
  if (!good.correct) fail(where, "the reference solution doesn't pass its own tests");
  if (good.output.results.some((x) => x.threw)) fail(where, "a test call throws an error even in the reference solution");
  checks++;
  const start = await safely(where, "the starter code", () => r.grade(starter, check));
  if (start?.correct) fail(where, "the starter code already passes every test, so pressing Run completes it");
  for (const [j, wrong] of reject.entries()) {
    checks++;
    if ((await safely(where, `wrong answer ${j + 1}`, () => r.grade(wrong, check)))?.correct) fail(where, `wrong answer ${j + 1} is accepted by the grader`);
  }
}

async function checkCodeTrack(bundle: ReturnType<typeof loadTrack>) {
  const python = bundle.track.engine === "python";
  const r = python ? pyRunner : jsRunner;
  for (const { level, topics } of bundle.levels) {
    for (const t of topics) {
      if (only && !t.key.includes(only)) continue;
      for (const [i, step] of t.lesson.steps.entries()) {
        if (step.kind === "try") {
          fail(`${t.key} lesson step ${i + 1}`, `a ${python ? "Python" : "JavaScript"} course uses "code" steps, not "try" (SQL) steps`);
          continue;
        }
        if (step.kind !== "code") continue;
        const where = `${t.key} lesson step ${i + 1}`;
        if (!!step.solution !== step.tests.length > 0) {
          fail(where, "a graded step needs both `tests` and `solution` (or neither)");
          continue;
        }
        const check = python ? pyStepCheck(step) : codeStepCheck(step);
        if (check) await checkGraded(r, where, step.code, check, step.reject);
        else {
          checks++;
          const out = await safely(where, "the starter code", () => r.run(step.code, step.stdin));
          if (out?.error && !step.broken_starter) fail(where, `starter code errors: ${out.error.message}`);
        }
      }

      if (t.quiz.pass > t.quiz.questions.length) fail(`${t.key} quiz`, "pass mark is higher than the number of questions");
      for (const [i, q] of t.quiz.questions.entries()) {
        const where = `${t.key} quiz Q${i + 1}`;
        checks++;
        if (q.type !== "fill" && (q.answer < 0 || q.answer >= q.options.length)) {
          fail(where, "answer index is out of range");
          continue;
        }
        if (q.type === "predict") {
          const out = await safely(where, "the code", () => r.run(q.code, q.stdin));
          if (!out) continue;
          if (out.error) fail(where, `code errors: ${out.error.message}`);
          else {
            const actual = r.text(out).trim();
            const expected = q.options[q.answer].trim();
            if (actual !== expected) fail(where, `the marked answer is wrong.\n    marked: ${JSON.stringify(expected)}\n    actual: ${JSON.stringify(actual)}`);
            q.options.forEach((o, j) => {
              if (j !== q.answer && o.trim() === actual) fail(where, `option ${j + 1} is also correct`);
            });
          }
        }
        if (q.type === "fill" && q.runnable) {
          const out = await safely(where, "the code with the answer filled in", () => r.run(q.code.replace("____", q.answer), q.stdin));
          if (out?.error) fail(where, `code with the answer filled in errors: ${out.error.message}`);
        }
      }
    }
    console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
  }
}

// A knowledge-based course (engine "none", e.g. Ethical Hacking). Nothing runs in the browser,
// so there is nothing to execute: we only confirm the content obeys the no-runner rules.
// Lessons may use explain/info/why/recap/mac steps but not try/code; quizzes must be multiple
// choice (or fill with runnable:false), never predict, since those need a running engine.
function checkReadingTrack(bundle: ReturnType<typeof loadTrack>) {
  for (const { level, topics } of bundle.levels) {
    for (const t of topics) {
      if (only && !t.key.includes(only)) continue;
      for (const [i, step] of t.lesson.steps.entries()) {
        checks++;
        if (step.kind === "try" || step.kind === "code")
          fail(`${t.key} lesson step ${i + 1}`, `a reading course can't run code, so it can't use "${step.kind}" steps (use explain/info/mac)`);
      }
      if (t.quiz.pass > t.quiz.questions.length) fail(`${t.key} quiz`, "pass mark is higher than the number of questions");
      for (const [i, q] of t.quiz.questions.entries()) {
        const where = `${t.key} quiz Q${i + 1}`;
        checks++;
        if (q.type === "predict") fail(where, "a reading course can't run code, so it can't use predict-the-output questions");
        else if (q.type === "fill" && q.runnable) fail(where, "a reading course can't run code: set `runnable: false` on fill questions");
        else if (q.type === "mcq" && (q.answer < 0 || q.answer >= q.options.length)) fail(where, "answer index is out of range");
      }
    }
    console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
  }
}

async function checkCodeCase(where: string, c: ReturnType<typeof loadPractice>[number], python: boolean) {
  const want = python ? "py" : "js";
  if (c.check.mode !== want) {
    fail(where, `a ${python ? "Python" : "JavaScript"} course needs \`check: { mode: ${want}, tests: [...], solution: ... }\``);
    return;
  }
  await checkGraded(python ? pyRunner : jsRunner, where, c.starter, c.check, []);
}

// Practice hub: every case's reference solution must pass its own check, and the
// starter code must not. Story episodes must be numbered 1, 2, 3… with no gaps.
// Each course gets at most MAX_PER_COURSE cases (the owner's rule: 10 per skill).
const MAX_PER_COURSE = 10;

async function checkPractice() {
  const cases = loadPractice();
  const perCourse = new Map<string, number>();
  cases.forEach((c) => perCourse.set(c.track, (perCourse.get(c.track) ?? 0) + 1));
  for (const [track, n] of perCourse)
    if (n > MAX_PER_COURSE) fail(`practice/${track}`, `has ${n} cases; the limit is ${MAX_PER_COURSE} per course`);
  const topicKeys = new Set(loadAllTracks().flatMap((b) => b.levels.flatMap((l) => l.topics.map((t) => t.key))));
  const series = new Map<string, number[]>();
  const titles = new Set<string>();

  for (const c of cases) {
    const where = `practice/${c.id}`;
    if (c.topic && !topicKeys.has(c.topic)) fail(where, `topic "${c.topic}" doesn't exist`);
    if (titles.has(`${c.track}:${c.title}`)) fail(where, `another ${c.track} case already has the title "${c.title}"`);
    titles.add(`${c.track}:${c.title}`);
    if (c.series) series.set(c.series.name, [...(series.get(c.series.name) ?? []), c.series.episode]);

    let track;
    try {
      track = loadTrack(c.track);
    } catch {
      fail(where, `the folder "${c.track}" isn't a course id`);
      continue;
    }
    if (track.track.engine === "javascript" || track.track.engine === "python") {
      await checkCodeCase(where, c, track.track.engine === "python");
      continue;
    }
    if (track.track.engine !== "postgres") {
      fail(where, `there's no automatic checker for ${track.track.engine} cases yet, so it can't go live`);
      continue;
    }
    if (c.check.mode === "js" || c.check.mode === "py") {
      fail(where, `a ${c.check.mode === "js" ? "JavaScript" : "Python"} check (mode: ${c.check.mode}) can only be used in a ${c.check.mode === "js" ? "JavaScript" : "Python"} course`);
      continue;
    }

    let base: PGlite;
    try {
      base = await makeBase(`${track.engine(c.dataset).setup}\n${c.evidence_setup}`);
    } catch (e) {
      fail(where, `evidence_setup errors: ${(e as Error).message}`);
      continue;
    }
    // Every grade opens fresh copies of the database; close them all afterwards or memory runs out.
    const copies: PGlite[] = [];
    const fresh = async () => {
      const copy = (await freshCopy(base, { PGlite, types }, "none")) as PGlite;
      copies.push(copy);
      return copy;
    };
    try {
      const good = await grade(fresh, c.check.solution, c.check);
      checks++;
      if (!good.correct) fail(where, "the reference solution doesn't pass its own check");
      if (c.check.mode === "result" && !lastRows(good.output)) fail(where, "the solution's last statement returns no rows");
      const bad = await grade(fresh, c.starter, c.check);
      checks++;
      if (bad.correct) fail(where, "the starter code already solves the case");
    } catch (e) {
      fail(where, (e as Error).message);
    }
    await Promise.all(copies.map((c) => c.close()));
    await base.close();
  }

  for (const [name, eps] of series) {
    eps.sort((a, b) => a - b).forEach((e, i) => {
      if (e !== i + 1) fail(`series "${name}"`, `episodes are ${eps.join(", ")}; expected 1 to ${eps.length} with no gaps`);
    });
  }
  console.log(`  checked practice hub (${cases.length} cases)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
