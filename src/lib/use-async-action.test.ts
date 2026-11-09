import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deferred } from "@/test/deferred";
import { useAsyncAction } from "./use-async-action";

describe("useAsyncAction", () => {
  it("goes idle → first phase → later phase → idle, and returns the task's result", async () => {
    const { result } = renderHook(() => useAsyncAction<"run" | "check">());
    expect(result.current).toMatchObject({ phase: null, busy: false });

    const step1 = deferred();
    const step2 = deferred();
    let done!: Promise<string | undefined>;
    act(() => {
      done = result.current.start("run", async (setPhase) => {
        await step1.promise;
        setPhase("check");
        await step2.promise;
        return "ok";
      });
    });
    expect(result.current).toMatchObject({ phase: "run", busy: true });
    await act(async () => step1.resolve());
    expect(result.current.phase).toBe("check");
    await act(async () => step2.resolve());
    expect(result.current).toMatchObject({ phase: null, busy: false });
    await expect(done).resolves.toBe("ok");
  });

  it("ignores a start while one is going", async () => {
    const { result } = renderHook(() => useAsyncAction<"run">());
    const d = deferred();
    let ran = 0;
    act(() => {
      void result.current.start("run", async () => {
        ran++;
        await d.promise;
      });
    });
    let second!: Promise<unknown>;
    act(() => {
      second = result.current.start("run", async () => {
        ran++;
      });
    });
    await expect(second).resolves.toBeUndefined();
    expect(ran).toBe(1);
    await act(async () => d.resolve());
  });

  it("goes back to idle when the task throws, and passes the error on", async () => {
    const { result } = renderHook(() => useAsyncAction<"run">());
    let failed!: Promise<unknown>;
    await act(async () => {
      failed = result.current.start("run", async () => {
        throw new Error("boom");
      });
      await failed.catch(() => {});
    });
    await expect(failed).rejects.toThrow("boom");
    expect(result.current).toMatchObject({ phase: null, busy: false });
  });
});
