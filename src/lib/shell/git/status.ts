// git status: what's staged, what's changed but not staged, what's untracked, conflicts, and
// how the branch compares with its upstream. Also used by `git commit` when there's nothing to do.
import { parseArgs } from "../util";
import { type G, color, detectRenames, needWorkTree, shown, short, state } from "./context";
import type { Change } from "./diff";
import { type Files, Repo } from "./repo";

export type Status = {
  staged: Change[];
  unstaged: { path: string; kind: "modified" | "deleted" | "typechange" }[];
  untracked: string[]; // folders end in "/"
  conflicts: { path: string; label: string; code: string }[];
  unborn: boolean;
  branch?: string;
  headSha?: string;
  merging: boolean;
  /** A cherry-pick, revert or rebase that stopped part-way. */
  op?: { kind: "cherry-pick" | "revert"; sha: string } | { kind: "rebase"; onto: string; branch: string; interactive: boolean; done: string[]; todo: string[]; stopped?: string; editing: boolean };
};

export async function computeStatus(repo: Repo & { root: string }, opts: { untrackedAll?: boolean } = {}): Promise<Status> {
  const s = await state(repo);
  const index = new Map(Object.entries(s.index.entries));
  const staged: Change[] = [];
  for (const path of [...new Set([...s.head.keys(), ...index.keys()])].sort()) {
    const h = s.head.get(path);
    const i = index.get(path);
    if (h && i && h.sha === i.sha && h.mode === i.mode) continue;
    if (!h && !i) continue;
    if (!i && s.index.conflicts[path]) continue; // shown as a conflict instead
    staged.push({ path, old: h ? { ...h, text: "" } : undefined, new: i ? { ...i, text: "" } : undefined });
  }
  const unstaged: Status["unstaged"] = [];
  for (const [path, i] of index) {
    const w = s.work.get(path);
    if (!w) unstaged.push({ path, kind: "deleted" });
    else if (w.sha !== i.sha) unstaged.push({ path, kind: "modified" });
    else if (w.mode !== i.mode) unstaged.push({ path, kind: "modified" });
  }
  const conflicts: Status["conflicts"] = [];
  for (const [path, c] of Object.entries(s.index.conflicts).sort()) {
    const [label, code] =
      c.ours && c.theirs ? (c.base ? ["both modified:", "UU"] : ["both added:", "AA"]) : c.ours ? ["deleted by them:", "UD"] : c.theirs ? ["deleted by us:", "DU"] : ["both deleted:", "DD"];
    conflicts.push({ path, label, code });
  }
  const rules = await repo.ignoreRules();
  const tracked = new Set([...index.keys(), ...Object.keys(s.index.conflicts)]);
  const untrackedFiles = [...s.work.keys()].filter((p) => !tracked.has(p) && !Repo.isIgnored(rules, p, false)).sort();
  let untracked = untrackedFiles;
  if (!opts.untrackedAll) {
    // A folder with no tracked files in it at all is shown once, as "folder/".
    const trackedDirs = new Set<string>();
    for (const p of tracked) {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join("/"));
    }
    const shownSet = new Set<string>();
    for (const p of untrackedFiles) {
      const parts = p.split("/");
      let entry = p;
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        if (!trackedDirs.has(dir)) {
          entry = `${dir}/`;
          break;
        }
      }
      shownSet.add(entry);
    }
    untracked = [...shownSet].sort();
  }
  return {
    staged: detectRenames(staged),
    unstaged: unstaged.sort((a, b) => (a.path < b.path ? -1 : 1)),
    untracked,
    conflicts,
    unborn: !s.headSha,
    branch: s.branch,
    headSha: s.headSha,
    merging: !!(await repo.readText("MERGE_HEAD")),
    op: await operation(repo),
  };
}

async function operation(repo: Repo): Promise<Status["op"]> {
  const pick = (await repo.readText("CHERRY_PICK_HEAD"))?.trim();
  if (pick) return { kind: "cherry-pick", sha: pick };
  const rev = (await repo.readText("REVERT_HEAD"))?.trim();
  if (rev) return { kind: "revert", sha: rev };
  const headName = (await repo.readText("rebase-merge/head-name"))?.trim();
  if (!headName) return undefined;
  const lines = async (f: string) => ((await repo.readText(`rebase-merge/${f}`)) ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  return {
    kind: "rebase",
    onto: ((await repo.readText("rebase-merge/onto")) ?? "").trim(),
    branch: headName.replace(/^refs\/heads\//, ""),
    interactive: (await repo.readText("rebase-merge/interactive")) !== undefined,
    done: await lines("done"),
    todo: await lines("git-rebase-todo"),
    stopped: (await repo.readText("rebase-merge/stopped-sha"))?.trim(),
    editing: (await repo.readText("rebase-merge/amend")) !== undefined,
  };
}

/** "Your branch is ahead of 'origin/main' by 1 commit." and friends. */
export async function trackingInfo(repo: Repo, branch: string | undefined, sha: string | undefined): Promise<string> {
  if (!branch) return "";
  const up = await upstreamOf(repo, branch);
  if (!up) return "";
  const upSha = await repo.readRef(`refs/remotes/${up}`);
  if (!upSha) return `Your branch is based on '${up}', but the upstream is gone.\n  (use "git branch --unset-upstream" to fixup)\n`;
  const { ahead, behind } = await aheadBehind(repo, sha, upSha);
  if (!ahead && !behind) return `Your branch is up to date with '${up}'.\n`;
  const commits = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;
  if (ahead && !behind) return `Your branch is ahead of '${up}' by ${commits(ahead)}.\n  (use "git push" to publish your local commits)\n`;
  if (behind && !ahead) return `Your branch is behind '${up}' by ${commits(behind)}, and can be fast-forwarded.\n  (use "git pull" to update your local branch)\n`;
  return `Your branch and '${up}' have diverged,\nand have ${ahead} and ${behind} different commits each, respectively.\n  (use "git pull" if you want to integrate the remote branch with yours)\n`;
}

/** "origin/main" for a branch that tracks main on origin. */
export async function upstreamOf(repo: Repo, branch: string): Promise<string | undefined> {
  const remote = await repo.config(`branch.${branch}.remote`);
  const merge = await repo.config(`branch.${branch}.merge`);
  if (!remote || !merge) return undefined;
  return `${remote}/${merge.replace(/^refs\/heads\//, "")}`;
}

export async function ancestors(repo: Repo, sha: string | undefined): Promise<Set<string>> {
  const seen = new Set<string>();
  const stack = sha ? [sha] : [];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    try {
      stack.push(...(await repo.readCommit(s)).parents);
    } catch {
      /* a missing parent (shallow history) ends the walk */
    }
  }
  return seen;
}

export async function aheadBehind(repo: Repo, a: string | undefined, b: string | undefined) {
  const A = await ancestors(repo, a);
  const B = await ancestors(repo, b);
  let ahead = 0;
  let behind = 0;
  for (const x of A) if (!B.has(x)) ahead++;
  for (const x of B) if (!A.has(x)) behind++;
  return { ahead, behind };
}

const LABEL: Record<string, string> = { added: "new file:", modified: "modified:", deleted: "deleted:", renamed: "renamed:", typechange: "typechange:" };
const pad = (label: string, width: number) => label.padEnd(width);

function stagedKind(c: Change) {
  if (c.oldPath) return "renamed";
  if (!c.old) return "added";
  if (!c.new) return "deleted";
  return "modified";
}

export function formatLong(g: G, repo: Repo, st: Status, tracking: string): string {
  const lines: string[] = [];
  const op = st.op;
  if (op?.kind === "rebase") {
    const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
    lines.push(`${op.interactive ? "interactive " : ""}rebase in progress; onto ${short(op.onto)}`);
    if (op.done.length) {
      lines.push(`Last command${op.done.length > 1 ? "s" : ""} done (${n(op.done.length, "command")} done):`);
      for (const d of op.done.slice(-2)) lines.push(`   ${d}`);
      if (op.done.length > 2) lines.push(`  (see more in file .git/rebase-merge/done)`);
    }
    if (op.todo.length) {
      lines.push(`Next command${op.todo.length > 1 ? "s" : ""} to do (${n(op.todo.length, "remaining command")}):`);
      for (const t of op.todo.slice(0, 2)) lines.push(`   ${t}`);
      lines.push('  (use "git rebase --edit-todo" to view and edit)');
    } else lines.push("No commands remaining.");
    if (st.conflicts.length) lines.push(`You are currently rebasing branch '${op.branch}' on '${short(op.onto)}'.`, '  (fix conflicts and then run "git rebase --continue")', '  (use "git rebase --skip" to skip this patch)', '  (use "git rebase --abort" to check out the original branch)', "");
    else if (op.editing) lines.push(`You are currently editing a commit while rebasing branch '${op.branch}' on '${short(op.onto)}'.`, '  (use "git commit --amend" to amend the current commit)', '  (use "git rebase --continue" once you are satisfied with your changes)', "");
    else lines.push(`You are currently rebasing branch '${op.branch}' on '${short(op.onto)}'.`, '  (all conflicts fixed: run "git rebase --continue")', "");
  } else lines.push(st.branch ? `On branch ${st.branch}` : `HEAD detached at ${short(st.headSha ?? "")}`);
  if (tracking) lines.push(tracking.trimEnd(), "");
  if (op && op.kind !== "rebase") {
    const ing = op.kind === "revert" ? "reverting" : "cherry-picking";
    lines.push(`You are currently ${ing} commit ${short(op.sha)}.`);
    if (st.conflicts.length) lines.push(`  (fix conflicts and run "git ${op.kind} --continue")`);
    else lines.push(`  (all conflicts fixed: run "git ${op.kind} --continue")`);
    lines.push(`  (use "git ${op.kind} --skip" to skip this patch)`, `  (use "git ${op.kind} --abort" to cancel the ${op.kind} operation)`, "");
  }
  if (st.merging) {
    if (st.conflicts.length) lines.push("You have unmerged paths.", '  (fix conflicts and run "git commit")', '  (use "git merge --abort" to abort the merge)', "");
    else lines.push("All conflicts fixed but you are still merging.", '  (use "git commit" to conclude merge)', "");
  }
  if (st.unborn) lines.push("", "No commits yet", "");
  const p = (path: string) => shown(g, repo, path);
  if (st.staged.length) {
    lines.push("Changes to be committed:", st.unborn ? '  (use "git rm --cached <file>..." to unstage)' : '  (use "git restore --staged <file>..." to unstage)');
    for (const c of st.staged) {
      const kind = stagedKind(c);
      const name = kind === "renamed" ? `${p(c.oldPath!)} -> ${p(c.path)}` : p(c.path);
      lines.push(`\t${color(g, "32", `${pad(LABEL[kind], 12)}${name}`)}`);
    }
    lines.push("");
  }
  if (st.conflicts.length) {
    lines.push("Unmerged paths:", '  (use "git add <file>..." to mark resolution)');
    for (const c of st.conflicts) lines.push(`\t${color(g, "31", `${pad(c.label, 17)}${p(c.path)}`)}`);
    lines.push("");
  }
  if (st.unstaged.length) {
    const anyDeleted = st.unstaged.some((u) => u.kind === "deleted");
    lines.push("Changes not staged for commit:", `  (use "git add${anyDeleted ? "/rm" : ""} <file>..." to update what will be committed)`, '  (use "git restore <file>..." to discard changes in working directory)');
    for (const u of st.unstaged) lines.push(`\t${color(g, "31", `${pad(LABEL[u.kind], 12)}${p(u.path)}`)}`);
    lines.push("");
  }
  if (st.untracked.length) {
    lines.push("Untracked files:", '  (use "git add <file>..." to include in what will be committed)');
    for (const u of st.untracked) lines.push(`\t${color(g, "31", u.endsWith("/") ? `${p(u.slice(0, -1))}/` : p(u))}`);
    lines.push("");
  }
  // The closing line.
  if (!st.staged.length && !st.conflicts.length) {
    if (st.unstaged.length) lines.push('no changes added to commit (use "git add" and/or "git commit -a")');
    else if (st.untracked.length) lines.push('nothing added to commit but untracked files present (use "git add" to track)');
    else if (st.unborn) lines.push('nothing to commit (create/copy files and use "git add" to track)');
    else if (!st.merging && !st.op) lines.push("nothing to commit, working tree clean");
    else if (st.op) lines.push("nothing to commit, working tree clean");
  } else if (st.conflicts.length && !st.staged.length && !st.unstaged.length) {
    lines.push('no changes added to commit (use "git add" and/or "git commit -a")');
  }
  return `${lines.join("\n")}\n`;
}

export function formatShort(g: G, repo: Repo, st: Status, branchLine: string | null): string {
  const rows = new Map<string, [string, string, string]>(); // path -> [X, Y, display]
  const p = (path: string) => shown(g, repo, path);
  for (const c of st.staged) {
    const kind = stagedKind(c);
    const x = kind === "added" ? "A" : kind === "deleted" ? "D" : kind === "renamed" ? "R" : "M";
    rows.set(c.path, [x, " ", kind === "renamed" ? `${p(c.oldPath!)} -> ${p(c.path)}` : p(c.path)]);
  }
  for (const u of st.unstaged) {
    const row = rows.get(u.path) ?? [" ", " ", p(u.path)];
    row[1] = u.kind === "deleted" ? "D" : "M";
    rows.set(u.path, row);
  }
  for (const c of st.conflicts) rows.set(c.path, [c.code[0], c.code[1], p(c.path)]);
  const out: string[] = [];
  if (branchLine !== null) out.push(`## ${branchLine}`);
  for (const [, [x, y, name]] of [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const conflict = x === "U" || y === "U" || (x === y && (x === "A" || x === "D"));
    out.push(conflict ? `${color(g, "31", `${x}${y}`)} ${name}` : `${color(g, "32", x)}${color(g, "31", y)} ${name}`);
  }
  for (const u of st.untracked) out.push(`${color(g, "31", "??")} ${u.endsWith("/") ? `${p(u.slice(0, -1))}/` : p(u)}`);
  return out.length ? `${out.join("\n")}\n` : "";
}

export async function gitStatus(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long } = parseArgs(args);
  const st = await computeStatus(repo, { untrackedAll: long.includes("untracked-files=all") || flags.has("u") });
  if (flags.has("s") || long.includes("short") || long.includes("porcelain")) {
    let branchLine: string | null = null;
    if (flags.has("b") || long.includes("branch")) {
      branchLine = st.branch ? (st.unborn ? `No commits yet on ${st.branch}` : st.branch) : "HEAD (no branch)";
      if (st.branch && !st.unborn) {
        const up = await upstreamOf(repo, st.branch);
        if (up) {
          const upSha = await repo.readRef(`refs/remotes/${up}`);
          const { ahead, behind } = await aheadBehind(repo, st.headSha, upSha);
          const parts = [ahead && `ahead ${ahead}`, behind && `behind ${behind}`].filter(Boolean);
          branchLine += `...${up}${parts.length ? ` [${parts.join(", ")}]` : ""}`;
        }
      }
    }
    g.out += formatShort(g, repo, st, branchLine);
    return;
  }
  g.out += formatLong(g, repo, st, await trackingInfo(repo, st.branch, st.headSha));
}

export type { Files };
