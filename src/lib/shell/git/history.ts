// git log, show and diff, plus the small inspection commands lessons and checks use:
// rev-parse, ls-files, cat-file and reflog.
import { decoder, parseArgs } from "../util";
import { type G, blobText, changesBetween, color, dateString, detectRenames, needRepo, needWorkTree, pathspecMatches, relativeDate, repoPath, short, state } from "./context";
import { type Change, diffStat, unifiedDiff } from "./diff";
import { renderGraph } from "./graph";
import { type Commit, parseTag, parseTree, subject } from "./objects";
import { type Files, GitError, Repo } from "./repo";
import { upstreamOf } from "./status";

// ----- decorations: "(HEAD -> main, origin/main, tag: v1.0)" -----

async function decorations(repo: Repo): Promise<Map<string, { text: string; code: string }[]>> {
  const out = new Map<string, { text: string; code: string }[]>();
  const add = (sha: string, text: string, code: string) => {
    if (!out.has(sha)) out.set(sha, []);
    out.get(sha)!.push({ text, code });
  };
  const h = await repo.head();
  if (h.sha && !h.branch) add(h.sha, "HEAD", "1;36");
  for (const r of await repo.listRefs("refs/heads")) {
    const name = r.name.slice(11);
    if (name === h.branch) add(r.sha, `HEAD -> ${name}`, "1;36");
    else add(r.sha, name, "1;32");
  }
  for (const r of await repo.listRefs("refs/remotes")) add(r.sha, r.name.slice(13), "1;31");
  for (const r of await repo.listRefs("refs/tags")) add(await repo.peel(r.sha), `tag: ${r.name.slice(10)}`, "1;33");
  // "HEAD -> main" comes first, then local branches, then remote ones, then tags.
  for (const list of out.values()) {
    const rank = (t: string) => (t.startsWith("HEAD") ? 0 : t.startsWith("tag: ") ? 4 : t.endsWith("/HEAD") ? 3 : t.includes("/") ? 2 : 1);
    list.sort((a, b) => rank(a.text) - rank(b.text));
  }
  return out;
}

function decorate(g: G, list: { text: string; code: string }[] | undefined, wrap = true): string {
  if (!list?.length) return "";
  const inner = list
    .map((d) => {
      if (d.text.startsWith("HEAD -> ")) return `${color(g, "1;36", "HEAD ->")} ${color(g, "1;32", d.text.slice(8))}`;
      return color(g, d.code, d.text);
    })
    .join(color(g, "33", ", "));
  return wrap ? `${color(g, "33", " (")}${inner}${color(g, "33", ")")}` : inner;
}

// ----- walking history -----

type Walked = { sha: string; c: Commit };

/** Commits reachable from `starts`, newest first, children before their parents. */
export async function walk(repo: Repo, starts: string[], exclude: Set<string> = new Set()): Promise<Walked[]> {
  const out: Walked[] = [];
  const seen = new Set<string>(exclude);
  const queue: Walked[] = [];
  const push = async (sha: string) => {
    if (seen.has(sha)) return;
    seen.add(sha);
    queue.push({ sha, c: await repo.readCommit(sha) });
  };
  for (const s of starts) await push(s);
  // Count how many shown children each commit has, so a parent never prints before a child.
  while (queue.length) {
    queue.sort((a, b) => b.c.committer.time - a.c.committer.time);
    const next = queue.shift()!;
    out.push(next);
    for (const p of next.c.parents) {
      try {
        await push(p);
      } catch {
        /* missing parent */
      }
    }
  }
  // Same-second commits: keep children before parents (a stable topological fix-up).
  const pos = new Map(out.map((w, i) => [w.sha, i]));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      for (const p of out[i].c.parents) {
        const j = pos.get(p);
        if (j !== undefined && j < i) {
          const [moved] = out.splice(j, 1);
          out.splice(i, 0, moved);
          out.forEach((w, k) => pos.set(w.sha, k));
          changed = true;
        }
      }
    }
  }
  return out;
}

async function commitChanges(repo: Repo, c: Commit, paths?: (p: string) => boolean): Promise<Change[]> {
  const before = c.parents[0] ? await repo.commitFiles(c.parents[0]) : new Map();
  const after = await repo.flatten(c.tree);
  return detectRenames(await changesBetween(repo, before, after, undefined, paths));
}

/** --since/--until: "2026-09-01", "2026-09-01 12:00", "2 weeks ago", "yesterday", "3 days". */
export function parseDate(v: string, now: number): number | undefined {
  const t = v.trim().toLowerCase();
  if (t === "now") return now;
  if (t === "today" || t === "midnight") return now - (now % 86400);
  if (t === "yesterday") return now - (now % 86400) - 86400;
  const rel = /^(\d+)[.\s]*(second|minute|hour|day|week|month|year)s?(\.ago|\s+ago)?$/.exec(t);
  if (rel) return now - Number(rel[1]) * { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }[rel[2]]!;
  const abs = /^(\d{4}-\d{2}-\d{2})(?:[ t](\d{2}:\d{2}(?::\d{2})?))?$/.exec(t);
  if (abs) return Math.floor(Date.parse(`${abs[1]}T${abs[2] ? (abs[2].length === 5 ? `${abs[2]}:00` : abs[2]) : "00:00:00"}Z`) / 1000);
  return undefined;
}

function fmtDate(time: number, tz: string, now: Date, mode?: string): string {
  if (mode === "short") return new Date(time * 1000).toISOString().slice(0, 10);
  if (mode === "relative") return relativeDate(time, now);
  if (mode === "iso" || mode === "iso8601") return `${new Date(time * 1000).toISOString().slice(0, 19).replace("T", " ")} ${tz}`;
  return dateString(time, tz);
}

function formatPlaceholder(g: G, fmt: string, sha: string, c: Commit, deco: ReturnType<typeof decorate>, decoBare: string, now: Date, dateMode?: string): string {
  return fmt.replace(/%(H|h|s|an|ae|ad|ar|cn|ce|cd|cr|d|D|P|p|n|b|B|T|t|%|C\(\w+\)|Creset|Cred|Cgreen|Cblue|Cyellow)/g, (_, k: string) => {
    switch (k) {
      case "H":
        return sha;
      case "h":
        return short(sha);
      case "s":
        return subject(c);
      case "an":
        return c.author.name;
      case "ae":
        return c.author.email;
      case "ad":
        return fmtDate(c.author.time, c.author.tz, now, dateMode);
      case "ar":
        return relativeDate(c.author.time, now);
      case "cn":
        return c.committer.name;
      case "ce":
        return c.committer.email;
      case "cd":
        return fmtDate(c.committer.time, c.committer.tz, now, dateMode);
      case "cr":
        return relativeDate(c.committer.time, now);
      case "d":
        return deco;
      case "D":
        return decoBare;
      case "P":
        return c.parents.join(" ");
      case "p":
        return c.parents.map(short).join(" ");
      case "T":
        return c.tree;
      case "t":
        return short(c.tree);
      case "n":
        return "\n";
      case "b":
        return c.message.split("\n").slice(2).join("\n").replace(/\n+$/, "\n").replace(/^\n$/, "");
      case "B":
        return c.message;
      case "%":
        return "%";
      default:
        if (!g.tty) return "";
        if (k === "Creset") return "\x1b[m";
        const name = k.startsWith("C(") ? k.slice(2, -1) : k.slice(1);
        const codes: Record<string, string> = { red: "31", green: "32", yellow: "33", blue: "34", magenta: "35", cyan: "36", bold: "1", reset: "" };
        return `\x1b[${codes[name] ?? ""}m`;
    }
  });
}

/** Shows text in the pager when it's longer than a screen, like Git does in a terminal. */
async function maybePage(g: G, text: string, title: string) {
  if (g.tty && g.m.interactive && text.split("\n").length > 26) {
    await g.m.page(text, title);
    return;
  }
  g.out += text;
}

export async function gitLog(g: G, args: string[]) {
  const repo = await needRepo(g);
  const dash = args.indexOf("--");
  const pathArgs = dash >= 0 ? args.slice(dash + 1) : [];
  const opts = dash >= 0 ? args.slice(0, dash) : args;
  let max = Infinity;
  let format: string | undefined;
  let oneline = false;
  let graph = false;
  let all = false;
  let stat = false;
  let patch = false;
  let reverse = false;
  let author: string | undefined;
  let grep: string | undefined;
  let decorateOn: boolean | undefined;
  let since: number | undefined;
  let until: number | undefined;
  let pickaxe: string | undefined;
  let pickaxeRe: RegExp | undefined;
  let firstParent = false;
  let merges: boolean | undefined;
  let names: "only" | "status" | undefined;
  let dateMode: string | undefined;
  const nowSec = Math.floor(g.m.now().getTime() / 1000);
  const revs: string[] = [];
  for (let i = 0; i < opts.length; i++) {
    const a = opts[i];
    if (a === "-n") max = Number(opts[++i]);
    else if (/^-n\d+$/.test(a)) max = Number(a.slice(2));
    else if (/^-\d+$/.test(a)) max = Number(a.slice(1));
    else if (a.startsWith("--max-count=")) max = Number(a.slice(12));
    else if (a === "--oneline") oneline = true;
    else if (a === "--graph") graph = true;
    else if (a === "--all") all = true;
    else if (a === "--stat") stat = true;
    else if (a === "-p" || a === "--patch") patch = true;
    else if (a === "--reverse") reverse = true;
    else if (a === "--decorate") decorateOn = true;
    else if (a === "--no-decorate") decorateOn = false;
    else if (a.startsWith("--author=")) author = a.slice(9);
    else if (a === "--author") author = opts[++i];
    else if (a.startsWith("--grep=")) grep = a.slice(7);
    else if (a === "--grep") grep = opts[++i];
    else if (/^--(since|after|until|before)(=|$)/.test(a)) {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : opts[++i];
      const t = parseDate(v, nowSec);
      if (t === undefined) throw new GitError(`fatal: invalid date: ${v}`);
      if (/^--(since|after)/.test(a)) since = t;
      else until = t;
    } else if (a.startsWith("-S")) pickaxe = a.slice(2) || opts[++i];
    else if (a.startsWith("-G")) pickaxeRe = new RegExp(a.slice(2) || opts[++i]);
    else if (a === "--first-parent") firstParent = true;
    else if (a === "--merges") merges = true;
    else if (a === "--no-merges") merges = false;
    else if (a === "--name-only") names = "only";
    else if (a === "--name-status") names = "status";
    else if (a.startsWith("--date=")) dateMode = a.slice(7);
    else if (a.startsWith("--format=") || a.startsWith("--pretty=")) {
      const v = a.slice(a.indexOf("=") + 1);
      if (v === "oneline") oneline = true;
      else format = v.replace(/^(format|tformat):/, "");
    } else if (a === "--no-pager" || a === "--no-color") continue;
    else if (a.startsWith("-")) throw new GitError(`fatal: unrecognized argument: ${a}`);
    else revs.push(a);
  }
  // A word that isn't a revision but is a file in the repository is a path, like "git log notes.txt".
  const paths = [...pathArgs];
  const startRevs: string[] = [];
  const excluded: string[] = [];
  const symmetric: string[] = [];
  for (const r of revs) {
    if (r.includes("...")) {
      const [a, b] = r.split("...");
      startRevs.push(a || "HEAD", b || "HEAD");
      symmetric.push(a || "HEAD", b || "HEAD");
    } else if (r.includes("..")) {
      const [a, b] = r.split("..");
      excluded.push(a || "HEAD");
      startRevs.push(b || "HEAD");
    } else if (r.startsWith("^")) excluded.push(r.slice(1));
    else if (await repo.resolve(r)) startRevs.push(r);
    else if (repo.root) paths.push(r);
    else throw new GitError(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.`);
  }
  const h = await repo.head();
  const starts: string[] = [];
  if (all) {
    for (const r of [...(await repo.listRefs("refs/heads")), ...(await repo.listRefs("refs/remotes")), ...(await repo.listRefs("refs/tags"))]) {
      if (r.name.endsWith("/HEAD")) continue;
      starts.push(await repo.peel(r.sha));
    }
  }
  if (all && h.sha) starts.push(h.sha);
  for (const r of startRevs.length ? startRevs : all ? [] : ["HEAD"]) {
    const sha = await repo.resolve(r);
    if (!sha) {
      if (r === "HEAD" && !h.sha) throw new GitError(`fatal: your current branch '${h.branch}' does not have any commits yet`);
      throw new GitError(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
    }
    starts.push(sha);
  }
  const exclude = new Set<string>();
  for (const e of excluded) {
    const sha = await repo.resolve(e);
    if (!sha) throw new GitError(`fatal: ambiguous argument '${e}': unknown revision or path not in the working tree.`);
    for (const w of await walk(repo, [sha])) exclude.add(w.sha);
  }
  const specs = repo.root ? paths.map((p) => repoPath(g, repo, p)) : paths;
  const pathFilter = specs.length ? (p: string) => specs.some((s) => pathspecMatches(s, p)) : undefined;

  if (symmetric.length === 2) {
    const A = new Set((await walk(repo, [(await repo.resolve(symmetric[0]))!])).map((w) => w.sha));
    const B = new Set((await walk(repo, [(await repo.resolve(symmetric[1]))!])).map((w) => w.sha));
    for (const x of A) if (B.has(x)) exclude.add(x);
  }
  let list = await walk(repo, [...new Set(starts)], exclude);
  if (firstParent) {
    const keep = new Set<string>();
    for (const st of starts) {
      let cur: string | undefined = st;
      while (cur && !keep.has(cur) && !exclude.has(cur)) {
        keep.add(cur);
        cur = (await repo.readCommit(cur)).parents[0];
      }
    }
    list = list.filter((w) => keep.has(w.sha));
  }
  if (merges !== undefined) list = list.filter((w) => (w.c.parents.length > 1) === merges);
  if (since !== undefined) list = list.filter((w) => w.c.committer.time >= since!);
  if (until !== undefined) list = list.filter((w) => w.c.committer.time <= until!);
  if (pickaxe !== undefined || pickaxeRe) {
    const kept: Walked[] = [];
    for (const w of list) {
      const changes = await commitChanges(repo, w.c, pathFilter);
      const hit = changes.some((c) => {
        if (pickaxe !== undefined) {
          const count = (t?: string) => (t ? t.split(pickaxe!).length - 1 : 0);
          return count(c.old?.text) !== count(c.new?.text);
        }
        const oldL = (c.old?.text ?? "").split("\n");
        const newL = (c.new?.text ?? "").split("\n");
        const added = newL.filter((l) => !oldL.includes(l));
        const removed = oldL.filter((l) => !newL.includes(l));
        return [...added, ...removed].some((l) => pickaxeRe!.test(l));
      });
      if (hit) kept.push(w);
    }
    list = kept;
  }
  if (author) list = list.filter((w) => new RegExp(author!, "i").test(`${w.c.author.name} <${w.c.author.email}>`));
  if (grep) list = list.filter((w) => new RegExp(grep!).test(w.c.message));
  if (pathFilter) {
    const kept: Walked[] = [];
    for (const w of list) if ((await commitChanges(repo, w.c, pathFilter)).length) kept.push(w);
    list = kept;
  }
  list = list.slice(0, max);
  if (reverse) list.reverse();

  const decos = decorateOn === false ? new Map() : await decorations(repo);
  const now = g.m.now();
  const entries: { sha: string; parents: string[]; lines: string[] }[] = [];
  for (const w of list) {
    const d = decos.get(w.sha);
    let text: string;
    if (format !== undefined) text = formatPlaceholder(g, format, w.sha, w.c, decorate(g, d), decorate(g, d, false), now, dateMode);
    else if (oneline) text = `${color(g, "33", short(w.sha))}${decorate(g, d)} ${subject(w.c)}`;
    else {
      const lines = [`${color(g, "33", `commit ${w.sha}`)}${decorate(g, d)}`];
      if (w.c.parents.length > 1) lines.push(`Merge: ${w.c.parents.map(short).join(" ")}`);
      lines.push(`Author: ${w.c.author.name} <${w.c.author.email}>`, `Date:   ${fmtDate(w.c.author.time, w.c.author.tz, now, dateMode)}`, "");
      for (const l of w.c.message.replace(/\n+$/, "").split("\n")) lines.push(l ? `    ${l}` : "");
      text = lines.join("\n");
    }
    if (names) {
      const changes = w.c.parents.length > 1 ? [] : await commitChanges(repo, w.c, pathFilter);
      if (changes.length) text += `\n${oneline || format !== undefined ? "" : "\n"}${changes.map((c) => (names === "only" ? c.path : `${c.oldPath ? "R100" : !c.old ? "A" : !c.new ? "D" : "M"}\t${c.oldPath ? `${c.oldPath}\t` : ""}${c.path}`)).join("\n")}`;
    }
    if (stat || patch) {
      const changes = w.c.parents.length > 1 ? [] : await commitChanges(repo, w.c, pathFilter);
      if (changes.length) {
        if (stat) text += `\n${oneline ? "" : "\n"}${diffStat(changes, g.tty).trimEnd()}`;
        if (patch) text += `\n${oneline ? "" : "\n"}${changes.map((c) => unifiedDiff(c, g.tty)).join("").trimEnd()}`;
      }
    }
    entries.push({ sha: w.sha, parents: w.c.parents, lines: text.split("\n") });
  }
  let out: string;
  if (graph) {
    // In the full format, a blank line separates commits; the graph draws its bars through it.
    out = renderGraph(entries.map((e, i) => ({ ...e, lines: !oneline && format === undefined && i < entries.length - 1 ? [...e.lines, ""] : e.lines })));
  } else {
    const sep = !oneline && format === undefined ? "\n\n" : "\n";
    out = entries.map((e) => e.lines.join("\n")).join(sep);
    if (out) out += "\n";
  }
  await maybePage(g, out, "git log");
}

// ----- diff -----

export async function gitDiff(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const dash = args.indexOf("--");
  const pathArgs = dash >= 0 ? args.slice(dash + 1) : [];
  const opts = dash >= 0 ? args.slice(0, dash) : args;
  const { long, operands } = parseArgs(opts);
  const cached = long.includes("staged") || long.includes("cached");
  const stat = long.includes("stat");
  const nameOnly = long.includes("name-only");
  const nameStatus = long.includes("name-status");
  const s = await state(repo);
  const revs: string[] = [];
  const paths = [...pathArgs];
  for (const o of operands) {
    if (o.includes("...")) {
      const [a, b] = o.split("...").map((x) => x || "HEAD");
      const { mergeBase } = await import("./branching");
      const base = await mergeBase(repo, (await repo.resolve(a))!, (await repo.resolve(b))!);
      revs.push(base ?? a, b);
    } else if (o.includes("..")) revs.push(...o.split(/\.{2}/).map((x) => x || "HEAD"));
    else if (await repo.resolve(o)) revs.push(o);
    else paths.push(o);
  }
  const specs = paths.map((p) => repoPath(g, repo, p));
  const filter = specs.length ? (p: string) => specs.some((sp) => pathspecMatches(sp, p)) : undefined;
  const files = async (rev: string): Promise<Files> => {
    const sha = await repo.resolve(rev);
    if (!sha) throw new GitError(`fatal: bad revision '${rev}'`);
    return repo.commitFiles(sha);
  };
  const indexFiles: Files = new Map(Object.entries(s.index.entries));
  const workText = async (p: string) => decoder.decode(await repo.readWork(p));
  let changes: Change[];
  if (revs.length >= 2) changes = await changesBetween(repo, await files(revs[0]), await files(revs[1]), undefined, filter);
  else if (revs.length === 1) {
    const base = await files(revs[0]);
    if (cached) changes = await changesBetween(repo, base, indexFiles, undefined, filter);
    else {
      // Commit against the working folder: tracked files only.
      const tracked = new Set([...indexFiles.keys(), ...base.keys()]);
      const work: Files = new Map([...s.work].filter(([p]) => tracked.has(p)));
      changes = await changesBetween(repo, base, work, workText, filter);
    }
  } else if (cached) changes = await changesBetween(repo, s.head, indexFiles, undefined, filter);
  else {
    const work: Files = new Map([...s.work].filter(([p]) => indexFiles.has(p)));
    changes = await changesBetween(repo, indexFiles, work, workText, filter);
    for (const p of Object.keys(s.index.conflicts)) if (!filter || filter(p)) g.out += `* Unmerged path ${p}\n`;
  }
  if (cached || revs.length) changes = detectRenames(changes);
  let out: string;
  if (nameOnly) out = changes.map((c) => `${c.path}\n`).join("");
  else if (nameStatus) out = changes.map((c) => `${c.oldPath ? "R100" : !c.old ? "A" : !c.new ? "D" : "M"}\t${c.oldPath ? `${c.oldPath}\t` : ""}${c.path}\n`).join("");
  else if (stat) out = diffStat(changes, g.tty);
  else out = changes.map((c) => unifiedDiff(c, g.tty)).join("");
  await maybePage(g, out, "git diff");
}

// ----- show -----

export async function gitShow(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { long, operands } = parseArgs(args);
  const target = operands[0] ?? "HEAD";
  // git show REV:path prints a file as it was in that commit.
  const colon = target.indexOf(":");
  if (colon >= 0) {
    const sha = await repo.resolve(target.slice(0, colon) || "HEAD");
    if (!sha) throw new GitError(`fatal: invalid object name '${target.slice(0, colon)}'.`);
    const path = target.slice(colon + 1).replace(/^\.\//, "");
    const f = (await repo.commitFiles(sha)).get(path);
    if (!f) throw new GitError(`fatal: path '${path}' does not exist in '${target.slice(0, colon) || "HEAD"}'`);
    g.out += await blobText(repo, f.sha);
    return;
  }
  const sha = await repo.resolve(target);
  if (!sha) throw new GitError(`fatal: ambiguous argument '${target}': unknown revision or path not in the working tree.`);
  // An annotated tag shows the tag itself first.
  let tagHead = "";
  const tagRef = await repo.readRef(`refs/tags/${target}`);
  if (tagRef) {
    const o = await repo.readObject(tagRef);
    if (o.type === "tag") {
      const t = parseTag(o.content);
      tagHead = `${color(g, "33", `tag ${t.tag}`)}
Tagger: ${t.tagger.name} <${t.tagger.email}>
Date:   ${dateString(t.tagger.time, t.tagger.tz)}

${t.message.replace(/\n+$/, "")}

`;
    }
  }
  const c = await repo.readCommit(sha);
  const d = (await decorations(repo)).get(sha);
  const oneline = long.includes("oneline");
  let out = oneline
    ? `${color(g, "33", short(sha))}${decorate(g, d)} ${subject(c)}\n`
    : `${color(g, "33", `commit ${sha}`)}${decorate(g, d)}\n${c.parents.length > 1 ? `Merge: ${c.parents.map(short).join(" ")}\n` : ""}Author: ${c.author.name} <${c.author.email}>\nDate:   ${dateString(c.author.time, c.author.tz)}\n\n${c.message
        .replace(/\n+$/, "")
        .split("\n")
        .map((l) => (l ? `    ${l}` : ""))
        .join("\n")}\n`;
  if (c.parents.length <= 1) {
    const changes = await commitChanges(repo, c);
    if (changes.length) {
      if (long.includes("stat")) out += `\n${diffStat(changes, g.tty)}`;
      else if (!long.includes("no-patch")) out += `\n${changes.map((ch) => unifiedDiff(ch, g.tty)).join("")}`;
    }
  }
  await maybePage(g, tagHead + out, "git show");
}

// ----- small helpers -----

export async function gitRevParse(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { long, operands } = parseArgs(args);
  if (long.includes("show-toplevel")) {
    if (!repo.root) throw new GitError("fatal: this operation must be run in a work tree");
    g.out += `${repo.root}\n`;
    return;
  }
  if (long.includes("is-inside-work-tree")) {
    g.out += `${!!repo.root}\n`;
    return;
  }
  if (long.includes("git-dir")) {
    g.out += `${repo.gitdir}\n`;
    return;
  }
  for (const o of operands) {
    if (long.includes("abbrev-ref") && (o === "HEAD" || o === "@")) {
      const h = await repo.head();
      g.out += `${h.branch ?? "HEAD"}\n`;
      continue;
    }
    if (long.includes("abbrev-ref") && o.endsWith("@{u}")) {
      const h = await repo.head();
      const up = h.branch ? await upstreamOf(repo, h.branch) : undefined;
      if (!up) throw new GitError("fatal: no upstream configured for branch");
      g.out += `${up}\n`;
      continue;
    }
    const sha = await repo.resolve(o);
    if (!sha) throw new GitError(`fatal: ambiguous argument '${o}': unknown revision or path not in the working tree.`);
    g.out += `${long.includes("short") ? short(sha) : sha}\n`;
  }
}

export async function gitLsFiles(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long } = parseArgs(args);
  const idx = await repo.readIndex();
  if (flags.has("o") || long.includes("others")) {
    const work = await repo.workFiles({ hash: false });
    const rules = long.includes("exclude-standard") ? await repo.ignoreRules() : [];
    for (const p of [...work.keys()].sort()) if (!(p in idx.entries) && !Repo.isIgnored(rules, p, false)) g.out += `${p}\n`;
    return;
  }
  if (flags.has("u") || long.includes("unmerged")) {
    for (const p of Object.keys(idx.conflicts).sort()) g.out += `${p}\n`;
    return;
  }
  for (const p of [...new Set([...Object.keys(idx.entries), ...Object.keys(idx.conflicts)])].sort()) {
    if (flags.has("s")) {
      const e = idx.entries[p];
      if (e) g.out += `${e.mode} ${e.sha} 0\t${p}\n`;
    } else g.out += `${p}\n`;
  }
}

export async function gitCatFile(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { flags, operands } = parseArgs(args);
  const name = operands.at(-1);
  if (!name) throw new GitError("usage: git cat-file (-t | -s | -e | -p) <object>", 129);
  // A tag's own object (not the commit it points at), as real cat-file shows it.
  const sha = (/^[\w./-]+$/.test(name) ? await repo.readRef(`refs/tags/${name}`) : undefined) ?? (await repo.resolve(name));
  if (!sha) throw new GitError(`fatal: Not a valid object name ${name}`);
  const o = await repo.readObject(sha);
  if (flags.has("t")) g.out += `${o.type}\n`;
  else if (flags.has("s")) g.out += `${o.content.length}\n`;
  else if (flags.has("e")) return;
  else if (o.type === "tree")
    g.out += parseTree(o.content)
      .map((e) => `${e.mode.padStart(6, "0")} ${e.mode === "40000" ? "tree" : "blob"} ${e.sha}\t${e.name}\n`)
      .join("");
  else g.out += decoder.decode(o.content);
}

export async function gitReflog(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { operands } = parseArgs(args.filter((a, i) => !(args[i - 1] === "-n")), "n");
  const ref = operands.find((o) => o !== "show" && !/^\d+$/.test(o)) ?? "HEAD";
  const file = ref === "HEAD" ? "logs/HEAD" : ref === "stash" ? "logs/refs/stash" : `logs/refs/heads/${ref}`;
  const text = (await repo.readText(file)) ?? "";
  const nArg = args.find((a) => /^-n?\d+$/.test(a)) ?? (args.includes("-n") ? `-${args[args.indexOf("-n") + 1]}` : undefined);
  const max = nArg ? Number(nArg.replace(/^-n?/, "")) : Infinity;
  const lines = (text.trim() ? text.trim().split("\n").reverse() : []).slice(0, max);
  const decos = await decorations(repo);
  g.out += lines
    .map((l, i) => {
      const [meta, msg] = l.split("\t");
      const sha = meta.split(" ")[1];
      return `${color(g, "33", short(sha))}${i === 0 ? decorate(g, decos.get(sha)) : ""} ${ref}@{${i}}: ${msg}\n`;
    })
    .join("");
}
