// File ownership and permissions for the practice terminal. The in-memory file system keeps
// each file's mode (rwx bits) but not its owner, and nothing checks the bits, so this adds both:
// files inside /home/learner and /tmp belong to "learner", everything else to "root", unless
// `chown` said otherwise or someone else made the file (a file `sudo` creates belongs to root).
// The learner is an ordinary user; `sudo` runs a command as root.
import type { IFileSystem } from "just-bash";
import { HOME, USER, dirname, normalize } from "./util";

export type Access = "r" | "w" | "x";

export class PermissionError extends Error {
  code = "EACCES";
  constructor(public path: string) {
    super(`EACCES: permission denied, '${path}'`);
  }
}

export class Perms {
  private owners = new Map<string, { user: string; group: string }>();
  /** How many nested root sections are running (sudo, or the terminal's own work). Root skips the read/write checks. */
  rootDepth = 0;
  /** How many nested `sudo` commands are running: what they create belongs to root. */
  sudoDepth = 0;

  constructor(private fs: IFileSystem) {}

  get root() {
    return this.rootDepth > 0;
  }

  owner(path: string): { user: string; group: string } {
    const p = normalize(path);
    const set = this.owners.get(p);
    if (set) return set;
    const mine = p === HOME || p.startsWith(`${HOME}/`) || p.startsWith("/tmp/");
    return mine ? { user: USER, group: USER } : { user: "root", group: "root" };
  }

  setOwner(path: string, user?: string, group?: string) {
    const cur = this.owner(path);
    this.owners.set(normalize(path), { user: user ?? cur.user, group: group ?? cur.group });
  }

  /** Forgets what was recorded for `path` and everything under it (it was deleted). */
  private forget(path: string) {
    const f = normalize(path);
    for (const p of [...this.owners.keys()]) if (p === f || p.startsWith(`${f}/`)) this.owners.delete(p);
  }

  /** Who a new file belongs to: root under sudo, the learner otherwise (the terminal's own work keeps the default). */
  private creator(): { user: string; group: string } | undefined {
    if (this.sudoDepth > 0) return { user: "root", group: "root" };
    return this.root ? undefined : { user: USER, group: USER };
  }

  /** Records the owner of entries that `make` creates (those of `paths` that didn't exist yet). */
  private async creating<T>(paths: string[], make: () => Promise<T>): Promise<T> {
    const who = this.creator();
    const isNew: string[] = [];
    if (who) for (const p of paths) if (!(await this.exists(p))) isNew.push(p);
    const r = await make();
    for (const p of isNew) {
      if (!(await this.exists(p))) continue;
      for (const q of await this.walk(p)) {
        this.forget(q);
        const d = this.owner(q);
        if (d.user !== who!.user || d.group !== who!.group) this.owners.set(normalize(q), who!);
      }
    }
    return r;
  }

  /** `path` and, for a folder, everything inside it. */
  private async walk(path: string): Promise<string[]> {
    const out = [normalize(path)];
    try {
      if (!(await this.fs.lstat(path)).isDirectory) return out;
      for (const n of await this.fs.readdir(path)) out.push(...(await this.walk(`${normalize(path)}/${n}`)));
    } catch {
      // gone meanwhile
    }
    return out;
  }

  // After mv, the moved entries keep their owners (even one that came from where they were).
  private async moveOwner(from: string, to: string) {
    const f = normalize(from);
    const t = normalize(to);
    const moved = new Map<string, { user: string; group: string }>();
    for (const p of await this.walk(t)) moved.set(p, this.owner(f + p.slice(t.length)));
    this.forget(f);
    this.forget(t);
    for (const [p, o] of moved) {
      const d = this.owner(p);
      if (d.user !== o.user || d.group !== o.group) this.owners.set(p, o);
    }
  }

  /** The file a path names once symbolic links are followed (its owner decides who may use it). */
  private async real(path: string): Promise<string> {
    try {
      return await this.fs.realpath(path);
    } catch {
      return normalize(path);
    }
  }

  // The learner's groups at the start: their own, plus "adm" (may read the system logs) and
  // "sudo" (may use sudo), like the first user on an Ubuntu server.
  static groups = [USER, "adm", "sudo"];

  /** A user's groups, read from /etc/group (their own group first). */
  async groupsOf(user: string): Promise<string[]> {
    let text = "";
    try {
      text = await this.fs.readFile("/etc/group");
    } catch {
      return user === USER ? Perms.groups : [user];
    }
    const out: string[] = [];
    for (const line of text.split("\n")) {
      const [name, , , members = ""] = line.split(":");
      if (!name) continue;
      if (name === user || members.split(",").includes(user)) out.push(name);
    }
    return out.sort((a, b) => (a === user ? -1 : b === user ? 1 : 0));
  }

  /** Whether some other user (a service's user, say) may read, write or run `path`. */
  async userCan(path: string, user: string, access: Access): Promise<boolean> {
    if (user === "root") return true;
    const mode = await this.mode(path);
    if (mode === undefined) return false;
    const bit = access === "r" ? 4 : access === "w" ? 2 : 1;
    const o = this.owner(await this.real(path));
    const bits = o.user === user ? (mode >> 6) & 7 : (await this.groupsOf(user)).includes(o.group) ? (mode >> 3) & 7 : mode & 7;
    return (bits & bit) !== 0;
  }

  async mode(path: string): Promise<number | undefined> {
    try {
      return (await this.fs.stat(path)).mode;
    } catch {
      return undefined;
    }
  }

  /** Whether the current user may read, write or execute `path` (which must exist). */
  async can(path: string, access: Access): Promise<boolean> {
    // /dev/null and friends are open to everyone (mode 666) on a real system.
    if (/^\/dev\/(null|zero|stdout|stderr|stdin|tty)$/.test(normalize(path))) return access !== "x";
    const mode = await this.mode(path);
    if (mode === undefined) return true; // missing files are the command's own error to report
    const bit = access === "r" ? 4 : access === "w" ? 2 : 1;
    if (this.root) return access !== "x" || (mode & 0o111) !== 0 || (await this.isDir(path));
    const o = this.owner(await this.real(path));
    const bits = o.user === USER ? (mode >> 6) & 7 : (await this.groupsOf(USER)).includes(o.group) ? (mode >> 3) & 7 : mode & 7;
    return (bits & bit) !== 0;
  }

  async isDir(path: string) {
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  async exists(path: string) {
    try {
      await this.fs.lstat(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Writing a file: the file itself must be writable, or, if it's new, its folder. */
  async canWriteFile(path: string) {
    return (await this.exists(path)) ? this.can(path, "w") : this.can(dirname(path), "w");
  }

  /** Creating or deleting an entry needs write permission on the folder it's in. */
  canChangeDir(path: string) {
    return this.can(dirname(path), "w");
  }

  /** chmod and chown: only the owner (or root) may change a file's permissions. */
  async isOwner(path: string) {
    return this.root || this.owner(await this.real(path)).user === USER;
  }

  /** A hard link to someone else's file needs read and write access to it (Linux's protected_hardlinks). */
  async canLink(path: string) {
    return (await this.isOwner(path)) || ((await this.can(path, "r")) && (await this.can(path, "w")));
  }

  // A file system that refuses reads and writes the bits don't allow. Commands check first and
  // print the proper message (see guard.ts); this catches the rest, such as `echo hi > file`.
  wrap(fs: IFileSystem): IFileSystem {
    // Arrow functions below need this object, not the proxy's.
    const perms: Perms = this; // eslint-disable-line @typescript-eslint/no-this-alias
    const check = async (ok: Promise<boolean>, path: string) => {
      if (!(await ok)) throw new PermissionError(path);
    };
    // The folders `mkdir -p` would create, top first.
    const missing = async (p: string) => {
      const out: string[] = [];
      for (let d = normalize(p); d !== "/" && !(await perms.exists(d)); d = dirname(d)) out.unshift(d);
      return out;
    };
    // The in-memory file system forgets a file's mode when the file is written again; on Linux
    // `echo hi > file` keeps it.
    const write = async (p: string, fn: () => Promise<void>) => {
      await check(perms.canWriteFile(p), p);
      const mode = await perms.mode(p);
      await perms.creating([p], fn);
      if (mode !== undefined) await fs.chmod(p, mode);
    };
    const guarded: Partial<Record<keyof IFileSystem, (...a: never[]) => unknown>> = {
      readFile: async (p: string, ...rest: never[]) => (await check(perms.can(p, "r"), p), fs.readFile(p, ...rest)),
      readFileBuffer: async (p: string) => (await check(perms.can(p, "r"), p), fs.readFileBuffer(p)),
      ...(fs.readFileBytes && { readFileBytes: async (p: string) => (await check(perms.can(p, "r"), p), fs.readFileBytes!(p)) }),
      writeFile: (p: string, content: never, opts?: never) => write(p, () => fs.writeFile(p, content, opts)),
      appendFile: (p: string, content: never, opts?: never) => write(p, () => fs.appendFile(p, content, opts)),
      ...(fs.createExclusive && {
        createExclusive: async (p: string, opts: never) => (await check(perms.canChangeDir(p), p), perms.creating([p], () => fs.createExclusive!(p, opts))),
      }),
      mkdir: async (p: string, opts?: { recursive?: boolean }) => {
        const made = opts?.recursive ? await missing(p) : (await perms.exists(p)) ? [] : [normalize(p)];
        if (made.length) await check(perms.canChangeDir(made[0]), made[0]);
        return perms.creating(made, () => fs.mkdir(p, opts));
      },
      rm: async (p: string, opts?: never) => {
        await check(perms.canChangeDir(p), p);
        await fs.rm(p, opts);
        if (!(await perms.exists(p))) perms.forget(p);
      },
      readdir: async (p: string) => (await check(perms.can(p, "r"), p), fs.readdir(p)),
      ...(fs.readdirWithFileTypes && { readdirWithFileTypes: async (p: string) => (await check(perms.can(p, "r"), p), fs.readdirWithFileTypes!(p)) }),
      chmod: async (p: string, mode: never) => {
        if (!(await perms.isOwner(p))) throw new PermissionError(p);
        return fs.chmod(p, mode);
      },
      utimes: async (p: string, atime: Date, mtime: Date) => (await check(perms.canWriteFile(p), p), fs.utimes(p, atime, mtime)),
      cp: async (a: string, b: string, opts?: never) => {
        for (const q of await perms.walk(a)) if (!(await perms.isDir(q))) await check(perms.can(q, "r"), q);
        const dest = (await perms.isDir(b)) ? `${normalize(b)}/${a.split("/").filter(Boolean).pop()}` : b;
        await check(perms.canWriteFile(dest), dest);
        // A new copy belongs to whoever made it; copying over a file keeps that file's owner.
        return perms.creating([dest], () => fs.cp(a, b, opts));
      },
      symlink: async (target: string, p: string) => (await check(perms.canChangeDir(p), p), perms.creating([p], () => fs.symlink(target, p))),
      link: async (a: string, b: string) => {
        if (!(await perms.canLink(a))) throw Object.assign(new PermissionError(a), { code: "EPERM" });
        await check(perms.canChangeDir(b), b);
        await fs.link(a, b);
        // A hard link is the same file under a second name, with the same owner.
        perms.forget(b);
        const o = perms.owner(await perms.real(a));
        const d = perms.owner(b);
        if (o.user !== d.user || o.group !== d.group) perms.owners.set(normalize(b), o);
      },
      mv: async (a: string, b: string) => {
        await check(perms.canChangeDir(a), a);
        await check(perms.canChangeDir(b), b);
        await fs.mv(a, b);
        await perms.moveOwner(a, b);
      },
    };
    return new Proxy(fs, {
      get(target, key, receiver) {
        const g = guarded[key as keyof IFileSystem];
        if (g) return g;
        const v = Reflect.get(target, key, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  }
}
