// Content checks: every file must match its schema, and every snippet and graded answer must
// really work on its engine (PostgreSQL, Python, JavaScript, or a browser for HTML & CSS).
// Runs on GitHub for main and pull requests (.github/workflows/check.yml); run it before pushing too.
//   pnpm check:content            everything
//   pnpm check:content 19-ctes    only lessons whose key contains "19-ctes"
import { PGlite, types } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { loadPyodide } from "pyodide";
import { gradeJs, logText, runJs, type Exec } from "../src/lib/js/core";
import { gradePy, logText as pyLogText, runPy, type PyodideLike } from "../src/lib/py/core";
import { loadAllTracks, loadStory, loadTrack } from "../src/lib/content/load";
import { codeStepCheck, pyStepCheck, shellStepCheck, tryStepCheck, webFiles, webStarter, webStepCheck } from "../src/lib/content/step-check";
import { commandLines, expectedFor, gradeShell, learnerClock, typeInto } from "../src/lib/shell/core";
import { stripAnsi } from "../src/lib/shell/util";
import { buildPage, CHECK_RUNTIME, checkInFrame, FRAME_HEIGHT, gradeWeb, type RunChecks } from "../src/lib/web/core";
import { chromium, type Browser } from "playwright-core";
import { freshCopy, grade, lastRows, rawTextParsers, resultText, runInput } from "../src/lib/sql/core";

const only = process.argv[2];
const problems: string[] = [];
let checks = 0;

function fail(where: string, msg: string) {
  problems.push(`✗ ${where}: ${msg}`);
}

type CheckTopic = ReturnType<typeof loadTrack>["levels"][number]["topics"][number];

// Quiz invariants every engine shares: a reachable pass mark, and in-range answer indices on
// questions that have options (mcq/predict — fill answers are free text). Returns, per question,
// whether its shape is sound, so callers can skip the ones that would index a missing option.
function checkQuizShape(t: CheckTopic): boolean[] {
  if (t.quiz.pass > t.quiz.questions.length) fail(`${t.key} quiz`, "pass mark is higher than the number of questions");
  return t.quiz.questions.map((q, i) => {
    checks++;
    const ok = q.type === "fill" || (q.answer >= 0 && q.answer < q.options.length);
    if (!ok) fail(`${t.key} quiz Q${i + 1}`, "answer index is out of range");
    // The quiz trims what the learner types and won't let them check an empty box,
    // so an answer that is only spaces can never be given.
    if (q.type === "fill" && [q.answer, ...q.accept].some((a) => !a.trim()))
      fail(`${t.key} quiz Q${i + 1}`, "a fill answer is only spaces, which the quiz can't accept");
    return ok;
  });
}

// "choice" steps work the same in every course: the marked answer must exist, and no two
// options may read the same.
function checkChoiceSteps(t: CheckTopic) {
  for (const [i, step] of t.lesson.steps.entries()) {
    if (step.kind !== "choice") continue;
    checks++;
    const where = `${t.key} lesson step ${i + 1}`;
    if (step.answer < 0 || step.answer >= step.options.length) fail(where, "answer index is out of range");
    if (new Set(step.options.map((o) => o.trim())).size !== step.options.length) fail(where, "two options are the same");
  }
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
    for (const t of bundle.levels.flatMap((l) => l.topics)) if (!only || t.key.includes(only)) checkChoiceSteps(t);
    if (bundle.track.engine === "javascript" || bundle.track.engine === "python") {
      await checkCodeTrack(bundle);
      continue;
    }
    if (bundle.track.engine === "none") {
      checkReadingTrack(bundle);
      continue;
    }
    if (bundle.track.engine === "web") {
      await checkWebTrack(bundle);
      continue;
    }
    if (bundle.track.engine === "shell") {
      await checkShellTrack(bundle);
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
          if (step.kind === "code" || step.kind === "web") {
            fail(`${t.key} lesson step ${i + 1}`, `a SQL course uses "try" steps, not "${step.kind}" steps`);
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

        const shapeOk = checkQuizShape(t);
        for (const [i, q] of t.quiz.questions.entries()) {
          if (!shapeOk[i]) continue;
          const where = `${t.key} quiz Q${i + 1}`;
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

  await browser?.then((b) => b.close());

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
        if (step.kind === "try" || step.kind === "web") {
          fail(`${t.key} lesson step ${i + 1}`, `a ${python ? "Python" : "JavaScript"} course uses "code" steps, not "${step.kind}" steps`);
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

      const shapeOk = checkQuizShape(t);
      for (const [i, q] of t.quiz.questions.entries()) {
        if (!shapeOk[i]) continue;
        const where = `${t.key} quiz Q${i + 1}`;
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
// Lessons may use explain/info/why/recap/mac/choice steps but not try/code; quizzes must be multiple
// choice (or fill with runnable:false), never predict, since those need a running engine.
function checkReadingTrack(bundle: ReturnType<typeof loadTrack>) {
  for (const { level, topics } of bundle.levels) {
    for (const t of topics) {
      if (only && !t.key.includes(only)) continue;
      for (const [i, step] of t.lesson.steps.entries()) {
        checks++;
        if (step.kind === "try" || step.kind === "code" || step.kind === "web")
          fail(`${t.key} lesson step ${i + 1}`, `a reading course can't run code, so it can't use "${step.kind}" steps (use explain/info/mac/choice)`);
      }
      checkQuizShape(t);
      for (const [i, q] of t.quiz.questions.entries()) {
        const where = `${t.key} quiz Q${i + 1}`;
        if (q.type === "predict") fail(where, "a reading course can't run code, so it can't use predict-the-output questions");
        else if (q.type === "fill" && q.runnable) fail(where, "a reading course can't run code: set `runnable: false` on fill questions");
      }
    }
    console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
  }
}

// HTML & CSS: pages render in headless Chrome (Playwright's own build, installed once with
// `pnpm exec playwright-core install chromium-headless-shell`), inside the same script-free
// iframe the site uses, so the checks measure exactly what a learner's browser would.
let browser: Promise<Browser> | undefined;
async function webRunner(): Promise<RunChecks> {
  browser ??= chromium.launch().catch((e: Error) => {
    throw new Error(`${e.message.split("\n")[0]}\n  Install the checker's browser once with: pnpm exec playwright-core install chromium-headless-shell`);
  });
  const page = await (await browser).newPage();
  // Pretend to be the site, so exercise images load from public/ just as they do in the browser.
  await page.route("https://mindpalace.test/**", (route) => {
    const file = path.join(process.cwd(), "public", decodeURIComponent(new URL(route.request().url()).pathname));
    if (new URL(route.request().url()).pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!DOCTYPE html><title>check</title>" });
    return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://mindpalace.test/");
  const src = checkInFrame.toString();
  return (html, tests, width) =>
    page.evaluate(
      ([src, html, tests, width, height, runtime]) => new Function(`return (${src});`)()(html, tests, width, height, runtime),
      [src, html, tests, width, FRAME_HEIGHT, CHECK_RUNTIME] as const,
    );
}

async function checkWebTrack(bundle: ReturnType<typeof loadTrack>) {
  // Only start headless Chrome when a lesson in this course is actually being checked.
  if (!bundle.levels.some((l) => l.topics.some((t) => !only || t.key.includes(only)))) return;
  const run = await webRunner();
  for (const { level, topics } of bundle.levels) {
    for (const t of topics) {
      if (only && !t.key.includes(only)) continue;
      for (const [i, step] of t.lesson.steps.entries()) {
        const where = `${t.key} lesson step ${i + 1}`;
        if (step.kind === "try" || step.kind === "code") {
          fail(where, `an HTML & CSS course uses "web" steps, not "${step.kind}" steps`);
          continue;
        }
        if (step.kind !== "web") continue;
        if (!!step.solution !== step.tests.length > 0) {
          fail(where, "a graded step needs both `tests` and `solution` (or neither)");
          continue;
        }
        if (step.css === undefined && [step.solution, ...step.reject].some((f) => f?.css !== undefined)) {
          fail(where, "an answer uses style.css, but the step has no `css:` starter, so the learner gets no style.css tab");
          continue;
        }
        const check = webStepCheck(step);
        if (!check) {
          // An "edit and look" step: the starter must at least render.
          checks++;
          await safely(where, "the starter page", () => run(buildPage(webStarter(step)), ["doc.body.localName"], step.widths[0]));
          continue;
        }
        checks++;
        const good = await safely(where, "the reference solution", () => gradeWeb(run, check.solution, check));
        if (!good) continue;
        if (!good.correct) fail(where, `the reference solution doesn't pass its own checks: ${good.message}`);
        checks++;
        const start = await safely(where, "the starter", () => gradeWeb(run, webStarter(step), check));
        if (start?.correct) fail(where, "the starter already passes every check, so the step is free");
        for (const [j, wrong] of step.reject.entries()) {
          checks++;
          const v = await safely(where, `wrong answer ${j + 1}`, () => gradeWeb(run, webFiles(step, wrong), check));
          if (v?.correct) fail(where, `wrong answer ${j + 1} is accepted by the grader`);
        }
      }
      checkQuizShape(t);
      for (const [i, q] of t.quiz.questions.entries()) {
        const where = `${t.key} quiz Q${i + 1}`;
        if (q.type === "predict") fail(where, "an HTML & CSS course has no output to predict: use an mcq that shows the code");
        else if (q.type === "fill" && q.runnable) fail(where, "set `runnable: false` on fill questions in an HTML & CSS course");
      }
    }
    console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
  }
}

// Linux & Git: every terminal step runs in the same simulated computer the browser uses
// (src/lib/shell), in Node. The set-up must work; for a graded step, every solution command must
// succeed (unless marked "# allow-error"), the solution must pass its own checks, the untouched
// start must not, and every listed wrong answer must be rejected. Predict-the-output questions
// run their commands on a fresh machine and compare.
async function checkShellTrack(bundle: ReturnType<typeof loadTrack>) {
  for (const { level, topics } of bundle.levels) {
    for (const t of topics) {
      if (only && !t.key.includes(only)) continue;
      for (const [i, step] of t.lesson.steps.entries()) {
        const where = `${t.key} lesson step ${i + 1}`;
        if (step.kind === "try" || step.kind === "code" || step.kind === "web") {
          fail(where, `the Linux & Git course uses "shell" steps, not "${step.kind}" steps`);
          continue;
        }
        if (step.kind !== "shell") continue;
        if ((step.solution !== undefined) !== (step.tests.length > 0 || step.output)) {
          fail(where, "a graded step needs a `solution` and something to compare (`tests` or `output: true`), or neither");
          continue;
        }
        checks++;
        const check = shellStepCheck(step);
        if (!check) {
          await safely(where, "the set-up script", () => typeInto(step.setup, []));
          continue;
        }
        const lines = commandLines(check.solution);
        const run = await safely(where, "the set-up script", () => typeInto(check.setup, lines, learnerClock()));
        if (!run) continue;
        run.codes.forEach((code, j) => {
          if (code !== 0 && !lines[j].includes("# allow-error")) fail(where, `solution command ${j + 1} (\`${lines[j]}\`) fails with exit code ${code}`);
        });
        const exp = await expectedFor(check);
        checks++;
        const good = await gradeShell(run.m, lines, run.last, check, exp);
        if (!good.correct) fail(where, `the solution doesn't pass its own checks: ${good.message}`);
        // The checks run after every command the learner types, so they must not change anything.
        else if (!(await gradeShell(run.m, lines, run.last, check, exp)).correct) fail(where, "a check changes the learner's computer (the solution passes once, then fails when checked again)");
        checks++;
        const start = await typeInto(check.setup, [], learnerClock());
        if ((await gradeShell(start.m, [], undefined, check, exp)).correct) fail(where, "the step is already done before typing anything");
        for (const [j, wrong] of step.reject.entries()) {
          checks++;
          const wl = commandLines(wrong);
          const w = await safely(where, `wrong answer ${j + 1}`, () => typeInto(check.setup, wl, learnerClock()));
          if (w && (await gradeShell(w.m, wl, w.last, check, exp)).correct) fail(where, `wrong answer ${j + 1} is accepted by the grader`);
        }
      }
      const shapeOk = checkQuizShape(t);
      for (const [i, q] of t.quiz.questions.entries()) {
        if (!shapeOk[i]) continue;
        const where = `${t.key} quiz Q${i + 1}`;
        if (q.type === "predict") {
          checks++;
          const r = await safely(where, "the commands", async () => {
            const { m } = await typeInto("", []);
            let out = "";
            for (const l of commandLines(q.code)) {
              const res = await m.run(l);
              out += (res.echo ? `${res.echo}\n` : "") + res.stdout + res.stderr;
            }
            return out;
          });
          if (r === undefined) continue;
          const actual = stripAnsi(r).trim();
          const expected = q.options[q.answer].trim();
          if (actual !== expected) fail(where, `the marked answer is wrong.\n    marked: ${JSON.stringify(expected)}\n    actual: ${JSON.stringify(actual)}`);
          q.options.forEach((o, j) => {
            if (j !== q.answer && o.trim() === actual) fail(where, `option ${j + 1} is also correct`);
          });
        }
        if (q.type === "fill" && q.runnable) {
          checks++;
          const lines = commandLines(q.code.replace("____", q.answer));
          const r = await safely(where, "the commands", () => typeInto("", lines));
          if (r?.codes.some((c) => c !== 0)) fail(where, "the commands with the answer filled in fail");
        }
      }
    }
    console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
