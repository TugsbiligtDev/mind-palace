"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { stripAnsi } from "@/lib/shell/util";
import { Ansi } from "./ansi";

const LINE = 18.85; // px per line at 13px / 1.45

/**
 * less (and man, and long git output): one screen at a time over the terminal. Space or f moves
 * forward, b back, arrows by a line, /word searches, n finds the next match, q quits.
 */
export function Pager({ text, title, height, onQuit }: { text: string; title: string; height: number; onQuit: () => void }) {
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const rows = Math.max(5, Math.floor((height - 8) / LINE) - 1);
  const [top, setTop] = useState(0);
  const [searching, setSearching] = useState<string | null>(null);
  const [pattern, setPattern] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(0, lines.length - rows);

  useEffect(() => ref.current?.focus(), []);

  const find = (p: string, from: number) => {
    if (!p) return;
    const i = lines.findIndex((l, n) => n >= from && stripAnsi(l).toLowerCase().includes(p.toLowerCase()));
    if (i === -1) setMessage("Pattern not found  (press RETURN)");
    else setTop(Math.min(i, max));
  };

  function onKey(e: React.KeyboardEvent) {
    if (searching !== null) {
      e.preventDefault();
      if (e.key === "Enter") {
        setPattern(searching);
        find(searching, top + 1);
        setSearching(null);
      } else if (e.key === "Escape") setSearching(null);
      else if (e.key === "Backspace") setSearching(searching.slice(0, -1));
      else if (e.key.length === 1) setSearching(searching + e.key);
      return;
    }
    setMessage(null);
    const k = e.key;
    const move = (n: number) => setTop((t) => Math.max(0, Math.min(max, t + n)));
    if (k === "q" || k === "Q" || (e.ctrlKey && k === "c")) onQuit();
    else if (k === " " || k === "f" || k === "PageDown" || (e.ctrlKey && k === "f")) move(rows);
    else if (k === "b" || k === "PageUp" || (e.ctrlKey && k === "b")) move(-rows);
    else if (k === "ArrowDown" || k === "j" || k === "Enter" || k === "e") move(1);
    else if (k === "ArrowUp" || k === "k" || k === "y") move(-1);
    else if (k === "d") move(Math.floor(rows / 2));
    else if (k === "u") move(-Math.floor(rows / 2));
    else if (k === "g" || k === "Home" || k === "<") setTop(0);
    else if (k === "G" || k === "End" || k === ">") setTop(max);
    else if (k === "/") setSearching("");
    else if (k === "n") find(pattern, top + 1);
    else if (k === "h") setMessage("q quit · Space next page · b back · ↑↓ one line · /word search · n next match · g top · G end");
    else return;
    e.preventDefault();
  }

  const atEnd = top >= max;
  const status =
    searching !== null
      ? `/${searching}`
      : message ?? (title.endsWith("(1)") ? `Manual page ${title.toLowerCase()} line ${top + 1}${atEnd ? " (END)" : ""} (press h for help or q to quit)` : atEnd ? "(END)" : ":");

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKey}
      className="absolute inset-x-0 bottom-0 flex flex-col bg-term-bg px-3 pt-2 font-mono text-[13px] leading-[1.45] outline-none"
      style={{ top: 31 }}
      role="dialog"
      aria-label={`${title}: press q to quit`}
    >
      <pre className="flex-1 overflow-hidden whitespace-pre-wrap">
        {lines.slice(top, top + rows).map((l, i) => (
          <div key={top + i}>
            <Ansi text={l || " "} />
          </div>
        ))}
      </pre>
      <div className="flex items-center gap-2 pb-1.5">
        <span className="min-w-0 truncate bg-term-text px-1 text-term-bg">{status}</span>
        <span className="ml-auto flex shrink-0 gap-1 font-sans text-xs">
          <button onClick={() => setTop((t) => Math.max(0, t - rows))} className="rounded px-2 py-0.5 text-term-black hover:bg-white/10">
            b ↑
          </button>
          <button onClick={() => setTop((t) => Math.min(max, t + rows))} className="rounded px-2 py-0.5 text-term-black hover:bg-white/10">
            Space ↓
          </button>
          <button onClick={onQuit} className="rounded px-2 py-0.5 text-term-black hover:bg-white/10">
            q quit
          </button>
        </span>
      </div>
    </div>
  );
}
