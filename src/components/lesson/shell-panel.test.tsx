import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ran } from "@/components/shell/terminal";
import type { Machine } from "@/lib/shell/machine";
import { deferred } from "@/test/deferred";
import { ShellPanel } from "./shell-panel";

// The real terminal boots a simulated Linux computer; this one only hands over its callbacks.
type TerminalProps = { onReady: (m: Machine, typed: string[]) => void; onRan: (ran: Ran) => void };
const term = vi.hoisted(() => ({ props: null as null | TerminalProps }));
vi.mock("@/components/shell/terminal", () => ({
  Terminal: (props: TerminalProps) => {
    term.props = props;
    return null;
  },
}));
const core = vi.hoisted(() => ({ expectedFor: vi.fn(), gradeShell: vi.fn() }));
vi.mock("@/lib/shell/core", () => core);
vi.mock("@/lib/content/step-check", () => ({ shellStepCheck: () => ({ solution: "ls", tests: [] }) }));
vi.mock("@/lib/progress", () => ({ useProgress: () => ({ code: {} }), saveCode: vi.fn() }));

const step = { kind: "shell", body: "", setup: "" } as never;
const machine = {} as Machine;
const ran = (line: string): Ran => ({ line, machine, result: { stdout: "", stderr: "", exitCode: 0 } });

function setup() {
  render(<ShellPanel step={step} slot="s" done={false} onDone={() => {}} />);
  act(() => term.props!.onReady(machine, []));
  return () => screen.getByRole("button", { name: /^(Check my work|Checking…)$/ });
}

beforeEach(() => {
  localStorage.clear();
  core.expectedFor.mockReset();
  core.gradeShell.mockReset();
});
afterEach(cleanup);

describe("ShellPanel Check my work", () => {
  it("shows Checking… while grading, then the result", async () => {
    core.expectedFor.mockResolvedValue({ tests: [] });
    const d = deferred<unknown>();
    core.gradeShell.mockReturnValue(d.promise);
    const button = setup();

    fireEvent.click(button());
    expect(button()).toHaveProperty("textContent", "Checking…");
    expect(button()).toHaveProperty("disabled", true);

    await act(async () => d.resolve({ correct: false, message: "Not yet: make the folder" }));
    expect(screen.getByText("Not yet: make the folder")).toBeTruthy();
    expect(button()).toHaveProperty("textContent", "Check my work");
    expect(button()).toHaveProperty("disabled", false);
  });

  it("when working out the expected answer fails, it says so, and the next check tries again", async () => {
    core.expectedFor.mockRejectedValueOnce(new Error("expected answer failed")).mockResolvedValue({ tests: [] });
    core.gradeShell.mockResolvedValue({ correct: false, message: "Not yet: make the folder" });
    const button = setup();

    await act(async () => fireEvent.click(button()));
    expect(screen.getByText("The checker couldn't run: expected answer failed")).toBeTruthy();
    expect(button()).toHaveProperty("textContent", "Check my work");

    // The failed attempt isn't kept: pressing again works it out afresh and grades.
    await act(async () => fireEvent.click(button()));
    expect(core.expectedFor).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Not yet: make the folder")).toBeTruthy();
  });

  it("the automatic check after a command also retries a failed expected answer", async () => {
    core.expectedFor.mockRejectedValueOnce(new Error("expected answer failed")).mockResolvedValue({ tests: [] });
    core.gradeShell.mockResolvedValue({ correct: false, message: "Not yet" });
    setup();
    await act(async () => term.props!.onRan(ran("ls")));
    await act(async () => term.props!.onRan(ran("ls")));
    expect(core.expectedFor).toHaveBeenCalledTimes(2);
    expect(core.gradeShell).toHaveBeenCalledTimes(1);
  });
});
