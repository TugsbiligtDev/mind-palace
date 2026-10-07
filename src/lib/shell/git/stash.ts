// git stash (Module 36): put local changes aside and bring them back. Stored the way Git does:
// refs/stash points at a "WIP" commit whose parents are HEAD, a commit of the index and (with
// -u) a commit of the untracked files; the list of stashes is the reflog of refs/stash.
import { parseArgs } from "../util";
import { type G, changesBetween, needWorkTree, short, state } from "./context";
import { diffStat, unifiedDiff } from "./diff";
import { subject } from "./objects";
import { type Files, GitError, Repo } from "./repo";
import { committer, replay } from "./rewrite";
import { computeStatus, formatLong, trackingInfo } from "./status";

type WorkRepo = Repo & { root: string };

async function stashes(repo: Repo) {
  return repo.reflogEntries("refs/stash");
}

async function pickStash(repo: Repo, arg: string | undefined): Promise<{ n: number; sha: string; message: string }> {
  const list = await stashes(repo);
  if (!list.length) throw new GitError(arg ? `error: ${arg} is not a valid reference` : "No stash entries found.", 1);
  const m = /^(?:stash@\{)?(\d+)\}?$/.exec(arg ?? "0");
  const n = m ? Number(m[1]) : -1;
  if (n < 0 || n >= list.length) throw new GitError(`error: ${arg} is not a valid reference`, 1);
  return { n, sha: list[n].sha, message: list[n].message };
}

async function writeStashLog(repo: Repo, entries: { old: string; sha: string; message: string; time: number }[]) {
  // entries are newest first; the file is oldest first.
  if (!entries.length) {
    await repo.deleteRef("refs/stash");
    return;
  }
  const id = (await repo.identity(false))!;
  const lines = [...entries].reverse().map((e, i, all) => `${i === 0 ? "0".repeat(40) : all[i - 1].sha} ${e.sha} ${id.name} <${id.email}> ${e.time} +0000\t${e.message}`);
  await repo.writeText("logs/refs/stash", `${lines.join("\n")}\n`);
  await repo.writeRef("refs/stash", entries[0].sha);
}

async function push(g: G, repo: WorkRepo, message: string | undefined, untracked: boolean, keepIndex: boolean, quiet: boolean) {
  const s = await state(repo);
  if (!s.headSha) throw new GitError("You do not have the initial commit yet", 1);
  const index: Files = new Map(Object.entries(s.index.entries));
  const rules = await repo.ignoreRules();
  const untrackedFiles = untracked ? [...s.work.keys()].filter((p) => !index.has(p) && !s.head.has(p) && !Repo.isIgnored(rules, p, false)) : [];
  // The working folder's version of every tracked file.
  const work: Files = new Map();
  for (const [p, e] of index) {
    const w = s.work.get(p);
    if (w) work.set(p, { sha: await repo.writeBlob(await repo.readWork(p)), mode: w.mode });
    else void e;
  }
  const changed = (await changesBetween(repo, s.head, index)).length || (await changesBetween(repo, index, work)).length || untrackedFiles.length;
  if (Object.keys(s.index.conflicts).length) throw new GitError("error: could not write index", 1);
  if (!changed) {
    g.out += "No local changes to save\n";
    return;
  }
  const head = await repo.readCommit(s.headSha);
  const where = s.branch ?? "(no branch)";
  const desc = `${short(s.headSha)} ${subject(head)}`;
  const who = await committer(g, repo);
  const mk = async (files: Files, parents: string[], msg: string) => repo.writeCommit({ tree: await repo.writeTree(files), parents, author: who, committer: who, message: `${msg}\n` });
  const iSha = await mk(index, [s.headSha], `index on ${where}: ${desc}`);
  const parents = [s.headSha, iSha];
  if (untrackedFiles.length) {
    const uFiles: Files = new Map();
    for (const p of untrackedFiles) uFiles.set(p, { sha: await repo.writeBlob(await repo.readWork(p)), mode: s.work.get(p)!.mode });
    parents.push(await mk(uFiles, [], `untracked files on ${where}: ${desc}`));
  }
  const label = message ? `On ${where}: ${message}` : `WIP on ${where}: ${desc}`;
  const wSha = await mk(work, parents, label);
  const list = await stashes(repo);
  await writeStashLog(repo, [{ old: list[0]?.sha ?? "0".repeat(40), sha: wSha, message: label, time: who.time }, ...list]);
  // Back to a clean working folder.
  for (const p of new Set([...index.keys(), ...s.head.keys()])) {
    const want = keepIndex ? index.get(p) : s.head.get(p);
    if (want) await repo.writeWork(p, want);
    else await repo.removeWork(p);
  }
  await repo.writeIndex({ entries: Object.fromEntries(keepIndex ? index : s.head), conflicts: {} });
  for (const p of untrackedFiles) await repo.removeWork(p);
  if (!quiet) g.out += `Saved working directory and index state ${label}\n`;
}

async function apply(g: G, repo: WorkRepo, sha: string, restoreIndex: boolean): Promise<boolean> {
  const w = await repo.readCommit(sha);
  const base = await repo.commitFiles(w.parents[0]);
  const work = await repo.flatten(w.tree);
  const indexSnap = await repo.commitFiles(w.parents[1]);
  // Untracked files come back first; they must not be in the way.
  const s0 = await state(repo);
  if (w.parents[2]) {
    const u = await repo.commitFiles(w.parents[2]);
    const blocked = [...u.keys()].filter((p) => s0.work.has(p));
    if (blocked.length) throw new GitError(`${blocked.map((p) => `${p} already exists, no checkout`).join("\n")}\nerror: could not restore untracked files from stash`, 1);
    for (const [p, f] of u) await repo.writeWork(p, f);
  }
  const before = await repo.readIndex();
  const r = await replay(g, repo, base, work, { ours: "Updated upstream", theirs: "Stashed changes", base: "Stash base" });
  for (const n of r.notes) g.out += `${n}\n`;
  // The stash puts back the files, not what was staged (unless --index), except new files.
  const idx = await repo.readIndex();
  if (!r.conflicted.length) {
    const entries = { ...before.entries };
    for (const [p, f] of indexSnap) if (!base.has(p)) entries[p] = restoreIndex ? f : (idx.entries[p] ?? f);
    if (restoreIndex) for (const [p, f] of indexSnap) entries[p] = f;
    await repo.writeIndex({ entries, conflicts: {} });
  }
  if (r.conflicted.length) {
    g.out += "On branch " + ((await repo.head()).branch ?? "HEAD") + "\n";
    return false;
  }
  const st = await computeStatus(repo);
  g.out += formatLong(g, repo, st, await trackingInfo(repo, st.branch, st.headSha));
  return true;
}

export async function gitStash(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const [first, ...rest] = args;
  const sub = !first || first.startsWith("-") ? "push" : first;
  const subArgs = !first || first.startsWith("-") ? args : rest;
  const { flags, long, values, operands } = parseArgs(subArgs, "m");
  switch (sub) {
    case "push":
    case "save": {
      const msg = values.m ?? long.find((l) => l.startsWith("message="))?.slice(8) ?? (sub === "save" ? operands.join(" ") || undefined : undefined);
      return push(g, repo, msg, flags.has("u") || long.includes("include-untracked") || flags.has("a"), flags.has("k") || long.includes("keep-index"), flags.has("q"));
    }
    case "list": {
      const list = await stashes(repo);
      g.out += list.map((e, i) => `stash@{${i}}: ${e.message}\n`).join("");
      return;
    }
    case "show": {
      const st = await pickStash(repo, operands[0]);
      const w = await repo.readCommit(st.sha);
      const changes = await changesBetween(repo, await repo.commitFiles(w.parents[0]), await repo.flatten(w.tree));
      if (flags.has("u") || long.includes("include-untracked")) {
        if (w.parents[2]) changes.push(...(await changesBetween(repo, new Map(), await repo.commitFiles(w.parents[2]))));
      }
      g.out += flags.has("p") || long.includes("patch") ? changes.map((c) => unifiedDiff(c, g.tty)).join("") : diffStat(changes, g.tty);
      return;
    }
    case "apply":
    case "pop": {
      const st = await pickStash(repo, operands[0]);
      const ok = await apply(g, repo, st.sha, long.includes("index"));
      if (!ok) {
        if (sub === "pop") g.err += "The stash entry is kept in case you need it again.\n";
        throw new GitError("", 1);
      }
      if (sub === "pop") {
        const list = await stashes(repo);
        list.splice(st.n, 1);
        await writeStashLog(repo, list);
        g.out += `Dropped refs/stash@{${st.n}} (${st.sha})\n`;
      }
      return;
    }
    case "drop": {
      const st = await pickStash(repo, operands[0]);
      const list = await stashes(repo);
      list.splice(st.n, 1);
      await writeStashLog(repo, list);
      g.out += `Dropped refs/stash@{${st.n}} (${st.sha})\n`;
      return;
    }
    case "clear":
      await writeStashLog(repo, []);
      return;
    case "branch": {
      const name = operands[0];
      if (!name) throw new GitError("fatal: No branch name specified", 128);
      const st = await pickStash(repo, operands[1]);
      const w = await repo.readCommit(st.sha);
      const { gitSwitch } = await import("./branching");
      await gitSwitch(g, ["-c", name, w.parents[0]]);
      const ok = await apply(g, repo, st.sha, true);
      if (ok) {
        const list = await stashes(repo);
        list.splice(st.n, 1);
        await writeStashLog(repo, list);
        g.out += `Dropped refs/stash@{${st.n}} (${st.sha})\n`;
      }
      return;
    }
    default:
      throw new GitError(`error: unknown subcommand: \`${sub}'\nusage: git stash list [<log-options>]\n   or: git stash show [-u | --include-untracked | --only-untracked] [<diff-options>] [<stash>]\n   or: git stash drop [-q | --quiet] [<stash>]\n   or: git stash pop [--index] [-q | --quiet] [<stash>]\n   or: git stash apply [--index] [-q | --quiet] [<stash>]\n   or: git stash branch <branchname> [<stash>]\n   or: git stash [push [-p | --patch] [-S | --staged] [-k | --[no-]keep-index] [-q | --quiet]\n                 [-u | --include-untracked] [-a | --all] [(-m | --message) <message>]\n                 [--pathspec-from-file=<file> [--pathspec-file-nul]]\n                 [--] [<pathspec>...]]\n   or: git stash clear`, 129);
  }
}
