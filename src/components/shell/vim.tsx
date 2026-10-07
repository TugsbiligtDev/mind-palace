"use client";
import { useEffect, useRef, useState } from "react";
import { type VimState, vimKey, vimOpen } from "@/lib/shell/vim";

const LINE = 18.85; // px per line at 13px / 1.45

/**
 * vim, drawn over the terminal (the keys are handled in src/lib/shell/vim.ts). A hidden input
 * takes the keys, so phones get a keyboard; the Esc and : buttons help where the keyboard has
 * no Escape key.
 */
export function Vim({ path, initial, height, onExit }: { path: string; initial: string; height: number; onExit: (saved: string) => void }) {
  const rows = Math.max(5, Math.floor((height - 10) / LINE) - 1);
  // The state, and the first line on screen (kept so the cursor's line stays visible).
  const [view, setView] = useState<{ s: VimState; top: number }>(() => ({ s: vimOpen(path, initial, initial === ""), top: 0 }));
  const { s, top } = view;
  const input = useRef<HTMLTextAreaElement>(null);

  const done = useRef(false);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (s.quit && !done.current) {
      done.current = true;
      onExit(s.quit.text);
    }
  }, [s.quit, onExit]);

  const press = (k: string) =>
    setView((v) => {
      const n = vimKey(v.s, k);
      const t = n.row < v.top ? n.row : n.row >= v.top + rows ? n.row - rows + 1 : v.top;
      return { s: n, top: t };
    });

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey) return;
    let k = e.key;
    if (e.ctrlKey) {
      if (!["r", "c", "g", "["].includes(k.toLowerCase())) return;
      k = `C-${k.toLowerCase()}`;
    }
    if (k === "Unidentified" || k === "Process" || (k.length > 1 && !k.startsWith("C-") && !["Escape", "Enter", "Backspace", "Delete", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(k))) return;
    e.preventDefault();
    press(k);
  }

  // Phone keyboards send letters as input events, not keys.
  function onInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const v = e.currentTarget.value;
    e.currentTarget.value = "";
    for (const ch of v) press(ch === "\n" ? "Enter" : ch);
  }

  const width = String(s.lines.length).length + 1;
  const shown = s.lines.slice(top, top + rows);
  const bottom =
    s.mode === "command" ? `:${s.cmd}` : s.mode === "search" ? `${s.searchBack ? "?" : "/"}${s.cmd}` : s.mode === "insert" ? "-- INSERT --" : s.message;

  return (
    <div
      className="absolute inset-x-0 bottom-0 flex flex-col bg-term-bg font-mono text-[13px] leading-[1.45] text-term-text"
      style={{ top: 31 }}
      role="dialog"
      aria-label={`vim editing ${path}`}
      onClick={() => input.current?.focus()}
    >
      <div className="flex-1 overflow-hidden px-1 pt-1">
        {Array.from({ length: rows }, (_, i) => {
          const line = shown[i];
          const r = top + i;
          if (line === undefined) return (
            <div key={i} className="text-term-blue">
              ~
            </div>
          );
          const cursorHere = r === s.row && s.mode !== "command" && s.mode !== "search";
          const col = Math.min(s.col, line.length);
          return (
            <div key={i} className="whitespace-pre">
              {s.number && <span className="text-term-yellow">{String(r + 1).padStart(width)} </span>}
              {cursorHere ? (
                <>
                  {line.slice(0, col)}
                  <span className={s.mode === "insert" ? "border-l-2 border-term-green" : "bg-term-green text-term-bg"}>{line[col] ?? " "}</span>
                  {line.slice(col + 1)}
                </>
              ) : (
                line || " "
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className={`min-w-0 flex-1 truncate whitespace-pre ${s.error ? "bg-term-red px-1 text-term-white" : s.mode === "insert" ? "font-bold" : ""}`}>{bottom || " "}</span>
        {s.mode === "normal" && <span className="text-xs text-term-black">{`${s.row + 1},${s.col + 1}`}</span>}
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => press("Escape")} className="rounded border border-white/20 px-1.5 text-xs hover:bg-white/10">
          Esc
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => press(":")} className="rounded border border-white/20 px-1.5 text-xs hover:bg-white/10">
          :
        </button>
      </div>
      <textarea
        ref={input}
        onKeyDown={onKeyDown}
        onInput={onInput}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="vim: type commands here"
        className="absolute h-px w-px opacity-0"
      />
    </div>
  );
}
