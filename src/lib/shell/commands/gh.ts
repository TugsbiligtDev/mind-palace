// The GitHub CLI (gh) on the pretend GitHub. Beginner uses auth, ssh-key, repo, pr and issue;
// Intermediate adds forks (gh repo fork / sync), reviews (gh pr review, checks, edit,
// comment), labels and milestones, releases, rulesets, Actions (gh run, gh workflow, gh
// secret, gh variable) and gh api. A lesson's set-up can act as a teammate:
// GH_PRACTICE_USER=kenji gh pr review 3 --approve (as root, in a set-up script only).
import type { Command, ResolvedCommandContext } from "just-bash";
import { latestRuns, runWorkflows } from "../actions";
import { makeG } from "../git";
import { initRepo, makeCommit } from "../git/basic";
import { gitSwitch, mergeBase, mergeFiles } from "../git/branching";
import { type G, changesBetween, short } from "../git/context";
import { countLines, unifiedDiff } from "../git/diff";
import { GH_LOGIN, GITHUB_ROOT, gitClone, gitFetch, gitPull, gitPush, locate } from "../git/remote";
import { GitError, Repo, exists, setConfigValue } from "../git/repo";
import { ancestors } from "../git/status";
import { copyInto } from "../github-rules";
import { DEFAULT_LABELS, type Issue, type Pull, type Ruleset, type Run, type Store, readStore, repoName, rulesetApplies, writeStore } from "../github-store";
import type { Machine } from "../machine";
import { HOME, USER, dirname, join } from "../util";
import { ghAuth, ghSshKey } from "./github";

const NOT_LOGGED_IN = "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.";

/** Who gh acts as: the learner, or (in a lesson's set-up) a teammate. */
function actor(g: G) {
  return (g.m.perms.root && g.env.get("GH_PRACTICE_USER")) || USER;
}

async function loggedIn(g: G, ctx: ResolvedCommandContext) {
  if (g.m.perms.root && g.env.get("GH_PRACTICE_USER")) return { protocol: "ssh" };
  let t: string | undefined;
  try {
    t = await ctx.fs.readFile(GH_LOGIN);
  } catch {
    t = undefined;
  }
  if (!t) return undefined;
  return { protocol: /git_protocol:\s*ssh/.test(t) ? "ssh" : "https" };
}

async function needLogin(g: G, ctx: ResolvedCommandContext) {
  const li = await loggedIn(g, ctx);
  if (!li) throw new GitError(NOT_LOGGED_IN, 4);
  return li;
}

type Ctx = { name: string; bare: Repo; local?: Repo; store: Store };

async function openBare(g: G, name: string): Promise<Repo> {
  const bare = await g.m.asRoot(() => Repo.open(g.fs, `${GITHUB_ROOT}/${name}.git`, g.m.now));
  if (!bare) throw new GitError(`GraphQL: Could not resolve to a Repository with the name '${name}'. (repository)`, 1);
  return bare;
}

/** The GitHub repository behind the current folder (origin, or upstream for a fork), or -R owner/name. */
async function currentRepo(g: G, ctx: ResolvedCommandContext, flag?: string, opts: { preferParent?: boolean } = {}): Promise<Ctx> {
  let name = flag && !flag.includes("/") ? `${actor(g)}/${flag}` : flag;
  const local = (await Repo.find(ctx.fs, ctx.cwd, g.m.now)) ?? undefined;
  if (!name) {
    if (!local) throw new GitError("failed to determine base repo: not a git repository (or any of the parent directories): .git", 1);
    const url = await local.config("remote.origin.url");
    const loc = url ? locate(g, url) : undefined;
    if (!loc?.github) throw new GitError("none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`", 1);
    name = loc.path.slice(GITHUB_ROOT.length + 1).replace(/\.git$/, "");
    if (opts.preferParent) {
      const st = await readStore(g.m, await openBare(g, name));
      if (st.forkOf) name = st.forkOf;
    }
  }
  const bare = await openBare(g, name);
  return { name, bare, local, store: await readStore(g.m, bare) };
}

const url = (name: string, kind: string, n: number | string) => `https://github.com/${name}/${kind}/${n}`;
const save = (g: G, c: Ctx) => writeStore(g.m, c.bare, c.store);

// gh's flags: --title x, --title=x, -t x; some may repeat (--label a --label b).
type Flags = { get: (name: string, short?: string) => string | undefined; all: (name: string, short?: string) => string[]; has: (name: string, short?: string) => boolean; operands: string[] };

const BOOLEAN = new Set(["draft", "fill", "fill-first", "web", "squash", "merge", "rebase", "delete-branch", "admin", "auto", "approve", "request-changes", "comment", "public", "private", "internal", "push", "clone", "remote", "force", "yes", "generate-notes", "prerelease", "latest", "log", "log-failed", "exit-status", "failed", "comments", "all", "paginate", "include", "silent"]);
const BOOL_SHORT = new Set(["d", "s", "m", "r", "w", "y", "c"]);

function flags(args: string[], shortBool = BOOL_SHORT): Flags {
  const vals: [string, string][] = [];
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }
    const long = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(a);
    if (long) {
      if (long[2] !== undefined) vals.push([long[1], long[2]]);
      else if (BOOLEAN.has(long[1])) vals.push([long[1], ""]);
      else vals.push([long[1], args[++i] ?? ""]);
      continue;
    }
    const sh = /^-([a-zA-Z])([\s\S]*)$/.exec(a);
    if (sh) {
      if (shortBool.has(sh[1]) && !sh[2]) vals.push([sh[1], ""]);
      else vals.push([sh[1], sh[2] || (args[++i] ?? "")]);
      continue;
    }
    operands.push(a);
  }
  const find = (n: string, s?: string) => vals.filter(([k]) => k === n || (s !== undefined && k === s)).map(([, v]) => v);
  return { get: (n, s) => find(n, s).at(-1), all: (n, s) => find(n, s).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean), has: (n, s) => find(n, s).length > 0, operands };
}

function ago(t: number, now: number) {
  const s = Math.max(0, now - t);
  if (s < 60) return "less than a minute ago";
  if (s < 3600) return `about ${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"} ago`;
  if (s < 86400) return `about ${Math.round(s / 3600)} hour${Math.round(s / 3600) === 1 ? "" : "s"} ago`;
  return `about ${Math.round(s / 86400)} day${Math.round(s / 86400) === 1 ? "" : "s"} ago`;
}

function table(headers: string[], rows: string[][]): string {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i]))).join("  ").trimEnd();
  return `${line(headers)}\n${rows.map(line).join("\n")}\n`;
}

// ----- repo -----

async function ghRepo(g: G, ctx: ResolvedCommandContext, args: string[]) {
  const [sub, ...rest] = args;
  const li = await needLogin(g, ctx);
  const f = flags(rest, new Set(["c"]));
  const me = actor(g);
  const remoteUrl = (name: string) => (li.protocol === "ssh" ? `git@github.com:${name}.git` : `https://github.com/${name}.git`);
  if (sub === "create") {
    const raw = f.operands[0];
    const visibility = f.has("public") ? "public" : f.has("private") ? "private" : f.has("internal") ? "internal" : undefined;
    const source = f.get("source", "s");
    if (!raw && !source) throw new GitError("name argument required when not running interactively", 1);
    if (!visibility) throw new GitError("`--public`, `--private`, or `--internal` required when not running interactively", 1);
    const localForName = source ? await Repo.find(ctx.fs, join(ctx.cwd, source), g.m.now) : undefined;
    const name = raw ? (raw.includes("/") ? raw : `${me}/${raw}`) : `${me}/${localForName ? localForName.root!.split("/").pop() : "repo"}`;
    const path = `${GITHUB_ROOT}/${name}.git`;
    if (await g.m.asRoot(() => exists(ctx.fs, path))) throw new GitError(`GraphQL: Name already exists on this account (createRepository)`, 1);
    await g.m.asRoot(() => initRepo(g, path, { bare: true, branch: "main" }));
    const bare = (await g.m.asRoot(() => Repo.open(ctx.fs, path, g.m.now)))!;
    await writeStore(g.m, bare, { next: 1, pulls: [], issues: [], description: f.get("description", "d"), visibility });
    g.out += `✓ Created repository ${name} on github.com\n  https://github.com/${name}\n`;
    if (source) {
      if (!localForName) throw new GitError(`current directory is not a git repository. Run \`git init\` to initialize it`, 1);
      const remoteName = f.get("remote", "r") ?? "origin";
      const secs = await localForName.configSections(false);
      setConfigValue(secs, `remote.${remoteName}.url`, remoteUrl(name));
      setConfigValue(secs, `remote.${remoteName}.fetch`, `+refs/heads/*:refs/remotes/${remoteName}/*`);
      await localForName.saveConfig(false, secs);
      g.out += `✓ Added remote ${remoteUrl(name)}\n`;
      if (f.has("push")) {
        const h = await localForName.head();
        const pg: G = { ...g, cwd: localForName.root!, repo: undefined, out: "", err: "" };
        await gitPush(pg, ["-u", remoteName, h.branch ?? "main"]);
        g.out += `✓ Pushed commits to ${remoteUrl(name)}\n`;
      }
    }
    return;
  }
  if (sub === "view") {
    const r = await currentRepo(g, ctx, f.operands[0]);
    if (f.has("web")) {
      g.out += `Opening https://github.com/${r.name} in your browser.\n(The practice computer has no browser: on your Mac this opens the page.)\n`;
      return;
    }
    const head = await g.m.asRoot(() => r.bare.resolve("HEAD"));
    let readme = "This repository does not have a README";
    if (head) {
      const files = await g.m.asRoot(() => r.bare.commitFiles(head));
      const file = files.get("README.md") ?? files.get("README");
      if (file) readme = await g.m.asRoot(() => r.bare.readBlobText(file.sha));
    }
    g.out += `${r.name}${r.store.forkOf ? ` (forked from ${r.store.forkOf})` : ""}\n${r.store.description ?? "No description provided"}\n\n${readme.trimEnd()}\n\n\nView this repository on GitHub: https://github.com/${r.name}\n`;
    return;
  }
  if (sub === "list") {
    const owner = f.operands[0] ?? me;
    let names: string[] = [];
    try {
      names = (await g.m.asRoot(() => ctx.fs.readdir(`${GITHUB_ROOT}/${owner}`))).filter((n) => n.endsWith(".git")).sort();
    } catch {
      names = [];
    }
    if (!names.length) {
      g.out += `no repositories found for ${owner}\n`;
      return;
    }
    const rows: string[][] = [];
    for (const n of names) {
      const bare = await g.m.asRoot(() => Repo.open(ctx.fs, `${GITHUB_ROOT}/${owner}/${n}`, g.m.now));
      const st = bare ? await readStore(g.m, bare) : undefined;
      rows.push([`${owner}/${n.slice(0, -4)}`, st?.description ?? "", `${st?.visibility ?? "public"}${st?.forkOf ? ", fork" : ""}`]);
    }
    g.out += `\nShowing ${rows.length} of ${rows.length} repositories in @${owner}\n\n${table(["NAME", "DESCRIPTION", "INFO"], rows)}`;
    return;
  }
  if (sub === "clone") {
    const name = f.operands[0]?.includes("/") ? f.operands[0] : `${me}/${f.operands[0] ?? ""}`;
    await gitClone(g, [remoteUrl(name), ...f.operands.slice(1)]);
    // Cloning a fork also adds its parent as "upstream", like gh does.
    const st = await readStore(g.m, await openBare(g, name));
    if (st.forkOf) {
      const dir = join(g.cwd, f.operands[1] ?? name.split("/")[1]);
      await addRemote(g, dir, "upstream", remoteUrl(st.forkOf));
      g.err += `! Repository ${st.forkOf} set as the default repository. To learn more or change the selection, run: gh repo set-default\n`;
    }
    return;
  }
  if (sub === "fork") {
    const source = f.operands[0] ? await currentRepo(g, ctx, f.operands[0]) : await currentRepo(g, ctx);
    const forkName = `${me}/${f.get("fork-name") ?? source.name.split("/")[1]}`;
    const path = `${GITHUB_ROOT}/${forkName}.git`;
    if (await g.m.asRoot(() => exists(ctx.fs, path))) g.err += `! ${forkName} already exists\n`;
    else {
      await g.m.asRoot(() => initRepo(g, path, { bare: true, branch: "main" }));
      const fork = (await g.m.asRoot(() => Repo.open(ctx.fs, path, g.m.now)))!;
      for (const r of [...(await g.m.asRoot(() => source.bare.listRefs("refs/heads"))), ...(await g.m.asRoot(() => source.bare.listRefs("refs/tags")))]) await copyInto(g, source.bare, fork, r.sha, r.name);
      const head = (await g.m.asRoot(() => source.bare.readText("HEAD"))) ?? "ref: refs/heads/main\n";
      await g.m.asRoot(() => fork.writeText("HEAD", head));
      await writeStore(g.m, fork, { next: 1, pulls: [], issues: [], description: source.store.description, visibility: "public", forkOf: source.name });
      g.err += `✓ Created fork ${forkName}\n`;
    }
    if (f.has("clone")) {
      const dir = join(g.cwd, forkName.split("/")[1]);
      await gitClone({ ...g, out: "", err: "" }, [remoteUrl(forkName), dir]);
      g.err += `Cloning into '${forkName.split("/")[1]}'...\n✓ Cloned fork\n`;
      await addRemote(g, dir, "upstream", remoteUrl(source.name));
      g.err += `! Repository ${source.name} set as the default repository. To learn more or change the selection, run: gh repo set-default\n`;
      return;
    }
    // Inside a clone of the original: point origin at the fork, and keep the original as upstream.
    if (!f.operands[0] && source.local && (f.has("remote") || true)) {
      const secs = await source.local.configSections(false);
      const originUrl = (await source.local.config("remote.origin.url"))!;
      const kept = secs.filter((sec) => !(sec.name === "remote" && sec.sub === "origin"));
      await source.local.saveConfig(false, kept);
      await addRemote(g, source.local.root!, "upstream", originUrl);
      await addRemote(g, source.local.root!, "origin", remoteUrl(forkName));
      g.err += `✓ Renamed remote origin to upstream\n✓ Added remote origin\n`;
    }
    return;
  }
  if (sub === "sync") {
    const target = f.operands[0];
    if (!target) {
      // Local: bring the current branch up to date with its remote (fast-forward only).
      const local = await Repo.find(ctx.fs, ctx.cwd, g.m.now);
      if (!local) throw new GitError("not a git repository", 1);
      const h = await local.head();
      const lg: G = { ...g, out: "", err: "" };
      await gitPull(lg, ["--ff-only"]);
      const origin = (await local.config("remote.origin.url")) ?? "";
      g.out += `✓ Synced the "${h.branch}" branch from "${locate(g, origin)?.path.slice(GITHUB_ROOT.length + 1).replace(/\.git$/, "") ?? "origin"}" to local repository\n`;
      return;
    }
    const fork = await currentRepo(g, ctx, target);
    const parentName = f.get("source", "s") ?? fork.store.forkOf;
    if (!parentName) throw new GitError(`can't determine source repository for ${fork.name} because repository is not fork`, 1);
    const parent = await openBare(g, parentName);
    const branch = f.get("branch", "b") ?? "main";
    const theirs = await g.m.asRoot(() => parent.readRef(`refs/heads/${branch}`));
    const mine = await g.m.asRoot(() => fork.bare.readRef(`refs/heads/${branch}`));
    if (!theirs) throw new GitError(`branch ${branch} not found in ${parentName}`, 1);
    if (mine && mine !== theirs && !(await g.m.asRoot(() => ancestors(parent, theirs))).has(mine) && !f.has("force"))
      throw new GitError(`can't sync because there are diverging changes; use \`--force\` to overwrite the destination branch`, 1);
    await copyInto(g, parent, fork.bare, theirs, `refs/heads/${branch}`);
    g.out += `✓ Synced the "${fork.name.split("/")[0]}:${branch}" branch from "${parentName.split("/")[0]}:${branch}"\n`;
    return;
  }
  if (sub === "set-default") {
    g.out += `✓ Set ${f.operands[0] ?? "the repository"} as the default repository for the current directory\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh repo"`, 1);
}

async function addRemote(g: G, dir: string, name: string, remoteUrl: string) {
  const local = await Repo.find(g.fs, dir, g.m.now);
  if (!local) return;
  const secs = await local.configSections(false);
  setConfigValue(secs, `remote.${name}.url`, remoteUrl);
  setConfigValue(secs, `remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`);
  await local.saveConfig(false, secs);
  await gitFetch({ ...g, cwd: dir, repo: undefined, out: "", err: "" }, [name]).catch(() => undefined);
}

// ----- pull requests -----

/** The commit a pull request proposes (copied in from the fork, for a fork's pull request). */
async function prHeadSha(g: G, c: Ctx, pr: Pull): Promise<string | undefined> {
  if (!pr.headRepo) return g.m.asRoot(() => c.bare.readRef(`refs/heads/${pr.head}`));
  const fork = await g.m.asRoot(() => Repo.open(g.fs, `${GITHUB_ROOT}/${pr.headRepo}.git`, g.m.now));
  const sha = fork ? await g.m.asRoot(() => fork.readRef(`refs/heads/${pr.head}`)) : undefined;
  if (sha && fork) await copyInto(g, fork, c.bare, sha, `refs/pull/${pr.number}/head`);
  return sha ?? (await g.m.asRoot(() => c.bare.readRef(`refs/pull/${pr.number}/head`)));
}

async function commitsAhead(g: G, bare: Repo, head: string, base: string): Promise<number> {
  const A = await g.m.asRoot(() => ancestors(bare, head));
  const B = await g.m.asRoot(() => ancestors(bare, base));
  return [...A].filter((x) => !B.has(x)).length;
}

function latestReviews(pr: Pull) {
  const by = new Map<string, Pull["reviews"] extends (infer R)[] | undefined ? R : never>();
  for (const r of pr.reviews ?? []) if (r.state !== "COMMENTED" || !by.has(r.author)) by.set(r.author, r);
  return [...by.values()];
}

/** What stops a pull request from being merged: rulesets on its base branch, drafts, conflicts. */
async function mergeBlockers(g: G, c: Ctx, pr: Pull, headSha: string): Promise<string[]> {
  const out: string[] = [];
  const def = ((await g.m.asRoot(() => c.bare.readText("HEAD"))) ?? "ref: refs/heads/main").trim().replace(/^ref: refs\/heads\//, "");
  const rules = (c.store.rulesets ?? []).filter((r) => rulesetApplies(r, pr.base, def));
  const reviews = latestReviews(pr);
  for (const rs of rules)
    for (const rule of rs.rules) {
      if (rule.type === "pull_request") {
        const need = Number(rule.parameters?.required_approving_review_count ?? 0);
        const approvals = reviews.filter((r) => r.state === "APPROVED" && r.author !== pr.author).length;
        if (reviews.some((r) => r.state === "CHANGES_REQUESTED")) out.push("Changes requested");
        else if (approvals < need) out.push(`Review required: ${need} approving review${need === 1 ? " is" : "s are"} required`);
      }
      if (rule.type === "required_status_checks") {
        const runs = latestRuns(c.store, headSha);
        for (const ctxName of ((rule.parameters?.required_status_checks ?? []) as { context: string }[]).map((x) => x.context)) {
          const job = runs.flatMap((r) => r.jobs.map((j) => ({ ...j, wf: r.workflow }))).find((j) => j.name === ctxName || `${j.wf} / ${j.name}` === ctxName);
          if (!job) out.push(`Required status check "${ctxName}" is expected`);
          else if (job.conclusion !== "success") out.push(`Required status check "${ctxName}" is failing`);
        }
      }
    }
  return out;
}

function checkRows(c: Ctx, sha: string) {
  return latestRuns(c.store, sha).flatMap((r) => r.jobs.map((j) => ({ run: r, job: j })));
}

async function ghPr(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const isMerge = sub === "merge";
  const f = flags(rest, isMerge ? new Set(["d", "s", "m", "r"]) : sub === "review" ? new Set(["a", "r", "c"]) : sub === "create" ? new Set(["d", "w", "f"]) : new Set(["w", "c"]));
  const me = actor(g);
  // In a fork's clone, pull requests live in the parent repository (gh's "default repository").
  const c = await currentRepo(g, ctx, f.get("repo", "R"), { preferParent: true });
  const pick = (n?: string) => (n ? c.store.pulls.find((p) => p.number === Number(n.replace(/^#/, "").replace(/^.*\/pull\//, ""))) : undefined);
  const currentPr = async () => {
    const n = f.operands[0];
    if (n) return pick(n);
    const h = c.local ? await c.local.head() : undefined;
    return c.store.pulls.find((p) => p.head === h?.branch && p.state === "OPEN");
  };

  if (sub === "create") {
    if (!c.local) throw new GitError("not in a git repository", 1);
    const h = await c.local.head();
    const origin = locate(g, (await c.local.config("remote.origin.url")) ?? "");
    const originName = origin?.path.slice(GITHUB_ROOT.length + 1).replace(/\.git$/, "");
    let head = f.get("head", "H") ?? h.branch!;
    let headRepo: string | undefined;
    if (head.includes(":")) {
      const [owner, br] = head.split(":");
      head = br;
      headRepo = `${owner}/${c.name.split("/")[1]}`;
    } else if (originName && originName !== c.name) headRepo = originName;
    const base = f.get("base", "B") ?? "main";
    const headBare = headRepo ? await openBare(g, headRepo) : c.bare;
    const remoteHead = await g.m.asRoot(() => headBare.readRef(`refs/heads/${head}`));
    if (!remoteHead) throw new GitError("aborted: you must first push the current branch to a remote, or use the --head flag", 1);
    if (head === base && !headRepo) throw new GitError(`a pull request for branch "${head}" into branch "${base}" can't be created: they're the same branch`, 1);
    const dup = c.store.pulls.find((p) => p.head === head && p.base === base && p.state === "OPEN" && p.headRepo === headRepo);
    if (dup) throw new GitError(`a pull request for branch "${headRepo ? `${headRepo.split("/")[0]}:` : ""}${head}" into branch "${base}" already exists:\n${url(c.name, "pull", dup.number)}`, 1);
    let title = f.get("title", "t");
    let body = f.get("body", "b") ?? "";
    const bodyFile = f.get("body-file", "F");
    if (bodyFile) body = await ctx.fs.readFile(join(ctx.cwd, bodyFile)).catch(() => "");
    if (f.has("fill") || f.has("fill-first") || f.has("f")) {
      const cm = await g.m.asRoot(() => headBare.readCommit(remoteHead));
      title ??= cm.message.split("\n")[0];
      body = body || cm.message.split("\n").slice(2).join("\n").trim();
    }
    if (!title) throw new GitError("must provide `--title` and `--body` (or `--fill`) when not running interactively", 1);
    const labels = f.all("label", "l");
    const known = (c.store.labels ?? DEFAULT_LABELS).map((l) => l.name);
    const bad = labels.find((l) => !known.includes(l));
    if (bad) throw new GitError(`could not add label: '${bad}' not found`, 1);
    const reviewers = [...new Set([...f.all("reviewer", "r"), ...(await codeOwners(g, c.bare, headBare, base, remoteHead))])].filter((r) => r !== me);
    const pr: Pull = { number: c.store.next++, title, body, head, headRepo, base, state: "OPEN", draft: f.has("draft") || f.has("d"), author: me, labels, reviewers, assignees: f.all("assignee", "a").map((a) => (a === "@me" ? me : a)), milestone: f.get("milestone", "m") };
    c.store.pulls.push(pr);
    await save(g, c);
    if (headRepo) await copyInto(g, headBare, c.bare, remoteHead, `refs/pull/${pr.number}/head`);
    await runWorkflows(g.m, c.bare, { event: "pull_request", branch: head, base, sha: remoteHead, pr: pr.number, actor: me });
    g.err += `\nCreating ${pr.draft ? "draft " : ""}pull request for ${headRepo ? `${headRepo.split("/")[0]}:` : ""}${head} into ${base} in ${c.name}\n\n`;
    g.out += `${url(c.name, "pull", pr.number)}\n`;
    return;
  }
  if (sub === "list") {
    const state = (f.get("state", "s") ?? "open").toLowerCase();
    let list = c.store.pulls.filter((p) => state === "all" || p.state.toLowerCase() === state);
    for (const l of f.all("label", "l")) list = list.filter((p) => p.labels?.includes(l));
    const author = f.get("author", "A");
    if (author) list = list.filter((p) => p.author === (author === "@me" ? me : author));
    if (!list.length) {
      g.out += `no ${state === "all" ? "" : `${state} `}pull requests in ${c.name}\n`;
      return;
    }
    g.out += `\nShowing ${list.length} of ${list.length} ${state === "all" ? "" : `${state} `}pull request${list.length === 1 ? "" : "s"} in ${c.name}\n\n`;
    const rows = [...list].reverse().map((p) => [`#${p.number}`, p.title, p.headRepo ? `${p.headRepo.split("/")[0]}:${p.head}` : p.head, p.state === "OPEN" ? (p.draft ? "DRAFT" : "OPEN") : p.state]);
    g.out += table(["ID", "TITLE", "BRANCH", "STATE"], rows);
    return;
  }
  const pr = await currentPr();
  if (!pr) throw new GitError(f.operands[0] ? `GraphQL: Could not resolve to a PullRequest with the number of ${f.operands[0]}. (repository.pullRequest)` : `no pull requests found for branch "${(await c.local?.head())?.branch ?? ""}"`, 1);
  const headSha = await prHeadSha(g, c, pr);
  const baseSha = await g.m.asRoot(() => c.bare.readRef(`refs/heads/${pr.base}`));
  const ref = `${c.name}#${pr.number}`;

  if (sub === "view") {
    if (f.has("web")) {
      g.out += `Opening ${url(c.name, "pull", pr.number)} in your browser.\n(The practice computer has no browser: on your Mac this opens the page.)\n`;
      return;
    }
    const count = headSha && baseSha ? await commitsAhead(g, c.bare, headSha, baseSha) : 0;
    const state = pr.state === "OPEN" ? (pr.draft ? "Draft" : "Open") : pr.state === "MERGED" ? "Merged" : "Closed";
    let plus = 0;
    let minus = 0;
    if (headSha && baseSha) {
      const mb = await g.m.asRoot(() => mergeBase(c.bare, baseSha, headSha));
      for (const ch of await g.m.asRoot(async () => changesBetween(c.bare, await c.bare.commitFiles(mb), await c.bare.commitFiles(headSha)))) {
        const n = countLines(ch.old?.text ?? "", ch.new?.text ?? "");
        plus += n.added;
        minus += n.removed;
      }
    }
    const checks = headSha ? checkRows(c, headSha) : [];
    const checkText = !checks.length ? "" : checks.some((x) => x.job.conclusion === "failure") ? " • × Checks failing" : " • ✓ Checks passing";
    let out = `${pr.title} ${ref}\n${state} • ${pr.author} wants to merge ${count} commit${count === 1 ? "" : "s"} into ${pr.base} from ${pr.headRepo ? `${pr.headRepo.split("/")[0]}:` : ""}${pr.head}\n+${plus} -${minus}${checkText}\n`;
    const reviews = latestReviews(pr);
    const reviewerText = [...reviews.map((r) => `${r.author} (${r.state === "APPROVED" ? "Approved" : r.state === "CHANGES_REQUESTED" ? "Changes requested" : "Commented"})`), ...(pr.reviewers ?? []).filter((x) => !reviews.some((r) => r.author === x)).map((x) => `${x} (Requested)`)];
    if (reviewerText.length) out += `Reviewers: ${reviewerText.join(", ")}\n`;
    if (pr.assignees?.length) out += `Assignees: ${pr.assignees.join(", ")}\n`;
    if (pr.labels?.length) out += `Labels: ${pr.labels.join(", ")}\n`;
    if (pr.milestone) out += `Milestone: ${pr.milestone}\n`;
    out += `\n${pr.body.trim() ? pr.body.trim().split("\n").map((l) => `  ${l}`).join("\n") : "  No description provided"}\n\n`;
    if (f.has("comments") || f.has("c")) {
      for (const r of pr.reviews ?? []) out += `${r.author} ${r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "requested changes" : "reviewed"}\n${r.body ? `  ${r.body}\n` : ""}\n`;
      for (const cm of pr.comments ?? []) out += `${cm.author} commented\n  ${cm.body}\n\n`;
    } else if ((pr.comments?.length ?? 0) + (pr.reviews?.filter((r) => r.body).length ?? 0)) out += `———————— Not showing ${(pr.comments?.length ?? 0) + (pr.reviews?.filter((r) => r.body).length ?? 0)} comments ————————\nUse --comments to view the full conversation\n\n`;
    out += `View this pull request on GitHub: ${url(c.name, "pull", pr.number)}\n`;
    g.out += out;
    return;
  }
  if (sub === "diff") {
    if (!headSha || !baseSha) throw new GitError("the branch is gone", 1);
    const mb = await g.m.asRoot(() => mergeBase(c.bare, baseSha, headSha));
    const changes = await g.m.asRoot(async () => changesBetween(c.bare, await c.bare.commitFiles(mb), await c.bare.commitFiles(headSha)));
    g.out += f.has("name-only") ? changes.map((x) => `${x.path}\n`).join("") : changes.map((x) => unifiedDiff(x, g.tty)).join("");
    return;
  }
  if (sub === "checkout") {
    if (!c.local) throw new GitError("not in a git repository", 1);
    const lg: G = { ...g, cwd: ctx.cwd, repo: undefined };
    if (pr.headRepo && !(await c.local.readRef(`refs/heads/${pr.head}`))) {
      // A fork's branch: fetch it from the pull request, like gh does.
      const sha = headSha!;
      await copyInto(g, c.bare, c.local, sha, `refs/heads/${pr.head}`);
      await gitSwitch(lg, [pr.head]);
      return;
    }
    await gitFetch(lg, []);
    await gitSwitch(lg, [pr.head]);
    return;
  }
  if (sub === "checks") {
    const rows = headSha ? checkRows(c, headSha) : [];
    if (!rows.length) throw new GitError(`no checks reported on the '${pr.head}' branch`, 1);
    const failing = rows.filter((x) => x.job.conclusion === "failure").length;
    const ok = rows.filter((x) => x.job.conclusion === "success").length;
    const skipped = rows.length - failing - ok;
    g.out += `${failing ? "Some checks were not successful" : "All checks were successful"}\n0 cancelled, ${failing} failing, ${ok} successful, ${skipped} skipped, and 0 pending checks\n\n`;
    g.out += table(["", "NAME", "DESCRIPTION", "ELAPSED", "URL"], rows.map((x) => [x.job.conclusion === "success" ? "✓" : x.job.conclusion === "failure" ? "X" : "-", `${x.run.workflow}/${x.job.name} (${x.run.event})`, "", "9s", `https://github.com/${c.name}/actions/runs/${x.run.id}/job/${x.job.id}`]));
    if (failing) throw new GitError("", 1);
    return;
  }
  if (sub === "review") {
    const approve = f.has("approve") || f.has("a");
    const changes = f.has("request-changes") || f.has("r");
    const body = f.get("body", "b") ?? "";
    if (!approve && !changes && !f.has("comment") && !f.has("c")) throw new GitError("--approve, --request-changes, or --comment required when not running interactively", 1);
    if (pr.author === me && approve) throw new GitError("failed to create review: GraphQL: Can not approve your own pull request (addPullRequestReview)", 1);
    if (pr.author === me && changes) throw new GitError("failed to create review: GraphQL: Can not request changes on your own pull request (addPullRequestReview)", 1);
    if ((changes || f.has("comment") || f.has("c")) && !body) throw new GitError("body cannot be blank for comment review", 1);
    pr.reviews = [...(pr.reviews ?? []), { author: me, state: approve ? "APPROVED" : changes ? "CHANGES_REQUESTED" : "COMMENTED", body }];
    pr.reviewers = (pr.reviewers ?? []).filter((r) => r !== me);
    await save(g, c);
    g.out += approve ? `✓ Approved pull request ${ref}\n` : changes ? `+ Requested changes to pull request ${ref}\n` : `- Reviewed pull request ${ref}\n`;
    return;
  }
  if (sub === "comment") {
    const body = f.get("body", "b");
    if (!body) throw new GitError("`--body` or `--body-file` required when not running interactively", 1);
    pr.comments = [...(pr.comments ?? []), { author: me, body }];
    await save(g, c);
    g.out += `${url(c.name, "pull", pr.number)}#issuecomment-${2400000000 + (pr.comments.length + pr.number * 10)}\n`;
    return;
  }
  if (sub === "edit") {
    const known = (c.store.labels ?? DEFAULT_LABELS).map((l) => l.name);
    for (const l of f.all("add-label")) {
      if (!known.includes(l)) throw new GitError(`'${l}' not found`, 1);
      pr.labels = [...new Set([...(pr.labels ?? []), l])];
    }
    for (const l of f.all("remove-label")) pr.labels = (pr.labels ?? []).filter((x) => x !== l);
    for (const r of f.all("add-reviewer")) pr.reviewers = [...new Set([...(pr.reviewers ?? []), r])];
    for (const a of f.all("add-assignee")) pr.assignees = [...new Set([...(pr.assignees ?? []), a === "@me" ? me : a])];
    if (f.get("title", "t") !== undefined) pr.title = f.get("title", "t")!;
    if (f.get("body", "b") !== undefined) pr.body = f.get("body", "b")!;
    if (f.get("milestone", "m") !== undefined) pr.milestone = f.get("milestone", "m");
    if (f.get("base", "B")) pr.base = f.get("base", "B")!;
    await save(g, c);
    g.out += `${url(c.name, "pull", pr.number)}\n`;
    return;
  }
  if (sub === "close") {
    pr.state = "CLOSED";
    await save(g, c);
    g.out += `✓ Closed pull request ${ref} (${pr.title})\n`;
    return;
  }
  if (sub === "reopen") {
    pr.state = "OPEN";
    await save(g, c);
    g.out += `✓ Reopened pull request ${ref} (${pr.title})\n`;
    return;
  }
  if (sub === "ready") {
    pr.draft = !f.has("undo");
    pr.draft = false;
    await save(g, c);
    g.out += `✓ Pull request ${ref} is marked as "ready for review"\n`;
    return;
  }
  if (sub === "merge") {
    if (pr.state !== "OPEN") throw new GitError(`Pull request ${ref} (${pr.title}) was already ${pr.state.toLowerCase()}`, 1);
    if (pr.draft) throw new GitError(`Pull request ${ref} is still a draft`, 1);
    const how = f.has("squash") || f.has("s") ? "squash" : f.has("rebase") || f.has("r") ? "rebase" : f.has("merge") || f.has("m") ? "merge" : undefined;
    if (!how) throw new GitError("--merge, --rebase, or --squash required when not running interactively", 1);
    if (!headSha || !baseSha) throw new GitError("the pull request's branch is gone", 1);
    const blockers = await mergeBlockers(g, c, pr, headSha);
    const admin = f.has("admin") && c.name.split("/")[0] === me;
    if (f.has("admin") && !admin) throw new GitError(`GraphQL: ${me} does not have the correct permissions to execute \`MergePullRequest\` (mergePullRequest)`, 1);
    if (blockers.length && !admin) {
      if (f.has("auto")) {
        g.out += `✓ Pull request ${ref} will be automatically merged via ${how} when all requirements are met\n`;
        return;
      }
      throw new GitError(`X Pull request ${ref} is not mergeable: the base branch policy prohibits the merge.\n${blockers.map((b) => `  - ${b}`).join("\n")}\nTo have the pull request merged after all the requirements have been met, add the \`--auto\` flag.\nTo use administrator privileges to immediately merge the pull request, add the \`--admin\` flag.`, 1);
    }
    const merged = await g.m.asRoot(() => mergeFiles(c.bare, baseSha, headSha));
    if (!merged) throw new GitError(`X Pull request ${ref} is not mergeable: the merge commit cannot be cleanly created.\nTo have the pull request merged after all the requirements have been met, add the \`--auto\` flag.\nRun the following to resolve the merge conflicts locally:\n  gh pr checkout ${pr.number} && git fetch origin ${pr.base} && git merge origin/${pr.base}`, 1);
    const tree = await g.m.asRoot(() => c.bare.writeTree(merged));
    const ghEnv = new Map(g.env);
    const id = (await c.local?.identity(false)) ?? { name: "Learner", email: "learner@inkwell.example" };
    ghEnv.set("GIT_AUTHOR_NAME", id.name);
    ghEnv.set("GIT_AUTHOR_EMAIL", id.email);
    ghEnv.set("GIT_COMMITTER_NAME", "GitHub");
    ghEnv.set("GIT_COMMITTER_EMAIL", "noreply@github.com");
    const mg: G = { ...g, env: ghEnv };
    const headOwner = (pr.headRepo ?? c.name).split("/")[0];
    let sha: string;
    if (how === "merge") sha = await g.m.asRoot(() => makeCommit(mg, c.bare, tree, [baseSha, headSha], `Merge pull request #${pr.number} from ${headOwner}/${pr.head}\n\n${pr.title}\n`));
    else if (how === "squash") {
      // Squash: one new commit; GitHub lists the branch's commit messages in its body.
      const { walk } = await import("../git/history");
      const B = await g.m.asRoot(() => ancestors(c.bare, baseSha));
      const list = (await g.m.asRoot(() => walk(c.bare, [headSha]))).filter((w) => !B.has(w.sha)).reverse();
      const body = pr.body.trim() || list.map((w) => `* ${w.c.message.split("\n")[0]}`).join("\n");
      sha = await g.m.asRoot(() => makeCommit(mg, c.bare, tree, [baseSha], `${pr.title} (#${pr.number})\n${body ? `\n${body}\n` : ""}`));
    } else {
      // Rebase-merge: the branch's commits replayed on top of the base, one by one.
      const mb = await g.m.asRoot(() => mergeBase(c.bare, baseSha, headSha));
      if (mb === baseSha) sha = headSha;
      else {
        const { walk } = await import("../git/history");
        const B = await g.m.asRoot(() => ancestors(c.bare, baseSha));
        const list = (await g.m.asRoot(() => walk(c.bare, [headSha]))).filter((w) => !B.has(w.sha) && w.c.parents.length < 2).reverse();
        let cur = baseSha;
        for (const w of list) {
          const files = await g.m.asRoot(() => mergeFiles(c.bare, cur, w.sha));
          if (!files) throw new GitError("This branch can't be rebased: the commits conflict with the base branch.", 1);
          const t = await g.m.asRoot(() => c.bare.writeTree(files));
          const authorEnv = new Map(ghEnv);
          authorEnv.set("GIT_AUTHOR_NAME", w.c.author.name);
          authorEnv.set("GIT_AUTHOR_EMAIL", w.c.author.email);
          authorEnv.set("GIT_AUTHOR_DATE", `@${w.c.author.time}`);
          cur = await g.m.asRoot(() => makeCommit({ ...g, env: authorEnv }, c.bare, t, [cur], w.c.message));
        }
        sha = cur;
      }
    }
    await g.m.asRoot(() => c.bare.writeRef(`refs/heads/${pr.base}`, sha));
    pr.state = "MERGED";
    pr.how = how;
    pr.mergedSha = sha;
    for (const mt of `${pr.title}\n${pr.body}`.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
      const issue = c.store.issues.find((i) => i.number === Number(mt[1]));
      if (issue) issue.state = "CLOSED";
    }
    await save(g, c);
    await runWorkflows(g.m, c.bare, { event: "push", branch: pr.base, sha, actor: me });
    const verb = how === "squash" ? "Squashed and merged" : how === "rebase" ? "Rebased and merged" : "Merged";
    g.out += `✓ ${verb} pull request ${ref} (${pr.title})\n`;
    if (f.has("delete-branch") || f.has("d")) {
      const headBare = pr.headRepo ? await openBare(g, pr.headRepo) : c.bare;
      await g.m.asRoot(() => headBare.deleteRef(`refs/heads/${pr.head}`));
      if (c.local) {
        const lg: G = { ...g, cwd: c.local.root!, repo: undefined, out: "", err: "" };
        const h = await c.local.head();
        if (h.branch === pr.head) await gitSwitch(lg, [pr.base]);
        const upstreamRemote = pr.headRepo ? "upstream" : "origin";
        await gitPull({ ...lg, out: "", err: "" }, pr.headRepo ? [upstreamRemote, pr.base, "--ff-only"] : ["--ff-only"]).catch(() => undefined);
        const stillThere = await c.local.readRef(`refs/heads/${pr.head}`);
        if (stillThere) await c.local.deleteRef(`refs/heads/${pr.head}`);
        await c.local.deleteRef(`refs/remotes/origin/${pr.head}`);
        g.out += `✓ Deleted local branch ${pr.head} and switched to branch ${pr.base}\n`;
      }
      g.out += `✓ Deleted remote branch ${pr.head}\n`;
    }
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh pr"`, 1);
}

/** Reviewers GitHub requests from CODEOWNERS for the files a pull request changes. */
async function codeOwners(g: G, bare: Repo, headBare: Repo, base: string, headSha: string): Promise<string[]> {
  const baseSha = await g.m.asRoot(() => bare.readRef(`refs/heads/${base}`));
  if (!baseSha) return [];
  const baseFiles = await g.m.asRoot(() => bare.commitFiles(baseSha));
  const file = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"].map((p) => baseFiles.get(p)).find(Boolean);
  if (!file) return [];
  const rules = (await g.m.asRoot(() => bare.readBlobText(file.sha)))
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [pattern, ...owners] = l.split(/\s+/);
      const anchored = pattern.startsWith("/") || pattern.slice(0, -1).includes("/");
      let body = pattern.replace(/^\//, "").replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
      if (body.endsWith("/")) body += ".*";
      return { re: new RegExp(`^${anchored ? "" : "(?:.*/)?"}${body}(?:/.*)?$`), owners: owners.map((o) => o.replace(/^@/, "")) };
    });
  const mb = await g.m.asRoot(() => mergeBase(headBare === bare ? bare : headBare, baseSha, headSha).catch(() => baseSha));
  const before = await g.m.asRoot(() => (headBare === bare ? bare : headBare).commitFiles(mb ?? baseSha).catch(() => baseFiles));
  const after = await g.m.asRoot(() => (headBare === bare ? bare : headBare).commitFiles(headSha));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p)?.sha !== after.get(p)?.sha);
  const out = new Set<string>();
  for (const p of changed) {
    let owners: string[] = [];
    for (const r of rules) if (r.re.test(p)) owners = r.owners;
    for (const o of owners) out.add(o);
  }
  return [...out];
}

// ----- issues -----

async function ghIssue(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest, new Set(["w", "c"]));
  const me = actor(g);
  const c = await currentRepo(g, ctx, f.get("repo", "R"), { preferParent: true });
  const known = (c.store.labels ?? DEFAULT_LABELS).map((l) => l.name);
  const checkLabels = (ls: string[]) => {
    const bad = ls.find((l) => !known.includes(l));
    if (bad) throw new GitError(`could not add label: '${bad}' not found`, 1);
  };
  const checkMilestone = (m?: string) => {
    if (m && !(c.store.milestones ?? []).some((x) => x.title === m)) throw new GitError(`could not add to milestone '${m}': '${m}' not found`, 1);
  };
  if (sub === "create") {
    const title = f.get("title", "t");
    if (!title) throw new GitError("must provide `--title` and `--body` when not running interactively", 1);
    const labels = f.all("label", "l");
    checkLabels(labels);
    const milestone = f.get("milestone", "m");
    checkMilestone(milestone);
    const issue: Issue = { number: c.store.next++, title, body: f.get("body", "b") ?? "", state: "OPEN", author: me, labels, milestone, assignees: f.all("assignee", "a").map((a) => (a === "@me" ? me : a)) };
    c.store.issues.push(issue);
    await save(g, c);
    g.err += `\nCreating issue in ${c.name}\n\n`;
    g.out += `${url(c.name, "issues", issue.number)}\n`;
    return;
  }
  if (sub === "list") {
    const state = (f.get("state", "s") ?? "open").toLowerCase();
    let list = c.store.issues.filter((i) => state === "all" || i.state.toLowerCase() === state);
    for (const l of f.all("label", "l")) list = list.filter((i) => i.labels?.includes(l));
    const ms = f.get("milestone", "m");
    if (ms) list = list.filter((i) => i.milestone === ms);
    const as = f.get("assignee", "a");
    if (as) list = list.filter((i) => i.assignees?.includes(as === "@me" ? me : as));
    if (!list.length) {
      g.out += `no ${state === "all" ? "" : `${state} `}issues in ${c.name}\n`;
      return;
    }
    g.out += `\nShowing ${list.length} of ${list.length} ${state === "all" ? "" : `${state} `}issue${list.length === 1 ? "" : "s"} in ${c.name}\n\n`;
    g.out += table(["ID", "TITLE", "LABELS"], [...list].reverse().map((i) => [`#${i.number}`, i.title, (i.labels ?? []).join(", ")]));
    return;
  }
  const issue = c.store.issues.find((i) => i.number === Number((f.operands[0] ?? "").replace(/^#/, "")));
  if (!issue) throw new GitError(`GraphQL: Could not resolve to an issue or pull request with the number of ${f.operands[0] ?? ""}. (repository.issue)`, 1);
  const ref = `${c.name}#${issue.number}`;
  if (sub === "view") {
    let out = `${issue.title} ${ref}\n${issue.state === "OPEN" ? "Open" : "Closed"} • ${issue.author} opened this issue • ${(issue.comments ?? []).length} comment${(issue.comments ?? []).length === 1 ? "" : "s"}\n`;
    if (issue.assignees?.length) out += `Assignees: ${issue.assignees.join(", ")}\n`;
    if (issue.labels?.length) out += `Labels: ${issue.labels.join(", ")}\n`;
    if (issue.milestone) out += `Milestone: ${issue.milestone}\n`;
    out += `\n${issue.body.trim() ? issue.body.trim().split("\n").map((l) => `  ${l}`).join("\n") : "  No description provided"}\n\n`;
    if (f.has("comments") || f.has("c")) for (const cm of issue.comments ?? []) out += `${cm.author} commented\n  ${cm.body}\n\n`;
    out += `View this issue on GitHub: ${url(c.name, "issues", issue.number)}\n`;
    g.out += out;
    return;
  }
  if (sub === "close" || sub === "reopen") {
    issue.state = sub === "close" ? "CLOSED" : "OPEN";
    issue.reason = sub === "close" ? (f.get("reason", "r") ?? "completed") : undefined;
    const comment = f.get("comment", "c");
    if (comment) issue.comments = [...(issue.comments ?? []), { author: me, body: comment }];
    await save(g, c);
    g.out += `✓ ${sub === "close" ? "Closed" : "Reopened"} issue ${ref} (${issue.title})${sub === "close" && issue.reason === "not planned" ? " as not planned" : ""}\n`;
    return;
  }
  if (sub === "comment") {
    const body = f.get("body", "b");
    if (!body) throw new GitError("`--body` or `--body-file` required when not running interactively", 1);
    issue.comments = [...(issue.comments ?? []), { author: me, body }];
    await save(g, c);
    g.out += `${url(c.name, "issues", issue.number)}#issuecomment-${2400000000 + issue.number * 10 + issue.comments.length}\n`;
    return;
  }
  if (sub === "edit") {
    const add = f.all("add-label");
    checkLabels(add);
    issue.labels = [...new Set([...(issue.labels ?? []), ...add])].filter((l) => !f.all("remove-label").includes(l));
    const ms = f.get("milestone", "m");
    if (ms !== undefined) {
      checkMilestone(ms);
      issue.milestone = ms || undefined;
    }
    for (const a of f.all("add-assignee")) issue.assignees = [...new Set([...(issue.assignees ?? []), a === "@me" ? me : a])];
    if (f.get("title", "t") !== undefined) issue.title = f.get("title", "t")!;
    if (f.get("body", "b") !== undefined) issue.body = f.get("body", "b")!;
    await save(g, c);
    g.out += `${url(c.name, "issues", issue.number)}\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh issue"`, 1);
}

// ----- labels, releases, rulesets -----

async function ghLabel(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest);
  const c = await currentRepo(g, ctx, f.get("repo", "R"), { preferParent: true });
  c.store.labels ??= DEFAULT_LABELS.map((l) => ({ ...l }));
  if (sub === "list") {
    g.out += `\nShowing ${c.store.labels.length} of ${c.store.labels.length} labels in ${c.name}\n\n${table(["NAME", "DESCRIPTION", "COLOR"], c.store.labels.map((l) => [l.name, l.description, `#${l.color}`]))}`;
    return;
  }
  const name = f.operands[0];
  if (!name) throw new GitError("cannot create label: name argument required", 1);
  const existing = c.store.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (sub === "create") {
    if (existing && !f.has("force")) throw new GitError(`label with name "${name}" already exists; use \`--force\` to update its color and description`, 1);
    const label = { name, color: (f.get("color", "c") ?? "ededed").replace(/^#/, ""), description: f.get("description", "d") ?? "" };
    if (existing) Object.assign(existing, label);
    else c.store.labels.push(label);
    await save(g, c);
    g.out += `✓ Label "${name}" created in ${c.name}\n`;
    return;
  }
  if (sub === "delete") {
    if (!existing) throw new GitError(`label "${name}" not found`, 1);
    c.store.labels = c.store.labels.filter((l) => l !== existing);
    await save(g, c);
    g.out += `✓ Label "${name}" deleted from ${c.name}\n`;
    return;
  }
  if (sub === "edit") {
    if (!existing) throw new GitError(`label "${name}" not found`, 1);
    if (f.get("color", "c")) existing.color = f.get("color", "c")!.replace(/^#/, "");
    if (f.get("description", "d") !== undefined) existing.description = f.get("description", "d")!;
    if (f.get("name", "n")) existing.name = f.get("name", "n")!;
    await save(g, c);
    g.out += `✓ Label "${name}" updated in ${c.name}\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh label"`, 1);
}

async function ghRelease(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest, new Set(["d", "p", "y"]));
  const c = await currentRepo(g, ctx, f.get("repo", "R"));
  c.store.releases ??= [];
  const now = Math.floor(g.m.now().getTime() / 1000);
  if (sub === "create") {
    const tag = f.operands[0];
    if (!tag) throw new GitError("could not create: no tag name provided", 1);
    if (c.store.releases.some((r) => r.tag === tag)) throw new GitError(`a release with the same tag name already exists: ${tag}`, 1);
    let sha = await g.m.asRoot(() => c.bare.readRef(`refs/tags/${tag}`));
    const target = f.get("target") ?? "main";
    if (!sha) {
      // GitHub creates the tag on the target branch.
      sha = await g.m.asRoot(() => c.bare.readRef(`refs/heads/${target}`));
      if (!sha) throw new GitError(`HTTP 422: Validation Failed (https://api.github.com/repos/${c.name}/releases)\nRelease.target_commitish is invalid`, 1);
      if (c.local && (await c.local.readRef(`refs/tags/${tag}`)) && (await c.local.readRef(`refs/tags/${tag}`)) !== sha) throw new GitError(`tag ${tag} exists locally but has not been pushed to ${c.name}, please push it before continuing or specify the \`--target\` flag to create a new tag`, 1);
      await g.m.asRoot(() => c.bare.writeRef(`refs/tags/${tag}`, sha!));
    }
    let notes = f.get("notes", "n") ?? "";
    const notesFile = f.get("notes-file", "F");
    if (notesFile) notes = await ctx.fs.readFile(join(ctx.cwd, notesFile)).catch(() => "");
    if (f.has("generate-notes")) {
      const merged = c.store.pulls.filter((p) => p.state === "MERGED");
      const prev = c.store.releases.at(-1)?.tag;
      notes = `${notes ? `${notes}\n\n` : ""}## What's Changed\n${merged.map((p) => `* ${p.title} by @${p.author} in https://github.com/${c.name}/pull/${p.number}`).join("\n")}\n\n**Full Changelog**: https://github.com/${c.name}/${prev ? `compare/${prev}...${tag}` : `commits/${tag}`}`;
    }
    c.store.releases.push({ tag, name: f.get("title", "t") ?? tag, notes, draft: f.has("draft") || f.has("d"), prerelease: f.has("prerelease") || f.has("p"), author: actor(g), target });
    await save(g, c);
    g.out += `https://github.com/${c.name}/releases/tag/${tag}\n`;
    void now;
    return;
  }
  if (sub === "list") {
    const list = [...c.store.releases].reverse();
    if (!list.length) throw new GitError("no releases found", 1);
    const latest = list.find((r) => !r.draft && !r.prerelease);
    g.out += table(["TITLE", "TYPE", "TAG NAME", "PUBLISHED"], list.map((r) => [r.name, r.draft ? "Draft" : r.prerelease ? "Pre-release" : r === latest ? "Latest" : "", r.tag, "less than a minute ago"]));
    return;
  }
  const tag = f.operands[0] ?? [...c.store.releases].reverse().find((r) => !r.draft && !r.prerelease)?.tag;
  const rel = c.store.releases.find((r) => r.tag === tag);
  if (!rel) throw new GitError("release not found", 1);
  if (sub === "view") {
    g.out += `${rel.name}\n${rel.draft ? "Draft" : rel.prerelease ? "Pre-release" : "Latest"} • ${rel.author} released this less than a minute ago\n\n${rel.notes.trim() ? rel.notes.trim().split("\n").map((l) => `  ${l}`).join("\n") : "  No release notes"}\n\nView on GitHub: https://github.com/${c.name}/releases/tag/${rel.tag}\n`;
    return;
  }
  if (sub === "delete") {
    if (!f.has("yes") && !f.has("y")) throw new GitError("--yes required when not running interactively", 1);
    c.store.releases = c.store.releases.filter((r) => r !== rel);
    await save(g, c);
    g.out += `✓ Deleted release ${rel.tag}\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh release"`, 1);
}

function ruleText(r: Ruleset["rules"][number]) {
  const p = r.parameters;
  if (!p || !Object.keys(p).length) return `- ${r.type}`;
  const fmt = (v: unknown): string => (Array.isArray(v) ? `[${v.map((x) => (typeof x === "object" ? `map[${Object.entries(x as object).map(([k, y]) => `${k}:${y}`).join(" ")}]` : String(x))).join(" ")}]` : String(v));
  return `- ${r.type}: ${Object.entries(p).map(([k, v]) => `[${k}: ${fmt(v)}]`).join(" ")}`;
}

async function ghRuleset(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest);
  const c = await currentRepo(g, ctx, f.get("repo", "R"), { preferParent: true });
  const sets = c.store.rulesets ?? [];
  if (sub === "list" || sub === "ls") {
    if (!sets.length) throw new GitError(`no rulesets found in ${c.name}`, 1);
    g.out += `\nShowing ${sets.length} of ${sets.length} rulesets in ${c.name} and its parents\n\n${table(["ID", "NAME", "SOURCE", "STATUS", "RULES"], sets.map((s) => [String(s.id), s.name, `${c.name} (repo)`, s.enforcement, String(s.rules.length)]))}`;
    return;
  }
  if (sub === "view") {
    const s = f.operands[0] ? sets.find((x) => String(x.id) === f.operands[0]) : sets[0];
    if (!s) throw new GitError(`ruleset ${f.operands[0] ?? ""} not found`, 1);
    g.out += `\n${s.name}\nID: ${s.id}\nSource: ${c.name} (Repository)\nEnforcement: ${s.enforcement[0].toUpperCase()}${s.enforcement.slice(1)}\n\nBypass List\nThis ruleset cannot be bypassed\n\nConditions\n- ref_name: [exclude: [${s.conditions.ref_name.exclude.join(" ")}]] [include: [${s.conditions.ref_name.include.join(" ")}]]\n\nRules\n${s.rules.map(ruleText).join("\n")}\n`;
    return;
  }
  if (sub === "check") {
    const branch = f.operands[0] ?? (await c.local?.head())?.branch ?? "main";
    const def = ((await g.m.asRoot(() => c.bare.readText("HEAD"))) ?? "ref: refs/heads/main").trim().replace(/^ref: refs\/heads\//, "");
    const apply = sets.filter((s) => rulesetApplies(s, branch, def));
    const rules = apply.flatMap((s) => s.rules.map((r) => ({ r, s })));
    g.out += `${rules.length} rule${rules.length === 1 ? "" : "s"} apply to branch ${branch} in repo ${c.name}\n${rules.map(({ r, s }) => `\n${ruleText(r)}${r.parameters && Object.keys(r.parameters).length ? "\n  " : ": "}(configured in ruleset ${s.id} from repository ${c.name})\n`).join("")}`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh ruleset"`, 1);
}

// ----- gh api -----

async function ghApi(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const f = flags(args, new Set(["i"]));
  let path = (f.operands[0] ?? "").replace(/^\//, "").replace(/^https:\/\/api\.github\.com\//, "");
  if (!path) throw new GitError("accepts 1 arg(s), received 0", 1);
  const fields = [...f.all("field", "f"), ...f.all("raw-field", "F")];
  const method = (f.get("method", "X") ?? (fields.length || f.get("input") ? "POST" : "GET")).toUpperCase();
  if (path.includes("{owner}") || path.includes("{repo}")) {
    const c = await currentRepo(g, ctx);
    path = path.replace("{owner}", c.name.split("/")[0]).replace("{repo}", c.name.split("/")[1]);
  }
  let body: Record<string, unknown> = {};
  const input = f.get("input");
  if (input) {
    const text = input === "-" ? String(ctx.stdin ?? "") : await ctx.fs.readFile(join(ctx.cwd, input)).catch(() => undefined);
    if (text === undefined) throw new GitError(`open ${input}: no such file or directory`, 1);
    try {
      body = JSON.parse(text);
    } catch {
      throw new GitError(`could not parse the --input file as JSON`, 1);
    }
  }
  for (const kv of fields) {
    const i = kv.indexOf("=");
    const k = kv.slice(0, i);
    const v = kv.slice(i + 1);
    body[k] = /^\d+$/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v;
  }
  const notFound = () => new GitError(`gh: Not Found (HTTP 404)\n{"message":"Not Found","documentation_url":"https://docs.github.com/rest","status":"404"}`, 1);
  let result: unknown;
  let m: RegExpExecArray | null;
  if (path === "user") result = { login: USER, id: 90210, type: "User", name: "Learner", public_repos: 4 };
  else if ((m = /^repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path))) {
    const name = `${m[1]}/${m[2]}`;
    const bare = await g.m.asRoot(() => Repo.open(g.fs, `${GITHUB_ROOT}/${name}.git`, g.m.now));
    if (!bare) throw notFound();
    const c: Ctx = { name, bare, store: await readStore(g.m, bare) };
    const rest = m[3] ?? "";
    if (!rest) result = { name: m[2], full_name: name, private: c.store.visibility === "private", fork: !!c.store.forkOf, default_branch: "main", open_issues_count: c.store.issues.filter((i) => i.state === "OPEN").length, description: c.store.description ?? null };
    else if (rest === "/rulesets" && method === "GET") result = (c.store.rulesets ?? []).map((r) => ({ id: r.id, name: r.name, target: r.target, enforcement: r.enforcement, source: name, source_type: "Repository" }));
    else if (rest === "/rulesets" && method === "POST") {
      if (!body.name) throw new GitError(`gh: Invalid request.\n\n"name" wasn't supplied. (HTTP 422)`, 1);
      const rs: Ruleset = {
        id: 4200000 + (c.store.rulesets?.length ?? 0) + 1,
        name: String(body.name),
        target: (body.target as Ruleset["target"]) ?? "branch",
        enforcement: (body.enforcement as Ruleset["enforcement"]) ?? "disabled",
        conditions: (body.conditions as Ruleset["conditions"]) ?? { ref_name: { include: [], exclude: [] } },
        rules: (body.rules as Ruleset["rules"]) ?? [],
      };
      rs.conditions.ref_name ??= { include: [], exclude: [] };
      rs.conditions.ref_name.exclude ??= [];
      c.store.rulesets = [...(c.store.rulesets ?? []), rs];
      await save(g, c);
      result = { ...rs, source: name, source_type: "Repository" };
    } else if ((m = /^\/rulesets\/(\d+)$/.exec(rest))) {
      const rs = (c.store.rulesets ?? []).find((r) => String(r.id) === m![1]);
      if (!rs) throw notFound();
      if (method === "DELETE") {
        c.store.rulesets = c.store.rulesets!.filter((r) => r !== rs);
        await save(g, c);
        return;
      }
      result = rs;
    } else if (rest === "/milestones" && method === "POST") {
      const ms = { number: (c.store.milestones?.length ?? 0) + 1, title: String(body.title ?? ""), state: "open" as const };
      if (!ms.title) throw new GitError(`gh: Validation Failed (HTTP 422)`, 1);
      c.store.milestones = [...(c.store.milestones ?? []), ms];
      await save(g, c);
      result = ms;
    } else if (rest === "/milestones") result = c.store.milestones ?? [];
    else if (rest === "/pulls") result = c.store.pulls.filter((p) => p.state === "OPEN").map((p) => ({ number: p.number, title: p.title, state: "open", draft: p.draft, user: { login: p.author }, head: { ref: p.head }, base: { ref: p.base }, labels: (p.labels ?? []).map((l) => ({ name: l })) }));
    else if (rest === "/issues") result = c.store.issues.filter((i) => i.state === "OPEN").map((i) => ({ number: i.number, title: i.title, state: "open", user: { login: i.author }, labels: (i.labels ?? []).map((l) => ({ name: l })) }));
    else if (rest === "/releases") result = (c.store.releases ?? []).map((r) => ({ tag_name: r.tag, name: r.name, draft: r.draft, prerelease: r.prerelease }));
    else if (rest === "/actions/runs") result = { total_count: c.store.runs?.length ?? 0, workflow_runs: [...(c.store.runs ?? [])].reverse().map((r) => ({ id: r.id, name: r.workflow, head_branch: r.branch, head_sha: r.sha, event: r.event, status: "completed", conclusion: r.conclusion, run_number: r.number })) };
    else if (rest === "/labels") result = (c.store.labels ?? DEFAULT_LABELS).map((l) => ({ name: l.name, color: l.color, description: l.description }));
    else throw notFound();
  } else throw notFound();
  const text = `${JSON.stringify(result, null, g.tty ? 2 : 0)}\n`;
  const jq = f.get("jq", "q");
  if (jq) {
    const r = await ctx.exec!(`jq -r ${`'${jq.replace(/'/g, `'\\''`)}'`}`, { cwd: ctx.cwd, env: { ...Object.fromEntries(ctx.env), MP_BUILTIN_PKG: "1" }, stdin: text });
    g.out += r.stdout;
    if (r.exitCode) throw new GitError(r.stderr.trim(), 1);
    return;
  }
  g.out += text;
}

// ----- Actions: runs, workflows, secrets, variables -----

const mark = (c: string) => (c === "success" ? "✓" : c === "failure" ? "X" : "-");

async function ghRun(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest);
  const c = await currentRepo(g, ctx, f.get("repo", "R"));
  const runs = [...(c.store.runs ?? [])].reverse();
  const now = Math.floor(g.m.now().getTime() / 1000);
  if (sub === "list" || sub === "ls") {
    let list = runs;
    const wf = f.get("workflow", "w");
    if (wf) list = list.filter((r) => r.workflow === wf || r.file.endsWith(`/${wf}`));
    const br = f.get("branch", "b");
    if (br) list = list.filter((r) => r.branch === br);
    const ev = f.get("event", "e");
    if (ev) list = list.filter((r) => r.event === ev);
    list = list.slice(0, Number(f.get("limit", "L") ?? 20));
    if (!list.length) {
      g.out += "no runs found\n";
      return;
    }
    if (!g.tty) {
      g.out += list.map((r) => ["completed", r.conclusion, r.title, r.workflow, r.branch, r.event, String(r.id), "9s"].join("\t")).join("\n") + "\n";
      return;
    }
    g.out += table(["STATUS", "TITLE", "WORKFLOW", "BRANCH", "EVENT", "ID", "ELAPSED", "AGE"], list.map((r) => [mark(r.conclusion), r.title, r.workflow, r.branch, r.event, String(r.id), "9s", ago(r.created, now)]));
    return;
  }
  const pickRun = (): Run => {
    const id = f.operands[0];
    const r = id ? runs.find((x) => String(x.id) === id) : runs[0];
    if (!r) throw new GitError(id ? `could not find any workflow run with ID ${id}` : "no runs found", 1);
    return r;
  };
  if (sub === "view" || sub === "watch") {
    const r = pickRun();
    const jobId = f.get("job", "j");
    const jobs = jobId ? r.jobs.filter((j) => String(j.id) === jobId) : r.jobs;
    if (f.has("log") || f.has("log-failed")) {
      for (const j of jobs) {
        if (f.has("log-failed") && j.conclusion !== "failure") continue;
        for (const s of j.steps) {
          if (f.has("log-failed") && s.conclusion !== "failure") continue;
          for (const l of s.log) g.out += `${j.name}\t${s.name}\t${l.replace(/\x1b\[[0-9;]*m/g, "")}\n`;
        }
      }
      return;
    }
    let out = `\n${mark(r.conclusion)} ${r.branch} ${r.workflow} · ${r.id}\nTriggered via ${r.event} ${ago(r.created, now)}\n\nJOBS\n`;
    for (const j of jobs) {
      out += `${mark(j.conclusion)} ${j.name} in 9s (ID ${j.id})\n`;
      if (sub === "watch" || jobId || j.conclusion === "failure") for (const s of j.steps) out += `  ${mark(s.conclusion)} ${s.name}\n`;
    }
    const failedJob = r.jobs.find((j) => j.conclusion === "failure");
    if (failedJob) {
      const step = failedJob.steps.find((s) => s.conclusion === "failure");
      const err = step?.log.find((l) => l.startsWith("##[error]"));
      out += `\nANNOTATIONS\nX ${err ? err.replace("##[error]", "") : "Process completed with exit code 1."}\n${failedJob.name}: .github#1\n\n`;
      out += `To see what failed, try: gh run view ${r.id} --log-failed\n`;
    } else out += `\nFor more information about the job, try: gh run view --job=${r.jobs[0]?.id ?? 0}\n`;
    out += `View this run on GitHub: https://github.com/${c.name}/actions/runs/${r.id}\n`;
    g.out += out;
    if ((f.has("exit-status") || sub === "watch") && r.conclusion === "failure") throw new GitError("", 1);
    return;
  }
  if (sub === "rerun") {
    const r = pickRun();
    const made = await runWorkflows(g.m, c.bare, { event: r.event as "push", branch: r.branch, sha: r.sha, actor: actor(g), pr: r.pr, workflowFile: r.file.split("/").pop() });
    g.out += `✓ Requested rerun of run ${r.id}${made[0] ? ` (new run ${made[0].id})` : ""}\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh run"`, 1);
}

async function workflowsOf(g: G, c: Ctx, branch = "main") {
  const sha = await g.m.asRoot(() => c.bare.readRef(`refs/heads/${branch}`));
  if (!sha) return [];
  const files = await g.m.asRoot(() => c.bare.commitFiles(sha));
  const out: { file: string; name: string; text: string }[] = [];
  for (const [p, e] of files) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) continue;
    const text = await g.m.asRoot(() => c.bare.readBlobText(e.sha));
    out.push({ file: p.split("/").pop()!, name: /^name:\s*(.+)$/m.exec(text)?.[1].trim().replace(/^["']|["']$/g, "") ?? p.split("/").pop()!, text });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : 1));
}

async function ghWorkflow(g: G, ctx: ResolvedCommandContext, args: string[]) {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest);
  const c = await currentRepo(g, ctx, f.get("repo", "R"));
  const wfs = await workflowsOf(g, c);
  if (sub === "list" || sub === "ls") {
    if (!wfs.length) throw new GitError(`no workflows found in ${c.name}`, 1);
    g.out += table(["NAME", "STATE", "ID"], wfs.map((w, i) => [w.name, "active", String(178000000 + i)]));
    return;
  }
  const want = f.operands[0];
  const wf = wfs.find((w) => w.file === want || w.name === want);
  if (!wf) throw new GitError(`could not find any workflows named ${want ?? ""}`, 1);
  if (sub === "view") {
    const runs = [...(c.store.runs ?? [])].reverse().filter((r) => r.file.endsWith(`/${wf.file}`));
    g.out += `${wf.name} - ${wf.file}\nID: 178000000\n\nTotal runs ${runs.length}\nRecent runs\n${runs.slice(0, 5).map((r) => `${mark(r.conclusion)}  ${r.title}  ${r.branch}  ${r.event}  ${r.id}`).join("\n")}\n\nTo see more runs for this workflow, try: gh run list --workflow ${wf.file}\nTo see the YAML for this workflow, try: gh workflow view ${wf.file} --yaml\n`;
    return;
  }
  if (sub === "run") {
    if (!/workflow_dispatch/.test(wf.text)) throw new GitError(`could not create workflow dispatch event: HTTP 422: Workflow does not have 'workflow_dispatch' trigger (https://api.github.com/repos/${c.name}/actions/workflows/${wf.file}/dispatches)`, 1);
    const branch = f.get("ref", "r") ?? "main";
    const sha = await g.m.asRoot(() => c.bare.readRef(`refs/heads/${branch}`));
    if (!sha) throw new GitError(`could not create workflow dispatch event: HTTP 422: No ref found for: ${branch}`, 1);
    await runWorkflows(g.m, c.bare, { event: "workflow_dispatch", branch, sha, actor: actor(g), workflowFile: wf.file });
    g.out += `✓ Created workflow_dispatch event for ${wf.file} at ${branch}\n\nTo see runs for this workflow, try: gh run list --workflow="${wf.file}"\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh workflow"`, 1);
}

async function ghSecretOrVar(g: G, ctx: ResolvedCommandContext, args: string[], kind: "secret" | "variable") {
  await needLogin(g, ctx);
  const [sub, ...rest] = args;
  const f = flags(rest);
  const c = await currentRepo(g, ctx, f.get("repo", "R"));
  const key = kind === "secret" ? "secrets" : "variables";
  c.store[key] ??= {};
  const bag = c.store[key]!;
  const Label = kind === "secret" ? "Actions secret" : "variable";
  if (sub === "list" || sub === "ls") {
    const names = Object.keys(bag).sort();
    if (!names.length) {
      g.out += `no ${kind}s found\n`;
      return;
    }
    g.out += kind === "secret" ? table(["NAME", "UPDATED"], names.map((n) => [n, "less than a minute ago"])) : table(["NAME", "VALUE", "UPDATED"], names.map((n) => [n, bag[n], "less than a minute ago"]));
    return;
  }
  const name = f.operands[0];
  if (!name) throw new GitError(`must pass name argument`, 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /^GITHUB_/i.test(name)) throw new GitError(`HTTP 422: ${kind === "secret" ? "Secret" : "Variable"} names can only contain alphanumeric characters ([a-z], [A-Z], [0-9]) or underscores (_), and can't start with GITHUB_.`, 1);
  if (sub === "set") {
    let value = f.get("body", "b");
    if (value === undefined && ctx.stdin && String(ctx.stdin).length) value = String(ctx.stdin).replace(/\n$/, "");
    if (value === undefined) value = await g.m.ask(`? Paste your ${kind}: `, { secret: kind === "secret", fallback: "" });
    bag[name.toUpperCase()] = value;
    await save(g, c);
    g.out += `✓ Set ${Label} ${name.toUpperCase()} for ${c.name}\n`;
    return;
  }
  if (sub === "delete" || sub === "remove") {
    if (!(name.toUpperCase() in bag)) throw new GitError(`HTTP 404: Not Found`, 1);
    delete bag[name.toUpperCase()];
    await save(g, c);
    g.out += `✓ Deleted ${Label} ${name.toUpperCase()} from ${c.name}\n`;
    return;
  }
  throw new GitError(`unknown command "${sub ?? ""}" for "gh ${kind}"`, 1);
}

const GH_HELP = `Work seamlessly with GitHub from the command line.

USAGE
  gh <command> <subcommand> [flags]

CORE COMMANDS
  auth:          Authenticate gh and git with GitHub
  browse:        Open repositories, issues, pull requests, and more in the browser
  issue:         Manage issues
  pr:            Manage pull requests
  release:       Manage releases
  repo:          Manage repositories

GITHUB ACTIONS COMMANDS
  run:           View details about workflow runs
  workflow:      View details about GitHub Actions workflows

ADDITIONAL COMMANDS
  api:           Make an authenticated GitHub API request
  label:         Manage labels
  ruleset:       View info about repo rulesets
  secret:        Manage GitHub secrets
  ssh-key:       Manage SSH keys
  variable:      Manage GitHub Actions variables

(The practice terminal's gh covers what this course uses.)
`;

export function ghCommand(m: Machine): Command {
  return {
    name: "gh",
    async execute(args, ctx) {
      const { g, done } = makeG(m, ctx);
      const [group, ...rest] = args;
      try {
        if (!group || group === "--help" || group === "help") g.out += GH_HELP;
        else if (group === "--version") g.out += "gh version 2.81.0 (2026-09-30)\nhttps://github.com/cli/cli/releases/tag/v2.81.0\n";
        else if (group === "auth") await ghAuth(g, ctx, rest);
        else if (group === "ssh-key") await ghSshKey(g, ctx, rest);
        else if (group === "repo") await ghRepo(g, ctx, rest);
        else if (group === "pr") await ghPr(g, ctx, rest);
        else if (group === "issue") await ghIssue(g, ctx, rest);
        else if (group === "label") await ghLabel(g, ctx, rest);
        else if (group === "release") await ghRelease(g, ctx, rest);
        else if (group === "ruleset" || group === "rs") await ghRuleset(g, ctx, rest);
        else if (group === "api") await ghApi(g, ctx, rest);
        else if (group === "run") await ghRun(g, ctx, rest);
        else if (group === "workflow") await ghWorkflow(g, ctx, rest);
        else if (group === "secret") await ghSecretOrVar(g, ctx, rest, "secret");
        else if (group === "variable") await ghSecretOrVar(g, ctx, rest, "variable");
        else if (group === "browse") {
          const r = await currentRepo(g, ctx);
          g.out += `Opening https://github.com/${r.name} in your browser.\n(The practice computer has no browser: on your Mac this opens the page.)\n`;
        } else throw new GitError(`unknown command "${group}" for "gh"\n\nUsage:  gh <command> <subcommand> [flags]`, 1);
        return done(0);
      } catch (e) {
        if (e instanceof GitError) return done(e.code, e.message ? `${e.message.replace(/\n$/, "")}\n` : "");
        throw e;
      }
    },
  };
}

export { HOME, dirname, repoName, short };
