// One Git repository in the practice computer: its objects, refs, index, config, ignore rules
// and working folder. The porcelain commands (porcelain.ts) are built on this.
import type { IFileSystem } from "just-bash";
import { HOME, decoder, dirname, encoder, join } from "../util";
import {
  type Commit,
  type ObjectType,
  type TreeEntry,
  deflate,
  frame,
  inflate,
  parseCommit,
  parseFramed,
  parseTag,
  parseTree,
  serializeCommit,
  serializeTree,
  sha1,
} from "./objects";

export type FileEntry = { sha: string; mode: string };
export type Files = Map<string, FileEntry>;
export type Conflict = { base?: FileEntry; ours?: FileEntry; theirs?: FileEntry };
export type Index = { entries: Record<string, FileEntry>; conflicts: Record<string, Conflict> };

// A Git failure: the message is printed as is ("fatal: …" exits 128, "error: …" usually 1).
export class GitError extends Error {
  constructor(
    message: string,
    public code = message.startsWith("fatal:") ? 128 : 1,
    public stdout = "",
  ) {
    super(message);
  }
}

// ----- config files (INI-style, like .git/config and ~/.gitconfig) -----

type Section = { name: string; sub?: string; values: [string, string][] };

export function parseConfig(text: string): Section[] {
  const out: Section[] = [];
  let cur: Section | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sec = /^\[([^\s\]"]+)(?:\s+"([^"]*)")?\]$/.exec(line);
    if (sec) {
      cur = { name: sec[1].toLowerCase(), sub: sec[2], values: [] };
      out.push(cur);
      continue;
    }
    const kv = /^([A-Za-z][\w-]*)\s*(?:=\s*(.*))?$/.exec(line);
    if (kv && cur) {
      let v = kv[2] ?? "true";
      v = v.replace(/\s+[#;].*$/, "");
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      cur.values.push([kv[1], v]);
    }
  }
  return out;
}

export function serializeConfig(sections: Section[]): string {
  return sections
    .map((s) => {
      const head = s.sub !== undefined ? `[${s.name} "${s.sub}"]` : `[${s.name}]`;
      const body = s.values.map(([k, v]) => `\t${k} = ${/[\s#;"]/.test(v) || v === "" ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v}`).join("\n");
      return body ? `${head}\n${body}` : head;
    })
    .join("\n")
    .concat("\n");
}

/** "user.name" → { section: "user", key: "name" }; "remote.origin.url" → sub "origin". */
export function splitKey(key: string): { section: string; sub?: string; key: string } | undefined {
  const first = key.indexOf(".");
  const last = key.lastIndexOf(".");
  if (first <= 0 || last === key.length - 1) return undefined;
  if (first === last) return { section: key.slice(0, first).toLowerCase(), key: key.slice(last + 1) };
  return { section: key.slice(0, first).toLowerCase(), sub: key.slice(first + 1, last), key: key.slice(last + 1) };
}

export function configEntries(sections: Section[]): [string, string][] {
  return sections.flatMap((s) => s.values.map(([k, v]) => [`${s.name}${s.sub !== undefined ? `.${s.sub}` : ""}.${k.toLowerCase()}`, v] as [string, string]));
}

export function setConfigValue(sections: Section[], key: string, value: string | undefined): boolean {
  const k = splitKey(key);
  if (!k) return false;
  let sec = sections.find((s) => s.name === k.section && s.sub === k.sub);
  if (value === undefined) {
    if (!sec) return false;
    const before = sec.values.length;
    sec.values = sec.values.filter(([n]) => n.toLowerCase() !== k.key.toLowerCase());
    if (sec.values.length === 0) sections.splice(sections.indexOf(sec), 1);
    return sec.values.length !== before;
  }
  if (!sec) {
    sec = { name: k.section, sub: k.sub, values: [] };
    sections.push(sec);
  }
  const existing = sec.values.find(([n]) => n.toLowerCase() === k.key.toLowerCase());
  if (existing) existing[1] = value;
  else sec.values.push([k.key, value]);
  return true;
}

export const GLOBAL_CONFIG = `${HOME}/.gitconfig`;

// ----- .gitignore -----

type IgnoreRule = { base: string; re: RegExp; negate: boolean; dirOnly: boolean };

function globToRegex(glob: string): string {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" matches any number of folders, "/**" everything inside.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end === -1) re += "\\[";
      else {
        re += `[${glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else if (c === "\\" && i + 1 < glob.length) re += `\\${glob[++i]}`;
    else re += c.replace(/[.+^${}()|]/g, "\\$&");
  }
  return re;
}

export function parseIgnore(text: string, base: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (let line of text.split("\n")) {
    line = line.replace(/(?<!\\)\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    }
    if (line.startsWith("\\")) line = line.slice(1);
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    const body = globToRegex(line);
    const re = new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`);
    rules.push({ base, re, negate, dirOnly });
  }
  return rules;
}

// ----- the repository -----

export class Repo {
  constructor(
    public fs: IFileSystem,
    /** The .git folder (or the repository folder itself, for a bare repository). */
    public gitdir: string,
    /** The working folder, or null for a bare repository (like the ones on "GitHub"). */
    public root: string | null,
    public now: () => Date,
  ) {}

  static async find(fs: IFileSystem, cwd: string, now: () => Date): Promise<Repo | null> {
    let dir = cwd;
    for (;;) {
      if (await isDir(fs, join(dir, ".git"))) return new Repo(fs, join(dir, ".git"), dir, now);
      if (dir.endsWith(".git") && (await exists(fs, join(dir, "HEAD"))) && (await isDir(fs, join(dir, "objects")))) return new Repo(fs, dir, null, now);
      if (dir === "/") return null;
      dir = dirname(dir);
    }
  }

  static async open(fs: IFileSystem, gitdir: string, now: () => Date): Promise<Repo | null> {
    if (!(await exists(fs, join(gitdir, "HEAD")))) return null;
    const bare = !gitdir.endsWith("/.git");
    return new Repo(fs, gitdir, bare ? null : dirname(gitdir), now);
  }

  p(rel: string) {
    return `${this.gitdir}/${rel}`;
  }

  get bare() {
    return this.root === null;
  }

  async readText(rel: string): Promise<string | undefined> {
    try {
      return await this.fs.readFile(this.p(rel));
    } catch {
      return undefined;
    }
  }

  async writeText(rel: string, text: string) {
    await this.fs.mkdir(dirname(this.p(rel)), { recursive: true });
    await this.fs.writeFile(this.p(rel), text);
  }

  async remove(rel: string) {
    try {
      await this.fs.rm(this.p(rel), { force: true });
    } catch {
      /* already gone */
    }
  }

  // ----- objects -----

  async writeObject(type: ObjectType, content: Uint8Array): Promise<string> {
    const raw = frame(type, content);
    const sha = await sha1(raw);
    const path = this.p(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
    if (!(await exists(this.fs, path))) {
      await this.fs.mkdir(dirname(path), { recursive: true });
      await this.fs.writeFile(path, await deflate(raw));
      await this.fs.chmod(path, 0o444).catch(() => undefined);
    }
    return sha;
  }

  async hasObject(sha: string) {
    return exists(this.fs, this.p(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`));
  }

  async readObject(sha: string): Promise<{ type: ObjectType; content: Uint8Array }> {
    let raw: Uint8Array;
    try {
      raw = await this.fs.readFileBuffer(this.p(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`));
    } catch {
      throw new GitError(`fatal: bad object ${sha}`);
    }
    return parseFramed(await inflate(raw));
  }

  /** The raw compressed bytes of an object (for copying between repositories). */
  async readRaw(sha: string) {
    return this.fs.readFileBuffer(this.p(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`));
  }

  async writeRaw(sha: string, bytes: Uint8Array) {
    const path = this.p(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
    if (await exists(this.fs, path)) return;
    await this.fs.mkdir(dirname(path), { recursive: true });
    await this.fs.writeFile(path, bytes);
  }

  async readCommit(sha: string): Promise<Commit> {
    let o = await this.readObject(sha);
    // A tag stands for the commit it points at.
    while (o.type === "tag") o = await this.readObject(parseTag(o.content).object);
    if (o.type !== "commit") throw new GitError(`fatal: ${sha} is not a commit`);
    return parseCommit(o.content);
  }

  /** A tag object's commit, or the sha itself for anything else. */
  async peel(sha: string): Promise<string> {
    let cur = sha;
    for (let i = 0; i < 5; i++) {
      const o = await this.readObject(cur);
      if (o.type !== "tag") return cur;
      cur = parseTag(o.content).object;
    }
    return cur;
  }

  async readTree(sha: string): Promise<TreeEntry[]> {
    const o = await this.readObject(sha);
    return parseTree(o.content);
  }

  async readBlob(sha: string): Promise<Uint8Array> {
    return (await this.readObject(sha)).content;
  }

  async readBlobText(sha: string): Promise<string> {
    return decoder.decode(await this.readBlob(sha));
  }

  writeBlob(content: Uint8Array | string) {
    return this.writeObject("blob", typeof content === "string" ? encoder.encode(content) : content);
  }

  writeCommit(c: Commit) {
    return this.writeObject("commit", serializeCommit(c));
  }

  /** Every file in a tree, by path. */
  async flatten(treeSha: string | undefined, prefix = ""): Promise<Files> {
    const out: Files = new Map();
    if (!treeSha) return out;
    for (const e of await this.readTree(treeSha)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.mode === "40000") for (const [k, v] of await this.flatten(e.sha, path)) out.set(k, v);
      else out.set(path, { sha: e.sha, mode: e.mode });
    }
    return out;
  }

  async commitFiles(commit: string | undefined): Promise<Files> {
    if (!commit) return new Map();
    return this.flatten((await this.readCommit(commit)).tree);
  }

  /** Writes the trees for a set of files and returns the top tree's hash. */
  async writeTree(files: Files): Promise<string> {
    type Node = { files: TreeEntry[]; dirs: Map<string, Node> };
    const rootNode: Node = { files: [], dirs: new Map() };
    for (const [path, f] of files) {
      const parts = path.split("/");
      let node = rootNode;
      for (const dir of parts.slice(0, -1)) {
        if (!node.dirs.has(dir)) node.dirs.set(dir, { files: [], dirs: new Map() });
        node = node.dirs.get(dir)!;
      }
      node.files.push({ mode: f.mode, name: parts.at(-1)!, sha: f.sha });
    }
    const write = async (node: Node): Promise<string> => {
      const entries = [...node.files];
      for (const [name, child] of node.dirs) entries.push({ mode: "40000", name, sha: await write(child) });
      return this.writeObject("tree", serializeTree(entries));
    };
    return write(rootNode);
  }

  // ----- refs -----

  async readRef(name: string): Promise<string | undefined> {
    const t = await this.readText(name);
    if (t === undefined) {
      const packed = await this.readText("packed-refs");
      const line = packed?.split("\n").find((l) => l.endsWith(` ${name}`));
      return line?.split(" ")[0];
    }
    const v = t.trim();
    if (v.startsWith("ref: ")) return this.readRef(v.slice(5));
    return v || undefined;
  }

  async writeRef(name: string, sha: string) {
    await this.writeText(name, `${sha}\n`);
  }

  async deleteRef(name: string) {
    await this.remove(name);
    await this.remove(`logs/${name}`);
  }

  async listRefs(prefix: string): Promise<{ name: string; sha: string }[]> {
    const out: { name: string; sha: string }[] = [];
    const walk = async (rel: string) => {
      let names: string[];
      try {
        names = await this.fs.readdir(this.p(rel));
      } catch {
        return;
      }
      for (const n of names.sort()) {
        const r = `${rel}/${n}`;
        if (await isDir(this.fs, this.p(r))) await walk(r);
        else {
          const sha = await this.readRef(r);
          if (sha) out.push({ name: r, sha });
        }
      }
    };
    await walk(prefix.replace(/\/$/, ""));
    return out;
  }

  /** The current branch (undefined when HEAD is detached) and the commit HEAD points at. */
  async head(): Promise<{ branch?: string; sha?: string }> {
    const t = ((await this.readText("HEAD")) ?? "").trim();
    if (t.startsWith("ref: ")) {
      const ref = t.slice(5);
      return { branch: ref.replace(/^refs\/heads\//, ""), sha: await this.readRef(ref) };
    }
    return { sha: t || undefined };
  }

  async setHead(target: { branch: string } | { detached: string }) {
    await this.writeText("HEAD", "branch" in target ? `ref: refs/heads/${target.branch}\n` : `${target.detached}\n`);
  }

  /** Moves the current branch (or a detached HEAD) to a new commit, and logs it. */
  async advance(sha: string, message: string) {
    const h = await this.head();
    const old = h.sha ?? "0".repeat(40);
    if (h.branch) {
      await this.writeRef(`refs/heads/${h.branch}`, sha);
      await this.reflog(`refs/heads/${h.branch}`, old, sha, message);
    } else await this.writeText("HEAD", `${sha}\n`);
    await this.reflog("HEAD", old, sha, message);
  }

  async reflog(ref: string, old: string, sha: string, message: string, who?: { name: string; email: string }) {
    const id = who ?? (await this.identity(false)) ?? { name: "learner", email: "learner@inkwell" };
    const time = Math.floor(this.now().getTime() / 1000);
    const line = `${old} ${sha} ${id.name} <${id.email}> ${time} +0000\t${message}\n`;
    const path = this.p(`logs/${ref}`);
    await this.fs.mkdir(dirname(path), { recursive: true });
    await this.fs.appendFile(path, line);
  }

  /** A branch, tag, remote branch, HEAD, a (short) hash, or any of those followed by ~n or ^. */
  async resolve(rev: string): Promise<string | undefined> {
    const m = /^(.*?)((?:[~^]\d*)*)$/.exec(rev);
    if (!m) return undefined;
    let sha = await this.resolveName(m[1] || "HEAD");
    if (!sha) return undefined;
    // An annotated tag points at a tag object: follow it to the commit.
    if (/^(refs\/tags\/)?[^/]/.test(m[1]) && (await this.readRef(`refs/tags/${m[1].replace(/^refs\/tags\//, "")}`))) sha = await this.peel(sha);
    for (const op of m[2].match(/[~^]\d*/g) ?? []) {
      const n = op.length > 1 ? Number(op.slice(1)) : 1;
      if (op[0] === "~") {
        for (let i = 0; i < n && sha; i++) sha = (await this.readCommit(sha)).parents[0];
      } else if (n === 0) continue;
      else sha = (await this.readCommit(sha!)).parents[n - 1];
      if (!sha) return undefined;
    }
    return sha;
  }

  /** The reflog of a ref, newest first: what HEAD@{1}, main@{2} and stash@{0} refer to. */
  async reflogEntries(ref: string): Promise<{ old: string; sha: string; message: string; time: number }[]> {
    const file = ref === "HEAD" ? "logs/HEAD" : ref === "stash" || ref === "refs/stash" ? "logs/refs/stash" : ref.startsWith("refs/") ? `logs/${ref}` : `logs/refs/heads/${ref}`;
    const text = (await this.readText(file)) ?? "";
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [meta, message = ""] = l.split("\t");
        const parts = meta.split(" ");
        return { old: parts[0], sha: parts[1], message, time: Number(parts[parts.length - 2]) };
      })
      .reverse();
  }

  private async resolveName(name: string): Promise<string | undefined> {
    const at = /^(.*)@\{(-?\d+|u|upstream|push)\}$/.exec(name);
    if (at) {
      const base = at[1] || "HEAD";
      if (at[2] === "u" || at[2] === "upstream" || at[2] === "push") {
        const branch = base === "HEAD" ? (await this.head()).branch : base;
        const remote = branch ? await this.config(`branch.${branch}.remote`) : undefined;
        const merge = branch ? await this.config(`branch.${branch}.merge`) : undefined;
        if (!remote || !merge) throw new GitError(`fatal: no upstream configured for branch '${branch ?? "HEAD"}'`);
        return this.readRef(`refs/remotes/${remote}/${merge.replace(/^refs\/heads\//, "")}`);
      }
      const n = Number(at[2]);
      if (n < 0) {
        const moves = (await this.reflogEntries("HEAD")).map((e) => /^checkout: moving from (\S+) to /.exec(e.message)?.[1]).filter(Boolean) as string[];
        const prev = moves[-n - 1];
        return prev ? this.resolveName(prev) : undefined;
      }
      const entries = await this.reflogEntries(base === "@" ? "HEAD" : base);
      if (n >= entries.length) {
        if (entries.length) throw new GitError(`fatal: log for '${base}' only has ${entries.length} entries`);
        return undefined;
      }
      return entries[n].sha;
    }
    if (name === "HEAD" || name === "@") return (await this.head()).sha;
    if (["ORIG_HEAD", "MERGE_HEAD", "FETCH_HEAD"].includes(name)) return (await this.readText(name))?.trim().split(/\s/)[0] || undefined;
    for (const ref of [name, `refs/${name}`, `refs/tags/${name}`, `refs/heads/${name}`, `refs/remotes/${name}`, `refs/remotes/${name}/HEAD`]) {
      if (ref.includes("..") || ref === "stash") continue;
      const sha = await this.readRef(ref);
      if (sha) return sha;
    }
    if (/^[0-9a-f]{4,40}$/.test(name)) {
      if (name.length === 40) return (await this.hasObject(name)) ? name : undefined;
      let names: string[] = [];
      try {
        names = await this.fs.readdir(this.p(`objects/${name.slice(0, 2)}`));
      } catch {
        return undefined;
      }
      const hits = names.filter((n) => n.startsWith(name.slice(2)));
      if (hits.length === 1) return name.slice(0, 2) + hits[0];
      if (hits.length > 1) throw new GitError(`error: short object ID ${name} is ambiguous`);
    }
    return undefined;
  }

  // ----- index (the staging area) -----

  async readIndex(): Promise<Index> {
    const t = await this.readText("index");
    if (!t) return { entries: {}, conflicts: {} };
    try {
      const parsed = JSON.parse(t) as Partial<Index>;
      return { entries: parsed.entries ?? {}, conflicts: parsed.conflicts ?? {} };
    } catch {
      throw new GitError("fatal: index file corrupt");
    }
  }

  async writeIndex(idx: Index) {
    const sorted: Record<string, FileEntry> = {};
    for (const k of Object.keys(idx.entries).sort()) sorted[k] = idx.entries[k];
    await this.writeText("index", `${JSON.stringify({ entries: sorted, conflicts: idx.conflicts }, null, 1)}\n`);
  }

  static indexFiles(idx: Index): Files {
    return new Map(Object.entries(idx.entries));
  }

  // ----- config -----

  async configSections(global: boolean): Promise<Section[]> {
    const path = global ? GLOBAL_CONFIG : this.p("config");
    try {
      return parseConfig(await this.fs.readFile(path));
    } catch {
      return [];
    }
  }

  async saveConfig(global: boolean, sections: Section[]) {
    const path = global ? GLOBAL_CONFIG : this.p("config");
    await this.fs.writeFile(path, serializeConfig(sections));
  }

  /** The value of a config key: the repository's own config wins over ~/.gitconfig. */
  async config(key: string): Promise<string | undefined> {
    const k = key.toLowerCase();
    const find = (secs: Section[]) => configEntries(secs).filter(([n]) => n.toLowerCase() === k).at(-1)?.[1];
    return find(await this.configSections(false)) ?? find(await this.configSections(true));
  }

  async identity(strict = true): Promise<{ name: string; email: string } | undefined> {
    const name = await this.config("user.name");
    const email = await this.config("user.email");
    if (name && email) return { name, email };
    if (strict) return undefined;
    return { name: name ?? "learner", email: email ?? "learner@inkwell" };
  }

  // ----- the working folder -----

  async ignoreRules(): Promise<IgnoreRule[]> {
    if (!this.root) return [];
    const rules: IgnoreRule[] = [];
    const exclude = await this.readText("info/exclude");
    if (exclude) rules.push(...parseIgnore(exclude, ""));
    const walk = async (rel: string) => {
      const dir = rel ? `${this.root}/${rel}` : this.root!;
      const gi = await readTextFile(this.fs, `${dir}/.gitignore`);
      if (gi !== undefined) rules.push(...parseIgnore(gi, rel));
      let names: string[] = [];
      try {
        names = await this.fs.readdir(dir);
      } catch {
        return;
      }
      for (const n of names) {
        if (n === ".git") continue;
        const r = rel ? `${rel}/${n}` : n;
        if (await isDir(this.fs, `${this.root}/${r}`)) await walk(r);
      }
    };
    await walk("");
    return rules;
  }

  static isIgnored(rules: IgnoreRule[], path: string, dir: boolean): boolean {
    // A file inside an ignored folder is ignored, whatever comes later.
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) if (Repo.matchOne(rules, parts.slice(0, i).join("/"), true)) return true;
    return Repo.matchOne(rules, path, dir);
  }

  private static matchOne(rules: IgnoreRule[], path: string, dir: boolean): boolean {
    let ignored = false;
    for (const r of rules) {
      if (r.dirOnly && !dir) continue;
      if (r.base && !path.startsWith(`${r.base}/`)) continue;
      const rel = r.base ? path.slice(r.base.length + 1) : path;
      if (r.re.test(rel)) ignored = !r.negate;
    }
    return ignored;
  }

  /** Every file in the working folder (except .git), with its content hash. */
  async workFiles(opts: { hash: boolean } = { hash: true }): Promise<Files> {
    const out: Files = new Map();
    if (!this.root) return out;
    const walk = async (rel: string) => {
      const dir = rel ? `${this.root}/${rel}` : this.root!;
      let names: string[];
      try {
        names = await this.fs.readdir(dir);
      } catch {
        return;
      }
      for (const n of names) {
        if (n === ".git") continue;
        const r = rel ? `${rel}/${n}` : n;
        const full = `${this.root}/${r}`;
        const st = await this.fs.lstat(full);
        if (st.isDirectory) await walk(r);
        else {
          const mode = st.isSymbolicLink ? "120000" : st.mode & 0o111 ? "100755" : "100644";
          out.set(r, { mode, sha: opts.hash ? await this.hashWork(r, st.isSymbolicLink) : "" });
        }
      }
    };
    await walk("");
    return out;
  }

  async readWork(path: string): Promise<Uint8Array> {
    const full = `${this.root}/${path}`;
    const st = await this.fs.lstat(full);
    if (st.isSymbolicLink) return encoder.encode(await this.fs.readlink(full));
    return this.fs.readFileBuffer(full);
  }

  private async hashWork(path: string, link: boolean): Promise<string> {
    const full = `${this.root}/${path}`;
    const bytes = link ? encoder.encode(await this.fs.readlink(full)) : await this.fs.readFileBuffer(full);
    return sha1(frame("blob", bytes));
  }

  /** Puts a file from the object store into the working folder. */
  async writeWork(path: string, f: FileEntry) {
    const full = `${this.root}/${path}`;
    await this.fs.mkdir(dirname(full), { recursive: true });
    const bytes = await this.readBlob(f.sha);
    if (await exists(this.fs, full)) {
      const st = await this.fs.lstat(full);
      if (st.isDirectory) await this.fs.rm(full, { recursive: true, force: true });
    }
    await this.fs.writeFile(full, bytes);
    await this.fs.chmod(full, f.mode === "100755" ? 0o755 : 0o644).catch(() => undefined);
  }

  /** Deletes a file from the working folder, and any folders that became empty. */
  async removeWork(path: string) {
    const full = `${this.root}/${path}`;
    await this.fs.rm(full, { force: true }).catch(() => undefined);
    let dir = dirname(full);
    while (dir !== this.root && dir.startsWith(`${this.root}/`)) {
      try {
        if ((await this.fs.readdir(dir)).length > 0) break;
        await this.fs.rm(dir, { recursive: true });
      } catch {
        break;
      }
      dir = dirname(dir);
    }
  }
}

export async function exists(fs: IFileSystem, path: string) {
  try {
    await fs.lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDir(fs: IFileSystem, path: string) {
  try {
    return (await fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

async function readTextFile(fs: IFileSystem, path: string) {
  try {
    return await fs.readFile(path);
  } catch {
    return undefined;
  }
}
