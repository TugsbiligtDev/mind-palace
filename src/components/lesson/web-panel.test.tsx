import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebFiles } from "@/lib/web/core";
import { deferred } from "@/test/deferred";
import { WebPanel } from "./web-panel";

// The real WebRunner draws editors and a preview; this one only reports what it was given.
const runner = vi.hoisted(() => ({ props: null as null | { onCheck?: (f: WebFiles) => void; checking?: boolean } }));
vi.mock("@/components/web/web-runner", () => ({
  WebRunner: (props: { onCheck?: (f: WebFiles) => void; checking?: boolean }) => {
    runner.props = props;
    return <span>{props.checking ? "checking" : "idle"}</span>;
  },
}));
const gradeWebPage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/web/client", () => ({ gradeWebPage }));
vi.mock("@/lib/content/step-check", () => ({
  webStepCheck: () => ({ solution: { html: "", css: "" }, tests: ["t"], widths: [800] }),
  webStarter: () => ({ html: "", css: "" }),
}));
vi.mock("@/lib/progress", () => ({ useProgress: () => ({ code: {} }) }));

const files = { html: "<p>hi</p>", css: "" };
const step = { kind: "web", body: "", html: "" } as never;

beforeEach(() => {
  localStorage.clear();
  gradeWebPage.mockReset();
});
afterEach(cleanup);

describe("WebPanel checking state", () => {
  it("is checking while the grader runs, then shows the result", async () => {
    const d = deferred<unknown>();
    gradeWebPage.mockReturnValue(d.promise);
    const onDone = vi.fn();
    render(<WebPanel step={step} slot="s" done={false} onDone={onDone} />);
    expect(screen.getByText("idle")).toBeTruthy();

    act(() => void runner.props!.onCheck!(files));
    expect(screen.getByText("checking")).toBeTruthy();

    await act(async () => d.resolve({ correct: true, total: 1 }));
    expect(screen.getByText("idle")).toBeTruthy();
    expect(screen.getByText(/Correct! The check passes\./)).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ignores a second check while one is running", async () => {
    const d = deferred<unknown>();
    gradeWebPage.mockReturnValue(d.promise);
    render(<WebPanel step={step} slot="s" done={false} onDone={() => {}} />);
    act(() => void runner.props!.onCheck!(files));
    act(() => void runner.props!.onCheck!(files));
    expect(gradeWebPage).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ correct: false, message: "Nope", total: 1 }));
    expect(screen.getByText("Nope")).toBeTruthy();
  });

  it("says the checker couldn't run when it throws, and stops checking", async () => {
    gradeWebPage.mockRejectedValue(new Error("boom"));
    render(<WebPanel step={step} slot="s" done={false} onDone={() => {}} />);
    await act(async () => runner.props!.onCheck!(files));
    expect(screen.getByText("The checker couldn't run: boom")).toBeTruthy();
    expect(screen.getByText("idle")).toBeTruthy();
  });
});
