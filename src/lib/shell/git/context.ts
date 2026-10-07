// What every git subcommand works with: the machine, the folder it runs in, where its output
// goes, and helpers for paths, colors and the repository's current state.
import type { IFileSystem } from "just-bash";
import type { Machine } from "../machine";
import { decoder, join, normalize } from "../util";
import type { Change } from "./diff";
import { type Files, GitError, type Index, Repo } from "./repo";

export type G = {
  m: Machine;
  fs: IFileSystem;
  cwd: string;
  /** Output goes to the screen (colors, pager, editor allowed). */
  tty: boolean;
  out: string;
  err: string;
  repo?: Repo;
  /** The command's environment (for GIT_AUTHOR_NAME, GIT_AUTHOR_DATE and friends). */
  env: Map<string, string>;
};

export function color(g: G, code: string, s: string) {
  return g.tty ? `\x1b[${code}m${s}\x1b[m` : s;
}

export async function needRepo(g: G): Promise<Repo> {
  if (g.repo) return g.repo;
  const r = await Repo.find(g.fs, g.cwd, g.m.now);
  if (!r) throw new GitError("fatal: not a git repository (or any of the parent directories): .git");
  g.repo = r;
  return r;
}

export async function needWorkTree(g: G): Promise<Repo & { root: string }> {
  const r = await needRepo(g);
  if (!r.root) throw new GitError("fatal: this operation must be run in a work tree");
  return r as Repo & { root: string };
}

/** A path the learner typed, as a path inside the repository ("" for the top folder). */
export function repoPath(g: G, repo: Repo, p: string): string {
  const abs = join(g.cwd, p);
  if (abs === repo.root) return "";
  if (!abs.startsWith(`${repo.root}/`)) throw new GitError(`fatal: ${p}: '${p}' is outside repository at '${repo.root}'`);
  return abs.slice(repo.root!.length + 1);
}

/** A repository path as Git shows it: relative to the folder you're in. */
export function shown(g: G, repo: Repo, path: string): string {
  const abs = normalize(`${repo.root}/${path}`);
  const from = g.cwd.split("/").filter(Boolean);
  const to = abs.split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const rel = [...Array(from.length - i).fill(".."), ...to.slice(i)].join("/");
  return rel || ".";
}

/** Whether a pathspec ("notes", ".", "*.txt", "src/a.js") covers a repository path. */
export function pathspecMatches(spec: string, path: string): boolean {
  if (spec === "") return true;
  if (path === spec || path.startsWith(`${spec}/`)) return true;
  if (/[*?[]/.test(spec)) {
    // In Git pathspecs, * also matches across folders.
    let re = "";
    for (let i = 0; i < spec.length; i++) {
      const c = spec[i];
      if (c === "*") re += ".*";
      else if (c === "?") re += ".";
      else if (c === "[") {
        const end = spec.indexOf("]", i);
        if (end > i) {
          re += `[${spec.slice(i + 1, end).replace(/^!/, "^")}]`;
          i = end;
        } else re += "\\[";
      } else re += c.replace(/[.+^${}()|\\]/g, "\\$&");
    }
    return new RegExp(`^${re}(/.*)?$`).test(path);
  }
  return false;
}

export type State = { head: Files; index: Index; work: Files; headSha?: string; branch?: string };

export async function state(repo: Repo): Promise<State> {
  const h = await repo.head();
  return {
    head: await repo.commitFiles(h.sha),
    index: await repo.readIndex(),
    work: await repo.workFiles(),
    headSha: h.sha,
    branch: h.branch,
  };
}

export const short = (sha: string) => sha.slice(0, 7);

export async function blobText(repo: Repo, sha: string): Promise<string> {
  return decoder.decode(await repo.readBlob(sha));
}

/** The changes between two sets of files, with text for diffs and summaries. */
export async function changesBetween(repo: Repo, a: Files, b: Files, readB?: (path: string) => Promise<string>, paths?: (p: string) => boolean): Promise<Change[]> {
  const out: Change[] = [];
  const all = [...new Set([...a.keys(), ...b.keys()])].sort();
  for (const path of all) {
    if (paths && !paths(path)) continue;
    const x = a.get(path);
    const y = b.get(path);
    if (x && y && x.sha === y.sha && x.mode === y.mode) continue;
    out.push({
      path,
      old: x ? { ...x, text: await blobText(repo, x.sha) } : undefined,
      new: y ? { ...y, text: readB ? await readB(path) : await blobText(repo, y.sha) } : undefined,
    });
  }
  return out;
}

/** Folds a deleted file plus an identical added file into one rename. */
export function detectRenames(changes: Change[]): Change[] {
  const added = changes.filter((c) => !c.old && c.new);
  const out: Change[] = [];
  const used = new Set<Change>();
  for (const c of changes) {
    if (c.old && !c.new) {
      const twin = added.find((a) => !used.has(a) && a.new!.sha === c.old!.sha);
      if (twin) {
        used.add(twin);
        out.push({ path: twin.path, oldPath: c.path, old: c.old, new: twin.new });
        continue;
      }
    }
    out.push(c);
  }
  return out.filter((c) => !used.has(c)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function dateString(time: number, tz = "+0000"): string {
  const d = new Date(time * 1000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} ${tz}`;
}

export function relativeDate(time: number, now: Date): string {
  const s = Math.max(0, Math.floor(now.getTime() / 1000) - time);
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"} ago`;
  if (s < 90) return unit(s, "second");
  if (s < 90 * 60) return unit(Math.round(s / 60), "minute");
  if (s < 36 * 3600) return unit(Math.round(s / 3600), "hour");
  if (s < 14 * 86400) return unit(Math.round(s / 86400), "day");
  if (s < 70 * 86400) return unit(Math.round(s / 604800), "week");
  if (s < 365 * 86400) return unit(Math.round(s / 2592000), "month");
  return unit(Math.round(s / 31536000), "year");
}

/** Opens the editor on a file in .git (COMMIT_EDITMSG, MERGE_MSG) and returns the cleaned text. */
export async function editMessage(g: G, repo: Repo, file: string, template: string): Promise<string | null> {
  await repo.writeText(file, template);
  // Git uses core.editor, then $GIT_EDITOR / $EDITOR.
  const ed = g.env.get("GIT_EDITOR") || (await repo.config("core.editor")) || g.env.get("EDITOR") || "vi";
  const edited = await g.m.edit(`${repo.gitdir}/${file}`.replace(g.m.env.HOME ?? "", "~"), template, /\bvim?\b/.test(ed) ? "vim" : "nano");
  if (edited === null) return null;
  await repo.writeText(file, edited);
  return cleanMessage(edited);
}

/** Drops comment lines and surrounding blank lines, like Git's default cleanup. */
export function cleanMessage(text: string): string {
  const scissors = text.indexOf("# ------------------------ >8 ------------------------");
  const body = scissors >= 0 ? text.slice(0, scissors) : text;
  const lines = body
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .map((l) => l.replace(/\s+$/, ""));
  const joined = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return joined ? `${joined}\n` : "";
}
