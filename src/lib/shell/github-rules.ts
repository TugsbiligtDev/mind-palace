// What GitHub checks when you push (Module 40), and what a push sets off (Module 41): branch
// rulesets (pull request required, status checks required, no force-push, no deletion), push
// protection (a push that contains a secret is refused), and the workflows a push triggers.
import { runWorkflows } from "./actions";
import type { G } from "./git/context";
import type { Repo } from "./git/repo";
import { ancestors } from "./git/status";
import { readStore, repoName, rulesetApplies, writeStore } from "./github-store";

// Patterns GitHub's secret scanning recognizes (a few of the hundreds).
const SECRETS: { name: string; re: RegExp }[] = [
  { name: "GitHub Personal Access Token", re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "GitHub Fine-Grained Personal Access Token", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: "Stripe API Key", re: /\bsk_live_[0-9a-zA-Z]{24,}\b/ },
  { name: "Amazon AWS Access Key ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack API Token", re: /\bxox[bap]-[0-9A-Za-z-]{10,}\b/ },
];

async function defaultBranch(g: G, remote: Repo) {
  return ((await g.m.asRoot(() => remote.readText("HEAD"))) ?? "ref: refs/heads/main").trim().replace(/^ref: refs\/heads\//, "");
}

/** The remote's "remote: …" lines when it refuses a branch update, or nothing when it's fine. */
export async function refusePush(g: G, local: Repo, remote: Repo, branch: string, old: string | undefined, sha: string | undefined): Promise<string[] | undefined> {
  const store = await readStore(g.m, remote);
  const name = repoName(remote);
  const out: string[] = [];
  // Push protection: look at every file the new commits add or change.
  if (sha && store.pushProtection !== false) {
    const known = new Set<string>();
    for (const r of await g.m.asRoot(() => remote.listRefs("refs/heads"))) for (const a of await g.m.asRoot(() => ancestors(remote, r.sha))) known.add(a);
    const fresh = [...(await ancestors(local, sha))].filter((c) => !known.has(c));
    const hits: { name: string; commit: string; path: string; line: number }[] = [];
    for (const c of fresh) {
      const commit = await local.readCommit(c);
      const before = commit.parents[0] ? await local.commitFiles(commit.parents[0]) : new Map();
      for (const [path, f] of await local.flatten(commit.tree)) {
        if (before.get(path)?.sha === f.sha) continue;
        const text = await local.readBlobText(f.sha);
        text.split("\n").forEach((l, i) => {
          for (const s of SECRETS) if (s.re.test(l)) hits.push({ name: s.name, commit: c, path, line: i + 1 });
        });
      }
    }
    if (hits.length) {
      out.push(
        `error: GH013: Repository rule violations found for refs/heads/${branch}.`,
        "",
        "- GITHUB PUSH PROTECTION",
        "  —————————————————————————————————————————",
        "    Resolve the following violations before pushing again",
        "",
        "    - Push cannot contain secrets",
        "",
        "    ",
        "     (?) Learn how to resolve a blocked push",
        "     https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line#resolving-a-blocked-push",
        "",
      );
      for (const h of hits) out.push("    ", `      —— ${h.name} ${"—".repeat(Math.max(4, 40 - h.name.length))}`, "       locations:", `         - commit: ${h.commit.slice(0, 9)}`, `           path: ${h.path}:${h.line}`, "");
      return out;
    }
  }
  const def = await defaultBranch(g, remote);
  const rules = (store.rulesets ?? []).filter((r) => rulesetApplies(r, branch, def));
  if (!rules.length) return undefined;
  const violations: string[] = [];
  const has = (t: string) => rules.some((r) => r.rules.some((x) => x.type === t));
  if (!sha && has("deletion")) violations.push("Cannot delete this branch");
  if (sha && old && has("non_fast_forward") && !(await ancestors(local, sha)).has(old)) violations.push("Cannot force-push to this branch");
  if (sha && old && has("pull_request")) violations.push("Changes must be made through a pull request.");
  if (sha && has("required_status_checks")) {
    for (const r of rules)
      for (const x of r.rules)
        if (x.type === "required_status_checks") for (const c of ((x.parameters?.required_status_checks ?? []) as { context: string }[])) violations.push(`Required status check "${c.context}" is expected.`);
  }
  if (!violations.length) return undefined;
  return [`error: GH013: Repository rule violations found for refs/heads/${branch}.`, `Review all repository rules at https://github.com/${name}/rules?ref=refs%2Fheads%2F${branch}`, "", ...violations.map((v) => `- ${v}`), ""];
}

/** After a push: run push workflows, and pull_request workflows for pull requests it updated. */
export async function afterPush(g: G, local: Repo, remote: Repo, updated: { branch: string; sha: string; created: boolean }[]): Promise<string[]> {
  const notes: string[] = [];
  const name = repoName(remote);
  const def = await defaultBranch(g, remote);
  for (const u of updated) {
    await runWorkflows(g.m, remote, { event: "push", branch: u.branch, sha: u.sha, actor: "learner" });
    if (u.created && u.branch !== def) notes.push("", `Create a pull request for '${u.branch}' on GitHub by visiting:`, `     https://github.com/${name}/pull/new/${u.branch}`, "");
  }
  // Pull requests whose branch moved: in this repository, or in the one this is a fork of.
  const store = await readStore(g.m, remote);
  const targets: { repo: Repo; fork: boolean }[] = [{ repo: remote, fork: false }];
  if (store.forkOf) {
    const { Repo: R } = await import("./git/repo");
    const up = await g.m.asRoot(() => R.open(g.fs, `/srv/git/github.com/${store.forkOf}.git`, g.m.now));
    if (up) targets.push({ repo: up, fork: true });
  }
  for (const t of targets) {
    const st = await readStore(g.m, t.repo);
    for (const pr of st.pulls) {
      if (pr.state !== "OPEN") continue;
      const u = updated.find((x) => x.branch === pr.head && (t.fork ? pr.headRepo === name : !pr.headRepo));
      if (!u) continue;
      if (t.fork) await copyInto(g, remote, t.repo, u.sha, `refs/pull/${pr.number}/head`);
      await runWorkflows(g.m, t.repo, { event: "pull_request", branch: pr.head, base: pr.base, sha: u.sha, pr: pr.number, actor: "learner" });
    }
  }
  return notes;
}

/** Copies a commit and everything it needs from one repository into another, and names it. */
export async function copyInto(g: G, from: Repo, to: Repo, sha: string, ref: string) {
  const { parseTree, parseTag } = await import("./git/objects");
  const stack = [sha];
  const seen = new Set<string>();
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    if (await g.m.asRoot(() => to.hasObject(s))) continue;
    const o = await g.m.asRoot(() => from.readObject(s));
    if (o.type === "commit") {
      const c = await g.m.asRoot(() => from.readCommit(s));
      stack.push(c.tree, ...c.parents);
    } else if (o.type === "tree") for (const e of parseTree(o.content)) stack.push(e.sha);
    else if (o.type === "tag") stack.push(parseTag(o.content).object);
    const raw = await g.m.asRoot(() => from.readRaw(s));
    await g.m.asRoot(() => to.writeRaw(s, raw));
  }
  await g.m.asRoot(() => to.writeRef(ref, sha));
}

export { writeStore };
