// Grading for the practice terminal ("shell" steps), shared by the lesson page and the content
// check. A graded step has a set-up script, a reference solution (commands, one per line) and
// check commands. The checks run on the learner's machine and on a fresh machine where the
// solution was typed; their output must match. A step can also compare what the learner's last
// command printed with what the solution's last command printed.
import { Machine } from "./machine";
import { stripAnsi } from "./util";

export type ShellUse = { match: string; why: string };

export type ShellCheck = {
  setup: string;
  solution: string;
  tests: string[];
  /** Compare the last command's output too. */
  output: boolean;
  /** Each pattern must match at least one command the learner typed in this step. */
  uses: ShellUse[];
};

export type ShellExpected = { tests: string[]; output: string };

export type ShellVerdict = { correct: boolean; message: string; passed: number; total: number };

// The content check and the expected answers use a fixed clock, so nothing depends on today.
export const FIXED_NOW = Date.UTC(2026, 9, 6, 9, 0, 0);
export function fixedClock(start = FIXED_NOW) {
  let t = start;
  return () => new Date((t += 1000));
}

/** A learner works at another time than the reference run. The content check simulates the
 * learner with this clock, so a check whose output depends on the time (a commit ID, a date)
 * fails there instead of in the browser. */
export const learnerClock = () => fixedClock(FIXED_NOW + 90_061_000);

/** Output with colors removed and spacing evened out, so `ls` and `ls -1` give the same names. */
export function normalizeOutput(s: string): string {
  return stripAnsi(s)
    // Notes shown only the first time in a session: sudo's password line, ssh's new host key.
    .replace(/^\[sudo\] password for .*$/gm, "")
    .replace(/^Warning: Permanently added .*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lines of a solution or wrong answer: one command per line, blank lines and # comments skipped. */
export function commandLines(script: string): string[] {
  return script
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() && !l.trim().startsWith("#"));
}

/** A fresh machine after the set-up, with `lines` typed into it. Returns it and the last output. */
export async function typeInto(setup: string, lines: string[], now = fixedClock()): Promise<{ m: Machine; last: string; codes: number[] }> {
  const m = await Machine.create(setup, { now });
  let last = "";
  const codes: number[] = [];
  for (const l of lines) {
    const answers = / # answers: (.*?)(?= # |$)/.exec(l)?.[1];
    const edits = [...l.matchAll(/ # edit: (.*?)(?= # |$)/g)].map((x) => x[1]);
    m.scripted = { answers: answers ? answers.trim().split(/\s+/).map((a) => (a === "(enter)" ? "" : a)) : [], edits };
    const r = await m.run(l);
    // What the command printed, errors included (ssh, for one, reports on standard error).
    last = r.stdout + r.stderr;
    codes.push(r.exitCode);
  }
  return { m, last, codes };
}

export function probeAll(m: Machine, tests: string[]): Promise<string[]> {
  return m.probeAll(tests);
}

export async function expectedFor(check: ShellCheck): Promise<ShellExpected> {
  const { m, last } = await typeInto(check.setup, commandLines(check.solution));
  return { tests: await probeAll(m, check.tests), output: last };
}

const clip = (s: string) => {
  const lines = stripAnsi(s).replace(/\n+$/, "").split("\n");
  const shown = lines.length > 8 ? [...lines.slice(0, 8), `… (${lines.length - 8} more lines)`] : lines;
  return shown.join("\n") || "(nothing)";
};

/** Grades a machine the learner has been typing into. */
export async function gradeShell(m: Machine, typed: string[], lastOutput: string | undefined, check: ShellCheck, exp: ShellExpected): Promise<ShellVerdict> {
  const got = await probeAll(m, check.tests);
  const total = check.tests.length + (check.output ? 1 : 0);
  let passed = 0;
  let firstMiss = "";
  got.forEach((g, i) => {
    if (normalizeOutput(g) === normalizeOutput(exp.tests[i])) passed++;
    else if (!firstMiss) firstMiss = `Checking with \`${check.tests[i]}\`, the result should be:\n${clip(exp.tests[i])}\n\nOn your computer it's:\n${clip(g)}`;
  });
  if (check.output) {
    if (lastOutput !== undefined && normalizeOutput(lastOutput) === normalizeOutput(exp.output)) passed++;
    else if (!firstMiss) firstMiss = lastOutput === undefined ? "Run a command that prints the answer." : "Your last command didn't print the answer yet.";
  }
  if (passed < total) return { correct: false, passed, total, message: firstMiss };
  for (const u of check.uses) {
    const re = new RegExp(u.match);
    if (!typed.some((t) => re.test(t))) return { correct: false, passed, total, message: `The result is right, but ${u.why}` };
  }
  return { correct: true, passed, total, message: "Done!" };
}
