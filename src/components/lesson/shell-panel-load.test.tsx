import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Machine } from "@/lib/shell/machine";
import { ShellPanel } from "./shell-panel";

// Its own file: here the checker's code can't be downloaded at all (a dropped connection),
// which every test in this file shares.
type TerminalProps = { onReady: (m: Machine, typed: string[]) => void };
const term = vi.hoisted(() => ({ props: null as null | TerminalProps }));
vi.mock("@/components/shell/terminal", () => ({
  Terminal: (props: TerminalProps) => {
    term.props = props;
    return null;
  },
}));
vi.mock("@/lib/shell/core", () => {
  throw new Error("pinned: checker download failed");
});
vi.mock("@/lib/content/step-check", () => ({ shellStepCheck: () => ({ solution: "ls", tests: [] }) }));
vi.mock("@/lib/progress", () => ({ useProgress: () => ({ code: {} }), saveCode: vi.fn() }));

afterEach(cleanup);

it("today: when the checker's code can't be downloaded, Check my work is stuck on Checking…", async () => {
  render(<ShellPanel step={{ kind: "shell", body: "", setup: "" } as never} slot="s" done={false} onDone={() => {}} />);
  act(() => term.props!.onReady({} as Machine, []));
  const button = () => screen.getByRole("button", { name: /^(Check my work|Checking…)$/ });

  await act(async () => fireEvent.click(button()));
  expect(button()).toHaveProperty("textContent", "Checking…");
  expect(button()).toHaveProperty("disabled", true);
  expect(screen.queryByText(/The checker couldn't run/)).toBeNull();
});
