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

  it("today: when working out the expected answer fails, it says so, and every later check reuses that failure", async () => {
    core.expectedFor.mockRejectedValue(new Error("expected answer failed"));
    const button = setup();

    await act(async () => fireEvent.click(button()));
    expect(screen.getByText("The checker couldn't run: expected answer failed")).toBeTruthy();
    expect(button()).toHaveProperty("textContent", "Check my work");

    // Every later check, automatic or pressed, reuses the failed attempt instead of trying again.
    await act(async () => term.props!.onRan(ran("ls")));
    await act(async () => fireEvent.click(button()));
    expect(core.expectedFor).toHaveBeenCalledTimes(1);
    expect(core.gradeShell).not.toHaveBeenCalled();
    expect(screen.getByText("The checker couldn't run: expected answer failed")).toBeTruthy();
  });
});
