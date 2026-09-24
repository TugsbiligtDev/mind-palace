// Content checks: every file must match its schema, and every piece of SQL must really
// work on PostgreSQL. Runs before each build, so broken content never goes live.
//   pnpm check:content
import { PGlite } from "@electric-sql/pglite";
import { loadAllTracks, loadStory } from "../src/lib/content/load";
import { grade, lastRows, rawTextParsers, resultText, runInput } from "../src/lib/sql/core";

const problems: string[] = [];
let checks = 0;

function fail(where: string, msg: string) {
  problems.push(`✗ ${where}: ${msg}`);
}

async function makeBase(setup: string) {
  const db = await PGlite.create({ parsers: rawTextParsers });
  if (setup.trim()) await db.exec(setup);
  return db;
}

async function main() {
  loadStory();
  for (const bundle of loadAllTracks()) {
    if (bundle.track.engine !== "postgres") continue;
    const lessonBase = await makeBase(bundle.dataset);
    const fresh = () => lessonBase.clone();

    for (const { level, topics } of bundle.levels) {
      topics.forEach((t, i) => {
        if (t.case.episode !== i + 1) fail(t.key, `case episode is ${t.case.episode}, expected ${i + 1}`);
      });

      for (const t of topics) {
        // Lesson steps
        for (const [i, step] of t.lesson.steps.entries()) {
          if (step.kind !== "try") continue;
          const where = `${t.key} lesson step ${i + 1}`;
          const out = await runInput(await fresh(), step.sql);
          checks++;
          const shouldError = step.expect_error || step.broken_starter;
          if (shouldError && !out.error) fail(where, "expected the starter SQL to error, but it ran fine");
          if (!shouldError && out.error) fail(where, `starter SQL errors: ${out.error.message}`);
          if (step.expect) {
            const exp = await runInput(await fresh(), step.expect);
            checks++;
            if (exp.error) fail(where, `expected-answer SQL errors: ${exp.error.message}`);
            else if (!lastRows(exp)) fail(where, "expected-answer SQL returns no rows to compare");
          }
        }

        // Quiz
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

        // Case
        const where = `${t.key} case`;
        let caseBase: PGlite;
        try {
          caseBase = await makeBase(`${bundle.dataset}\n${t.case.evidence_setup}`);
        } catch (e) {
          fail(where, `evidence_setup errors: ${(e as Error).message}`);
          continue;
        }
        const caseFresh = () => caseBase.clone();
        try {
          const good = await grade(caseFresh, t.case.check.solution, t.case.check);
          checks++;
          if (!good.correct) fail(where, "the reference solution doesn't pass its own check");
          if (t.case.check.mode === "result" && !lastRows(good.output)) fail(where, "the solution's last statement returns no rows");
          const bad = await grade(caseFresh, t.case.starter, t.case.check);
          checks++;
          if (bad.correct) fail(where, "the starter code already solves the case");
        } catch (e) {
          fail(where, (e as Error).message);
        }
        await caseBase.close();
      }
      console.log(`  checked ${bundle.track.id}/${level.id} (${topics.length} topics)`);
    }
    await lessonBase.close();
  }

  if (problems.length) {
    console.error(`\nContent check failed: ${problems.length} problem(s)\n\n${problems.join("\n")}\n`);
    process.exit(1);
  }
  console.log(`Content check passed (${checks} SQL checks).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
