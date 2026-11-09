import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@/test/deferred";
import { CodeRunner } from "./code-runner";

// The real editor is CodeMirror; a textarea and a "⌘ + Enter" button stand in for it.
vi.mock("./code-editor", () => ({
  CodeEditor: ({ value, onChange, onRun }: { value: string; onChange: (v: string) => void; onRun: () => void }) => (
    <>
      <textarea aria-label="editor" value={value} onChange={(e) => onChange(e.target.value)} />
      <button onClick={onRun}>cmd-enter</button>
    </>
  ),
}));
vi.mock("@/lib/progress", () => ({ saveCode: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const runs: ReturnType<typeof deferred<string>>[] = [];
  const grades: ReturnType<typeof deferred<void>>[] = [];
  const runCode = vi.fn(() => {
    const d = deferred<string>();
    runs.push(d);
    return d.promise;
  });
  const onRan = vi.fn(() => {
    const d = deferred();
    grades.push(d);
    return d.promise;
  });
  render(<CodeRunner language="sql" initial="typed" starter="starter" run={runCode} renderOutput={(o: string) => <pre>{o}</pre>} onRan={onRan} />);
  const runButton = () => screen.getByRole("button", { name: /^(Run|Running…|Checking…)$/ });
  return { runs, grades, runCode, onRan, runButton };
}

describe("CodeRunner busy state", () => {
  it("shows Running…, then Checking… while grading, then Run again", async () => {
    const { runs, grades, runButton } = setup();
    fireEvent.click(runButton());
    expect(runButton()).toHaveProperty("textContent", "Running…");
    expect(runButton()).toHaveProperty("disabled", true);

    await act(async () => runs[0].resolve("the output"));
    expect(runButton()).toHaveProperty("textContent", "Checking…");
    expect(runButton()).toHaveProperty("disabled", true);
    expect(screen.getByText("the output")).toBeTruthy();

    await act(async () => grades[0].resolve());
    expect(runButton()).toHaveProperty("textContent", "Run");
    expect(runButton()).toHaveProperty("disabled", false);
  });

  it("ignores ⌘ + Enter while a run is still going, and runs again once it's done", async () => {
    const { runs, grades, runCode, runButton } = setup();
    fireEvent.click(runButton());
    fireEvent.click(screen.getByText("cmd-enter"));
    expect(runCode).toHaveBeenCalledTimes(1);

    await act(async () => runs[0].resolve("x"));
    fireEvent.click(screen.getByText("cmd-enter")); // still grading
    expect(runCode).toHaveBeenCalledTimes(1);

    await act(async () => grades[0].resolve());
    fireEvent.click(screen.getByText("cmd-enter"));
    expect(runCode).toHaveBeenCalledTimes(2);
  });

  it("says Still working… after 3 seconds, and stops saying it when done", async () => {
    vi.useFakeTimers();
    const { runs, grades, runButton } = setup();
    fireEvent.click(runButton());
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText("Still working…")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Still working…")).toBeTruthy();

    await act(async () => runs[0].resolve("x"));
    await act(async () => grades[0].resolve());
    expect(screen.queryByText("Still working…")).toBeNull();
  });

  it("Reset during a run: today the button works, and the old run's result still shows and is graded", async () => {
    const { runs, onRan, runButton } = setup();
    fireEvent.click(runButton());
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset).toHaveProperty("disabled", false);
    fireEvent.click(reset);
    expect(screen.getByLabelText("editor")).toHaveProperty("value", "starter");

    await act(async () => runs[0].resolve("old output"));
    expect(screen.getByText("old output")).toBeTruthy();
    expect(onRan).toHaveBeenCalledWith("typed", "old output");
  });
});
