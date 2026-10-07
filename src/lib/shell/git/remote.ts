// git remote, clone, push, fetch and pull. "GitHub" is a folder of bare repositories inside the
// practice computer (/srv/git/github.com/<owner>/<repo>.git), so a push really lands somewhere
// a later fetch or clone can find it, without the internet.
import type { IFileSystem } from "just-bash";
import type { Machine } from "../machine";
import { HOME, basename, join, parseArgs } from "../util";
import { initRepo } from "./basic";
import { checkoutTo, mergeBase, mergeInto, setUpstream } from "./branching";
import { type G, changesBetween, needRepo, needWorkTree, short, state } from "./context";
import { diffStat, modeLines } from "./diff";
import { parseTag, parseTree } from "./objects";
import { GitError, Repo, configEntries, exists, setConfigValue } from "./repo";
import { ancestors, upstreamOf } from "./status";

export const GITHUB_ROOT = "/srv/git/github.com";
/** Public keys GitHub accepts (added with `gh ssh-key add`, or by a lesson's set-up). */
export const GITHUB_KEYS = `${GITHUB_ROOT}/.authorized_keys`;
export const GH_LOGIN = `${HOME}/.config/gh/hosts.yml`;

// GitHub's published SSH host key fingerprint (docs.github.com, "GitHub's SSH key fingerprints").
const GITHUB_FINGERPRINT = "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU";
const KNOWN_HOSTS_LINE = "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n";

/** Checks (and on first use, asks about) GitHub's host key, like ssh does. */
export async function knownHost(m: Machine, fs: IFileSystem): Promise<{ ok: boolean; text: string }> {
  const known = (await fs.readFile(`${HOME}/.ssh/known_hosts`).catch(() => undefined)) ?? "";
  if (known.includes("github.com ")) return { ok: true, text: "" };
  const question =
    `The authenticity of host 'github.com (140.82.121.4)' can't be established.\nED25519 key fingerprint is ${GITHUB_FINGERPRINT}.\n` +
    "This key is not known by any other names.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ";
  const answer = (await m.ask(question, { fallback: "yes" })).trim();
  if (answer !== "yes" && answer !== GITHUB_FINGERPRINT) return { ok: false, text: "Host key verification failed.\n" };
  await fs.mkdir(`${HOME}/.ssh`, { recursive: true });
  await fs.appendFile(`${HOME}/.ssh/known_hosts`, KNOWN_HOSTS_LINE);
  return { ok: true, text: "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.\n" };
}

type Remote = { url: string; path: string; display: string; ssh: boolean; github: boolean };

/** Where a remote URL lives in the practice computer, and how Git prints it. */
export function locate(g: G, url: string): Remote | undefined {
  let m = /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  if (m) return { url, path: `${GITHUB_ROOT}/${m[1]}/${m[2]}.git`, display: `github.com:${m[1]}/${m[2]}${url.endsWith(".git") ? ".git" : ""}`, ssh: true, github: true };
  m = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  if (m) return { url, path: `${GITHUB_ROOT}/${m[1]}/${m[2]}.git`, display: url, ssh: false, github: true };
  if (/^[a-z]+:\/\//.test(url) || /^[\w.-]+@[\w.-]+:/.test(url)) return undefined;
  return { url, path: join(g.cwd, url), display: url, ssh: false, github: false };
}

const NOT_FOUND = "ERROR: Repository not found.\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.";

/** Opens the repository behind a remote, checking the learner may reach it. */
async function openRemote(g: G, r: Remote): Promise<Repo> {
  if (r.github) {
    if (r.ssh) {
      // The first SSH connection asks you to confirm GitHub's host key.
      const host = await knownHost(g.m, g.fs);
      g.err += host.text;
      if (!host.ok) throw new GitError("fatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.");
      // SSH needs one of your public keys to be on GitHub.
      let keys = "";
      try {
        keys = await g.m.asRoot(() => g.fs.readFile(GITHUB_KEYS));
      } catch {
        keys = "";
      }
      let mine: string[] = [];
      try {
        mine = (await g.fs.readdir(`${HOME}/.ssh`)).filter((f) => f.endsWith(".pub"));
      } catch {
        mine = [];
      }
      let ok = false;
      for (const f of mine) {
        const key = (await g.fs.readFile(`${HOME}/.ssh/${f}`)).trim().split(/\s+/).slice(0, 2).join(" ");
        if (key && keys.includes(key)) ok = true;
      }
      if (!ok) throw new GitError("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.");
    } else if (!(await exists(g.fs, GH_LOGIN))) {
      throw new GitError(
        `remote: Support for password authentication was removed on August 13, 2021.\nremote: Please see https://docs.github.com/get-started/getting-started-with-git/about-remote-repositories#cloning-with-https-urls for information on currently recommended modes of authentication.\nfatal: Authentication failed for '${r.url}'`,
      );
    }
  }
  const repo = await g.m.asRoot(() => Repo.open(g.fs, r.path, g.m.now));
  if (!repo) throw new GitError(r.github ? NOT_FOUND : `fatal: '${r.url}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`);
  return repo;
}

/** Copies every object reachable from `tips` that `to` doesn't have yet. Returns how many. */
async function copyObjects(g: G, from: Repo, to: Repo, tips: string[]): Promise<number> {
  let n = 0;
  const seen = new Set<string>();
  const stack = [...tips];
  while (stack.length) {
    const sha = stack.pop()!;
    if (seen.has(sha)) continue;
    seen.add(sha);
    if (await g.m.asRoot(() => to.hasObject(sha))) continue;
    const o = await g.m.asRoot(() => from.readObject(sha));
    if (o.type === "commit") {
      const c = await from.readCommit(sha);
      stack.push(c.tree, ...c.parents);
    } else if (o.type === "tree") for (const e of parseTree(o.content)) stack.push(e.sha);
    else if (o.type === "tag") stack.push(parseTag(o.content).object);
    const raw = await g.m.asRoot(() => from.readRaw(sha));
    await g.m.asRoot(() => to.writeRaw(sha, raw));
    n++;
  }
  return n;
}

async function remoteUrl(repo: Repo, name: string): Promise<string | undefined> {
  return repo.config(`remote.${name}.url`);
}

// ----- remote -----

export async function gitRemote(g: G, args: string[]) {
  const repo = await needRepo(g);
  const [sub, ...rest] = args;
  const secs = await repo.configSections(false);
  const remotes = secs.filter((s) => s.name === "remote" && s.sub !== undefined);
  if (!sub || sub === "-v" || sub === "--verbose") {
    for (const r of remotes) {
      const url = r.values.find(([k]) => k === "url")?.[1] ?? "";
      g.out += sub ? `${r.sub}\t${url} (fetch)\n${r.sub}\t${url} (push)\n` : `${r.sub}\n`;
    }
    return;
  }
  const [name, url] = rest;
  const exists_ = remotes.some((r) => r.sub === name);
  switch (sub) {
    case "add":
      if (!name || !url) throw new GitError("usage: git remote add [<options>] <name> <url>", 129);
      if (exists_) throw new GitError(`error: remote ${name} already exists.`, 3);
      setConfigValue(secs, `remote.${name}.url`, url);
      setConfigValue(secs, `remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`);
      await repo.saveConfig(false, secs);
      return;
    case "remove":
    case "rm":
      if (!exists_) throw new GitError(`error: No such remote: '${name}'`, 2);
      await repo.saveConfig(false, secs.filter((s) => !(s.name === "remote" && s.sub === name) && !(s.name === "branch" && s.values.some(([k, v]) => k === "remote" && v === name))));
      for (const r of await repo.listRefs(`refs/remotes/${name}`)) await repo.deleteRef(r.name);
      return;
    case "rename": {
      if (!exists_) throw new GitError(`error: No such remote: '${name}'`, 2);
      const to = url;
      for (const s of secs) {
        if (s.name === "remote" && s.sub === name) {
          s.sub = to;
          s.values = s.values.map(([k, v]) => [k, k === "fetch" ? v.replace(`refs/remotes/${name}/`, `refs/remotes/${to}/`) : v]);
        }
        if (s.name === "branch") s.values = s.values.map(([k, v]) => [k, k === "remote" && v === name ? to : v]);
      }
      await repo.saveConfig(false, secs);
      for (const r of await repo.listRefs(`refs/remotes/${name}`)) {
        await repo.writeRef(r.name.replace(`refs/remotes/${name}/`, `refs/remotes/${to}/`), r.sha);
        await repo.deleteRef(r.name);
      }
      return;
    }
    case "get-url":
      if (!exists_) throw new GitError(`error: No such remote '${name}'`, 2);
      g.out += `${await remoteUrl(repo, name)}\n`;
      return;
    case "set-url":
      if (!exists_) throw new GitError(`error: No such remote '${name}'`, 2);
      setConfigValue(secs, `remote.${name}.url`, url);
      await repo.saveConfig(false, secs);
      return;
    default:
      throw new GitError(`error: unknown subcommand: \`${sub}'`, 129);
  }
}

// ----- clone -----

export async function gitClone(g: G, args: string[]) {
  const { operands } = parseArgs(args);
  const [url, dirArg] = operands;
  if (!url) throw new GitError("fatal: You must specify a repository to clone.", 129);
  const r = locate(g, url);
  if (!r) throw new GitError(`fatal: unable to access '${url}': Could not resolve host: ${url.replace(/^\w+:\/\//, "").split(/[/:]/)[0]}`);
  const name = dirArg ?? basename(url.replace(/\/$/, "")).replace(/\.git$/, "");
  const dir = join(g.cwd, name);
  if ((await exists(g.fs, dir)) && (await g.fs.readdir(dir)).length) throw new GitError(`fatal: destination path '${name}' already exists and is not an empty directory.`);
  g.err += `Cloning into '${name}'...\n`;
  const remote = await openRemote(g, r);
  const remoteHead = ((await g.m.asRoot(() => remote.readText("HEAD"))) ?? "").trim().replace(/^ref: refs\/heads\//, "");
  const branches = await g.m.asRoot(() => remote.listRefs("refs/heads"));
  await initRepo(g, dir, { branch: remoteHead || "main" });
  const local = (await Repo.open(g.fs, join(dir, ".git"), g.m.now))!;
  const secs = await local.configSections(false);
  setConfigValue(secs, "remote.origin.url", url);
  setConfigValue(secs, "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  await local.saveConfig(false, secs);
  if (branches.length === 0) {
    g.err += "warning: You appear to have cloned an empty repository.\n";
    await setUpstream(local, remoteHead || "main", `origin/${remoteHead || "main"}`);
    return;
  }
  const n = await copyObjects(g, remote, local, branches.map((b) => b.sha));
  if (n) g.err += `remote: Enumerating objects: ${n}, done.\nremote: Total ${n} (delta 0), reused ${n} (delta 0), pack-reused 0\nReceiving objects: 100% (${n}/${n}), done.\n`;
  for (const b of branches) await local.writeRef(`refs/remotes/origin/${b.name.slice(11)}`, b.sha);
  const remoteTags = await g.m.asRoot(() => remote.listRefs("refs/tags"));
  if (remoteTags.length) await copyObjects(g, remote, local, remoteTags.map((t) => t.sha));
  for (const t of remoteTags) await local.writeRef(t.name, t.sha);
  await local.writeText("refs/remotes/origin/HEAD", `ref: refs/remotes/origin/${remoteHead}\n`);
  const headSha = branches.find((b) => b.name === `refs/heads/${remoteHead}`)?.sha;
  if (headSha) {
    await local.writeRef(`refs/heads/${remoteHead}`, headSha);
    await local.reflog(`refs/heads/${remoteHead}`, "0".repeat(40), headSha, `clone: from ${url}`);
    await local.reflog("HEAD", "0".repeat(40), headSha, `clone: from ${url}`);
    await setUpstream(local, remoteHead, `origin/${remoteHead}`);
    // Fill the new working folder from the branch's files.
    const files = await local.commitFiles(headSha);
    for (const [p, f] of files) await local.writeWork(p, f);
    await local.writeIndex({ entries: Object.fromEntries(files), conflicts: {} });
  }
}

// ----- push -----

export async function gitPush(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { flags, long, operands } = parseArgs(args);
  const setUp = flags.has("u") || long.includes("set-upstream");
  const force = flags.has("f") || long.includes("force");
  const lease = long.some((l) => l.startsWith("force-with-lease"));
  const del = flags.has("d") || long.includes("delete");
  const all = long.includes("all");
  const pushTags = long.includes("tags") || long.includes("follow-tags");
  const h = await repo.head();
  let [remoteName, ...specs] = operands;
  if (!remoteName) {
    const up = h.branch ? await repo.config(`branch.${h.branch}.remote`) : undefined;
    remoteName = up ?? "origin";
    if (!h.branch) throw new GitError("fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>\n");
    const upName = await upstreamOf(repo, h.branch);
    if (!upName && !setUp && !all) {
      const remotes = configEntries(await repo.configSections(false)).filter(([k]) => /^remote\..+\.url$/.test(k));
      if (remotes.length === 0)
        throw new GitError("fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n");
      throw new GitError(
        `fatal: The current branch ${h.branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream origin ${h.branch}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.\n`,
      );
    }
    if (upName) specs = [`${h.branch}:${upName.slice(upName.indexOf("/") + 1)}`];
    else specs = [h.branch];
  }
  const url = await remoteUrl(repo, remoteName);
  const r = locate(g, url ?? remoteName);
  if (!r || (!url && !r.github && !(await exists(g.fs, r.path)))) throw new GitError(`fatal: '${remoteName}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`);
  const remote = await openRemote(g, r);
  if (all) specs = (await repo.listRefs("refs/heads")).map((b) => b.name.slice(11));
  if (specs.length === 0 && !(pushTags && operands.length === 1 && long.includes("tags"))) specs = h.branch ? [h.branch] : [];
  const tagLines: string[] = [];
  const pushTag = async (name: string) => {
    const sha = (await repo.readRef(`refs/tags/${name}`))!;
    const old = await g.m.asRoot(() => remote.readRef(`refs/tags/${name}`));
    if (old === sha) return;
    if (old) {
      tagLines.push(` ! [rejected]        ${name} -> ${name} (already exists)`);
      return;
    }
    await copyObjects(g, repo, remote, [sha]);
    await g.m.asRoot(() => remote.writeRef(`refs/tags/${name}`, sha));
    tagLines.push(` * [new tag]         ${name} -> ${name}`);
  };
  // `git push origin v1.0` pushes a tag; `git push --delete origin v1.0` deletes one.
  const tagSpecs: string[] = [];
  for (const sp of specs) if (!sp.includes(":") && !(await repo.readRef(`refs/heads/${sp.replace(/^\+/, "")}`)) && (await repo.readRef(`refs/tags/${sp}`))) tagSpecs.push(sp);
  specs = specs.filter((sp) => !tagSpecs.includes(sp));
  if (del) {
    for (const t of [...tagSpecs]) {
      await g.m.asRoot(() => remote.deleteRef(`refs/tags/${t}`));
      tagLines.push(` - [deleted]         ${t}`);
    }
  } else for (const t of tagSpecs) await pushTag(t);
  if (del) for (const sp of [...specs]) if (!(await g.m.asRoot(() => remote.readRef(`refs/heads/${sp}`))) && (await g.m.asRoot(() => remote.readRef(`refs/tags/${sp}`)))) {
    await g.m.asRoot(() => remote.deleteRef(`refs/tags/${sp}`));
    tagLines.push(` - [deleted]         ${sp}`);
    specs = specs.filter((x) => x !== sp);
  }
  if (pushTags) for (const t of await repo.listRefs("refs/tags")) await pushTag(t.name.slice(10));

  const lines: string[] = [];
  let rejected: "fetch first" | "non-fast-forward" | undefined;
  let copied = 0;
  const remoteSays: string[] = [];
  let declined = false;
  const updated: { branch: string; sha: string; created: boolean }[] = [];
  const { refusePush, afterPush } = await import("../github-rules");
  for (const spec of specs) {
    if (del) {
      const ref = `refs/heads/${spec}`;
      if (!(await g.m.asRoot(() => remote.readRef(ref)))) {
        lines.push(` ! [remote rejected] ${spec} (remote ref does not exist)`);
        continue;
      }
      if (r.github) {
        const no = await refusePush(g, repo, remote, spec, await g.m.asRoot(() => remote.readRef(ref)), undefined);
        if (no) {
          remoteSays.push(...no);
          lines.push(` ! [remote rejected] ${spec} (push declined due to repository rule violations)`);
          declined = true;
          continue;
        }
      }
      await g.m.asRoot(() => remote.deleteRef(ref));
      await repo.deleteRef(`refs/remotes/${remoteName}/${spec}`);
      lines.push(` - [deleted]         ${spec}`);
      continue;
    }
    const plus = spec.startsWith("+");
    const [src, dst = src] = spec.replace(/^\+/, "").split(":");
    const srcName = src === "HEAD" ? (h.branch ?? "HEAD") : src;
    const sha = await repo.resolve(src);
    if (!sha) throw new GitError(`error: src refspec ${src} does not match any\nerror: failed to push some refs to '${r.display}'`, 1);
    const ref = `refs/heads/${dst}`;
    const old = await g.m.asRoot(() => remote.readRef(ref));
    const pad = (s: string) => s.padEnd(18);
    if (old === sha) {
      lines.push("");
      continue;
    }
    if (old && !(await ancestors(repo, sha)).has(old)) {
      const tracking = await repo.readRef(`refs/remotes/${remoteName}/${dst}`);
      const leaseOk = lease && tracking === old;
      if (!(force || plus || leaseOk)) {
        rejected = (await repo.hasObject(old)) ? "non-fast-forward" : "fetch first";
        lines.push(` ! [rejected]        ${srcName} -> ${dst} (${rejected})`);
        continue;
      }
      if (lease && !leaseOk) {
        lines.push(` ! [rejected]        ${srcName} -> ${dst} (stale info)`);
        rejected = "fetch first";
        continue;
      }
    }
    if (r.github) {
      const no = await refusePush(g, repo, remote, dst, old, sha);
      if (no) {
        remoteSays.push(...no);
        lines.push(` ! [remote rejected] ${srcName} -> ${dst} (push declined due to repository rule violations)`);
        declined = true;
        continue;
      }
    }
    copied += await copyObjects(g, repo, remote, [sha]);
    await g.m.asRoot(() => remote.writeRef(ref, sha));
    updated.push({ branch: dst, sha, created: !old });
    await repo.writeRef(`refs/remotes/${remoteName}/${dst}`, sha);
    if (!old) lines.push(` * [new branch]      ${srcName === dst ? dst : `${srcName} -> ${dst}`}`);
    else if (!(await ancestors(repo, sha)).has(old)) lines.push(` + ${short(old)}...${short(sha)} ${pad(`${srcName} -> ${dst}`).trimEnd()} (forced update)`);
    else lines.push(`   ${short(old)}..${short(sha)}  ${srcName} -> ${dst}`);
    if (setUp && h.branch && srcName === h.branch) {
      await setUpstream(repo, h.branch, `${remoteName}/${dst}`);
      lines.push(`\u0000branch '${h.branch}' set up to track '${remoteName}/${dst}'.`);
    }
  }
  lines.push(...tagLines);
  const visible = lines.filter((l) => l && !l.startsWith("\u0000"));
  if (visible.length === 0 && !rejected) {
    g.err += "Everything up-to-date\n";
    for (const l of lines) if (l.startsWith("\u0000")) g.out += `${l.slice(1)}\n`;
    return;
  }
  const quiet = flags.has("q") || long.includes("quiet");
  if (copied && !quiet) g.err += `Enumerating objects: ${copied}, done.\nCounting objects: 100% (${copied}/${copied}), done.\nWriting objects: 100% (${copied}/${copied}), done.\nTotal ${copied} (delta 0), reused 0 (delta 0), pack-reused 0 (from 0)\n`;
  if (r.github && updated.length) remoteSays.push(...(await afterPush(g, repo, remote, updated)));
  for (const l of remoteSays) if (!quiet || declined) g.err += `remote: ${l}\n`.replace(/ \n$/, "\n");
  if (!quiet || rejected || declined) g.err += `To ${r.display}\n${visible.join("\n")}\n`;
  for (const l of lines) if (l.startsWith("\u0000")) g.out += `${l.slice(1)}\n`;
  if (declined && !rejected) throw new GitError(`error: failed to push some refs to '${r.display}'`, 1);
  if (rejected) {
    const hint =
      rejected === "fetch first"
        ? "hint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details."
        : "hint: Updates were rejected because the tip of your current branch is behind\nhint: its remote counterpart. If you want to integrate the remote changes,\nhint: use 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.";
    throw new GitError(`error: failed to push some refs to '${r.display}'\n${hint}`, 1);
  }
}

// ----- fetch -----

async function fetchRemote(g: G, repo: Repo, remoteName: string, prune: boolean, quiet = false): Promise<void> {
  const url = await remoteUrl(repo, remoteName);
  if (!url) throw new GitError(`fatal: '${remoteName}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`);
  const r = locate(g, url);
  if (!r) throw new GitError(`fatal: unable to access '${url}'`);
  const remote = await openRemote(g, r);
  const branches = await g.m.asRoot(() => remote.listRefs("refs/heads"));
  const n = await copyObjects(g, remote, repo, branches.map((b) => b.sha));
  const lines: string[] = [];
  for (const b of branches) {
    const name = b.name.slice(11);
    const local = `refs/remotes/${remoteName}/${name}`;
    const old = await repo.readRef(local);
    if (old === b.sha) continue;
    const pad = (s: string) => s.padEnd(10);
    if (!old) lines.push(` * [new branch]      ${pad(name)} -> ${remoteName}/${name}`);
    else if (!(await ancestors(repo, b.sha)).has(old)) lines.push(` + ${short(old)}...${short(b.sha)} ${pad(name)} -> ${remoteName}/${name}  (forced update)`);
    else lines.push(`   ${short(old)}..${short(b.sha)}  ${pad(name)} -> ${remoteName}/${name}`);
    await repo.writeRef(local, b.sha);
  }
  const tags = await g.m.asRoot(() => remote.listRefs("refs/tags"));
  for (const t of tags) {
    if (await repo.readRef(t.name)) continue;
    await copyObjects(g, remote, repo, [t.sha]);
    await repo.writeRef(t.name, t.sha);
    lines.push(` * [new tag]         ${t.name.slice(10).padEnd(10)} -> ${t.name.slice(10)}`);
  }
  if (prune) {
    for (const t of await repo.listRefs(`refs/remotes/${remoteName}`)) {
      const name = t.name.slice(`refs/remotes/${remoteName}/`.length);
      if (name === "HEAD" || branches.some((b) => b.name === `refs/heads/${name}`)) continue;
      await repo.deleteRef(t.name);
      lines.push(` - [deleted]         (none)     -> ${remoteName}/${name}`);
    }
  }
  if (quiet) return;
  if (n) g.err += `remote: Enumerating objects: ${n}, done.\nremote: Total ${n} (delta 0), reused 0 (delta 0), pack-reused 0\nUnpacking objects: 100% (${n}/${n}), done.\n`;
  if (lines.length) g.err += `From ${r.display.replace(/\.git$/, "")}\n${lines.join("\n")}\n`;
}

export async function gitFetch(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { flags, long, operands } = parseArgs(args);
  const prune = flags.has("p") || long.includes("prune");
  const quiet = flags.has("q") || long.includes("quiet");
  if (long.includes("all")) {
    const names = configEntries(await repo.configSections(false))
      .filter(([k]) => /^remote\..+\.url$/.test(k))
      .map(([k]) => k.slice(7, -4));
    for (const n of names) await fetchRemote(g, repo, n, prune, quiet);
    return;
  }
  const h = await repo.head();
  const name = operands[0] ?? (h.branch ? await repo.config(`branch.${h.branch}.remote`) : undefined) ?? "origin";
  await fetchRemote(g, repo, name, prune, quiet);
}

// ----- pull -----

const DIVERGENT = `hint: You have divergent branches and need to specify how to reconcile them.
hint: You can do so by running one of the following commands sometime before
hint: your next pull:
hint:
hint:   git config pull.rebase false  # merge
hint:   git config pull.rebase true   # rebase
hint:   git config pull.ff only       # fast-forward only
hint:
hint: You can replace "git config" with "git config --global" to set a default
hint: preference for all repositories. You can also pass --rebase, --no-rebase,
hint: or --ff-only on the command line to override the configured default per
hint: invocation.
hint: Disable this message with "git config set advice.diverging false"
fatal: Need to specify how to reconcile divergent branches.`;

export async function gitPull(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { long, operands } = parseArgs(args);
  const h = await repo.head();
  if (!h.branch) throw new GitError("You are not currently on a branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n", 1);
  let remoteName = operands[0];
  let branch = operands[1];
  if (!remoteName) {
    const up = await upstreamOf(repo, h.branch);
    if (!up) {
      throw new GitError(
        `There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=origin/<branch> ${h.branch}\n`,
        1,
      );
    }
    remoteName = up.slice(0, up.indexOf("/"));
    branch = up.slice(up.indexOf("/") + 1);
  }
  branch ??= h.branch;
  await fetchRemote(g, repo, remoteName, false);
  const theirs = await repo.readRef(`refs/remotes/${remoteName}/${branch}`);
  if (!theirs) throw new GitError(`fatal: couldn't find remote ref ${branch}`);
  const ours = h.sha;
  if (ours && (await ancestors(repo, ours)).has(theirs)) {
    g.out += "Already up to date.\n";
    return;
  }
  const canFF = !ours || (await mergeBase(repo, ours, theirs)) === ours;
  const rebaseCfg = await repo.config("pull.rebase");
  const ffCfg = await repo.config("pull.ff");
  const wantsRebase = long.includes("rebase") || (rebaseCfg === "true" && !long.includes("no-rebase"));
  const ffOnly = long.includes("ff-only") || (ffCfg === "only" && !long.includes("no-rebase") && !long.includes("rebase"));
  if (!canFF) {
    if (ffOnly) throw new GitError("fatal: Not possible to fast-forward, aborting.");
    if (wantsRebase) {
      const { gitRebase } = await import("./rewrite");
      await gitRebase(g, [`${remoteName}/${branch}`]);
      return;
    }
    if (rebaseCfg === undefined && ffCfg === undefined && !long.includes("no-rebase") && !long.includes("no-ff") && !long.includes("ff")) throw new GitError(DIVERGENT);
  }
  if (canFF && ours) {
    await checkoutTo(g, repo, theirs, "merge");
    await repo.advance(theirs, `pull: Fast-forward`);
    const s = await state(repo);
    const changes = await changesBetween(repo, await repo.commitFiles(ours), s.head);
    g.out += `Updating ${short(ours)}..${short(theirs)}\nFast-forward\n${diffStat(changes, g.tty)}${modeLines(changes)}`;
    return;
  }
  const url = (await remoteUrl(repo, remoteName)) ?? remoteName;
  const display = locate(g, url)?.display.replace(/\.git$/, "") ?? url;
  const ok = await mergeInto(g, repo, theirs, { label: `${remoteName}/${branch}`, message: `Merge branch '${branch}' of ${display}`, noEdit: long.includes("no-edit") });
  if (!ok) throw new GitError("", 1);
}

// ----- ls-remote -----

export async function gitLsRemote(g: G, args: string[]) {
  const { long, operands } = parseArgs(args);
  const repo = await Repo.find(g.fs, g.cwd, g.m.now);
  const name = operands[0] ?? "origin";
  const url = repo ? ((await remoteUrl(repo, name)) ?? name) : name;
  const r = locate(g, url);
  if (!r) throw new GitError(`fatal: '${name}' does not appear to be a git repository`);
  const remote = await openRemote(g, r);
  let out = "";
  const head = await g.m.asRoot(() => remote.resolve("HEAD"));
  const heads = await g.m.asRoot(() => remote.listRefs("refs/heads"));
  const tags = await g.m.asRoot(() => remote.listRefs("refs/tags"));
  if (!long.includes("tags") && !long.includes("heads") && head) out += `${head}\tHEAD\n`;
  if (!long.includes("tags")) for (const h of heads) out += `${h.sha}\t${h.name}\n`;
  if (!long.includes("heads"))
    for (const t of tags) {
      out += `${t.sha}\t${t.name}\n`;
      const peeled = await g.m.asRoot(() => remote.peel(t.sha));
      if (peeled !== t.sha) out += `${peeled}\t${t.name}^{}\n`;
    }
  g.out += out;
}
