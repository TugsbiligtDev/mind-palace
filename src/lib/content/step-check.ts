// Kept apart from schema.ts so the browser can use it without loading zod.
import type { CaseCheck } from "../sql/core";
import type { Step } from "./schema";

// How a graded lesson step is checked (the same rule in the browser and in the content check).
export function tryStepCheck(step: Extract<Step, { kind: "try" }>): CaseCheck | undefined {
  if (!step.expect) return undefined;
  return step.state_query
    ? { mode: "state", solution: step.expect, state_query: step.state_query }
    : { mode: "result", solution: step.expect, ordered: step.ordered };
}
