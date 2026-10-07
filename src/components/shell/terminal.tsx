"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { JournalEntry, Machine, RunResult } from "@/lib/shell/machine";
import { HOME, HOST, USER, tildify } from "@/lib/shell/util";
import { Ansi, afterClear } from "./ansi";
import { Editor } from "./editor";
import { Pager } from "./pager";
import { Vim } from "./vim";

type Block = { kind: "cmd"; prompt: string; text: string } | { kind: "out"; text: string } | { kind: "note"; text: string };

type Overlay =
  | { kind: "pager"; text: string; title: string; done: () => void }
  | { kind: "editor"; path: string; content: string; editor: "nano" | "vim"; done: (v: string | null) => void };

export type Ran = { line: string; result: RunResult; machine: Machine };

const MAX_BLOCKS = 400;

function Prompt({ text }: { text: string }) {
  // learner@inkwell:~/case$  in Ubuntu's colors.
  const m = /^([^@]+@[^:]+):(.*)\$ $/.exec(text);
  if (!m) return <span>{text}</span>;
  return (
    <span className="select-none">
      <span className="font-bold text-term-green">{m[1]}</span>:<span className="font-bold text-term-blue">{m[2]}</span>${" "}
    </span>
  );
}

type Props = {
  setup: string;
  saved?: string;
  onSave: (journal: string) => void;
  onRan?: (ran: Ran) => void;
  onReady?: (m: Machine, typed: string[]) => void;
  height?: number;
};

/**
 * The practice terminal: a simulated Linux computer the learner types into. Everything they do
 * is saved (`onSave`) and rebuilt from `saved` on reload. `onRan` fires after every command, for
 * grading. Reset starts a fresh session from the set-up.
 */
export function Terminal(props: Props) {
  const [generation, setGeneration] = useState(0);
  const [fresh, setFresh] = useState(false);
  const { onSave } = props;
  const reset = useCallback(() => {
    onSave("");
    setFresh(true);
    setGeneration((n) => n + 1);
  }, [onSave]);
  return <Session key={generation} {...props} saved={fresh ? undefined : props.saved} onReset={reset} />;
}

function Session({ setup, saved, onSave, onRan, onReady, onReset, height = 380 }: Props & { onReset: () => void }) {
  const [machine, setMachine] = useState<Machine | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [ask, setAsk] = useState<{ question: string; answer: (s: string) => void; secret?: boolean } | null>(null);
  const [search, setSearch] = useState<{ query: string; index: number } | null>(null);
  const histPos = useRef<number | null>(null);
  const draft = useRef("");
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Focus follows the learner once they've started using the terminal (not on page load,
  // which would pop up the keyboard on a phone).
  const engaged = useRef(false);
  const queued = useRef<string | null>(null);
  const runRef = useRef<((line: string) => void) | null>(null);
  // False once Reset has replaced this session: a command still running must not save or report.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);

  const add = useCallback((b: Block | Block[]) => setBlocks((prev) => [...prev, ...(Array.isArray(b) ? b : [b])].slice(-MAX_BLOCKS)), []);

  // Build the machine, then replay what was saved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Machine } = await import("@/lib/shell/machine");
        const m = await Machine.create(setup);
        const journal: JournalEntry[] = saved ? (JSON.parse(saved) as JournalEntry[]) : [];
        if (journal.length) await m.replay(journal);
        if (cancelled) return;
        m.ui = {
          page: (text, title) => new Promise<void>((done) => setOverlay({ kind: "pager", text, title, done })),
          edit: (path, content, editor) => new Promise<string | null>((done) => setOverlay({ kind: "editor", path, content, editor, done })),
          ask: (question, secret) => new Promise<string>((answer) => setAsk({ question, answer, secret })),
        };
        const typed = journal.flatMap((e) => ("line" in e ? [e.line] : []));
        if (typed.length) add({ kind: "note", text: `Your ${typed.length} earlier command${typed.length === 1 ? " was" : "s were"} restored. Reset starts this step over.` });
        setMachine(m);
        onReady?.(m, typed);
      } catch (e) {
        if (!cancelled) setFailed((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Built once per session: Reset makes a new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest output in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks, ask, busy, search]);

  const focus = useCallback(() => {
    engaged.current = true;
    if (!overlay && window.getSelection()?.toString() === "") inputRef.current?.focus();
  }, [overlay]);

  useEffect(() => {
    if (engaged.current && !overlay && machine) inputRef.current?.focus({ preventScroll: true });
  }, [busy, overlay, machine, search]);

  const run = useCallback(
    async (line: string) => {
      const m = machine;
      if (!m) return;
      add({ kind: "cmd", prompt: m.prompt(), text: line });
      setInput("");
      histPos.current = null;
      setBusy(true);
      const ac = new AbortController();
      abort.current = ac;
      let result: RunResult;
      try {
        result = await m.run(line, { signal: ac.signal });
      } catch (e) {
        result = { stdout: "", stderr: `bash: ${(e as Error).message}\n`, exitCode: 1 };
      }
      if (!alive.current) return;
      abort.current = null;
      setBusy(false);
      const out: Block[] = [];
      if (result.echo) out.push({ kind: "out", text: `${result.echo}\n` });
      const text = result.stdout + result.stderr;
      // `clear` wipes the screen; whatever came after it (clear; ls) is still shown.
      const rest = afterClear(text);
      if (rest !== undefined) {
        setBlocks([]);
        out.length = 0;
        if (rest) out.push({ kind: "out", text: rest });
      } else if (text) out.push({ kind: "out", text });
      add(out);
      onSave(JSON.stringify(m.journal));
      onRan?.({ line, result, machine: m });
      const next = queued.current;
      queued.current = null;
      if (next !== null) setTimeout(() => runRef.current?.(next), 0);
    },
    [machine, add, onSave, onRan],
  );

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const complete = useCallback(async () => {
    const el = inputRef.current;
    if (!machine || !el) return;
    const cursor = el.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after = input.slice(cursor);
    const r = await machine.complete(before);
    if (r.options.length) {
      add([
        { kind: "cmd", prompt: machine.prompt(), text: input },
        { kind: "out", text: `${r.options.join("  ")}\n` },
      ]);
      return;
    }
    setInput(r.text + after);
    requestAnimationFrame(() => el.setSelectionRange(r.text.length, r.text.length));
  }, [machine, input, add]);

  const history = machine?.history ?? [];
  const searchMatch = search ? [...history].reverse().filter((h) => search.query && h.includes(search.query))[search.index] : undefined;

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    engaged.current = true;
    const el = e.currentTarget;
    const cursor = el.selectionStart ?? input.length;
    const setCursor = (n: number) => requestAnimationFrame(() => el.setSelectionRange(n, n));

    if (ask) {
      if (e.key === "Enter") {
        e.preventDefault();
        add({ kind: "out", text: `${ask.question}${ask.secret ? "" : input}\n` });
        ask.answer(input);
        setAsk(null);
        setInput("");
      } else if (e.ctrlKey && e.key === "c") {
        e.preventDefault();
        add({ kind: "out", text: `${ask.question}^C\n` });
        ask.answer("n");
        setAsk(null);
        setInput("");
      }
      return;
    }

    if (search) {
      if (e.key === "Enter") {
        e.preventDefault();
        setSearch(null);
        if (!searchMatch) return;
        if (busy) queued.current = searchMatch;
        else run(searchMatch);
        return;
      }
      if (e.ctrlKey && e.key === "r") {
        e.preventDefault();
        setSearch({ ...search, index: search.index + 1 });
        return;
      }
      if (e.key === "Escape" || (e.ctrlKey && (e.key === "g" || e.key === "c")) || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setSearch(null);
        setInput(e.key === "Escape" || e.key.startsWith("Arrow") ? (searchMatch ?? "") : "");
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setSearch({ query: search.query.slice(0, -1), index: 0 });
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearch({ query: search.query + e.key, index: 0 });
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // Typed ahead while a command was still running: run it as soon as that one finishes.
      if (busy) {
        queued.current = input;
        setInput("");
      } else run(input);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      complete();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (!history.length) return;
      if (histPos.current === null) draft.current = input;
      let pos = histPos.current ?? history.length;
      pos = e.key === "ArrowUp" ? Math.max(0, pos - 1) : pos + 1;
      if (pos >= history.length) {
        histPos.current = null;
        setInput(draft.current);
        setCursor(draft.current.length);
      } else {
        histPos.current = pos;
        setInput(history[pos]);
        setCursor(history[pos].length);
      }
      return;
    }
    if (!e.ctrlKey || e.metaKey || e.altKey) return;
    // The shortcuts bash gets from its line editor.
    switch (e.key.toLowerCase()) {
      case "c":
        e.preventDefault();
        if (busy) abort.current?.abort();
        else {
          add({ kind: "cmd", prompt: machine?.prompt() ?? "", text: `${input}^C` });
          setInput("");
          histPos.current = null;
        }
        return;
      case "z":
        // Ctrl+Z pauses the running command (it becomes a stopped job).
        e.preventDefault();
        if (busy) abort.current?.abort("stop");
        return;
      case "l":
        e.preventDefault();
        setBlocks([]);
        return;
      case "a":
        e.preventDefault();
        setCursor(0);
        return;
      case "e":
        e.preventDefault();
        setCursor(input.length);
        return;
      case "u":
        e.preventDefault();
        setInput(input.slice(cursor));
        setCursor(0);
        return;
      case "k":
        e.preventDefault();
        setInput(input.slice(0, cursor));
        return;
      case "w": {
        e.preventDefault();
        const before = input.slice(0, cursor).replace(/\S+\s*$/, "");
        setInput(before + input.slice(cursor));
        setCursor(before.length);
        return;
      }
      case "r":
        e.preventDefault();
        setSearch({ query: "", index: 0 });
        return;
      case "d":
        if (!input) {
          e.preventDefault();
          add({ kind: "note", text: "(Ctrl+D on an empty line would close a real terminal. This one stays open.)" });
        }
        return;
    }
  }

  const prompt = machine?.prompt() ?? `${USER}@${HOST}:${tildify(HOME)}$ `;

  // While a command runs or Ctrl+R searches, the input stays focused (for Ctrl+C and typing)
  // but out of sight.
  const hidden = !!search;
  let status: ReactNode = null;
  if (failed) status = <span className="text-term-red">The practice terminal couldn&apos;t start: {failed}</span>;
  else if (!machine) status = <span className="text-term-black">Starting the practice computer…</span>;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-term-bg text-term-text shadow-sm">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs text-term-black">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="mr-auto truncate font-mono">
          {(machine?.prompt() ?? `${USER}@${HOST}:`).replace(/:.*$/, "")}: bash
        </span>
        <button
          onClick={onReset}
          className="rounded px-2 py-0.5 text-term-black transition-colors hover:bg-white/10 hover:text-term-text"
        >
          Reset
        </button>
      </div>
      <div
        ref={scrollRef}
        onClick={focus}
        className="overflow-y-auto px-3 py-2 font-mono text-[13px] leading-[1.45]"
        style={{ height }}
        role="log"
        aria-label="Terminal output"
      >
        {blocks.map((b, i) =>
          b.kind === "cmd" ? (
            <div key={i} className="break-all whitespace-pre-wrap">
              <Prompt text={b.prompt} />
              {b.text}
            </div>
          ) : b.kind === "note" ? (
            <div key={i} className="my-1 font-sans text-xs text-term-black italic">
              {b.text}
            </div>
          ) : (
            <pre key={i} className="font-mono break-words whitespace-pre-wrap">
              <Ansi text={b.text} />
            </pre>
          ),
        )}
        <div className="relative flex break-all whitespace-pre-wrap">
          {status ?? (
            <>
              {search ? (
                <span>
                  (reverse-i-search)`{search.query}&apos;: {searchMatch ?? ""}
                </span>
              ) : ask ? (
                <span>{ask.question}</span>
              ) : (
                <Prompt text={prompt} />
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  histPos.current = null;
                }}
                onKeyDown={onKey}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                aria-label={ask?.secret ? "Type the passphrase (it isn't shown)" : "Type a command"}
                type={ask?.secret ? "password" : "text"}
                className={hidden ? "absolute h-px w-px opacity-0" : `min-w-0 flex-1 bg-transparent font-mono caret-term-green outline-none ${ask?.secret ? "text-transparent" : "text-term-text"}`}
              />
            </>
          )}
        </div>
      </div>
      {overlay?.kind === "pager" && (
        <Pager
          text={overlay.text}
          title={overlay.title}
          height={height}
          onQuit={() => {
            overlay.done();
            setOverlay(null);
          }}
        />
      )}
      {overlay?.kind === "editor" && overlay.editor === "vim" && (
        <Vim
          path={overlay.path}
          initial={overlay.content}
          height={height}
          onExit={(v) => {
            overlay.done(v);
            setOverlay(null);
          }}
        />
      )}
      {overlay?.kind === "editor" && overlay.editor !== "vim" && (
        <Editor
          path={overlay.path}
          initial={overlay.content}
          height={height}
          onExit={(v) => {
            overlay.done(v);
            setOverlay(null);
          }}
        />
      )}
    </div>
  );
}
