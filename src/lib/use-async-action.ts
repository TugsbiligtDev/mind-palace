"use client";
import { useCallback, useRef, useState } from "react";

/**
 * One slow action at a time, such as Run or Check. `phase` is null while idle, otherwise what is
 * happening now (Run goes "run" → "check"). It always goes back to null when the task ends,
 * even if the task throws. Starting while an action is already going does nothing (resolves
 * to undefined), so a double click or ⌘ + Enter can't start a second one.
 */
export function useAsyncAction<Phase extends string>() {
  const [phase, setPhase] = useState<Phase | null>(null);
  // The state above is for drawing; this ref answers "is one going?" right away, before React re-renders.
  const running = useRef(false);

  const start = useCallback(async <T>(first: Phase, task: (setPhase: (p: Phase) => void) => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setPhase(first);
    try {
      return await task(setPhase);
    } finally {
      running.current = false;
      setPhase(null);
    }
  }, []);

  return { phase, busy: phase !== null, start };
}
