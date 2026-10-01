// Kept apart from schema.ts so the browser can use it without loading zod.
import type { JsCheck } from "../js/core";
import type { PyCheck } from "../py/core";
import type { CaseCheck } from "../sql/core";
import type { WebCheck, WebFiles } from "../web/core";
import type { Step } from "./schema";

// How a graded lesson step is checked (the same rule in the browser and in the content check).
export function tryStepCheck(step: Extract<Step, { kind: "try" }>): CaseCheck | undefined {
  if (!step.expect) return undefined;
  return step.state_query
    ? { mode: "state", solution: step.expect, state_query: step.state_query }
    : { mode: "result", solution: step.expect, ordered: step.ordered };
}

// The same for JavaScript "code" steps: a step with tests and a solution is graded.
export function codeStepCheck(step: Extract<Step, { kind: "code" }>): JsCheck | undefined {
  if (!step.solution || step.tests.length === 0) return undefined;
  return { tests: step.tests, solution: step.solution, unordered: step.unordered };
}

// The same for Python "code" steps.
export function pyStepCheck(step: Extract<Step, { kind: "code" }>): PyCheck | undefined {
  if (!step.solution || step.tests.length === 0) return undefined;
  return { tests: step.tests, solution: step.solution, unordered: step.unordered, stdin: step.stdin };
}

// HTML & CSS "web" steps: the starter files, and the check when the step is graded.
// A solution or wrong answer that leaves out a file means "the starter's version of it".
type WebStep = Extract<Step, { kind: "web" }>;

export function webStarter(step: WebStep): WebFiles {
  return { html: step.html, css: step.css ?? "" };
}

export function webFiles(step: WebStep, files: { html?: string; css?: string }): WebFiles {
  return { html: files.html ?? step.html, css: files.css ?? step.css ?? "" };
}

export function webStepCheck(step: WebStep): WebCheck | undefined {
  if (!step.solution || step.tests.length === 0) return undefined;
  return { tests: step.tests, solution: webFiles(step, step.solution), widths: step.widths };
}
