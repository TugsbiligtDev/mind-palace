// Changing history (Intermediate, Modules 34 to 37): git reset, revert, cherry-pick, rebase
// (plain, --onto and interactive, with --autosquash) and clean. Revert, cherry-pick and rebase
// all replay a commit's change on top of HEAD with a three-way merge, and can stop on a
// conflict and be continued, skipped or aborted, like real Git (the state lives in .git:
// CHERRY_PICK_HEAD, REVERT_HEAD, rebase-merge/).
import { parseArgs } from "../util";
import { type G, changesBetween, color, editMessage, needWorkTree, pathspecMatches, repoPath, short, state } from "./context";
import { countLines, diffStat, mergeText, modeLines, summaryLine } from "./diff";
import { type Commit, type Person, subject } from "./objects";
import { type FileEntry, type Files, GitError, type Index, Repo } from "./repo";
import { ancestors, upstreamOf } from "./status";
import { mergeBase } from "./branching";

const same = (a?: FileEntry, b?: FileEntry) => (!a && !b) || (!!a && !!b && a.sha === b.sha && a.mode === b.mode);

type WorkRepo = Repo & { root: string };

/** The committer for a new commit: the configured identity (or GIT_COMMITTER_*), now. */
export async function committer(g: G, repo: Repo): Promise<Person> {
  const id = await repo.identity();
  const name = g.env.get("GIT_COMMITTER_NAME") || id?.name;
  const email = g.env.get("GIT_COMMITTER_EMAIL") || id?.email;
  if (!name || !email) throw new GitError("Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email \"you@example.com\"\n  git config --global user.name \"Your Name\"\n\nto set your account's default identity.\nOmit --global to set the identity only in this repository.\n\nfatal: unable to auto-detect email address (got 'learner@inkwell.(none)')", 128);
  const date = g.env.get("GIT_COMMITTER_DATE");
  const parsed = date ? (date.startsWith("@") ? Number(date.slice(1).split(" ")[0]) : Math.floor(Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(date) ? date : `${date.replace(" ", "T")}Z`) / 1000)) : NaN;
  return { name, email, time: Number.isNaN(parsed) ? Math.floor(g.m.now().getTime() / 1000) : parsed, tz: "+0000" };
}

export async function writeCommitAs(g: G, repo: Repo, files: Files, parents: string[], message: string, author?: Person): Promise<string> {
  const c = await committer(g, repo);
  const tree = await repo.writeTree(files);
  const commit: Commit = { tree, parents, author: author ?? c, committer: c, message: message.endsWith("\n") ? message : `${message}\n` };
  return repo.writeCommit(commit);
}

/** Puts the index and the tracked files of the working folder at a commit's files. */
export async function hardReset(repo: WorkRepo, to: string | undefined) {
  const s = await state(repo);
  const T = to ? await repo.commitFiles(to) : new Map<string, FileEntry>();
  for (const p of new Set([...s.head.keys(), ...Object.keys(s.index.entries), ...Object.keys(s.index.conflicts)])) if (!T.has(p)) await repo.removeWork(p);
  for (const [p, f] of T) if (!same(s.work.get(p), f)) await repo.writeWork(p, f);
  await repo.writeIndex({ entries: Object.fromEntries(T), conflicts: {} });
}

async function clearOperations(repo: Repo) {
  for (const f of ["MERGE_HEAD", "MERGE_MSG", "MERGE_MODE", "CHERRY_PICK_HEAD", "REVERT_HEAD", "sequencer/todo", "sequencer/opts", "sequencer/head"]) await repo.remove(f);
}

/**
 * Replays the change from `base` to `theirs` onto HEAD (and the working folder). Returns the
 * paths that conflict; the others are merged into the index.
 */
export async function replay(g: G, repo: WorkRepo, base: Files, theirs: Files, labels: { ours: string; theirs: string; base: string }): Promise<{ conflicted: string[]; notes: string[] }> {
  const s = await state(repo);
  const O = s.head;
  const I = new Map(Object.entries(s.index.entries));
  const touched = [...new Set([...base.keys(), ...O.keys(), ...theirs.keys()])].filter((p) => !same(theirs.get(p), base.get(p)) && !same(theirs.get(p), O.get(p)));
  const dirty = touched.filter((p) => !same(I.get(p), O.get(p)) || !same(s.work.get(p), I.get(p)));
  if (dirty.length)
    throw new GitError(`error: Your local changes to the following files would be overwritten by merge:\n${dirty.map((p) => `\t${p}`).join("\n")}\nPlease commit your changes or stash them before you merge.\nAborting`, 1);
  const style = ((await repo.config("merge.conflictStyle")) ?? "merge") as "merge" | "diff3" | "zdiff3";
  const index: Index = { entries: Object.fromEntries(I), conflicts: {} };
  const notes: string[] = [];
  const conflicted: string[] = [];
  for (const path of touched.sort()) {
    const b = base.get(path);
    const o = O.get(path);
    const t = theirs.get(path);
    if (same(b, o)) {
      if (t) {
        index.entries[path] = t;
        await repo.writeWork(path, t);
      } else {
        delete index.entries[path];
        await repo.removeWork(path);
      }
      continue;
    }
    if (o && t) {
      notes.push(`Auto-merging ${path}`);
      const r = mergeText(await repo.readBlobText(o.sha), b ? await repo.readBlobText(b.sha) : "", await repo.readBlobText(t.sha), labels, style);
      const sha = await repo.writeBlob(r.text);
      if (r.conflicts) {
        notes.push(`CONFLICT (${b ? "content" : "add/add"}): Merge conflict in ${path}`);
        conflicted.push(path);
        delete index.entries[path];
        index.conflicts[path] = { base: b, ours: o, theirs: t };
      } else index.entries[path] = { sha, mode: o.mode };
      await repo.writeWork(path, { sha, mode: o.mode });
      continue;
    }
    const kept = (o ?? t)!;
    notes.push(`CONFLICT (modify/delete): ${path} deleted in ${o ? labels.theirs : "HEAD"} and modified in ${o ? "HEAD" : labels.theirs}.  Version ${o ? "HEAD" : labels.theirs} of ${path} left in tree.`);
    conflicted.push(path);
    delete index.entries[path];
    index.conflicts[path] = { base: b, ours: o, theirs: t };
    await repo.writeWork(path, kept);
  }
  await repo.writeIndex(index);
  return { conflicted, notes };
}

function commitSummary(changes: Awaited<ReturnType<typeof changesBetween>>) {
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    const n = countLines(c.old?.text ?? "", c.new?.text ?? "");
    added += n.added;
    removed += n.removed;
  }
  return `${summaryLine(changes.length, added, removed)}\n${modeLines(changes)}`;
}

const dateLine = (p: Person) => {
  const d = new Date(p.time * 1000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} ${d.getUTCFullYear()} ${p.tz}`;
};

async function message(g: G, repo: WorkRepo, file: string, start: string, noEdit: boolean): Promise<string> {
  if (noEdit || (!g.m.interactive && !g.m.quiet && !g.m.root.scripted.edits.length)) return start;
  const edited = await editMessage(g, repo, file, `${start}\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n`);
  if (edited === null) return start;
  return edited;
}

// ----- reset -----

export async function gitReset(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const dash = args.indexOf("--");
  const { long, flags, operands } = parseArgs(dash >= 0 ? args.slice(0, dash) : args);
  const paths = dash >= 0 ? args.slice(dash + 1) : [];
  const mode = long.includes("hard") ? "hard" : long.includes("soft") ? "soft" : long.includes("keep") ? "keep" : long.includes("merge") ? "merge" : "mixed";
  const quiet = flags.has("q") || long.includes("quiet");
  let rev = "HEAD";
  for (const o of operands) {
    if (paths.length === 0 && (await repo.resolve(o)) && rev === "HEAD" && !(o.includes(".") && !(await repo.resolve(o)))) rev = o;
    else paths.push(o);
  }
  const target = await repo.resolve(rev);
  const h = await repo.head();
  if (!target && h.sha) throw new GitError(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
  if (paths.length) {
    if (mode !== "mixed") throw new GitError(`fatal: Cannot do ${mode} reset with paths.`);
    const files = await repo.commitFiles(target);
    const idx = await repo.readIndex();
    const specs = paths.map((p) => repoPath(g, repo, p));
    for (const p of new Set([...Object.keys(idx.entries), ...files.keys()])) {
      if (!specs.some((sp) => pathspecMatches(sp, p))) continue;
      const f = files.get(p);
      if (f) idx.entries[p] = f;
      else delete idx.entries[p];
      delete idx.conflicts[p];
    }
    await repo.writeIndex(idx);
    await unstagedAfter(g, repo, quiet);
    return;
  }
  if (h.sha) await repo.writeText("ORIG_HEAD", `${h.sha}\n`);
  if (target && target !== h.sha) await repo.advance(target, `reset: moving to ${rev}`);
  else if (target) await repo.reflog("HEAD", target, target, `reset: moving to ${rev}`);
  if (mode === "soft") return;
  await clearOperations(repo);
  if (mode === "hard" || mode === "keep" || mode === "merge") {
    await hardReset(repo, target);
    if (!quiet) g.out += `HEAD is now at ${short(target!)} ${subject(await repo.readCommit(target!))}\n`;
    return;
  }
  const files = await repo.commitFiles(target);
  await repo.writeIndex({ entries: Object.fromEntries(files), conflicts: {} });
  await unstagedAfter(g, repo, quiet);
}

async function unstagedAfter(g: G, repo: WorkRepo, quiet: boolean) {
  if (quiet) return;
  const s = await state(repo);
  const rows: string[] = [];
  for (const [p, i] of Object.entries(s.index.entries).sort()) {
    const w = s.work.get(p);
    if (!w) rows.push(`D\t${p}`);
    else if (w.sha !== i.sha) rows.push(`M\t${p}`);
  }
  if (rows.length) g.out += `Unstaged changes after reset:\n${rows.join("\n")}\n`;
}

// ----- revert and cherry-pick -----

type PickKind = "cherry-pick" | "revert";

async function pickOne(g: G, repo: WorkRepo, kind: PickKind, sha: string, opts: { noCommit: boolean; noEdit: boolean; x: boolean; mainline?: number }): Promise<boolean> {
  const c = await repo.readCommit(sha);
  if (c.parents.length > 1 && !opts.mainline) throw new GitError(`error: commit ${sha} is a merge but no -m option was given.\nfatal: ${kind === "revert" ? "revert" : "cherry-pick"} failed`, 128);
  const parent = c.parents[(opts.mainline ?? 1) - 1];
  const P = await repo.commitFiles(parent);
  const C = await repo.flatten(c.tree);
  const label = `${short(sha)} (${subject(c)})`;
  const [base, theirs] = kind === "revert" ? [C, P] : [P, C];
  const before = await state(repo);
  const r = await replay(g, repo, base, theirs, { ours: "HEAD", theirs: kind === "revert" ? `parent of ${label}` : label, base: kind === "revert" ? label : `parent of ${label}` });
  const msg =
    kind === "revert"
      ? `Revert "${subject(c)}"\n\nThis reverts commit ${sha}.\n`
      : `${c.message.replace(/\n+$/, "")}\n${opts.x ? `\n(cherry picked from commit ${sha})\n` : ""}`;
  for (const n of r.notes) g.out += `${n}\n`;
  if (r.conflicted.length) {
    await repo.writeText(kind === "revert" ? "REVERT_HEAD" : "CHERRY_PICK_HEAD", `${sha}\n`);
    await repo.writeText("MERGE_MSG", `${msg}\n# Conflicts:\n${r.conflicted.map((p) => `#\t${p}`).join("\n")}\n`);
    const verb = kind === "revert" ? "revert" : "apply";
    throw new GitError(
      `error: could not ${verb} ${short(sha)}... ${subject(c)}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git ${kind} --continue".\nhint: You can instead skip this commit with "git ${kind} --skip".\nhint: To abort and get back to the state before "git ${kind}",\nhint: run "git ${kind} --abort".\nhint: Disable this message with "git config set advice.mergeConflict false"`,
      1,
    );
  }
  if (opts.noCommit) return true;
  const idx = await repo.readIndex();
  const files: Files = new Map(Object.entries(idx.entries));
  const changes = await changesBetween(repo, before.head, files);
  if (!changes.length) {
    await repo.writeText(kind === "revert" ? "REVERT_HEAD" : "CHERRY_PICK_HEAD", `${sha}\n`);
    throw new GitError(
      `On branch ${before.branch ?? "HEAD"}\nYou are currently ${kind === "revert" ? "reverting" : "cherry-picking"} commit ${short(sha)}.\n  (all conflicts fixed: run "git ${kind} --continue")\n  (use "git ${kind} --skip" to skip this patch)\n  (use "git ${kind} --abort" to cancel the ${kind} operation)\n\nnothing to commit, working tree clean\nThe previous ${kind} is now empty, possibly due to conflict resolution.\nIf you wish to commit it anyway, use:\n\n    git commit --allow-empty\n\nOtherwise, please use 'git ${kind} --skip'`,
      1,
    );
  }
  const final = kind === "revert" ? await message(g, repo, "COMMIT_EDITMSG", msg, opts.noEdit) : msg;
  const newSha = await writeCommitAs(g, repo, files, before.headSha ? [before.headSha] : [], final, kind === "cherry-pick" ? c.author : undefined);
  await repo.advance(newSha, `${kind}: ${subject({ message: final } as Commit)}`);
  g.out += `[${before.branch ?? "detached HEAD"} ${short(newSha)}] ${subject({ message: final } as Commit)}\n`;
  if (kind === "cherry-pick") g.out += ` Date: ${dateLine(c.author)}\n`;
  g.out += commitSummary(changes);
  return true;
}

async function sequence(g: G, args: string[], kind: PickKind) {
  const repo = await needWorkTree(g);
  const { flags, long, values, operands } = parseArgs(args, "m");
  const head = kind === "revert" ? "REVERT_HEAD" : "CHERRY_PICK_HEAD";
  const opts = { noCommit: flags.has("n") || long.includes("no-commit"), noEdit: long.includes("no-edit") || (kind === "cherry-pick" && !flags.has("e")), x: flags.has("x"), mainline: values.m ? Number(values.m) : undefined };
  if (long.includes("abort")) {
    const orig = (await repo.readText("sequencer/head"))?.trim() ?? (await repo.readText("ORIG_HEAD"))?.trim();
    if (!(await repo.readText(head)) && !(await repo.readText("sequencer/todo"))) throw new GitError(`error: no ${kind} in progress\nfatal: ${kind} failed`, 128);
    if (orig) {
      await repo.advance(orig, `${kind}: abort`);
      await hardReset(repo, orig);
    }
    await clearOperations(repo);
    return;
  }
  if (long.includes("quit")) {
    await clearOperations(repo);
    return;
  }
  if (long.includes("continue") || long.includes("skip")) {
    const cur = (await repo.readText(head))?.trim();
    if (!cur && !(await repo.readText("sequencer/todo"))) throw new GitError(`error: no ${kind} in progress\nfatal: ${kind} failed`, 128);
    const idx = await repo.readIndex();
    if (long.includes("skip")) {
      const h = await repo.head();
      await hardReset(repo, h.sha);
    } else if (cur) {
      if (Object.keys(idx.conflicts).length) throw new GitError(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.\nU\t${Object.keys(idx.conflicts)[0]}\nerror: could not commit staged changes.`, 128);
      const s = await state(repo);
      const files: Files = new Map(Object.entries(idx.entries));
      const changes = await changesBetween(repo, s.head, files);
      if (changes.length) {
        const c = await repo.readCommit(cur);
        const start = ((await repo.readText("MERGE_MSG")) ?? "").replace(/\n# Conflicts:[\s\S]*$/, "\n");
        const final = await message(g, repo, "COMMIT_EDITMSG", start, false);
        const sha = await writeCommitAs(g, repo, files, s.headSha ? [s.headSha] : [], final, kind === "cherry-pick" ? c.author : undefined);
        await repo.advance(sha, `${kind}: ${subject({ message: final } as Commit)}`);
        g.out += `[${s.branch ?? "detached HEAD"} ${short(sha)}] ${subject({ message: final } as Commit)}\n${commitSummary(changes)}`;
      }
    }
    await repo.remove(head);
    await repo.remove("MERGE_MSG");
    const todo = ((await repo.readText("sequencer/todo")) ?? "").split("\n").filter(Boolean);
    const rest = todo.slice(cur || long.includes("skip") ? 1 : 0);
    if (!rest.length) {
      await clearOperations(repo);
      return;
    }
    await repo.writeText("sequencer/todo", `${rest.join("\n")}\n`);
    return runTodo(g, repo, kind, rest, opts);
  }
  if (!operands.length) throw new GitError(`usage: git ${kind} [--[no-]edit] [-n] [-m <parent-number>] [-s] [-x] [--[no-]allow-empty] <commit>...`, 129);
  if (await repo.readText(head)) throw new GitError(`error: ${kind === "revert" ? "revert" : "cherry-pick"} is already in progress\nhint: try "git ${kind} (--continue | --abort | --quit)"\nfatal: ${kind} failed`, 128);
  const shas: string[] = [];
  for (const o of operands) {
    if (o.includes("..")) {
      const [a, b] = o.split("..");
      const A = await ancestors(repo, await repo.resolve(a || "HEAD"));
      const { walk } = await import("./history");
      const list = (await walk(repo, [(await repo.resolve(b || "HEAD"))!])).filter((w) => !A.has(w.sha) && w.c.parents.length < 2).reverse();
      shas.push(...list.map((w) => w.sha));
      continue;
    }
    const sha = await repo.resolve(o);
    if (!sha) throw new GitError(`fatal: bad revision '${o}'`, 128);
    shas.push(sha);
  }
  const h = await repo.head();
  if (h.sha) {
    await repo.writeText("ORIG_HEAD", `${h.sha}\n`);
    await repo.writeText("sequencer/head", `${h.sha}\n`);
  }
  const todo: string[] = [];
  for (const sha of shas) todo.push(`${kind === "revert" ? "revert" : "pick"} ${sha} ${subject(await repo.readCommit(sha))}`);
  await repo.writeText("sequencer/todo", `${todo.join("\n")}\n`);
  return runTodo(g, repo, kind, todo, opts);
}

async function runTodo(g: G, repo: WorkRepo, kind: PickKind, todo: string[], opts: { noCommit: boolean; noEdit: boolean; x: boolean; mainline?: number }) {
  for (let i = 0; i < todo.length; i++) {
    const sha = todo[i].split(" ")[1];
    await repo.writeText("sequencer/todo", `${todo.slice(i).join("\n")}\n`);
    await pickOne(g, repo, kind, sha, opts);
  }
  await clearOperations(repo);
}

export const gitRevert = (g: G, args: string[]) => sequence(g, args, "revert");
export const gitCherryPick = (g: G, args: string[]) => sequence(g, args, "cherry-pick");

// ----- rebase -----

const REBASE = "rebase-merge";

type Todo = { cmd: string; sha?: string; rest: string };

const TODO_HELP = (from: string, to: string, onto: string, n: number) => `
# Rebase ${from}..${to} onto ${onto} (${n} command${n === 1 ? "" : "s"})
#
# Commands:
# p, pick <commit> = use commit
# r, reword <commit> = use commit, but edit the commit message
# e, edit <commit> = use commit, but stop for amending
# s, squash <commit> = use commit, but meld into previous commit
# f, fixup [-C | -c] <commit> = like "squash" but keep only the previous
#                    commit's log message, unless -C is used, in which case
#                    keep only this commit's message; -c is same as -C but
#                    opens the editor
# x, exec <command> = run command (the rest of the line) using shell
# b, break = stop here (continue rebase later with 'git rebase --continue')
# d, drop <commit> = remove commit
#
# These lines can be re-ordered; they are executed from top to bottom.
#
# If you remove a line here THAT COMMIT WILL BE LOST.
#
# However, if you remove everything, the rebase will be aborted.
#
`;

const ALIASES: Record<string, string> = { p: "pick", r: "reword", e: "edit", s: "squash", f: "fixup", x: "exec", b: "break", d: "drop" };

function parseTodo(text: string): Todo[] | { error: string } {
  const out: Todo[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [w, ...rest] = line.split(/\s+/);
    const cmd = ALIASES[w] ?? w;
    if (!["pick", "reword", "edit", "squash", "fixup", "exec", "break", "drop"].includes(cmd)) return { error: `error: invalid command '${w}'\nerror: invalid line ${out.length + 1}: ${line}` };
    if (cmd === "exec") out.push({ cmd, rest: rest.join(" ") });
    else if (cmd === "break") out.push({ cmd, rest: "" });
    else {
      const args = rest.filter((x) => x !== "-C" && x !== "-c");
      out.push({ cmd, sha: args[0], rest: args.slice(1).join(" ") });
    }
  }
  return out;
}

async function rebaseState(repo: Repo) {
  const r = async (f: string) => (await repo.readText(`${REBASE}/${f}`))?.trim();
  const headName = await r("head-name");
  if (!headName) return undefined;
  return {
    headName,
    onto: (await r("onto"))!,
    orig: (await r("orig-head"))!,
    todo: ((await repo.readText(`${REBASE}/git-rebase-todo`)) ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("#")),
    done: ((await repo.readText(`${REBASE}/done`)) ?? "").split("\n").filter(Boolean),
    stopped: await r("stopped-sha"),
    interactive: (await repo.readText(`${REBASE}/interactive`)) !== undefined,
    squashMsg: await repo.readText(`${REBASE}/message-squash`),
  };
}

export async function rebaseInfo(repo: Repo) {
  return rebaseState(repo);
}

async function finishRebase(g: G, repo: WorkRepo) {
  const st = (await rebaseState(repo))!;
  const h = await repo.head();
  const branch = st.headName.replace(/^refs\/heads\//, "");
  if (st.headName.startsWith("refs/heads/")) {
    const old = await repo.readRef(st.headName);
    await repo.writeRef(st.headName, h.sha!);
    await repo.reflog(st.headName, old ?? "0".repeat(40), h.sha!, `rebase (finish): refs/heads/${branch} onto ${st.onto}`);
    await repo.setHead({ branch });
    await repo.reflog("HEAD", h.sha!, h.sha!, `rebase (finish): returning to refs/heads/${branch}`);
  }
  await repo.writeText("ORIG_HEAD", `${st.orig}\n`);
  await repo.remove(`${REBASE}`);
  await g.fs.rm(`${repo.gitdir}/${REBASE}`, { recursive: true, force: true }).catch(() => undefined);
  g.err += `Successfully rebased and updated ${st.headName}.\n`;
}

/** Applies the todo list from the top; stops on a conflict, edit or break. */
async function continueTodo(g: G, repo: WorkRepo) {
  for (;;) {
    const st = (await rebaseState(repo))!;
    if (!st.todo.length) return finishRebase(g, repo);
    const [line, ...rest] = st.todo;
    await repo.writeText(`${REBASE}/git-rebase-todo`, rest.length ? `${rest.join("\n")}\n` : "");
    await repo.writeText(`${REBASE}/done`, `${[...st.done, line].join("\n")}\n`);
    const parsed = parseTodo(line);
    if ("error" in parsed) throw new GitError(parsed.error, 1);
    const t = parsed[0];
    if (t.cmd === "drop") continue;
    if (t.cmd === "break") {
      g.err += "Stopped at HEAD\n";
      return;
    }
    if (t.cmd === "exec") {
      g.err += `Executing: ${t.rest}\n`;
      const r = await g.m.bash.exec(t.rest, { cwd: repo.root, env: Object.fromEntries(g.env) });
      g.out += r.stdout;
      g.err += r.stderr;
      if (r.exitCode !== 0) throw new GitError(`warning: execution failed: ${t.rest}\nYou can fix the problem, and then run\n\n  git rebase --continue\n`, 1);
      continue;
    }
    const sha = await repo.resolve(t.sha!);
    if (!sha) throw new GitError(`error: invalid line 1: ${line}\nYou can fix this with 'git rebase --edit-todo' and then run 'git rebase --continue'.`, 1);
    const c = await repo.readCommit(sha);
    const h = await repo.head();
    const label = `${short(sha)} (${subject(c)})`;
    await repo.writeText(`${REBASE}/stopped-sha`, `${sha}\n`);
    // A commit already on top of HEAD is reused as it is (same ID), like real Git.
    if (t.cmd === "pick" && c.parents[0] === h.sha) {
      await repo.writeText("HEAD", `${sha}\n`);
      await repo.reflog("HEAD", h.sha!, sha, `rebase (pick): ${subject(c)}`);
      await hardReset(repo, sha);
      continue;
    }
    const r = await replay(g, repo, await repo.commitFiles(c.parents[0]), await repo.flatten(c.tree), { ours: "HEAD", theirs: label, base: `parent of ${label}` });
    for (const n of r.notes) g.out += `${n}\n`;
    if (r.conflicted.length) {
      await repo.writeText(`${REBASE}/message`, c.message);
      await repo.writeText(`${REBASE}/pending-cmd`, `${t.cmd}\n`);
      throw new GitError(
        `error: could not apply ${short(sha)}... ${subject(c)}\nhint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".\nhint: Disable this message with "git config set advice.mergeConflict false"\nCould not apply ${short(sha)}... ${subject(c)}`,
        1,
      );
    }
    // A change that's already upstream (cherry-picked earlier, say) leaves nothing to commit.
    if (t.cmd !== "squash" && t.cmd !== "fixup") {
      const now = await state(repo);
      if (!(await changesBetween(repo, now.head, new Map(Object.entries(now.index.entries)))).length) {
        g.err += `warning: skipped previously applied commit ${short(sha)}\nhint: use --reapply-cherry-picks to include skipped commits\nhint: Disable this message with "git config set advice.skippedCherryPicks false"\n`;
        continue;
      }
    }
    await commitStep(g, repo, t.cmd, c);
    if (t.cmd === "edit") {
      const h2 = await repo.head();
      g.err += `Stopped at ${short(h2.sha!)}...  ${subject(c)}\nYou can amend the commit now, with\n\n  git commit --amend \n\nOnce you are satisfied with your changes, run\n\n  git rebase --continue\n`;
      await repo.writeText(`${REBASE}/amend`, `${h2.sha}\n`);
      return;
    }
  }
}

/** Makes the commit for one replayed step (pick, reword, edit, squash, fixup). */
async function commitStep(g: G, repo: WorkRepo, cmd: string, c: Commit) {
  const s = await state(repo);
  const files: Files = new Map(Object.entries(s.index.entries));
  if (cmd === "squash" || cmd === "fixup") {
    const prev = await repo.readCommit(s.headSha!);
    let msg = prev.message;
    if (cmd === "squash") {
      const combined = `# This is a combination of 2 commits.\n# This is the 1st commit message:\n\n${prev.message.replace(/\n+$/, "")}\n\n# This is the commit message #2:\n\n${c.message.replace(/\n+$/, "")}\n`;
      const edited = g.m.interactive || g.m.quiet || g.m.root.scripted.edits.length ? await editMessage(g, repo, "COMMIT_EDITMSG", `${combined}\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n`) : null;
      msg = edited ?? `${prev.message.replace(/\n+$/, "")}\n\n${c.message.replace(/\n+$/, "")}\n`;
    }
    const sha = await writeCommitAs(g, repo, files, prev.parents, msg, prev.author);
    await repo.writeText("HEAD", `${sha}\n`);
    await repo.reflog("HEAD", s.headSha!, sha, `rebase (${cmd}): ${subject({ message: msg } as Commit)}`);
    return;
  }
  let msg = c.message;
  if (cmd === "reword") msg = await message(g, repo, "COMMIT_EDITMSG", c.message, false);
  const sha = await writeCommitAs(g, repo, files, s.headSha ? [s.headSha] : [], msg, c.author);
  await repo.writeText("HEAD", `${sha}\n`);
  await repo.reflog("HEAD", s.headSha ?? "0".repeat(40), sha, `rebase (${cmd}): ${subject({ message: msg } as Commit)}`);
}

export async function gitRebase(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long, operands } = parseArgs(args.filter((a) => a !== "--onto"), "");
  const ontoIdx = args.indexOf("--onto");
  const ontoArg = ontoIdx >= 0 ? args[ontoIdx + 1] : long.find((l) => l.startsWith("onto="))?.slice(5);
  const ops = operands.filter((o) => o !== ontoArg);
  const st = await rebaseState(repo);
  if (long.includes("abort")) {
    if (!st) throw new GitError("fatal: no rebase in progress");
    const branch = st.headName.replace(/^refs\/heads\//, "");
    await hardReset(repo, st.orig);
    if (st.headName.startsWith("refs/heads/")) {
      await repo.writeRef(st.headName, st.orig);
      await repo.setHead({ branch });
    } else await repo.writeText("HEAD", `${st.orig}\n`);
    await repo.reflog("HEAD", st.orig, st.orig, `rebase (abort): returning to ${st.headName}`);
    await clearOperations(repo);
    await g.fs.rm(`${repo.gitdir}/${REBASE}`, { recursive: true, force: true }).catch(() => undefined);
    return;
  }
  if (long.includes("continue") || long.includes("skip")) {
    if (!st) throw new GitError("fatal: no rebase in progress");
    const idx = await repo.readIndex();
    if (long.includes("skip")) {
      await hardReset(repo, (await repo.head()).sha);
    } else {
      if (Object.keys(idx.conflicts).length) throw new GitError(`${Object.keys(idx.conflicts).map((p) => `${p}: needs merge`).join("\n")}\nYou must edit all merge conflicts and then\nmark them as resolved using git add`, 1);
      const pending = (await repo.readText(`${REBASE}/pending-cmd`))?.trim();
      if (pending && st.stopped) {
        const s = await state(repo);
        const changes = await changesBetween(repo, s.head, new Map(Object.entries(idx.entries)));
        const c = await repo.readCommit(st.stopped);
        if (!changes.length && pending !== "squash" && pending !== "fixup")
          throw new GitError(`No changes - did you forget to use 'git add'?\nIf there is nothing left to stage, chances are that something else\nalready introduced the same changes; you might want to skip this patch.\n\nWhen you have resolved this problem, run "git rebase --continue".\nIf you prefer to skip this patch, run "git rebase --skip" instead.\nTo check out the original branch and stop rebasing, run "git rebase --abort".\n`, 1);
        if (!(g.m.interactive || g.m.quiet) || pending === "squash" || pending === "fixup") await commitStep(g, repo, pending, c);
        else {
          const msg = await message(g, repo, "COMMIT_EDITMSG", c.message, false);
          await commitStep(g, repo, "pick", { ...c, message: msg });
        }
        g.out += `[detached HEAD ${short((await repo.head()).sha!)}] ${subject(c)}\n`;
        if (pending === "edit") {
          await repo.remove(`${REBASE}/pending-cmd`);
          return;
        }
      } else {
        // After `edit`: changes staged but not committed yet are added to the commit.
        const s = await state(repo);
        const changes = await changesBetween(repo, s.head, new Map(Object.entries(idx.entries)));
        if (changes.length) {
          const prev = await repo.readCommit(s.headSha!);
          const sha = await writeCommitAs(g, repo, new Map(Object.entries(idx.entries)), prev.parents, prev.message, prev.author);
          await repo.writeText("HEAD", `${sha}\n`);
        }
      }
    }
    await repo.remove(`${REBASE}/pending-cmd`);
    await repo.remove(`${REBASE}/amend`);
    return continueTodo(g, repo);
  }
  if (long.includes("edit-todo")) throw new GitError("The practice terminal can't edit the todo list in the middle of a rebase: use git rebase --abort and start again.", 1);
  if (st) throw new GitError(`fatal: It seems that there is already a rebase-merge directory, and\nI wonder if you are in the middle of another rebase.  If that is the\ncase, please try\n\tgit rebase (--continue | --abort | --skip)\nIf that is not the case, please\n\trm -fr "${repo.gitdir}/${REBASE}"\nand run me again.  I am stopping in case you still have something\nvaluable there.\n`);
  if (await repo.readText("MERGE_HEAD")) throw new GitError("fatal: You have not concluded your merge (MERGE_HEAD exists).");
  const interactive = flags.has("i") || long.includes("interactive");
  const autosquash = long.includes("autosquash") || (interactive && (await repo.config("rebase.autoSquash")) === "true");
  const h = await repo.head();
  if (!h.sha) throw new GitError("fatal: no commits yet");
  let upstreamName = ops[0];
  if (ops[1]) {
    // git rebase main feature: switch to feature first.
    const { gitSwitch } = await import("./branching");
    await gitSwitch(g, [ops[1]]);
  }
  const head = await repo.head();
  if (!upstreamName) {
    const up = head.branch ? await upstreamOf(repo, head.branch) : undefined;
    if (!up) throw new GitError(`There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.\nSee git-rebase(1) for details.\n\n    git rebase '<branch>'\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=<remote>/<branch> ${head.branch ?? "<branch>"}\n`, 1);
    upstreamName = up;
  }
  const upstream = await repo.resolve(upstreamName);
  if (!upstream) throw new GitError(`fatal: invalid upstream '${upstreamName}'`);
  const onto = ontoArg ? await repo.resolve(ontoArg) : upstream;
  if (!onto) throw new GitError(`fatal: Does not point to a valid commit '${ontoArg}'`);
  // Local changes would be lost.
  const s = await state(repo);
  const dirty = [...new Set([...s.head.keys(), ...Object.keys(s.index.entries)])].some((p) => !same(s.head.get(p), s.index.entries[p]) || !same(s.work.get(p), s.index.entries[p]));
  if (dirty) throw new GitError("error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.", 1);
  const U = await ancestors(repo, upstream);
  const { walk } = await import("./history");
  const commits = (await walk(repo, [head.sha!])).filter((w) => !U.has(w.sha) && w.c.parents.length < 2).reverse();
  const base = await mergeBase(repo, head.sha!, onto);
  if (!interactive && base === onto && commits.every((c, i) => (i === 0 ? c.c.parents[0] === onto || U.has(c.c.parents[0]) : true)) && (await ancestors(repo, head.sha!)).has(onto)) {
    g.out += `Current branch ${head.branch ?? "HEAD"} is up to date.\n`;
    return;
  }
  let todo: Todo[] = commits.map((w) => ({ cmd: "pick", sha: short(w.sha), rest: subject(w.c) }));
  if (autosquash) {
    const out: Todo[] = [];
    const later = todo.filter((t) => /^(fixup|squash|amend)! /.test(t.rest));
    for (const t of todo.filter((x) => !later.includes(x))) {
      out.push(t);
      for (const f of later.filter((l) => l.rest.replace(/^(fixup|squash|amend)! /, "") === t.rest || t.sha!.startsWith(l.rest.replace(/^(fixup|squash|amend)! /, "")))) out.push({ ...f, cmd: f.rest.startsWith("squash!") ? "squash" : "fixup" });
    }
    for (const f of later) if (!out.includes(f) && !out.some((o) => o.sha === f.sha)) out.push(f);
    todo = out;
  }
  const text = todo.map((t) => `${t.cmd} ${t.sha} ${t.rest}`).join("\n");
  let finalText = text;
  if (interactive) {
    const template = `${text}\n${TODO_HELP(short(upstream), short(head.sha!), short(onto), todo.length)}`;
    const edited = g.m.interactive || g.m.quiet || g.m.root.scripted.edits.length ? await editMessage(g, repo, `${REBASE}/git-rebase-todo`, template) : null;
    finalText = edited ?? text;
    const parsed = parseTodo(finalText);
    if ("error" in parsed) throw new GitError(parsed.error, 1);
    if (!parsed.length) {
      await g.fs.rm(`${repo.gitdir}/${REBASE}`, { recursive: true, force: true }).catch(() => undefined);
      g.err += "Nothing to do\n";
      return;
    }
    if (parsed[0].cmd === "squash" || parsed[0].cmd === "fixup") throw new GitError(`error: cannot '${parsed[0].cmd}' without a previous commit\nYou can fix this with 'git rebase --edit-todo' and then run 'git rebase --continue'.\nOr you can abort the rebase with 'git rebase --abort'.`, 1);
    finalText = parsed.map((t) => (t.cmd === "exec" ? `exec ${t.rest}` : t.cmd === "break" ? "break" : `${t.cmd} ${t.sha} ${t.rest}`)).join("\n");
  }
  await repo.writeText(`${REBASE}/head-name`, `${head.branch ? `refs/heads/${head.branch}` : "detached HEAD"}\n`);
  await repo.writeText(`${REBASE}/onto`, `${onto}\n`);
  await repo.writeText(`${REBASE}/orig-head`, `${head.sha}\n`);
  await repo.writeText(`${REBASE}/git-rebase-todo`, `${finalText}\n`);
  await repo.writeText(`${REBASE}/done`, "");
  if (interactive) await repo.writeText(`${REBASE}/interactive`, "");
  await repo.writeText("ORIG_HEAD", `${head.sha}\n`);
  // Start from `onto`, with HEAD detached.
  await hardReset(repo, onto);
  await repo.writeText("HEAD", `${onto}\n`);
  await repo.reflog("HEAD", head.sha!, onto, `rebase (start): checkout ${ontoArg ?? upstreamName}`);
  return continueTodo(g, repo);
}

// ----- clean -----

export async function gitClean(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long, operands } = parseArgs(args, "e");
  const dry = flags.has("n") || long.includes("dry-run");
  const force = flags.has("f") || long.includes("force");
  const dirs = flags.has("d");
  const ignoredToo = flags.has("x");
  const onlyIgnored = flags.has("X");
  if (flags.has("i")) throw new GitError("The practice terminal's git clean has no interactive mode: use git clean -n to see what would go, then git clean -f.", 1);
  if (!dry && !force && (await repo.config("clean.requireForce")) !== "false") throw new GitError("fatal: clean.requireForce is true and -f not given: refusing to clean");
  const idx = await repo.readIndex();
  const work = await repo.workFiles({ hash: false });
  const rules = await repo.ignoreRules();
  const specs = operands.map((o) => repoPath(g, repo, o));
  const tracked = new Set([...Object.keys(idx.entries), ...Object.keys(idx.conflicts)]);
  const trackedDirs = new Set<string>();
  for (const p of tracked) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join("/"));
  }
  const victims = new Set<string>();
  for (const p of [...work.keys()].sort()) {
    if (tracked.has(p)) continue;
    if (specs.length && !specs.some((sp) => pathspecMatches(sp, p))) continue;
    const ignored = Repo.isIgnored(rules, p, false);
    if (onlyIgnored ? !ignored : ignored && !ignoredToo) continue;
    const parts = p.split("/");
    let entry = p;
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join("/");
      if (!trackedDirs.has(d)) {
        entry = `${d}/`;
        break;
      }
    }
    if (entry.endsWith("/") && !dirs) continue;
    victims.add(entry);
  }
  for (const v of [...victims].sort()) {
    g.out += `${dry ? "Would remove" : "Removing"} ${v}\n`;
    if (!dry) await g.fs.rm(`${repo.root}/${v}`, { recursive: true, force: true });
  }
}

export { color, diffStat };
