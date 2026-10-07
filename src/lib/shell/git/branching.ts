// git branch, switch, checkout and merge.
import { parseArgs } from "../util";
import { gitCommit, makeCommit } from "./basic";
import { type G, blobText, changesBetween, color, editMessage, needRepo, needWorkTree, pathspecMatches, repoPath, short, state } from "./context";
import { diffStat, mergeText, modeLines } from "./diff";
import { subject } from "./objects";
import { type FileEntry, type Files, GitError, type Index, Repo, setConfigValue } from "./repo";
import { aheadBehind, ancestors, trackingInfo, upstreamOf } from "./status";

const same = (a?: FileEntry, b?: FileEntry) => (!a && !b) || (!!a && !!b && a.sha === b.sha && a.mode === b.mode);

export function validBranchName(name: string): boolean {
  return !(
    !name ||
    name.startsWith("-") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.endsWith(".lock") ||
    name.includes("..") ||
    name.includes("//") ||
    name === "HEAD" ||
    /[\s~^:?*[\\\x00-\x1f\x7f]|@\{/.test(name)
  );
}

/**
 * Moves the working folder and index from HEAD's files to a commit's files, keeping local
 * changes to files the two commits agree on (and refusing when a change would be lost).
 */
export async function checkoutTo(g: G, repo: Repo & { root: string }, target: string | undefined, verb: "checkout" | "merge" = "checkout"): Promise<string[]> {
  const s = await state(repo);
  const T = target ? await repo.commitFiles(target) : new Map<string, FileEntry>();
  const I = new Map(Object.entries(s.index.entries));
  const rules = await repo.ignoreRules();
  const blocked: string[] = [];
  const untracked: string[] = [];
  for (const path of new Set([...s.head.keys(), ...T.keys()])) {
    const h = s.head.get(path);
    const t = T.get(path);
    if (same(h, t)) continue;
    const i = I.get(path);
    const w = s.work.get(path);
    if (!h && !i && w) {
      if (t && w.sha === t.sha) continue;
      if (!Repo.isIgnored(rules, path, false)) untracked.push(path);
      continue;
    }
    if (!same(i, h) || !same(w, i)) {
      if (same(i, t) && same(w, t)) continue;
      blocked.push(path);
    }
  }
  if (blocked.length)
    throw new GitError(
      `error: Your local changes to the following files would be overwritten by ${verb}:\n${blocked.map((p) => `\t${p}`).join("\n")}\nPlease commit your changes or stash them before you ${verb === "checkout" ? "switch branches" : "merge"}.\nAborting`,
      1,
    );
  if (untracked.length)
    throw new GitError(
      `error: The following untracked working tree files would be overwritten by ${verb}:\n${untracked.map((p) => `\t${p}`).join("\n")}\nPlease move or remove them before you ${verb === "checkout" ? "switch branches" : "merge"}.\nAborting`,
      1,
    );
  for (const path of new Set([...s.head.keys(), ...T.keys()])) {
    const h = s.head.get(path);
    const t = T.get(path);
    if (same(h, t)) continue;
    if (t) {
      await repo.writeWork(path, t);
      I.set(path, t);
    } else {
      await repo.removeWork(path);
      I.delete(path);
    }
  }
  await repo.writeIndex({ entries: Object.fromEntries(I), conflicts: {} });
  // Files that still differ from the new commit: the local changes carried along.
  const after = await repo.workFiles();
  const carried: string[] = [];
  for (const path of [...new Set([...T.keys(), ...I.keys()])].sort()) {
    const t = T.get(path);
    const i = I.get(path);
    const w = after.get(path);
    if (same(t, i) && same(i, w)) continue;
    carried.push(`${!w && i ? "D" : !t ? "A" : "M"}\t${path}`);
  }
  return carried;
}

async function previousBranch(repo: Repo): Promise<string | undefined> {
  const log = (await repo.readText("logs/HEAD")) ?? "";
  const moves = log.trim().split("\n").reverse();
  for (const l of moves) {
    const m = /\tcheckout: moving from (\S+) to (\S+)$/.exec(l);
    if (m) return m[1];
  }
  return undefined;
}

async function switchTo(g: G, repo: Repo & { root: string }, name: string, opts: { create?: boolean; force?: boolean; start?: string; detach?: boolean; quiet?: boolean; checkoutStyle?: boolean }) {
  if (await repo.readText("MERGE_HEAD")) throw new GitError(`fatal: cannot switch branch while merging\nConsider "git merge --quit" or "git worktree add".`);
  if (await repo.readText("rebase-merge/head-name")) throw new GitError(`fatal: cannot switch branch while rebasing\nConsider "git rebase --quit" or "git worktree add".`);
  if (await repo.readText("CHERRY_PICK_HEAD")) throw new GitError(`fatal: cannot switch branch while cherry-picking\nConsider "git cherry-pick --quit" or "git worktree add".`);
  const h = await repo.head();
  const from = h.branch ?? (h.sha ? short(h.sha) : "HEAD");
  if (name === "-") {
    const prev = await previousBranch(repo);
    if (!prev) throw new GitError("fatal: invalid reference: @{-1}");
    name = prev;
  }
  if (opts.detach) {
    const sha = await repo.resolve(name);
    if (!sha) throw new GitError(`fatal: invalid reference: ${name}`);
    const carried = await checkoutTo(g, repo, sha);
    await repo.setHead({ detached: sha });
    await repo.reflog("HEAD", h.sha ?? "0".repeat(40), sha, `checkout: moving from ${from} to ${sha}`);
    for (const c of carried) g.out += `${c}\n`;
    const c = await repo.readCommit(sha);
    if (opts.checkoutStyle)
      g.err += `Note: switching to '${name}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nIf you want to create a new branch to retain commits you create, you may\ndo so (now or later) by using -c with the switch command. Example:\n\n  git switch -c <new-branch-name>\n\nOr undo this operation with:\n\n  git switch -\n\nTurn off this advice by setting config variable advice.detachedHead to false\n\n`;
    g.err += `HEAD is now at ${short(sha)} ${subject(c)}\n`;
    return;
  }
  const ref = `refs/heads/${name}`;
  let existing = await repo.readRef(ref);
  let tracking: string | undefined;
  if (opts.create) {
    if (!validBranchName(name)) throw new GitError(`fatal: '${name}' is not a valid branch name`);
    if (existing && !opts.force) throw new GitError(`fatal: a branch named '${name}' already exists`);
    const start = opts.start ? await repo.resolve(opts.start) : h.sha;
    if (opts.start && !start) throw new GitError(`fatal: invalid reference: ${opts.start}`);
    if (opts.start && (await repo.readRef(`refs/remotes/${opts.start}`))) tracking = opts.start;
    if (!start) {
      // A new branch on a repository with no commits yet just renames the future branch.
      await repo.setHead({ branch: name });
      if (!opts.quiet) g.err += `Switched to a new branch '${name}'\n`;
      return;
    }
    existing = undefined;
    const carried = await checkoutTo(g, repo, start);
    await repo.writeRef(ref, start);
    await repo.reflog(ref, "0".repeat(40), start, `branch: Created from ${opts.start ?? "HEAD"}`);
    await repo.setHead({ branch: name });
    await repo.reflog("HEAD", h.sha ?? "0".repeat(40), start, `checkout: moving from ${from} to ${name}`);
    if (tracking) await setUpstream(repo, name, tracking);
    for (const c of carried) g.out += `${c}\n`;
    if (tracking && !opts.quiet) g.out += `branch '${name}' set up to track '${tracking}'.\n`;
    if (!opts.quiet) g.err += `Switched to a new branch '${name}'\n`;
    return;
  }
  if (!existing) {
    // No local branch, but a remote one with that name: create a local branch that tracks it.
    const remotes = (await repo.listRefs("refs/remotes")).filter((r) => r.name.endsWith(`/${name}`) && !r.name.endsWith("/HEAD"));
    if (remotes.length === 1) return switchTo(g, repo, name, { ...opts, create: true, start: remotes[0].name.slice(13) });
    if (await repo.resolve(name)) {
      if (opts.checkoutStyle) return switchTo(g, repo, name, { ...opts, detach: true });
      throw new GitError(`fatal: a branch is expected, got commit '${name}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.\nhint: Disable this message with "git config set advice.suggestDetachingHead false"`);
    }
    if (h.branch === name && !h.sha) {
      g.err += `Already on '${name}'\n`;
      return;
    }
    throw new GitError(opts.checkoutStyle ? `error: pathspec '${name}' did not match any file(s) known to git` : `fatal: invalid reference: ${name}`, opts.checkoutStyle ? 1 : 128);
  }
  if (h.branch === name) {
    g.err += `Already on '${name}'\n`;
    const up = await upstreamOf(repo, name);
    if (up) g.out += await trackingInfo(repo, name, h.sha);
    return;
  }
  const carried = await checkoutTo(g, repo, existing);
  await repo.setHead({ branch: name });
  await repo.reflog("HEAD", h.sha ?? "0".repeat(40), existing, `checkout: moving from ${from} to ${name}`);
  for (const c of carried) g.out += `${c}\n`;
  if (!opts.quiet) g.err += `Switched to branch '${name}'\n`;
  if (await upstreamOf(repo, name)) g.out += await trackingInfo(repo, name, existing);
}

export async function setUpstream(repo: Repo, branch: string, upstream: string) {
  const slash = upstream.indexOf("/");
  const remote = upstream.slice(0, slash);
  const merge = upstream.slice(slash + 1);
  const secs = await repo.configSections(false);
  setConfigValue(secs, `branch.${branch}.remote`, remote);
  setConfigValue(secs, `branch.${branch}.merge`, `refs/heads/${merge}`);
  await repo.saveConfig(false, secs);
}

export async function gitSwitch(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long, values, operands } = parseArgs(args, "cC");
  const create = values.c ?? values.C ?? long.find((l) => l.startsWith("create="))?.slice(7);
  if (create !== undefined || long.includes("create")) {
    const name = create ?? operands.shift();
    if (!name) throw new GitError("fatal: missing branch name; try -c", 128);
    return switchTo(g, repo, name, { create: true, force: values.C !== undefined, start: operands[0], quiet: flags.has("q") });
  }
  const name = operands[0];
  if (!name) throw new GitError("fatal: missing branch or commit argument");
  return switchTo(g, repo, name, { detach: long.includes("detach") || flags.has("d"), quiet: flags.has("q") });
}

/** git checkout --ours / --theirs <file>: one side of a conflict, written to the file. */
export async function takeSide(g: G, repo: Repo & { root: string }, side: "ours" | "theirs", paths: string[], verb: string) {
  const idx = await repo.readIndex();
  let n = 0;
  for (const p of paths) {
    const spec = repoPath(g, repo, p);
    const hits = Object.keys(idx.conflicts).filter((k) => pathspecMatches(spec, k));
    if (!hits.length) {
      if (idx.entries[spec]) continue;
      throw new GitError(`error: pathspec '${p}' did not match any file(s) known to git`, 1);
    }
    for (const k of hits) {
      const f = idx.conflicts[k][side];
      if (!f) throw new GitError(`error: path '${k}' does not have ${side === "ours" ? "our" : "their"} version`, 1);
      await repo.writeWork(k, f);
      n++;
    }
  }
  if (verb === "checkout") g.err += `Updated ${n} path${n === 1 ? "" : "s"} from the index\n`;
}

export async function gitCheckout(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const side = args.includes("--ours") ? "ours" : args.includes("--theirs") ? "theirs" : undefined;
  if (side) return takeSide(g, repo, side, args.filter((a) => !a.startsWith("-")), "checkout");
  const dash = args.indexOf("--");
  if (dash >= 0) {
    const source = args.slice(0, dash).filter((a) => !a.startsWith("-"))[0];
    return checkoutPaths(g, repo, source, args.slice(dash + 1));
  }
  const { flags, values, operands } = parseArgs(args, "bB");
  if (values.b !== undefined || values.B !== undefined) return switchTo(g, repo, values.b ?? values.B, { create: true, force: values.B !== undefined, start: operands[0], quiet: flags.has("q"), checkoutStyle: true });
  const [first, ...rest] = operands;
  if (!first) throw new GitError("fatal: you must specify path(s) to restore", 128);
  const isRef = (await repo.readRef(`refs/heads/${first}`)) || first === "-" || (await repo.resolve(first)) || (await repo.listRefs("refs/remotes")).some((r) => r.name.endsWith(`/${first}`));
  if (isRef && rest.length === 0) return switchTo(g, repo, first, { quiet: flags.has("q"), checkoutStyle: true });
  if (isRef) return checkoutPaths(g, repo, first, rest);
  return checkoutPaths(g, repo, undefined, operands);
}

async function checkoutPaths(g: G, repo: Repo & { root: string }, source: string | undefined, paths: string[]) {
  const idx = await repo.readIndex();
  let from: Files = new Map(Object.entries(idx.entries));
  if (source) {
    const sha = await repo.resolve(source);
    if (!sha) throw new GitError(`fatal: invalid reference: ${source}`);
    from = await repo.commitFiles(sha);
  }
  let n = 0;
  for (const p of paths) {
    const spec = repoPath(g, repo, p);
    const hits = [...from.keys()].filter((k) => pathspecMatches(spec, k));
    if (hits.length === 0) throw new GitError(`error: pathspec '${p}' did not match any file(s) known to git`, 1);
    for (const k of hits) {
      await repo.writeWork(k, from.get(k)!);
      if (source) idx.entries[k] = from.get(k)!;
      n++;
    }
  }
  await repo.writeIndex(idx);
  g.err += `Updated ${n} path${n === 1 ? "" : "s"} from ${source ? `${(await repo.resolve(source))!.slice(0, 7)}` : "the index"}\n`;
}

// ----- branch -----

export async function gitBranch(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { flags, long, values, operands } = parseArgs(args, "u");
  const h = await repo.head();
  const del = flags.has("d") || flags.has("D") || long.includes("delete");
  const force = flags.has("D") || flags.has("f") || long.includes("force");
  const move = flags.has("m") || flags.has("M") || long.includes("move");

  // Git 2.56: delete every local branch whose tip is already in its upstream. Operands are
  // patterns: one naming a remote (`origin/*`) picks branches by their upstream, any other
  // (`topic-*`) by their own name. The current branch and branches without an upstream stay.
  if (long.includes("delete-merged")) {
    const dry = flags.has("n") || long.includes("dry-run");
    const re = (p: string) => new RegExp(`^${p.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    const remotes = new Set((await repo.configSections(false)).filter((s) => s.name === "remote" && s.sub).map((s) => s.sub!));
    const upPats = operands.filter((p) => remotes.has(p.split("/")[0])).map(re);
    const namePats = operands.filter((p) => !remotes.has(p.split("/")[0])).map(re);
    for (const r of await repo.listRefs("refs/heads")) {
      const name = r.name.slice(11);
      if (name === h.branch) continue;
      if (namePats.length && !namePats.some((p) => p.test(name))) continue;
      const up = await upstreamOf(repo, name);
      const upSha = up && (await repo.readRef(`refs/remotes/${up}`));
      if (!up || !upSha) continue;
      if (upPats.length && !upPats.some((p) => p.test(up))) continue;
      if (!(await ancestors(repo, upSha)).has(r.sha)) continue;
      if (dry) {
        g.out += `Would delete branch ${name} (was ${short(r.sha)}).\n`;
        continue;
      }
      await repo.deleteRef(`refs/heads/${name}`);
      const secs = await repo.configSections(false);
      await repo.saveConfig(false, secs.filter((s) => !(s.name === "branch" && s.sub === name)));
      g.out += `Deleted branch ${name} (was ${short(r.sha)}).\n`;
    }
    return;
  }

  if (del) {
    if (operands.length === 0) throw new GitError("fatal: branch name required");
    for (const name of operands) {
      const sha = await repo.readRef(`refs/heads/${name}`);
      if (!sha) {
        g.err += `error: branch '${name}' not found\n`;
        throw new GitError("", 1);
      }
      if (name === h.branch) throw new GitError(`error: cannot delete branch '${name}' used by worktree at '${repo.root}'`, 1);
      if (!force) {
        const up = await upstreamOf(repo, name);
        const against = (up && (await repo.readRef(`refs/remotes/${up}`))) || h.sha;
        if (!(await ancestors(repo, against)).has(sha))
          throw new GitError(
            `error: the branch '${name}' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'\nhint: Disable this message with "git config set advice.forceDeleteBranch false"`,
            1,
          );
      }
      await repo.deleteRef(`refs/heads/${name}`);
      const secs = await repo.configSections(false);
      const kept = secs.filter((s) => !(s.name === "branch" && s.sub === name));
      if (kept.length !== secs.length) await repo.saveConfig(false, kept);
      g.out += `Deleted branch ${name} (was ${short(sha)}).\n`;
    }
    return;
  }
  if (move) {
    const [a, b] = operands.length === 1 ? [h.branch!, operands[0]] : operands;
    if (!b) throw new GitError("fatal: branch name required");
    if (!validBranchName(b)) throw new GitError(`fatal: '${b}' is not a valid branch name`);
    const sha = await repo.readRef(`refs/heads/${a}`);
    if ((await repo.readRef(`refs/heads/${b}`)) && !flags.has("M")) throw new GitError(`fatal: a branch named '${b}' already exists`);
    if (sha) {
      await repo.writeRef(`refs/heads/${b}`, sha);
      await repo.deleteRef(`refs/heads/${a}`);
    } else if (a !== h.branch) throw new GitError(`error: refname refs/heads/${a} not found\nfatal: branch rename failed`);
    if (a === h.branch) await repo.setHead({ branch: b });
    return;
  }
  if (values.u !== undefined || long.some((l) => l.startsWith("set-upstream-to="))) {
    const up = values.u ?? long.find((l) => l.startsWith("set-upstream-to="))!.slice(16);
    const branch = operands[0] ?? h.branch!;
    if (!(await repo.readRef(`refs/remotes/${up}`))) throw new GitError(`fatal: the requested upstream branch '${up}' does not exist`);
    await setUpstream(repo, branch, up);
    g.out += `branch '${branch}' set up to track '${up}'.\n`;
    return;
  }
  if (long.includes("show-current")) {
    if (h.branch) g.out += `${h.branch}\n`;
    return;
  }
  if (long.includes("unset-upstream")) {
    const secs = await repo.configSections(false);
    await repo.saveConfig(false, secs.filter((s) => !(s.name === "branch" && s.sub === (operands[0] ?? h.branch))));
    return;
  }
  const listing = flags.has("a") || flags.has("r") || flags.has("v") || long.includes("all") || long.some((l) => l.startsWith("merged") || l.startsWith("no-merged") || l === "list") || operands.length === 0;
  if (!listing) {
    const [name, start] = operands;
    if (!validBranchName(name)) throw new GitError(`fatal: '${name}' is not a valid branch name`);
    const existing = await repo.readRef(`refs/heads/${name}`);
    if (existing && !force) throw new GitError(`fatal: a branch named '${name}' already exists`);
    if (existing && name === h.branch) throw new GitError(`fatal: cannot force update the branch '${name}' used by worktree at '${repo.root}'`);
    const sha = await repo.resolve(start ?? "HEAD");
    if (!sha) throw new GitError(`fatal: not a valid object name: '${start ?? h.branch}'`);
    await repo.writeRef(`refs/heads/${name}`, sha);
    await repo.reflog(`refs/heads/${name}`, existing ?? "0".repeat(40), sha, existing ? `branch: Reset to ${start ?? "HEAD"}` : `branch: Created from ${start ?? "HEAD"}`);
    if (start && !existing && (await repo.readRef(`refs/remotes/${start}`))) {
      await setUpstream(repo, name, start);
      g.out += `branch '${name}' set up to track '${start}'.\n`;
    }
    return;
  }
  // Listing.
  let rows: { name: string; display: string; sha: string; current: boolean; remote: boolean }[] = [];
  if (!flags.has("r")) {
    for (const r of await repo.listRefs("refs/heads")) {
      const name = r.name.slice(11);
      rows.push({ name, display: name, sha: r.sha, current: name === h.branch, remote: false });
    }
    const rebasing = (await repo.readText("rebase-merge/head-name"))?.trim().replace(/^refs\/heads\//, "");
    if (!h.branch && h.sha) rows.unshift({ name: "HEAD", display: rebasing ? `(no branch, rebasing ${rebasing})` : `(HEAD detached at ${short(h.sha)})`, sha: h.sha, current: true, remote: false });
  }
  if (flags.has("a") || flags.has("r") || long.includes("all")) {
    for (const r of await repo.listRefs("refs/remotes")) {
      const name = r.name.slice(13);
      if (name.endsWith("/HEAD")) {
        const target = ((await repo.readText(r.name)) ?? "").trim().replace(/^ref: refs\/remotes\//, "");
        rows.push({ name, display: `${flags.has("r") ? "" : "remotes/"}${name} -> ${target}`, sha: r.sha, current: false, remote: true });
      } else rows.push({ name, display: `${flags.has("r") ? "" : "remotes/"}${name}`, sha: r.sha, current: false, remote: true });
    }
  }
  const merged = long.find((l) => l === "merged" || l.startsWith("merged="));
  const noMerged = long.find((l) => l === "no-merged" || l.startsWith("no-merged="));
  if (merged || noMerged) {
    const target = await repo.resolve((merged ?? noMerged)!.split("=")[1] ?? operands[0] ?? "HEAD");
    const anc = await ancestors(repo, target);
    rows = rows.filter((r) => (merged ? anc.has(r.sha) : !anc.has(r.sha)));
  }
  const width = Math.max(0, ...rows.map((r) => r.display.length));
  for (const r of rows) {
    const mark = r.current ? "* " : "  ";
    const name = r.current ? color(g, "32", r.display) : r.remote ? color(g, "31", r.display) : r.display;
    let line = `${mark}${name}`;
    if (flags.has("v") || long.includes("verbose")) {
      const c = await repo.readCommit(r.sha);
      let track = "";
      if (args.includes("-vv") && !r.remote && r.name !== "HEAD") {
        const up = await upstreamOf(repo, r.name);
        if (up) {
          const upSha = await repo.readRef(`refs/remotes/${up}`);
          const { ahead, behind } = await aheadBehind(repo, r.sha, upSha);
          const parts = [ahead && `ahead ${ahead}`, behind && `behind ${behind}`].filter(Boolean);
          track = `[${color(g, "34", up)}${parts.length ? `: ${parts.join(", ")}` : ""}] `;
        }
      }
      line = `${mark}${name}${" ".repeat(width - r.display.length)} ${color(g, "33", short(r.sha))} ${track}${subject(c)}`;
    }
    g.out += `${line}\n`;
  }
}

// ----- merge -----

export async function mergeBase(repo: Repo, a: string, b: string): Promise<string | undefined> {
  const A = await ancestors(repo, a);
  const cands: string[] = [];
  const seen = new Set<string>();
  const queue = [b];
  while (queue.length) {
    const x = queue.shift()!;
    if (seen.has(x)) continue;
    seen.add(x);
    if (A.has(x)) {
      cands.push(x);
      continue;
    }
    queue.push(...(await repo.readCommit(x)).parents);
  }
  for (const c of cands) {
    let dominated = false;
    for (const o of cands) if (o !== c && (await ancestors(repo, o)).has(c)) dominated = true;
    if (!dominated) return c;
  }
  return undefined;
}

export type MergeOptions = { noFF?: boolean; ffOnly?: boolean; message?: string; noEdit?: boolean; label: string; squash?: boolean };

/** Merges `theirs` into the current branch. Returns false when it stopped on conflicts. */
export async function mergeInto(g: G, repo: Repo & { root: string }, theirs: string, opts: MergeOptions): Promise<boolean> {
  const s = await state(repo);
  if (Object.keys(s.index.conflicts).length)
    throw new GitError(
      "error: Merging is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.",
    );
  if (await repo.readText("MERGE_HEAD")) throw new GitError("fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.");
  const ours = s.headSha;
  if (!ours) {
    // Merging into a branch with no commits: just take theirs.
    await checkoutTo(g, repo, theirs, "merge");
    await repo.advance(theirs, `merge ${opts.label}: Fast-forward`);
    return true;
  }
  if ((await ancestors(repo, ours)).has(theirs)) {
    g.out += "Already up to date.\n";
    return true;
  }
  const base = await mergeBase(repo, ours, theirs);
  const canFF = base === ours;
  if (opts.ffOnly && !canFF) throw new GitError("fatal: Not possible to fast-forward, aborting.");
  if (canFF && !opts.noFF) {
    await checkoutTo(g, repo, theirs, "merge");
    await repo.advance(theirs, `merge ${opts.label}: Fast-forward`);
    await repo.writeText("ORIG_HEAD", `${ours}\n`);
    const changes = await changesBetween(repo, s.head, await repo.commitFiles(theirs));
    g.out += `Updating ${short(ours)}..${short(theirs)}\nFast-forward\n${diffStat(changes, g.tty)}${modeLines(changes)}`;
    return true;
  }

  const B = await repo.commitFiles(base);
  const O = s.head;
  const T = await repo.commitFiles(theirs);
  const I = new Map(Object.entries(s.index.entries));
  // Local changes to files the merge needs to touch would be lost: refuse, like Git.
  const touched = [...new Set([...B.keys(), ...O.keys(), ...T.keys()])].filter((p) => !same(T.get(p), O.get(p)) && !same(T.get(p), B.get(p)));
  const dirty = touched.filter((p) => !same(I.get(p), O.get(p)) || !same(s.work.get(p), I.get(p)));
  if (dirty.length)
    throw new GitError(
      `error: Your local changes to the following files would be overwritten by merge:\n${dirty.map((p) => `\t${p}`).join("\n")}\nPlease commit your changes or stash them before you merge.\nAborting`,
      1,
    );
  const rules = await repo.ignoreRules();
  const untrackedHit = touched.filter((p) => !O.get(p) && !I.get(p) && s.work.get(p) && T.get(p) && s.work.get(p)!.sha !== T.get(p)!.sha && !Repo.isIgnored(rules, p, false));
  if (untrackedHit.length)
    throw new GitError(`error: The following untracked working tree files would be overwritten by merge:\n${untrackedHit.map((p) => `\t${p}`).join("\n")}\nPlease move or remove them before you merge.\nAborting`, 1);

  const style = ((await repo.config("merge.conflictStyle")) ?? "merge") as "merge" | "diff3" | "zdiff3";
  const merged: Files = new Map();
  const index: Index = { entries: {}, conflicts: {} };
  const notes: string[] = [];
  const conflicted: string[] = [];
  for (const path of [...new Set([...B.keys(), ...O.keys(), ...T.keys()])].sort()) {
    const b = B.get(path);
    const o = O.get(path);
    const t = T.get(path);
    if (same(o, t)) {
      if (o) merged.set(path, o);
      continue;
    }
    if (same(b, o)) {
      if (t) merged.set(path, t);
      continue;
    }
    if (same(b, t)) {
      if (o) merged.set(path, o);
      continue;
    }
    // Both sides changed this file.
    if (o && t) {
      notes.push(`Auto-merging ${path}`);
      const r = mergeText(await blobText(repo, o.sha), b ? await blobText(repo, b.sha) : "", await blobText(repo, t.sha), { ours: "HEAD", theirs: opts.label, base: base ? short(base) : "empty tree" }, style);
      const sha = await repo.writeBlob(r.text);
      const mode = o.mode === t.mode ? o.mode : b && o.mode === b.mode ? t.mode : o.mode;
      if (r.conflicts) {
        notes.push(`CONFLICT (${b ? "content" : "add/add"}): Merge conflict in ${path}`);
        conflicted.push(path);
        index.conflicts[path] = { base: b, ours: o, theirs: t };
        await repo.writeWork(path, { sha, mode });
      } else merged.set(path, { sha, mode });
      continue;
    }
    // One side deleted it, the other changed it.
    const kept = (o ?? t)!;
    const deletedIn = o ? opts.label : "HEAD";
    const changedIn = o ? "HEAD" : opts.label;
    notes.push(`CONFLICT (modify/delete): ${path} deleted in ${deletedIn} and modified in ${changedIn}.  Version ${changedIn} of ${path} left in tree.`);
    conflicted.push(path);
    index.conflicts[path] = { base: b, ours: o, theirs: t };
    await repo.writeWork(path, kept);
  }
  // Update the working folder for the cleanly merged files.
  for (const path of new Set([...O.keys(), ...merged.keys()])) {
    if (index.conflicts[path]) continue;
    const m = merged.get(path);
    if (m) {
      index.entries[path] = m;
      if (!same(O.get(path), m) || !same(s.work.get(path), m)) await repo.writeWork(path, m);
    } else await repo.removeWork(path);
  }
  // Staged files the merge didn't touch stay as they were.
  for (const [p, e] of I) if (!touched.includes(p) && !index.conflicts[p] && !(p in index.entries) && !O.has(p)) index.entries[p] = e;

  const into = s.branch && !["main", "master"].includes(s.branch) ? ` into ${s.branch}` : "";
  const what = opts.label.includes("/") && (await repo.readRef(`refs/remotes/${opts.label}`)) ? `remote-tracking branch '${opts.label}'` : /^[0-9a-f]{7,40}$/.test(opts.label) ? `commit '${opts.label}'` : `branch '${opts.label}'`;
  const defaultMsg = opts.message ?? `Merge ${what}${into}`;
  await repo.writeText("ORIG_HEAD", `${ours}\n`);

  for (const n of notes) g.out += `${n}\n`;
  if (conflicted.length) {
    await repo.writeIndex(index);
    await repo.writeText("MERGE_HEAD", `${theirs}\n`);
    await repo.writeText("MERGE_MSG", `${defaultMsg}\n\n# Conflicts:\n${conflicted.map((p) => `#\t${p}`).join("\n")}\n`);
    await repo.writeText("MERGE_MODE", "no-ff\n");
    g.out += "Automatic merge failed; fix conflicts and then commit the result.\n";
    return false;
  }
  await repo.writeIndex(index);
  let message = `${defaultMsg}\n`;
  if (!opts.noEdit && g.tty && g.m.interactive) {
    const edited = await editMessage(
      g,
      repo,
      "MERGE_MSG",
      `${defaultMsg}\n# Please enter a commit message to explain why this merge is necessary,\n# especially if it merges an updated upstream into a topic branch.\n#\n# Lines starting with '#' will be ignored, and an empty message aborts\n# the commit.\n`,
    );
    if (!edited) {
      await repo.writeText("MERGE_HEAD", `${theirs}\n`);
      throw new GitError("Not committing merge; use 'git commit' to complete the merge.", 1);
    }
    message = edited;
  } else if (!opts.noEdit && g.tty && g.m.quiet) {
    const replay = await g.m.edit("MERGE_MSG", defaultMsg);
    if (replay) message = replay;
  }
  const tree = await repo.writeTree(new Map(Object.entries(index.entries)));
  const sha = await makeCommit(g, repo, tree, [ours, theirs], message);
  await repo.advance(sha, `merge ${opts.label}: Merge made by the 'ort' strategy.`);
  await repo.remove("MERGE_MSG");
  const changes = await changesBetween(repo, O, new Map(Object.entries(index.entries)));
  g.out += `Merge made by the 'ort' strategy.\n${diffStat(changes, g.tty)}${modeLines(changes)}`;
  return true;
}

export async function gitMerge(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long, values, operands } = parseArgs(args, "m");
  if (long.includes("abort")) {
    if (!(await repo.readText("MERGE_HEAD"))) throw new GitError("fatal: There is no merge to abort (MERGE_HEAD missing).");
    await abortMerge(repo);
    return;
  }
  if (long.includes("continue")) {
    if (!(await repo.readText("MERGE_HEAD"))) throw new GitError("fatal: There is no merge in progress (MERGE_HEAD missing).");
    return gitCommit(g, ["--no-edit"]);
  }
  let target = operands[0];
  if (!target) {
    const h = await repo.head();
    const up = h.branch ? await upstreamOf(repo, h.branch) : undefined;
    if (!up) throw new GitError("fatal: No remote for the current branch.");
    target = up;
  }
  const sha = await repo.resolve(target);
  if (!sha) throw new GitError(`merge: ${target} - not something we can merge`, 1);
  const ok = await mergeInto(g, repo, sha, {
    noFF: long.includes("no-ff"),
    ffOnly: long.includes("ff-only"),
    message: values.m,
    noEdit: long.includes("no-edit") || flags.has("n") || values.m !== undefined,
    label: target,
  });
  if (!ok) throw new GitError("", 1);
}

/** Puts the index and tracked files back the way they were before the merge started. */
export async function abortMerge(repo: Repo & { root: string }) {
  const s = await state(repo);
  const H = s.head;
  const paths = new Set([...Object.keys(s.index.entries), ...Object.keys(s.index.conflicts), ...H.keys()]);
  for (const p of paths) {
    const h = H.get(p);
    if (h) await repo.writeWork(p, h);
    else await repo.removeWork(p);
  }
  await repo.writeIndex({ entries: Object.fromEntries(H), conflicts: {} });
  for (const f of ["MERGE_HEAD", "MERGE_MSG", "MERGE_MODE"]) await repo.remove(f);
}

/**
 * Merges two commits' files without a working folder (what GitHub does when you press "Merge").
 * Returns the merged files, or undefined if any file conflicts.
 */
export async function mergeFiles(repo: Repo, ours: string, theirs: string): Promise<Files | undefined> {
  const base = await mergeBase(repo, ours, theirs);
  const B = await repo.commitFiles(base);
  const O = await repo.commitFiles(ours);
  const T = await repo.commitFiles(theirs);
  const out: Files = new Map();
  for (const path of new Set([...B.keys(), ...O.keys(), ...T.keys()])) {
    const b = B.get(path);
    const o = O.get(path);
    const t = T.get(path);
    if (same(o, t) || same(b, t)) {
      if (o) out.set(path, o);
    } else if (same(b, o)) {
      if (t) out.set(path, t);
    } else if (o && t) {
      const r = mergeText(await blobText(repo, o.sha), b ? await blobText(repo, b.sha) : "", await blobText(repo, t.sha), { ours: "base", theirs: "head" });
      if (r.conflicts) return undefined;
      out.set(path, { sha: await repo.writeBlob(r.text), mode: o.mode });
    } else return undefined;
  }
  return out;
}

export async function gitMergeBase(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { long, operands } = parseArgs(args);
  const [a, b] = operands;
  if (!a || !b) throw new GitError("usage: git merge-base [-a | --all] <commit> <commit>...\n   or: git merge-base --is-ancestor <commit> <commit>", 129);
  const A = await repo.resolve(a);
  const B = await repo.resolve(b);
  if (!A) throw new GitError(`fatal: Not a valid object name ${a}`);
  if (!B) throw new GitError(`fatal: Not a valid object name ${b}`);
  if (long.includes("is-ancestor")) {
    if (!(await ancestors(repo, B)).has(A)) throw new GitError("", 1);
    return;
  }
  const base = await mergeBase(repo, A, B);
  if (!base) throw new GitError("", 1);
  g.out += `${base}\n`;
}
