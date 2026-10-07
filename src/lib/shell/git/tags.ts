// git tag (lightweight and annotated), git describe and git blame (Module 36).
import { diffArrays } from "diff";
import { parseArgs } from "../util";
import { type G, dateString, editMessage, needRepo, needWorkTree, repoPath, short } from "./context";
import { parseTag, serializeTag, subject } from "./objects";
import { GitError, type Repo } from "./repo";
import { committer } from "./rewrite";
import { validBranchName } from "./branching";

function globRe(p: string) {
  return new RegExp(`^${p.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

/** Sorts tag names like version numbers (v1.10 after v1.9) when they look like versions. */
function versionSort(a: string, b: string) {
  const pa = a.match(/\d+|\D+/g) ?? [];
  const pb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    if (/^\d+$/.test(x) && /^\d+$/.test(y) && x !== y) return Number(x) - Number(y);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export async function gitTag(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { flags, long, values, operands } = parseArgs(args, "mF");
  const annotate = flags.has("a") || values.m !== undefined || long.includes("annotate");
  const list = flags.has("l") || long.includes("list") || (operands.length === 0 && !flags.has("d"));
  if (flags.has("d") || long.includes("delete")) {
    if (!operands.length) throw new GitError("fatal: tag name required", 128);
    for (const name of operands) {
      const sha = await repo.readRef(`refs/tags/${name}`);
      if (!sha) {
        g.err += `error: tag '${name}' not found.\n`;
        throw new GitError("", 1);
      }
      await repo.deleteRef(`refs/tags/${name}`);
      g.out += `Deleted tag '${name}' (was ${short(sha)})\n`;
    }
    return;
  }
  if (list) {
    const sortBy = long.find((l) => l.startsWith("sort="))?.slice(5);
    let names = (await repo.listRefs("refs/tags")).map((r) => r.name.slice(10));
    const pats = operands;
    if (pats.length) names = names.filter((n) => pats.some((p) => globRe(p).test(n)));
    names.sort(sortBy?.includes("version") ? versionSort : undefined);
    if (sortBy?.startsWith("-")) names.reverse();
    const withLines = flags.has("n") || args.some((a) => /^-n\d*$/.test(a));
    for (const n of names) {
      if (!withLines) {
        g.out += `${n}\n`;
        continue;
      }
      const sha = (await repo.readRef(`refs/tags/${n}`))!;
      const o = await repo.readObject(sha);
      const text = o.type === "tag" ? parseTag(o.content).message.split("\n")[0] : subject(await repo.readCommit(sha));
      g.out += `${n.padEnd(15)} ${text}\n`;
    }
    return;
  }
  const [name, rev = "HEAD"] = operands;
  if (!validBranchName(name)) throw new GitError(`fatal: '${name}' is not a valid tag name.`, 128);
  const target = await repo.resolve(rev);
  if (!target) throw new GitError(`fatal: Failed to resolve '${rev}' as a valid ref.`, 128);
  const existing = await repo.readRef(`refs/tags/${name}`);
  if (existing && !flags.has("f")) throw new GitError(`fatal: tag '${name}' already exists`, 128);
  if (!annotate) {
    await repo.writeRef(`refs/tags/${name}`, target);
    if (existing) g.out += `Updated tag '${name}' (was ${short(existing)})\n`;
    return;
  }
  let message = values.m;
  if (message === undefined) {
    if (!g.m.interactive && !g.m.quiet && !g.m.root.scripted.edits.length) throw new GitError("error: There was a problem with the editor 'nano'.\nPlease supply the message using either -m or -F option.", 1);
    const edited = await editMessage(g, repo as Repo & { root: string }, "TAG_EDITMSG", `\n#\n# Write a message for tag:\n#   ${name}\n# Lines starting with '#' will be ignored.\n`);
    if (!edited) throw new GitError("fatal: no tag message?", 128);
    message = edited;
  }
  const tagger = await committer(g, repo);
  const sha = await repo.writeObject("tag", serializeTag({ object: target, type: "commit", tag: name, tagger, message }));
  await repo.writeRef(`refs/tags/${name}`, sha);
  if (existing) g.out += `Updated tag '${name}' (was ${short(existing)})\n`;
}

/** "v1.2-3-g1a2b3c4": the newest tag before a commit, and how far past it the commit is. */
export async function gitDescribe(g: G, args: string[]) {
  const repo = await needRepo(g);
  const { long, operands } = parseArgs(args);
  const all = long.includes("tags");
  const rev = operands[0] ?? "HEAD";
  const sha = await repo.resolve(rev);
  if (!sha) throw new GitError(`fatal: Not a valid object name ${rev}`, 128);
  const tags = new Map<string, string>();
  for (const r of await repo.listRefs("refs/tags")) {
    const o = await repo.readObject(r.sha);
    if (o.type !== "tag" && !all) continue;
    tags.set(await repo.peel(r.sha), r.name.slice(10));
  }
  // Breadth-first from the commit: the first tagged commit found, and the distance.
  const { walk } = await import("./history");
  const order = await walk(repo, [sha]);
  for (let i = 0; i < order.length; i++) {
    const t = tags.get(order[i].sha);
    if (!t) continue;
    if (order[i].sha === sha && !long.includes("long")) g.out += `${t}\n`;
    else {
      const { ancestors } = await import("./status");
      const A = await ancestors(repo, order[i].sha);
      const n = order.filter((w) => !A.has(w.sha)).length;
      g.out += `${t}-${n}-g${short(sha)}\n`;
    }
    return;
  }
  throw new GitError(all ? `fatal: No names found, cannot describe anything.` : `fatal: No annotated tags can describe '${sha}'.\nHowever, there were unannotated tags: try --tags.`, 128);
}

// ----- blame -----

export async function gitBlame(g: G, args: string[]) {
  const repo = await needWorkTree(g);
  const { values, operands } = parseArgs(args.filter((a) => a !== "--"), "L");
  const file = operands.at(-1);
  if (!file) throw new GitError("usage: git blame [<options>] [<rev-opts>] [<rev>] [--] <file>", 129);
  const rev = operands.length > 1 ? operands[0] : "HEAD";
  const path = repoPath(g, repo, file);
  const start = await repo.resolve(rev);
  if (!start) throw new GitError(`fatal: bad revision '${rev}'`, 128);
  const startFiles = await repo.commitFiles(start);
  const f = startFiles.get(path);
  if (!f) throw new GitError(`fatal: no such path '${path}' in ${rev === "HEAD" ? "HEAD" : rev}`, 128);
  const text = await repo.readBlobText(f.sha);
  const lines = text.replace(/\n$/, "").split("\n");
  // owner[i]: the commit that last changed line i. Walk back along first parents.
  const owner: (string | undefined)[] = lines.map(() => undefined);
  let cur = start;
  let curLines = lines;
  let map = lines.map((_, i) => i); // index in curLines -> index in the final file
  for (;;) {
    const c = await repo.readCommit(cur);
    const parent = c.parents[0];
    const pf = parent ? (await repo.commitFiles(parent)).get(path) : undefined;
    if (!pf) {
      for (const i of map) if (i >= 0 && owner[i] === undefined) owner[i] = cur;
      break;
    }
    const pLines = (await repo.readBlobText(pf.sha)).replace(/\n$/, "").split("\n");
    const parts = diffArrays(pLines, curLines);
    const nextMap: number[] = new Array(pLines.length).fill(-1);
    let pi = 0;
    let ci = 0;
    for (const part of parts) {
      const n = part.count ?? part.value.length;
      if (part.added) {
        for (let k = 0; k < n; k++) if (map[ci + k] >= 0 && owner[map[ci + k]] === undefined) owner[map[ci + k]] = cur;
        ci += n;
      } else if (part.removed) pi += n;
      else {
        for (let k = 0; k < n; k++) nextMap[pi + k] = map[ci + k];
        pi += n;
        ci += n;
      }
    }
    cur = parent;
    curLines = pLines;
    map = nextMap;
    if (!owner.some((o) => o === undefined)) break;
  }
  let from = 1;
  let to = lines.length;
  if (values.L) {
    const [a, b] = values.L.split(",");
    from = Number(a);
    to = b?.startsWith("+") ? from + Number(b.slice(1)) - 1 : b ? Number(b) : from;
    if (!from || from > lines.length) throw new GitError(`fatal: file ${path} has only ${lines.length} lines`, 128);
  }
  const root = async (sha: string) => (await repo.readCommit(sha)).parents.length === 0;
  const width = String(to).length;
  const names = new Map<string, string>();
  for (const o of owner) if (o && !names.has(o)) names.set(o, (await repo.readCommit(o)).author.name);
  const nameWidth = Math.max(...[...names.values()].map((n) => n.length));
  for (let i = from - 1; i < to; i++) {
    const o = owner[i]!;
    const c = await repo.readCommit(o);
    const isRoot = await root(o);
    const id = isRoot ? `^${o.slice(0, 7)}` : o.slice(0, 8);
    const d = dateString(c.author.time, c.author.tz).split(" ");
    const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
    const date = `${d[4]}-${months[d[1]]}-${d[2].padStart(2, "0")} ${d[3]} ${d[5]}`;
    g.out += `${id} (${c.author.name.padEnd(nameWidth)} ${date} ${String(i + 1).padStart(width)}) ${lines[i]}\n`;
  }
}
