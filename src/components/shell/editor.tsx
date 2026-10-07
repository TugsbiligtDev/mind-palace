"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Prompt = { kind: "write"; value: string; thenExit: boolean } | { kind: "save?" } | { kind: "search"; value: string };

/**
 * A small nano, drawn over the terminal: type to edit, Ctrl+O writes the file, Ctrl+X exits
 * (asking first if there are unsaved changes), Ctrl+K cuts a line and Ctrl+U pastes it,
 * Ctrl+W searches. The shortcut bar at the bottom can be clicked too.
 */
export function Editor({ path, initial, height, onExit }: { path: string; initial: string; height: number; onExit: (saved: string) => void }) {
  const [text, setText] = useState(initial);
  const [written, setWritten] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const cut = useRef<string[]>([]);
  const lastWasCut = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const saved = written ?? initial;
  // Where the cursor goes after an edit made by a shortcut (cut, paste, Tab). Applied right after
  // React updates the text, before the next key is handled, so fast repeated Ctrl+K works.
  const caret = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const c = caret.current;
    if (c && area.current) {
      area.current.setSelectionRange(c.start, c.end);
      caret.current = null;
    }
  }, [text]);
  const place = (start: number, end = start) => {
    caret.current = { start, end };
  };
  const modified = text !== saved;

  useEffect(() => {
    if (prompt && prompt.kind !== "save?") promptRef.current?.focus();
    else area.current?.focus();
  }, [prompt]);

  const lineCount = (s: string) => (s ? s.split("\n").length - (s.endsWith("\n") ? 1 : 0) : 0);

  function write(thenExit: boolean) {
    // nano adds the final newline a text file should end with.
    const out = text && !text.endsWith("\n") ? `${text}\n` : text;
    setText(out);
    setWritten(out);
    setStatus(`[ Wrote ${lineCount(out)} line${lineCount(out) === 1 ? "" : "s"} ]`);
    setPrompt(null);
    if (thenExit) onExit(out);
  }

  // Leaving without saving keeps the file as it was on disk: what was last written, or what
  // was there when nano opened (Git then uses its ready-made message).
  function exit() {
    if (modified) setPrompt({ kind: "save?" });
    else onExit(saved);
  }

  function cutLine() {
    const el = area.current!;
    const pos = el.selectionStart;
    const start = text.lastIndexOf("\n", pos - 1) + 1;
    let end = text.indexOf("\n", pos);
    end = end === -1 ? text.length : end + 1;
    const line = text.slice(start, end);
    cut.current = lastWasCut.current ? [...cut.current, line] : [line];
    place(start);
    setText(text.slice(0, start) + text.slice(end));
  }

  function paste() {
    const el = area.current!;
    const pos = el.selectionStart;
    const start = text.lastIndexOf("\n", pos - 1) + 1;
    const chunk = cut.current.join("");
    place(start + chunk.length);
    setText(text.slice(0, start) + chunk + text.slice(start));
  }

  function search(word: string) {
    const el = area.current!;
    if (!word) return setPrompt(null);
    let i = text.indexOf(word, el.selectionEnd);
    if (i === -1) i = text.indexOf(word);
    setPrompt(null);
    if (i === -1) setStatus(`[ "${word}" not found ]`);
    else requestAnimationFrame(() => el.setSelectionRange(i, i + word.length));
  }

  function onAreaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!e.ctrlKey || e.metaKey) {
      lastWasCut.current = false;
      if (status && e.key.length === 1) setStatus(null);
      if (e.key === "Tab") {
        e.preventDefault();
        const el = e.currentTarget;
        const p = el.selectionStart;
        place(p + 1);
        setText(text.slice(0, p) + "\t" + text.slice(el.selectionEnd));
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (!"oxkuwsg".includes(k)) return;
    e.preventDefault();
    if (k === "o") setPrompt({ kind: "write", value: path, thenExit: false });
    else if (k === "s") write(false);
    else if (k === "x") exit();
    else if (k === "k") {
      cutLine();
      lastWasCut.current = true;
      return;
    } else if (k === "u") paste();
    else if (k === "w") setPrompt({ kind: "search", value: "" });
    else if (k === "g") setStatus("^O write the file · ^X exit · ^K cut line · ^U paste · ^W search");
    lastWasCut.current = false;
  }

  function onPromptKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!prompt || prompt.kind === "save?") return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (prompt.kind === "write") write(prompt.thenExit);
      else search(prompt.value);
    } else if (e.key === "Escape" || (e.ctrlKey && e.key === "c")) {
      e.preventDefault();
      setPrompt(null);
      setStatus("[ Cancelled ]");
    }
  }

  function onSaveKey(e: React.KeyboardEvent) {
    const k = e.key.toLowerCase();
    e.preventDefault();
    if (k === "y") setPrompt({ kind: "write", value: path, thenExit: true });
    else if (k === "n") onExit(saved);
    else if (k === "escape" || (e.ctrlKey && k === "c")) {
      setPrompt(null);
      setStatus("[ Cancelled ]");
    }
  }

  const KEYS = [
    ["^O", "Write Out"],
    ["^X", "Exit"],
    ["^K", "Cut"],
    ["^U", "Paste"],
    ["^W", "Where Is"],
  ] as const;

  function press(k: (typeof KEYS)[number][0]) {
    if (k === "^O") setPrompt({ kind: "write", value: path, thenExit: false });
    else if (k === "^X") exit();
    else if (k === "^K") cutLine();
    else if (k === "^U") paste();
    else setPrompt({ kind: "search", value: "" });
  }

  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col bg-term-bg font-mono text-[13px] leading-[1.45]" style={{ top: 31 }} role="dialog" aria-label={`nano editing ${path}`}>
      <div className="flex bg-term-text px-2 text-term-bg">
        <span>GNU nano 7.2</span>
        <span className="mx-auto truncate px-2">{path}</span>
        <span className="w-16 text-right">{modified ? "Modified" : ""}</span>
      </div>
      <textarea
        ref={area}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          lastWasCut.current = false;
        }}
        onKeyDown={onAreaKey}
        spellCheck={false}
        wrap="off"
        className="flex-1 resize-none bg-transparent px-3 py-1 text-term-text caret-term-green outline-none"
        style={{ minHeight: height - 110 }}
        aria-label="File contents"
      />
      <div className="min-h-[1.45em] px-2 text-center">
        {prompt?.kind === "save?" ? (
          <div tabIndex={0} ref={(el) => el?.focus()} onKeyDown={onSaveKey} className="flex flex-wrap items-center gap-x-4 text-left outline-none">
            <span className="bg-term-text px-1 text-term-bg">Save modified buffer?</span>
            <button onClick={() => setPrompt({ kind: "write", value: path, thenExit: true })}>
              <b>Y</b> Yes
            </button>
            <button onClick={() => onExit(saved)}>
              <b>N</b> No
            </button>
            <button onClick={() => setPrompt(null)}>
              <b>^C</b> Cancel
            </button>
          </div>
        ) : prompt ? (
          <label className="flex bg-term-text px-1 text-left text-term-bg">
            <span className="whitespace-pre">{prompt.kind === "write" ? "File Name to Write: " : "Search: "}</span>
            <input
              ref={promptRef}
              value={prompt.value}
              onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
              onKeyDown={onPromptKey}
              className="min-w-0 flex-1 bg-transparent outline-none"
              spellCheck={false}
            />
          </label>
        ) : status ? (
          <span className="bg-term-text px-1 text-term-bg">{status}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-3 px-2 pb-1.5 text-xs">
        {KEYS.map(([k, label]) => (
          <button key={k} onMouseDown={(e) => e.preventDefault()} onClick={() => press(k)} className="hover:text-term-white">
            <span className="bg-term-text px-0.5 text-term-bg">{k}</span> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
