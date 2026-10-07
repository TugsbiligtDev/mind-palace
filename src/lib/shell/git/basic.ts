// git init, config, add, commit, restore, rm and mv.
import { HOME, dirname, join, parseArgs, tildify } from "../util";
import { type G, changesBetween, cleanMessage, dateString, editMessage, needWorkTree, pathspecMatches, repoPath, shown, short, state } from "./context";
import { countLines, hasConflictMarkers, modeLines, summaryLine } from "./diff";
import { type Commit, subject } from "./objects";
import {
  type Files,
  GLOBAL_CONFIG,
  GitError,
  Repo,
  configEntries,
  exists,
  isDir,
  parseConfig,
  serializeConfig,
  setConfigValue,
  splitKey,
} from "./repo";
import { computeStatus, formatLong, trackingInfo } from "./status";

// ----- init -----

const DEFAULT_BRANCH_HINT = `hint: Using 'master' as the name for the initial branch. This default branch name
hint: will change to "main" in Git 3.0. To configure the initial branch name
hint: to use in all of your new repositories, which will suppress this warning,
hint: call:
hint:
hint: \tgit config --global init.defaultBranch <name>
hint:
hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
hint: 'development'. The just-created branch can be renamed via this command:
hint:
hint: \tgit branch -m <name>
hint:
hint: Disable this message with "git config set advice.defaultBranchName false"
`;

const EXCLUDE = `# git ls-files --others --exclude-from=.git/info/exclude
# Lines that start with '#' are comments.
# For a project mostly in C, the following would be a good set of
# exclude patterns (uncomment them if you want to use them):
# *.[oa]
# *~
`;

async function globalConfig(g: G, key: string): Promise<string | undefined> {
  try {
    const secs = parseConfig(await g.fs.readFile(GLOBAL_CONFIG));
    return configEntries(secs).filter(([k]) => k === key.toLowerCase()).at(-1)?.[1];
  } catch {
    return undefined;
  }
}

/** Creates the files of a new repository. Also used by clone and by lesson set-up scripts. */
export async function initRepo(g: G, dir: string, opts: { bare?: boolean; branch?: string }): Promise<{ gitdir: string; existed: boolean; hint: boolean }> {
  const gitdir = opts.bare ? dir : join(dir, ".git");
  const existed = await exists(g.fs, join(gitdir, "HEAD"));
  await g.fs.mkdir(dir, { recursive: true });
  const configured = await globalConfig(g, "init.defaultBranch");
  const branch = opts.branch ?? configured ?? "master";
  for (const d of ["objects/info", "objects/pack", "refs/heads", "refs/tags", "hooks", "info"]) await g.fs.mkdir(join(gitdir, d), { recursive: true });
  if (!existed) {
    await g.fs.writeFile(join(gitdir, "HEAD"), `ref: refs/heads/${branch}\n`);
    await g.fs.writeFile(
      join(gitdir, "config"),
      `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = ${opts.bare ? "true" : "false"}\n${opts.bare ? "" : "\tlogallrefupdates = true\n"}`,
    );
    await g.fs.writeFile(join(gitdir, "description"), "Unnamed repository; edit this file 'description' to name the repository.\n");
    await g.fs.writeFile(join(gitdir, "info/exclude"), EXCLUDE);
  }
  return { gitdir, existed, hint: !existed && !opts.branch && !configured };
}

export async function gitInit(g: G, args: string[]) {
  const { flags, long, values, operands } = parseArgs(args, "b");
  const branchOpt = values.b ?? long.find((l) => l.startsWith("initial-branch="))?.split("=")[1];
  const bare = long.includes("bare");
  const dir = operands[0] ? join(g.cwd, operands[0]) : g.cwd;
  const r = await initRepo(g, dir, { bare, branch: branchOpt });
  if (r.hint && !flags.has("q")) g.err += DEFAULT_BRANCH_HINT;
  if (!flags.has("q")) g.out += `${r.existed ? "Reinitialized existing" : "Initialized empty"} Git repository in ${r.gitdir}/\n`;
}

// ----- config -----

export async function gitConfig(g: G, args: string[]) {
  let rest = [...args];
  // The newer form: git config set/get/list/unset/edit.
  let action: "get" | "set" | "list" | "unset" | "edit" | undefined;
  if (["set", "get", "list", "unset", "edit"].includes(rest[0])) action = rest.shift() as typeof action;
  const take = (flag: string) => {
    const i = rest.indexOf(flag);
    if (i === -1) return false;
    rest.splice(i, 1);
    return true;
  };
  const global = take("--global");
  take("--local");
  const showOrigin = take("--show-origin");
  if (take("--list") || take("-l")) action = "list";
  if (take("--unset") || take("--unset-all")) action = "unset";
  if (take("--edit") || take("-e")) action = "edit";
  if (take("--get")) action = "get";
  rest = rest.filter((a) => !a.startsWith("--"));

  const repo = await Repo.find(g.fs, g.cwd, g.m.now);
  if (!global && !repo && action !== "list" && action !== "get" && !(action === undefined && rest.length === 1)) throw new GitError("fatal: not in a git directory");
  const file = global || !repo ? GLOBAL_CONFIG : join(repo.gitdir, "config");

  const read = async (path: string) => {
    try {
      return parseConfig(await g.fs.readFile(path));
    } catch {
      return [];
    }
  };

  if (action === "list") {
    const files = global ? [GLOBAL_CONFIG] : [GLOBAL_CONFIG, ...(repo ? [join(repo.gitdir, "config")] : [])];
    for (const f of files) for (const [k, v] of configEntries(await read(f))) g.out += `${showOrigin ? `file:${tildify(f).replace(/^~/, HOME)}\t` : ""}${k}=${v}\n`;
    return;
  }
  if (action === "edit") {
    let text = "";
    try {
      text = await g.fs.readFile(file);
    } catch {
      text = "";
    }
    const edited = await g.m.edit(tildify(file), text);
    if (edited !== null) await g.fs.writeFile(file, edited);
    return;
  }
  const [key, ...valueParts] = rest;
  if (!key) throw new GitError("error: no action specified", 2);
  const parts = splitKey(key);
  if (!parts) throw new GitError(`error: key does not contain a section: ${key}`, 2);

  if (action === "unset") {
    const secs = await read(file);
    if (!setConfigValue(secs, key, undefined)) throw new GitError("", 5);
    await g.fs.writeFile(file, serializeConfig(secs));
    return;
  }
  if (action === "get" || (action === undefined && valueParts.length === 0)) {
    const value = global ? configEntries(await read(GLOBAL_CONFIG)).filter(([k]) => k === key.toLowerCase()).at(-1)?.[1] : repo ? await repo.config(key) : await globalConfig(g, key);
    if (value === undefined) throw new GitError("", 1);
    g.out += `${value}\n`;
    return;
  }
  const secs = await read(file);
  setConfigValue(secs, key, valueParts.join(" "));
  await g.fs.writeFile(file, serializeConfig(secs));
}

// ----- add -----

export async function gitAdd(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long, operands } = parseArgs(args);
  const all = flags.has("A") || long.includes("all");
  const update = flags.has("u") || long.includes("update");
  const force = flags.has("f") || long.includes("force");
  const dry = flags.has("n") || long.includes("dry-run");
  const verbose = flags.has("v") || long.includes("verbose");
  const resolved = long.includes("resolved");
  if (flags.has("p") || long.includes("patch")) return addPatch(g, repo, operands);
  if (resolved && update) throw new GitError("fatal: options '-u/--update' and '--resolved' cannot be used together");
  if (resolved && all) throw new GitError("fatal: options '-A/--all' and '--resolved' cannot be used together");

  const idx = await repo.readIndex();
  const work = await repo.workFiles();
  const specs = operands.map((o) => repoPath(g, repo, o));

  if (resolved) {
    const paths = Object.keys(idx.conflicts).filter((p) => specs.length === 0 || specs.some((s) => pathspecMatches(s, p)));
    const marked: string[] = [];
    for (const p of paths) {
      if (work.has(p) && hasConflictMarkers(new TextDecoder().decode(await repo.readWork(p)))) marked.push(p);
    }
    if (marked.length) throw new GitError(`fatal: the following paths still have conflict markers:\n${marked.map((p) => `    ${shown(g, repo, p)}`).join("\n")}`);
    for (const p of paths) {
      delete idx.conflicts[p];
      const w = work.get(p);
      if (w) idx.entries[p] = { sha: await repo.writeBlob(await repo.readWork(p)), mode: w.mode };
      else delete idx.entries[p];
    }
    if (!dry) await repo.writeIndex(idx);
    return;
  }

  if (specs.length === 0 && !all && !update) {
    g.out += `Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\nhint: Disable this message with "git config set advice.addEmptyPathspec false"\n`;
    return;
  }
  // -A and -u with no paths cover the whole repository.
  const effective = specs.length ? specs : [""];
  const rules = await repo.ignoreRules();
  const candidates = new Set([...work.keys(), ...Object.keys(idx.entries), ...Object.keys(idx.conflicts)]);
  const ignoredNamed: string[] = [];
  const toStage: string[] = [];
  for (const spec of effective) {
    let matched = false;
    for (const p of candidates) {
      if (!pathspecMatches(spec, p)) continue;
      matched = true;
      const isTracked = p in idx.entries || p in idx.conflicts;
      if (update && !isTracked) continue;
      if (!isTracked && work.has(p) && !force && Repo.isIgnored(rules, p, false)) {
        // Only complain about ignored files named outright, not ones inside a folder you added.
        if (spec === p || (/[*?[]/.test(spec) && !p.includes("/"))) ignoredNamed.push(p);
        continue;
      }
      toStage.push(p);
    }
    if (!matched) {
      // A folder that only holds ignored files still "matches".
      const dirExists = spec && (await isDir(g.fs, join(repo.root, spec)));
      if (!dirExists) throw new GitError(`fatal: pathspec '${operands[effective.indexOf(spec)] ?? spec}' did not match any files`);
    }
  }
  for (const p of [...new Set(toStage)].sort()) {
    const w = work.get(p);
    if (w) {
      if (verbose || dry) g.out += `add '${p}'\n`;
      if (dry) continue;
      idx.entries[p] = { sha: await repo.writeBlob(await repo.readWork(p)), mode: w.mode };
    } else {
      if (verbose || dry) g.out += `remove '${p}'\n`;
      if (dry) continue;
      delete idx.entries[p];
    }
    delete idx.conflicts[p];
  }
  if (!dry) await repo.writeIndex(idx);
  if (ignoredNamed.length) {
    throw new GitError(
      `The following paths are ignored by one of your .gitignore files:\n${ignoredNamed.map((p) => shown(g, repo, p)).join("\n")}\nhint: Use -f if you really want to add them.\nhint: Disable this message with "git config set advice.addIgnoredFile false"`,
      1,
    );
  }
}

// ----- commit -----

const IDENTITY_HELP = `Author identity unknown

*** Please tell me who you are.

Run

  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"

to set your account's default identity.
Omit --global to set the identity only in this repository.

fatal: unable to auto-detect email address (got 'learner@inkwell.(none)')`;

// GIT_AUTHOR_DATE / GIT_COMMITTER_DATE: "2026-09-14 22:10:00" (UTC), an ISO date, or "@<seconds>".
function envTime(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  if (value.startsWith("@")) return Number(value.slice(1).split(" ")[0]) || fallback;
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(ms) ? fallback : Math.floor(ms / 1000);
}

export async function makeCommit(g: G, repo: Repo, tree: string, parents: string[], message: string): Promise<string> {
  const e = (k: string) => g.env.get(k) || undefined;
  const configured = await repo.identity(false);
  const name = e("GIT_AUTHOR_NAME") ?? (await repo.config("user.name"));
  const email = e("GIT_AUTHOR_EMAIL") ?? (await repo.config("user.email"));
  if (!name || !email) throw new GitError(IDENTITY_HELP, 128);
  const now = Math.floor(g.m.now().getTime() / 1000);
  const author = { name, email, time: envTime(e("GIT_AUTHOR_DATE"), now), tz: "+0000" };
  const committer = {
    name: e("GIT_COMMITTER_NAME") ?? configured!.name,
    email: e("GIT_COMMITTER_EMAIL") ?? configured!.email,
    time: envTime(e("GIT_COMMITTER_DATE"), e("GIT_AUTHOR_DATE") ? author.time : now),
    tz: "+0000",
  };
  const c: Commit = { tree, parents, author, committer, message };
  return repo.writeCommit(c);
}

export async function gitCommit(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const messages: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-m" || a === "--message") messages.push(args[++i] ?? "");
    else if (a.startsWith("--message=")) messages.push(a.slice(10));
    else if (/^-[a-zA-Z]*m/.test(a) && !a.startsWith("--")) {
      // -am "msg", or -m"msg"
      const j = a.indexOf("m");
      const tail = a.slice(j + 1);
      if (j > 1) rest.push(`-${a.slice(1, j)}`);
      messages.push(tail || (args[++i] ?? ""));
    } else rest.push(a);
  }
  const { flags, long } = parseArgs(rest);
  // --fixup=<commit> and --squash=<commit>: a commit that `git rebase --autosquash` folds in.
  const fixArg = long.find((l) => l.startsWith("fixup=") || l.startsWith("squash="));
  const fixIdx = rest.findIndex((a) => a === "--fixup" || a === "--squash");
  const fixTarget = fixArg ? fixArg.slice(fixArg.indexOf("=") + 1) : fixIdx >= 0 ? rest[fixIdx + 1] : undefined;
  if (fixTarget !== undefined) {
    const kind = fixArg?.startsWith("squash") || rest[fixIdx] === "--squash" ? "squash" : "fixup";
    const t = await repo.resolve(fixTarget);
    if (!t) throw new GitError(`fatal: could not lookup commit '${fixTarget}'`);
    messages.unshift(`${kind}! ${subject(await repo.readCommit(t))}`);
  }
  const amend = long.includes("amend");
  const noEdit = long.includes("no-edit");
  const allowEmpty = long.includes("allow-empty");
  const quiet = flags.has("q") || long.includes("quiet");
  if (flags.has("a") || long.includes("all")) {
    // -a stages every change to tracked files first (not new files).
    const idx = await repo.readIndex();
    const work = await repo.workFiles();
    for (const p of Object.keys(idx.entries)) {
      const w = work.get(p);
      if (!w) delete idx.entries[p];
      else if (w.sha !== idx.entries[p].sha || w.mode !== idx.entries[p].mode) idx.entries[p] = { sha: await repo.writeBlob(await repo.readWork(p)), mode: w.mode };
    }
    await repo.writeIndex(idx);
  }

  const s = await state(repo);
  const mergeHead = (await repo.readText("MERGE_HEAD"))?.trim();
  // Finishing a cherry-pick or revert by hand: its message, and (cherry-pick) its author.
  const pickHead = (await repo.readText("CHERRY_PICK_HEAD"))?.trim();
  const revertHead = (await repo.readText("REVERT_HEAD"))?.trim();
  if (Object.keys(s.index.conflicts).length) {
    throw new GitError(
      "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.",
      128,
    );
  }
  if (amend && !s.headSha) throw new GitError("fatal: You have nothing to amend.");
  if (amend && mergeHead) throw new GitError("fatal: You are in the middle of a merge -- cannot amend.");

  const indexFiles: Files = new Map(Object.entries(s.index.entries));
  const tree = await repo.writeTree(indexFiles);
  const previous = amend ? await repo.readCommit(s.headSha!) : undefined;
  const parentTree = amend ? (previous!.parents[0] ? (await repo.readCommit(previous!.parents[0])).tree : undefined) : s.headSha ? (await repo.readCommit(s.headSha)).tree : undefined;
  const headTree = s.headSha ? (await repo.readCommit(s.headSha)).tree : undefined;
  const nothingNew = !amend && !mergeHead && !allowEmpty && tree === (headTree ?? (await repo.writeTree(new Map())));
  if (nothingNew && (s.headSha || indexFiles.size === 0)) {
    const st = await computeStatus(repo);
    const text = formatLong(g, repo, st, await trackingInfo(repo, st.branch, st.headSha));
    throw new GitError(text.trimEnd(), 1, "");
  }
  if (!(await repo.identity()) && !(g.env.get("GIT_AUTHOR_NAME") && g.env.get("GIT_AUTHOR_EMAIL"))) throw new GitError(IDENTITY_HELP, 128);

  let message: string;
  if (messages.length) message = cleanMessage(messages.join("\n\n"));
  else if (amend && noEdit) message = previous!.message;
  else if ((mergeHead || pickHead || revertHead) && noEdit) message = cleanMessage((await repo.readText("MERGE_MSG")) ?? "Merge");
  else if (!g.m.interactive && !g.m.quiet && !g.m.root.scripted.edits.length) {
    // No page to open an editor in (the content check): Git would fail to start one too.
    throw new GitError("error: There was a problem with the editor 'nano'.\nPlease supply the message using either -m or -F option.", 1);
  } else {
    const st = await computeStatus(repo);
    const status = formatLong({ ...g, tty: false }, repo, st, "")
      .trimEnd()
      .split("\n")
      .map((l) => (l ? `# ${l.replace(/^\t/, "\t")}` : "#"))
      .join("\n")
      .replace(/^# /gm, "# ")
      .replace(/^# \t/gm, "#\t");
    const start = amend ? previous!.message : mergeHead || pickHead || revertHead ? ((await repo.readText("MERGE_MSG")) ?? "") : "";
    const template = `${start}${start.endsWith("\n") || !start ? "" : "\n"}\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n${status}\n#\n`;
    const edited = await editMessage(g, repo, "COMMIT_EDITMSG", template);
    message = edited ?? "";
  }
  if (!message.trim()) throw new GitError("Aborting commit due to empty commit message.", 1);

  const parents = amend ? previous!.parents : [...(s.headSha ? [s.headSha] : []), ...(mergeHead ? [mergeHead] : [])];
  let sha: string;
  if (pickHead) {
    const { writeCommitAs } = await import("./rewrite");
    sha = await writeCommitAs(g, repo, indexFiles, parents, message, (await repo.readCommit(pickHead)).author);
  } else if (amend && !long.includes("reset-author") && !g.env.get("GIT_AUTHOR_NAME")) {
    const { writeCommitAs } = await import("./rewrite");
    sha = await writeCommitAs(g, repo, indexFiles, parents, message, previous!.author);
  } else sha = await makeCommit(g, repo, tree, parents, message);
  for (const f of ["CHERRY_PICK_HEAD", "REVERT_HEAD"]) await repo.remove(f);
  await repo.writeText("COMMIT_EDITMSG", message);
  const kind = amend ? "commit (amend)" : mergeHead ? "commit (merge)" : pickHead ? "commit (cherry-pick)" : !s.headSha ? "commit (initial)" : "commit";
  await repo.advance(sha, `${kind}: ${subject({ message } as Commit)}`);
  if (mergeHead) {
    await repo.remove("MERGE_HEAD");
    await repo.remove("MERGE_MSG");
    await repo.remove("MERGE_MODE");
  }
  if (quiet) return;
  const where = s.branch ?? "detached HEAD";
  const root = parents.length === 0 ? " (root-commit)" : "";
  g.out += `[${where}${root} ${short(sha)}] ${subject({ message } as Commit)}\n`;
  if (amend) {
    g.out += ` Date: ${dateString(previous!.author.time, previous!.author.tz)}\n`;
  }
  if (mergeHead) return;
  const before = await repo.flatten(parentTree);
  const changes = await changesBetween(repo, before, indexFiles);
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    const n = countLines(c.old?.text ?? "", c.new?.text ?? "");
    added += n.added;
    removed += n.removed;
  }
  g.out += `${summaryLine(changes.length, added, removed)}\n${modeLines(changes)}`;
}

// ----- restore -----

export async function gitRestore(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const side = args.includes("--ours") ? "ours" : args.includes("--theirs") ? "theirs" : undefined;
  if (side) {
    const { takeSide } = await import("./branching");
    return takeSide(g, repo, side, args.filter((a) => !a.startsWith("-")), "restore");
  }
  const { flags, long, values, operands } = parseArgs(args, "s");
  const staged = flags.has("S") || long.includes("staged");
  const worktree = flags.has("W") || long.includes("worktree") || !staged;
  const sourceArg = values.s ?? long.find((l) => l.startsWith("source="))?.slice(7);
  if (operands.length === 0) throw new GitError("fatal: you must specify path(s) to restore");
  const s = await state(repo);
  let source: Files | undefined;
  if (sourceArg) {
    const sha = await repo.resolve(sourceArg);
    if (!sha) throw new GitError(`fatal: could not resolve ${sourceArg}`);
    source = await repo.commitFiles(sha);
  }
  const idx = s.index;
  const specs = operands.map((o) => repoPath(g, repo, o));
  const known = new Set([...Object.keys(idx.entries), ...s.head.keys(), ...(source?.keys() ?? []), ...Object.keys(idx.conflicts)]);
  for (const [i, spec] of specs.entries()) {
    const paths = [...known].filter((p) => pathspecMatches(spec, p));
    if (paths.length === 0) throw new GitError(`error: pathspec '${operands[i]}' did not match any file(s) known to git`, 1);
    for (const p of paths) {
      if (idx.conflicts[p] && worktree && !staged) throw new GitError(`error: path '${shown(g, repo, p)}' is unmerged`, 1);
      if (staged) {
        const from = source ?? s.head;
        const f = from.get(p);
        if (f) idx.entries[p] = f;
        else delete idx.entries[p];
        delete idx.conflicts[p];
      }
      if (worktree) {
        const from = staged ? (source ?? s.head) : (source ?? new Map(Object.entries(idx.entries)));
        const f = from.get(p);
        if (f) await repo.writeWork(p, f);
        else if (staged || source) await repo.removeWork(p);
      }
    }
  }
  await repo.writeIndex(idx);
}

// ----- rm -----

export async function gitRm(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { flags, long, operands } = parseArgs(args);
  const cached = long.includes("cached");
  const force = flags.has("f") || long.includes("force");
  const recursive = flags.has("r");
  const quiet = flags.has("q");
  if (operands.length === 0) throw new GitError("usage: git rm [<options>] [--] <file>...", 129);
  const s = await state(repo);
  const idx = s.index;
  const remove: string[] = [];
  for (const [i, op] of operands.entries()) {
    const spec = repoPath(g, repo, op);
    const paths = Object.keys(idx.entries).filter((p) => pathspecMatches(spec, p));
    if (paths.length === 0) throw new GitError(`fatal: pathspec '${operands[i]}' did not match any files`);
    if (!recursive && paths.some((p) => p !== spec && !/[*?[]/.test(spec))) throw new GitError(`fatal: not removing '${op}' recursively without -r`);
    remove.push(...paths);
  }
  if (!force) {
    const local: string[] = [];
    const stagedOnly: string[] = [];
    const both: string[] = [];
    for (const p of remove) {
      const i = idx.entries[p];
      const h = s.head.get(p);
      const w = s.work.get(p);
      const stagedChange = !h || h.sha !== i.sha;
      const workChange = !!w && w.sha !== i.sha;
      if (stagedChange && workChange && (!h || w!.sha !== h.sha)) both.push(p);
      else if (!cached && workChange) local.push(p);
      else if (!cached && stagedChange && h) stagedOnly.push(p);
    }
    const list = (ps: string[]) => ps.map((p) => `    ${shown(g, repo, p)}`).join("\n");
    if (both.length)
      throw new GitError(`error: the following file has staged content different from both the\nfile and the HEAD:\n${list(both)}\n(use -f to force removal)`, 1);
    if (stagedOnly.length) throw new GitError(`error: the following file has changes staged in the index:\n${list(stagedOnly)}\n(use --cached to keep the file, or -f to force removal)`, 1);
    if (local.length) throw new GitError(`error: the following file has local modifications:\n${list(local)}\n(use --cached to keep the file, or -f to force removal)`, 1);
  }
  for (const p of remove.sort()) {
    if (!quiet) g.out += `rm '${p}'\n`;
    delete idx.entries[p];
    if (!cached) await repo.removeWork(p);
  }
  await repo.writeIndex(idx);
}

// ----- mv -----

export async function gitMv(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { operands } = parseArgs(args);
  if (operands.length < 2) throw new GitError("usage: git mv [<options>] <source>... <destination>", 129);
  const idx = await repo.readIndex();
  const destOp = operands.at(-1)!;
  const dest = repoPath(g, repo, destOp);
  const destIsDir = await isDir(g.fs, join(repo.root, dest));
  if (operands.length > 2 && !destIsDir) throw new GitError(`fatal: destination '${destOp}' is not a directory`);
  for (const srcOp of operands.slice(0, -1)) {
    const src = repoPath(g, repo, srcOp);
    const target = destIsDir ? (dest ? `${dest}/${src.split("/").pop()}` : src.split("/").pop()!) : dest;
    const tracked = Object.keys(idx.entries).filter((p) => p === src || p.startsWith(`${src}/`));
    if (!(await exists(g.fs, join(repo.root, src)))) throw new GitError(`fatal: bad source, source=${src}, destination=${target}`);
    if (tracked.length === 0) throw new GitError(`fatal: not under version control, source=${src}, destination=${target}`);
    if (await exists(g.fs, join(repo.root, target))) throw new GitError(`fatal: destination exists, source=${src}, destination=${target}`);
    await g.fs.mkdir(dirname(join(repo.root, target)), { recursive: true });
    await g.fs.mv(join(repo.root, src), join(repo.root, target));
    for (const p of tracked) {
      idx.entries[target + p.slice(src.length)] = idx.entries[p];
      delete idx.entries[p];
    }
  }
  await repo.writeIndex(idx);
}

// ----- add -p -----

/** git add -p: shows each changed piece ("hunk") of each file and asks whether to stage it. */
async function addPatch(g: G, repo: Repo & { root: string }, operands: string[]) {
  const { structuredPatch } = await import("diff");
  const idx = await repo.readIndex();
  const work = await repo.workFiles();
  const specs = operands.map((o) => repoPath(g, repo, o));
  const files = Object.keys(idx.entries)
    .filter((p) => !specs.length || specs.some((sp) => pathspecMatches(sp, p)))
    .filter((p) => !work.has(p) || work.get(p)!.sha !== idx.entries[p].sha)
    .sort();
  if (!files.length) {
    g.out += "No changes.\n";
    return;
  }
  const c = (code: string, t: string) => (g.tty ? `\x1b[${code}m${t}\x1b[m` : t);
  let quit = false;
  for (const path of files) {
    if (quit) break;
    const oldText = await repo.readBlobText(idx.entries[path].sha);
    const w = work.get(path);
    const head = `${c("1", `diff --git a/${path} b/${path}`)}\n${c("1", `index ${idx.entries[path].sha.slice(0, 7)}..${w ? w.sha.slice(0, 7) : "0000000"} ${idx.entries[path].mode}`)}\n${c("1", `--- a/${path}`)}\n${c("1", `+++ ${w ? `b/${path}` : "/dev/null"}`)}\n`;
    if (!w) {
      const a = (await g.m.ask(`${head}${c("1;34", "(1/1) Stage deletion [y,n,q,a,d,?]? ")}`, { fallback: "n" })).trim();
      if (a === "y" || a === "a") delete idx.entries[path];
      if (a === "q") quit = true;
      continue;
    }
    const newText = new TextDecoder().decode(await repo.readWork(path));
    const hunks = structuredPatch(path, path, oldText, newText, undefined, undefined, { context: 3 }).hunks;
    const take: boolean[] = hunks.map(() => false);
    let shownHead = false;
    for (let i = 0; i < hunks.length; i++) {
      const h = hunks[i];
      const body = h.lines.map((l) => (l.startsWith("+") ? c("32", l) : l.startsWith("-") ? c("31", l) : l)).join("\n");
      const text = `${shownHead ? "" : head}${c("36", `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`)}\n${body}\n${c("1;34", `(${i + 1}/${hunks.length}) Stage this hunk [y,n,q,a,d${hunks.length > 1 ? ",j,k" : ""},e,?]? `)}`;
      shownHead = true;
      const a = (await g.m.ask(text, { fallback: "n" })).trim();
      if (a === "y") take[i] = true;
      else if (a === "a") {
        for (let j = i; j < hunks.length; j++) take[j] = true;
        break;
      } else if (a === "d") break;
      else if (a === "q") {
        quit = true;
        break;
      } else if (a === "?") {
        g.out += "y - stage this hunk\nn - do not stage this hunk\nq - quit; do not stage this hunk or any of the remaining ones\na - stage this hunk and all later hunks in the file\nd - do not stage this hunk or any of the later hunks in the file\n";
        i--;
      }
    }
    if (!take.some(Boolean)) continue;
    // Rebuild the file from the staged version, with only the chosen hunks applied.
    const oldLines = oldText.split("\n");
    const out: string[] = [];
    let at = 0;
    hunks.forEach((h, i) => {
      const start = h.oldLines === 0 ? h.oldStart : h.oldStart - 1;
      while (at < start) out.push(oldLines[at++]);
      if (take[i]) {
        for (const l of h.lines) if (!l.startsWith("-") && !l.startsWith("\\")) out.push(l.slice(1));
      } else for (const l of h.lines) if (!l.startsWith("+") && !l.startsWith("\\")) out.push(l.slice(1));
      at = start + h.oldLines;
    });
    while (at < oldLines.length) out.push(oldLines[at++]);
    idx.entries[path] = { sha: await repo.writeBlob(out.join("\n")), mode: w.mode };
  }
  await repo.writeIndex(idx);
}
