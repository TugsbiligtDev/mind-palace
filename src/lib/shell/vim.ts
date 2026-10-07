// A small vim for the practice terminal (Module 26), as a state machine so it can be tested
// without a page: `vimKey(state, key)` returns the next state. It covers what the course
// teaches: the modes (normal, insert, command line, search), moving (h j k l, w b e, 0 ^ $,
// gg G, counts like 5j), inserting (i a I A o O), changing (x r dd D dw cw cc yy p P J),
// undo and redo (u, Ctrl+R), searching (/ ? n N), and the commands :w :q :wq :x :q! :e!
// :N :set number :%s/old/new/g, plus ZZ and ZQ.

export type Mode = "normal" | "insert" | "command" | "search";

export type VimState = {
  path: string;
  lines: string[];
  row: number;
  col: number;
  mode: Mode;
  /** What's typed after ":" or "/". */
  cmd: string;
  searchBack: boolean;
  /** The message on the bottom line (and whether it's an error). */
  message: string;
  error: boolean;
  /** A count or operator typed so far (3, d, g, 2d…). */
  pending: string;
  register: { text: string[]; linewise: boolean };
  undo: { lines: string[]; row: number; col: number }[];
  redo: { lines: string[]; row: number; col: number }[];
  /** The text as last written (or as it was when opened). */
  saved: string;
  /** Whether the file has ever been written by this session. */
  wrote: boolean;
  lastSearch: string;
  number: boolean;
  /** Set when vim quits: what's on disk now. */
  quit?: { text: string };
  /** Text inserted in the current insert session (for the undo step). */
  inserting: boolean;
};

const toLines = (text: string) => {
  const l = text.split("\n");
  if (text.endsWith("\n")) l.pop();
  return l.length ? l : [""];
};

export const joinLines = (lines: string[]) => (lines.length === 1 && lines[0] === "" ? "" : `${lines.join("\n")}\n`);

export function vimOpen(path: string, text: string, isNew: boolean): VimState {
  const lines = toLines(text);
  const bytes = new TextEncoder().encode(text).length;
  return {
    path,
    lines,
    row: 0,
    col: 0,
    mode: "normal",
    cmd: "",
    searchBack: false,
    message: isNew ? `"${path}" [New]` : `"${path}" ${text ? lines.length : 0}L, ${bytes}B`,
    error: false,
    pending: "",
    register: { text: [], linewise: true },
    undo: [],
    redo: [],
    saved: text,
    wrote: false,
    lastSearch: "",
    number: false,
    inserting: false,
  };
}

export const modified = (s: VimState) => joinLines(s.lines) !== s.saved;

function clampCol(s: VimState, col = s.col): VimState {
  const len = s.lines[s.row].length;
  const max = s.mode === "insert" ? len : Math.max(0, len - 1);
  return { ...s, col: Math.max(0, Math.min(col, max)) };
}

function snapshot(s: VimState): VimState {
  return { ...s, undo: [...s.undo, { lines: s.lines, row: s.row, col: s.col }].slice(-200), redo: [] };
}

function msg(s: VimState, message: string, error = false): VimState {
  return { ...s, message, error };
}

const isWord = (c: string | undefined) => !!c && /\w/.test(c);
const cls = (c: string | undefined) => (c === undefined ? 0 : /\s/.test(c) ? 0 : isWord(c) ? 1 : 2);

function wordForward(s: VimState): { row: number; col: number } {
  let { row, col } = s;
  const line = s.lines[row];
  const start = cls(line[col]);
  while (col < line.length && cls(line[col]) === start && start !== 0) col++;
  while (col < line.length && cls(line[col]) === 0) col++;
  if (col >= line.length && row < s.lines.length - 1) {
    row++;
    col = 0;
    const next = s.lines[row];
    while (col < next.length && cls(next[col]) === 0) col++;
  }
  return { row, col };
}

function wordBack(s: VimState): { row: number; col: number } {
  let { row, col } = s;
  if (col === 0 && row > 0) {
    row--;
    col = s.lines[row].length;
  }
  const line = s.lines[row];
  col--;
  while (col > 0 && cls(line[col]) === 0) col--;
  const c = cls(line[col]);
  while (col > 0 && cls(line[col - 1]) === c && c !== 0) col--;
  return { row, col: Math.max(0, col) };
}

function wordEnd(s: VimState): { row: number; col: number } {
  const { row } = s;
  let { col } = s;
  const line = s.lines[row];
  col++;
  while (col < line.length && cls(line[col]) === 0) col++;
  const c = cls(line[col]);
  while (col < line.length - 1 && cls(line[col + 1]) === c) col++;
  return { row, col: Math.min(col, Math.max(0, line.length - 1)) };
}

function find(s: VimState, pattern: string, back: boolean, from = { row: s.row, col: s.col }): { row: number; col: number } | undefined {
  if (!pattern) return undefined;
  const n = s.lines.length;
  for (let k = 0; k <= n; k++) {
    const r = back ? (from.row - k + n * 2) % n : (from.row + k) % n;
    const line = s.lines[r];
    if (!back) {
      const startAt = k === 0 ? from.col + 1 : 0;
      const i = line.indexOf(pattern, startAt);
      if (i >= 0 && !(k === n && i > from.col)) return { row: r, col: i };
    } else {
      const endAt = k === 0 ? from.col - 1 : line.length;
      if (endAt < 0) continue;
      const i = line.lastIndexOf(pattern, endAt);
      if (i >= 0) return { row: r, col: i };
    }
  }
  return undefined;
}

function doSearch(s: VimState, pattern: string, back: boolean): VimState {
  const hit = find(s, pattern, back);
  if (!hit) return msg({ ...s, lastSearch: pattern }, `E486: Pattern not found: ${pattern}`, true);
  const wrapped = back ? hit.row > s.row || (hit.row === s.row && hit.col >= s.col) : hit.row < s.row || (hit.row === s.row && hit.col <= s.col);
  return msg({ ...s, ...hit, lastSearch: pattern, searchBack: back }, wrapped ? `search hit ${back ? "TOP, continuing at BOTTOM" : "BOTTOM, continuing at TOP"}` : `${back ? "?" : "/"}${pattern}`, wrapped);
}

function write(s: VimState, path = s.path): VimState {
  const text = joinLines(s.lines);
  const bytes = new TextEncoder().encode(text).length;
  return msg({ ...s, saved: text, wrote: true, path }, `"${path}" ${s.wrote || s.saved ? "" : "[New] "}${text ? s.lines.length : 0}L, ${bytes}B written`);
}

function exCommand(s0: VimState, raw: string): VimState {
  const s = { ...s0, mode: "normal" as Mode, cmd: "" };
  const c = raw.trim();
  if (!c) return msg(s, "");
  if (/^\d+$/.test(c)) return clampCol({ ...msg(s, ""), row: Math.min(s.lines.length - 1, Math.max(0, Number(c) - 1)), col: 0 });
  if (c === "$") return clampCol({ ...msg(s, ""), row: s.lines.length - 1, col: 0 });
  const sub = /^(%|\d+(?:,\d+)?)?s\/((?:[^/\\]|\\.)*)\/((?:[^/\\]|\\.)*)\/?([gi]*)$/.exec(c);
  if (sub) {
    const [, range, pat, rep, fl] = sub;
    let from = s.row;
    let to = s.row;
    if (range === "%") {
      from = 0;
      to = s.lines.length - 1;
    } else if (range) {
      const [a, b] = range.split(",").map((x) => Number(x) - 1);
      from = a;
      to = b ?? a;
    }
    let re: RegExp;
    try {
      re = new RegExp(pat.replace(/\\\//g, "/"), `${fl.includes("g") ? "g" : ""}${fl.includes("i") ? "i" : ""}`);
    } catch {
      return msg(s, `E486: Pattern not found: ${pat}`, true);
    }
    let count = 0;
    let lastRow = s.row;
    const lines = s.lines.map((l, i) => {
      if (i < from || i > to || !re.test(l)) return l;
      re.lastIndex = 0;
      const n = (l.match(new RegExp(re.source, `g${re.flags.includes("i") ? "i" : ""}`)) ?? []).length;
      count += fl.includes("g") ? n : 1;
      lastRow = i;
      return l.replace(re, rep.replace(/\\\//g, "/").replace(/&/g, "$&"));
    });
    if (!count) return msg(s, `E486: Pattern not found: ${pat}`, true);
    const lineCount = lines.filter((l, i) => l !== s.lines[i]).length;
    return clampCol({ ...snapshot(s), lines, row: lastRow, col: 0, message: count > 2 ? `${count} substitution${count === 1 ? "" : "s"} on ${lineCount} line${lineCount === 1 ? "" : "s"}` : "", error: false });
  }
  if (c === "set number" || c === "set nu") return { ...msg(s, ""), number: true };
  if (c === "set nonumber" || c === "set nonu") return { ...msg(s, ""), number: false };
  if (c === "noh" || c === "nohlsearch") return msg(s, "");
  if (c === "u" || c === "undo") return key(s, "u");
  if (c === "red" || c === "redo") return key(s, "C-r");
  if (c === "e!") {
    const lines = toLines(s.saved);
    return clampCol({ ...snapshot(s), lines, row: Math.min(s.row, lines.length - 1), message: `"${s.path}" ${lines.length}L, ${new TextEncoder().encode(s.saved).length}B`, error: false });
  }
  const m = /^(w|write|wq|x|xit|exit|q|quit|wq!|w!|q!|quit!|qa|qa!|wqa|xa)(?:\s+(\S+))?$/.exec(c);
  if (!m) {
    if (c === "help" || c.startsWith("help ")) return msg(s, "The practice terminal's vim has no :help. The lesson lists the commands it knows.");
    return msg(s, `E492: Not an editor command: ${c}`, true);
  }
  const [, verb, file] = m;
  const force = verb.endsWith("!");
  const v = verb.replace("!", "");
  if (v === "w" || v === "write") return write(s, file ?? s.path);
  if (v === "wq" || v === "x" || v === "xit" || v === "exit" || v === "wqa" || v === "xa") {
    const w = v.startsWith("x") && !modified(s) ? s : write(s, file ?? s.path);
    return { ...w, quit: { text: w.saved } };
  }
  // :q
  if (modified(s) && !force) return msg(s, "E37: No write since last change (add ! to override)", true);
  return { ...s, quit: { text: s.saved } };
}

function deleteLines(s: VimState, n: number, yankOnly = false): VimState {
  const count = Math.min(n, s.lines.length - s.row);
  const taken = s.lines.slice(s.row, s.row + count);
  const register = { text: taken, linewise: true };
  if (yankOnly) return msg({ ...s, register }, count > 2 ? `${count} lines yanked` : "");
  const before = snapshot(s);
  let lines = [...s.lines.slice(0, s.row), ...s.lines.slice(s.row + count)];
  if (!lines.length) lines = [""];
  const row = Math.min(s.row, lines.length - 1);
  return clampCol({ ...before, lines, row, col: firstNonBlank(lines[row]), register, message: count > 2 ? `${count} fewer lines` : "", error: false });
}

const firstNonBlank = (l: string) => Math.max(0, l.search(/\S/));

function setLine(s: VimState, text: string, col: number): VimState {
  const lines = [...s.lines];
  lines[s.row] = text;
  return { ...s, lines, col };
}

function startInsert(s: VimState, row: number, col: number, lines = s.lines): VimState {
  return { ...snapshot(s), lines, row, col, mode: "insert", message: "-- INSERT --", error: false, inserting: true };
}

/** Handles one key. Keys are the browser's names ("a", "Escape", "Enter", "ArrowUp"), with
 * "C-r" for Ctrl+R. */
export function vimKey(s: VimState, k: string): VimState {
  if (s.quit) return s;
  return key(s, k);
}

function key(s: VimState, k: string): VimState {
  if (s.mode === "insert") return insertKey(s, k);
  if (s.mode === "command" || s.mode === "search") {
    if (k === "Escape" || k === "C-c") return { ...s, mode: "normal", cmd: "", message: "", error: false };
    if (k === "Enter") return s.mode === "command" ? exCommand(s, s.cmd) : doSearch({ ...s, mode: "normal", cmd: "" }, s.cmd || s.lastSearch, s.searchBack);
    if (k === "Backspace") return s.cmd ? { ...s, cmd: s.cmd.slice(0, -1) } : { ...s, mode: "normal", cmd: "" };
    if (k.length === 1) return { ...s, cmd: s.cmd + k };
    return s;
  }
  return normalKey(s, k);
}

function insertKey(s: VimState, k: string): VimState {
  const line = s.lines[s.row];
  if (k === "Escape" || k === "C-c" || k === "C-[") return clampCol({ ...s, mode: "normal", col: Math.max(0, s.col - 1), message: "", inserting: false });
  if (k === "Enter") {
    const lines = [...s.lines];
    lines.splice(s.row, 1, line.slice(0, s.col), line.slice(s.col));
    return { ...s, lines, row: s.row + 1, col: 0 };
  }
  if (k === "Backspace") {
    if (s.col > 0) return setLine(s, line.slice(0, s.col - 1) + line.slice(s.col), s.col - 1);
    if (s.row > 0) {
      const prev = s.lines[s.row - 1];
      const lines = [...s.lines];
      lines.splice(s.row - 1, 2, prev + line);
      return { ...s, lines, row: s.row - 1, col: prev.length };
    }
    return s;
  }
  if (k === "Delete") return setLine(s, line.slice(0, s.col) + line.slice(s.col + 1), s.col);
  if (k === "Tab") return setLine(s, `${line.slice(0, s.col)}\t${line.slice(s.col)}`, s.col + 1);
  if (k === "ArrowLeft") return { ...s, col: Math.max(0, s.col - 1) };
  if (k === "ArrowRight") return { ...s, col: Math.min(line.length, s.col + 1) };
  if (k === "ArrowUp" || k === "ArrowDown") {
    const row = Math.max(0, Math.min(s.lines.length - 1, s.row + (k === "ArrowUp" ? -1 : 1)));
    return { ...s, row, col: Math.min(s.col, s.lines[row].length) };
  }
  if (k === "Home") return { ...s, col: 0 };
  if (k === "End") return { ...s, col: line.length };
  if (k.length === 1) return setLine(s, line.slice(0, s.col) + k + line.slice(s.col), s.col + 1);
  return s;
}

function normalKey(s0: VimState, k: string): VimState {
  const s = s0.message && !s0.error && s0.message !== "-- INSERT --" ? s0 : s0;
  const pending = s.pending;
  const countMatch = /^(\d*)(.*)$/.exec(pending)!;
  const count = Number(countMatch[1] || "1");
  const op = countMatch[2];
  const done = (x: VimState) => ({ ...x, pending: "" });
  const line = s.lines[s.row];

  if (k === "Escape") return done(msg(s, ""));
  if (/^\d$/.test(k) && (k !== "0" || countMatch[1])) return { ...s, pending: pending + k };

  // Second key of a two-key command.
  if (op === "d" || op === "y" || op === "c") {
    if ((op === "d" && k === "d") || (op === "y" && k === "y")) return done(deleteLines(s, count, op === "y"));
    if (op === "c" && k === "c") {
      const before = snapshot(s);
      return done({ ...startInsert(before, s.row, 0, s.lines.map((l, i) => (i === s.row ? "" : l))), undo: before.undo });
    }
    if (k === "w" || k === "e" || k === "$") {
      let end = s.col;
      if (k === "$") end = line.length;
      else {
        let cur: VimState = s;
        for (let i = 0; i < count; i++) {
          const p = k === "e" || op === "c" ? wordEnd(cur) : wordForward(cur);
          cur = { ...cur, ...p };
        }
        end = cur.row === s.row ? (k === "e" || op === "c" ? cur.col + 1 : cur.col) : line.length;
      }
      const taken = line.slice(s.col, end);
      const register = { text: [taken], linewise: false };
      if (op === "y") return done({ ...s, register });
      const before = snapshot(s);
      const next = { ...before, register, lines: s.lines.map((l, i) => (i === s.row ? l.slice(0, s.col) + l.slice(end) : l)) };
      if (op === "c") return done({ ...next, mode: "insert", message: "-- INSERT --", error: false, inserting: true });
      return done(clampCol(next));
    }
    return done(s);
  }
  if (op === "g") return done(k === "g" ? clampCol({ ...s, row: countMatch[1] ? Math.min(s.lines.length - 1, count - 1) : 0, col: 0 }) : s);
  if (op === "Z") {
    if (k === "Z") return done(modified(s) ? { ...write(s), quit: { text: joinLines(s.lines) } } : { ...s, quit: { text: s.saved } });
    if (k === "Q") return done({ ...s, quit: { text: s.saved } });
    return done(s);
  }
  if (op === "r") {
    if (k.length !== 1 || !line.length) return done(s);
    return done({ ...snapshot(s), lines: s.lines.map((l, i) => (i === s.row ? l.slice(0, s.col) + k + l.slice(s.col + 1) : l)) });
  }

  const move = (row: number, col: number) => done(clampCol({ ...s, row: Math.max(0, Math.min(s.lines.length - 1, row)) }, col));
  switch (k) {
    case "h":
    case "ArrowLeft":
    case "Backspace":
      return move(s.row, s.col - count);
    case "l":
    case "ArrowRight":
    case " ":
      return move(s.row, s.col + count);
    case "j":
    case "ArrowDown":
    case "Enter":
      return move(s.row + count, k === "Enter" ? firstNonBlank(s.lines[Math.min(s.lines.length - 1, s.row + count)]) : s.col);
    case "k":
    case "ArrowUp":
      return move(s.row - count, s.col);
    case "0":
    case "Home":
      return move(s.row, 0);
    case "^":
      return move(s.row, firstNonBlank(line));
    case "$":
    case "End":
      return move(s.row, line.length);
    case "w":
    case "b":
    case "e": {
      let cur: VimState = s;
      for (let i = 0; i < count; i++) cur = { ...cur, ...(k === "w" ? wordForward(cur) : k === "b" ? wordBack(cur) : wordEnd(cur)) };
      return move(cur.row, cur.col);
    }
    case "G":
      return move(countMatch[1] ? count - 1 : s.lines.length - 1, firstNonBlank(s.lines[countMatch[1] ? Math.min(s.lines.length - 1, count - 1) : s.lines.length - 1]));
    case "g":
    case "d":
    case "y":
    case "c":
    case "Z":
    case "r":
      return { ...s, pending: pending + k };
    case "i":
      return done(startInsert(s, s.row, s.col));
    case "a":
      return done(startInsert(s, s.row, Math.min(line.length, s.col + 1)));
    case "I":
      return done(startInsert(s, s.row, firstNonBlank(line)));
    case "A":
      return done(startInsert(s, s.row, line.length));
    case "o":
    case "O": {
      const at = k === "o" ? s.row + 1 : s.row;
      const lines = [...s.lines];
      lines.splice(at, 0, "");
      return done(startInsert(s, at, 0, lines));
    }
    case "x":
    case "Delete": {
      if (!line.length) return done(s);
      const taken = line.slice(s.col, s.col + count);
      return done(clampCol({ ...snapshot(s), register: { text: [taken], linewise: false }, lines: s.lines.map((l, i) => (i === s.row ? l.slice(0, s.col) + l.slice(s.col + count) : l)) }));
    }
    case "D":
    case "C": {
      const next = { ...snapshot(s), register: { text: [line.slice(s.col)], linewise: false }, lines: s.lines.map((l, i) => (i === s.row ? l.slice(0, s.col) : l)) };
      if (k === "C") return done({ ...next, mode: "insert", message: "-- INSERT --", error: false, inserting: true });
      return done(clampCol(next));
    }
    case "J": {
      if (s.row >= s.lines.length - 1) return done(s);
      const joined = `${line.replace(/\s+$/, "")} ${s.lines[s.row + 1].replace(/^\s+/, "")}`;
      const lines = [...s.lines];
      lines.splice(s.row, 2, joined);
      return done({ ...snapshot(s), lines, col: line.replace(/\s+$/, "").length });
    }
    case "p":
    case "P": {
      const r = s.register;
      if (!r.text.length) return done(msg(s, "E353: Nothing in register \"", true));
      if (r.linewise) {
        const at = k === "p" ? s.row + 1 : s.row;
        const lines = [...s.lines];
        const chunk = Array.from({ length: count }, () => r.text).flat();
        lines.splice(at, 0, ...chunk);
        return done({ ...snapshot(s), lines, row: at, col: firstNonBlank(lines[at]), message: chunk.length > 2 ? `${chunk.length} more lines` : "", error: false });
      }
      const at = k === "p" && line.length ? s.col + 1 : s.col;
      const t = r.text.join("").repeat(count);
      return done({ ...snapshot(s), lines: s.lines.map((l, i) => (i === s.row ? l.slice(0, at) + t + l.slice(at) : l)), col: at + t.length - 1 });
    }
    case "u": {
      if (!s.undo.length) return done(msg(s, "Already at oldest change"));
      const prev = s.undo[s.undo.length - 1];
      return done(clampCol({ ...s, lines: prev.lines, row: prev.row, col: prev.col, undo: s.undo.slice(0, -1), redo: [...s.redo, { lines: s.lines, row: s.row, col: s.col }], message: "1 change; before #" + s.undo.length, error: false }));
    }
    case "C-r": {
      if (!s.redo.length) return done(msg(s, "Already at newest change"));
      const next = s.redo[s.redo.length - 1];
      return done(clampCol({ ...s, lines: next.lines, row: next.row, col: next.col, redo: s.redo.slice(0, -1), undo: [...s.undo, { lines: s.lines, row: s.row, col: s.col }], message: "1 change; after #" + (s.undo.length + 1), error: false }));
    }
    case ":":
      return done({ ...s, mode: "command", cmd: "", message: "", error: false });
    case "/":
    case "?":
      return done({ ...s, mode: "search", cmd: "", searchBack: k === "?", message: "", error: false });
    case "n":
    case "N":
      if (!s.lastSearch) return done(msg(s, "E35: No previous regular expression", true));
      return done(doSearch(s, s.lastSearch, k === "n" ? s.searchBack : !s.searchBack));
    case "C-g":
      return done(msg(s, `"${s.path}"${modified(s) ? " [Modified]" : ""} ${s.lines.length} lines --${Math.round(((s.row + 1) / s.lines.length) * 100)}%--`));
    default:
      return done(s);
  }
}
