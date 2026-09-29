// Content checks: every file must match its schema, and every piece of SQL must really
// work on PostgreSQL. Runs before each build, so broken content never goes live.
//   pnpm check:content            everything
//   pnpm check:content 19-ctes    only lessons whose key contains "19-ctes" (skips the Practice hub)
import { PGlite, types } from "@electric-sql/pglite";
import { loadAllTracks, loadStory, loadTrack } from "../src/lib/content/load";
import { loadPractice } from "../src/lib/content/practice";
import { tryStepCheck } from "../src/lib/content/step-check";
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
  console.log(`Content check passed (${checks} SQL checks).`);
  process.exit(0);
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
    if (track.track.engine !== "postgres") {
      fail(where, `there's no automatic checker for ${track.track.engine} cases yet, so it can't go live`);
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
