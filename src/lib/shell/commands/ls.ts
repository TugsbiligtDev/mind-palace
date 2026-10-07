// ls, written for the practice terminal so `ls -l` shows each file's real permissions and
// owner (the built-in one prints the same "-rw-r--r-- user" for everything). Output follows
// GNU ls on Ubuntu: columns on screen, one name per line into a pipe, `total` in 1K blocks.
import type { Command, FsStat } from "just-bash";
import type { Machine } from "../machine";
import { fail, join, ok, parseArgs } from "../util";

type Entry = { name: string; path: string; st: FsStat; target?: string };

export function modeString(st: FsStat): string {
  const type = st.isSymbolicLink ? "l" : st.isDirectory ? "d" : "-";
  const m = st.mode;
  const rwx = (b: number, special: boolean, s: string) =>
    `${b & 4 ? "r" : "-"}${b & 2 ? "w" : "-"}${special ? ((b & 1) ? s : s.toUpperCase()) : b & 1 ? "x" : "-"}`;
  return (
    type +
    rwx((m >> 6) & 7, (m & 0o4000) !== 0, "s") +
    rwx((m >> 3) & 7, (m & 0o2000) !== 0, "s") +
    rwx(m & 7, (m & 0o1000) !== 0, "t")
  );
}

export function humanSize(n: number): string {
  if (n < 1024) return String(n);
  const units = ["K", "M", "G", "T"];
  let v = n;
  let i = -1;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // GNU rounds up, with one decimal below 10.
  const s = v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v));
  return s + units[i];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateString(d: Date, now: Date): string {
  const recent = Math.abs(now.getTime() - d.getTime()) < 182 * 24 * 3600 * 1000;
  const day = String(d.getDate()).padStart(2, " ");
  const tail = recent ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${day} ${tail}`;
}

// Names sort the way Ubuntu's ls does in English: ignoring case and leading dots.
function sortKey(name: string) {
  return name.replace(/^\.+/, "").toLowerCase();
}

function byName(a: Entry, b: Entry) {
  const ka = sortKey(a.name);
  const kb = sortKey(b.name);
  return ka < kb ? -1 : ka > kb ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

const size = (e: Entry) => (e.st.isDirectory ? 4096 : e.st.size);
const blocks = (e: Entry) => (e.st.isDirectory ? 4 : Math.ceil(e.st.size / 4096) * 4);

// ANSI colors like Ubuntu's default: folders bold blue, programs bold green, links bold cyan.
function colored(e: Entry, name: string, color: boolean) {
  if (!color) return name;
  if (e.st.isSymbolicLink) return `\x1b[1;36m${name}\x1b[0m`;
  if (e.st.isDirectory) return `\x1b[1;34m${name}\x1b[0m`;
  if (e.st.mode & 0o111) return `\x1b[1;32m${name}\x1b[0m`;
  return name;
}

function classify(e: Entry) {
  if (e.st.isSymbolicLink) return "@";
  if (e.st.isDirectory) return "/";
  if (e.st.mode & 0o111) return "*";
  return "";
}

// GNU's column layout: as many columns as fit in 80 characters, filled top to bottom.
function columns(names: string[], widths: number[], width = 80): string {
  if (names.length === 0) return "";
  for (let cols = Math.min(names.length, Math.floor(width / 3)); cols > 1; cols--) {
    const rows = Math.ceil(names.length / cols);
    if (Math.ceil(names.length / rows) < cols) continue;
    const colWidths: number[] = [];
    for (let c = 0; c < cols; c++) {
      let w = 0;
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        if (i < names.length) w = Math.max(w, widths[i]);
      }
      colWidths.push(w);
    }
    const total = colWidths.reduce((a, w) => a + w, 0) + 2 * (cols - 1);
    if (total > width) continue;
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < cols; c++) {
        const i = c * rows + r;
        if (i >= names.length) continue;
        const last = c === cols - 1 || (c + 1) * rows + r >= names.length;
        line += last ? names[i] : names[i] + " ".repeat(colWidths[c] - widths[i] + 2);
      }
      lines.push(line);
    }
    return lines.join("\n") + "\n";
  }
  return names.join("\n") + "\n";
}

export function lsCommand(m: Machine): Command {
  return {
    name: "ls",
    async execute(args, ctx) {
      const { flags, long, operands } = parseArgs(args);
      if (long.includes("help"))
        return ok(
          "Usage: ls [OPTION]... [FILE]...\nList information about the FILEs (the current directory by default).\n\n  -a, --all          do not ignore entries starting with .\n  -A, --almost-all   do not list implied . and ..\n  -d, --directory    list directories themselves, not their contents\n  -F, --classify     append indicator (one of */@) to entries\n  -h, --human-readable  with -l, print sizes like 1K 234M 2G\n  -l                 use a long listing format\n  -r, --reverse      reverse order while sorting\n  -R, --recursive    list subdirectories recursively\n  -S                 sort by file size, largest first\n  -t                 sort by time, newest first\n  -1                 list one file per line\n",
        );
      for (const l of long) {
        if (l === "all") flags.add("a");
        else if (l === "almost-all") flags.add("A");
        else if (l === "human-readable") flags.add("h");
        else if (l === "reverse") flags.add("r");
        else if (l === "recursive") flags.add("R");
        else if (l === "directory") flags.add("d");
        else if (l === "classify") flags.add("F");
        else if (l.startsWith("color")) continue;
        else return fail(`ls: unrecognized option '--${l}'\nTry 'ls --help' for more information.`, 2);
      }
      const unknown = [...flags].find((f) => !"aAdFhlrRSt1".includes(f));
      if (unknown) return fail(`ls: invalid option -- '${unknown}'\nTry 'ls --help' for more information.`, 2);

      const tty = ctx.env.get("MP_TTY") === "1";
      const color = tty;
      const longFmt = flags.has("l");
      const now = m.now();
      let stderr = "";
      let exitCode = 0;

      const stat = async (path: string, name: string): Promise<Entry | undefined> => {
        try {
          const st = await ctx.fs.lstat(path);
          const target = st.isSymbolicLink ? await ctx.fs.readlink(path).catch(() => undefined) : undefined;
          return { name, path, st, target };
        } catch {
          return undefined;
        }
      };

      const sorted = (list: Entry[]) => {
        const out = [...list].sort(byName);
        if (flags.has("t")) out.sort((a, b) => b.st.mtime.getTime() - a.st.mtime.getTime());
        if (flags.has("S")) out.sort((a, b) => size(b) - size(a));
        if (flags.has("r")) out.reverse();
        return out;
      };

      const render = (list: Entry[], withTotal: boolean): string => {
        if (longFmt) {
          const rows = list.map((e) => {
            const o = m.perms.owner(e.path);
            const links = e.st.isDirectory ? 2 : 1;
            const sz = flags.has("h") ? humanSize(size(e)) : String(size(e));
            let name = colored(e, e.name, color) + (flags.has("F") ? classify(e) : "");
            if (e.target !== undefined) name += ` -> ${e.target}`;
            return [modeString(e.st), String(links), o.user, o.group, sz, dateString(e.st.mtime, now), name];
          });
          const w = [1, 2, 3, 4].map((c) => Math.max(0, ...rows.map((r) => r[c].length)));
          const lines = rows.map((r) => `${r[0]} ${r[1].padStart(w[0])} ${r[2].padEnd(w[1])} ${r[3].padEnd(w[2])} ${r[4].padStart(w[3])} ${r[5]} ${r[6]}`);
          const total = withTotal ? `total ${list.reduce((a, e) => a + blocks(e), 0)}\n` : "";
          return total + lines.map((l) => l + "\n").join("");
        }
        const names = list.map((e) => e.name + (flags.has("F") ? classify(e) : ""));
        if (!tty || flags.has("1")) return names.map((n) => n + "\n").join("");
        // Like GNU ls, names with spaces are shown in quotes on screen.
        const shown = names.map((n) => (/[\s'"$]/.test(n) ? `'${n.replace(/'/g, `'\\''`)}'` : n));
        const widths = shown.map((n) => n.length);
        return columns(shown.map((n, i) => colored(list[i], n, color)), widths);
      };

      const listDir = async (path: string): Promise<Entry[] | undefined> => {
        let names: string[];
        try {
          names = await ctx.fs.readdir(path);
        } catch (e) {
          const denied = (e as { code?: string }).code === "EACCES";
          stderr += `ls: cannot open directory '${path}': ${denied ? "Permission denied" : "No such file or directory"}\n`;
          exitCode = 2;
          return undefined;
        }
        const entries: Entry[] = [];
        if (flags.has("a")) {
          for (const [n, p] of [[".", path], ["..", join(path, "..")]]) {
            const e = await stat(p, n);
            if (e) entries.push(e);
          }
        }
        for (const n of names) {
          if (n.startsWith(".") && !flags.has("a") && !flags.has("A")) continue;
          const e = await stat(join(path, n), n);
          if (e) entries.push(e);
        }
        return entries;
      };

      const targets = operands.length ? operands : ["."];
      const files: Entry[] = [];
      const dirs: Entry[] = [];
      for (const t of targets) {
        const path = join(ctx.cwd, t);
        const e = await stat(path, t);
        if (!e) {
          stderr += `ls: cannot access '${t}': No such file or directory\n`;
          exitCode = 2;
          continue;
        }
        // A link to a folder is listed as the folder, unless -l or -d asks about the link itself.
        let isDir = e.st.isDirectory;
        if (e.st.isSymbolicLink && !longFmt && !flags.has("d")) isDir = await ctx.fs.stat(path).then((s) => s.isDirectory).catch(() => false);
        if (isDir && !flags.has("d")) dirs.push(e);
        else files.push(e);
      }

      let out = "";
      if (files.length) out += render(sorted(files), false);
      const showHeaders = targets.length > 1 || flags.has("R");
      const sortedDirs = sorted(dirs);
      const queue = sortedDirs.map((d) => ({ label: d.name, path: d.path }));
      let first = files.length === 0;
      while (queue.length) {
        const d = queue.shift()!;
        const entries = await listDir(d.path);
        if (!entries) continue;
        if (showHeaders) out += `${first ? "" : "\n"}${d.label}:\n`;
        first = false;
        const list = sorted(entries);
        out += render(list, true);
        if (flags.has("R")) {
          const subs = list.filter((e) => e.st.isDirectory && e.name !== "." && e.name !== "..");
          queue.unshift(...subs.map((s) => ({ label: `${d.label === "." ? "." : d.label.replace(/\/$/, "")}/${s.name}`, path: s.path })));
        }
      }
      return { stdout: out, stderr, exitCode };
    },
  };
}
