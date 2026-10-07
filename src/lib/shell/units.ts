// Services (systemd units) and the system journal of the practice computer. A unit is a real
// unit file (/etc/systemd/system/x.service or /usr/lib/systemd/system/x.service); "enabled"
// is a real symlink in multi-user.target.wants. Starting a unit runs a small model of its
// program (nginx checks its config, sshd reads its port, the Inkwell shop reads its settings
// file) or, for anything else, the ExecStart command itself; the processes it leaves running
// are in /proc (see procs.ts). The journal is kept in /var/log/journal as one JSON object per
// line, and copied to /var/log/syslog as text.
import type { Machine } from "./machine";
import type { Proc } from "./procs";
import { basename } from "./util";

export const UNIT_DIRS = ["/etc/systemd/system", "/usr/lib/systemd/system"];
export const WANTS = "/etc/systemd/system/multi-user.target.wants";
const STATE_DIR = "/run/systemd/mp";
export const JOURNAL = "/var/log/journal/system.jsonl";

export type Unit = {
  name: string; // nginx.service
  path: string;
  description: string;
  execStart: string;
  user: string;
  type: string;
  docs?: string;
  wantedBy?: string;
  raw: string;
};

export type UnitState = { active: "active" | "inactive" | "failed"; since?: number; mainPid?: number; result?: string; exitStatus?: number; execStart?: string; loadedHash?: string };

export type JournalEntry = { t: number; host: string; ident: string; pid?: number; unit?: string; prio: number; msg: string };

export function unitName(n: string): string {
  return /\.(service|timer|socket|target)$/.test(n) ? n : `${n}.service`;
}

function parseUnit(name: string, path: string, raw: string): Unit {
  const get = (k: string) => {
    const m = new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`, "m").exec(raw);
    return m?.[1].trim();
  };
  return {
    name,
    path,
    raw,
    description: get("Description") ?? name,
    execStart: (get("ExecStart") ?? "").replace(/^[-@+!]+/, ""),
    user: get("User") ?? "root",
    type: get("Type") ?? "simple",
    docs: get("Documentation"),
    wantedBy: get("WantedBy"),
  };
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
};

export class Services {
  constructor(private m: Machine) {}

  private root<T>(fn: () => Promise<T>) {
    return this.m.asRoot(fn);
  }

  private async read(path: string): Promise<string | undefined> {
    return this.root(async () => {
      try {
        return await this.m.fs.readFile(path);
      } catch {
        return undefined;
      }
    });
  }

  async load(n: string): Promise<Unit | undefined> {
    const name = unitName(n);
    for (const d of UNIT_DIRS) {
      const raw = await this.read(`${d}/${name}`);
      if (raw !== undefined) return parseUnit(name, `${d}/${name}`, raw);
    }
    return undefined;
  }

  async all(): Promise<Unit[]> {
    const seen = new Map<string, Unit>();
    for (const d of UNIT_DIRS) {
      let names: string[] = [];
      try {
        names = await this.root(() => this.m.fs.readdir(d));
      } catch {
        continue;
      }
      for (const n of names.sort()) {
        if (!n.endsWith(".service") || seen.has(n)) continue;
        const u = await this.load(n);
        if (u) seen.set(n, u);
      }
    }
    return [...seen.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  async state(n: string): Promise<UnitState> {
    const t = await this.read(`${STATE_DIR}/${unitName(n)}.json`);
    const s: UnitState = t ? (JSON.parse(t) as UnitState) : { active: "inactive" };
    // A running service whose main process was killed is no longer running.
    if (s.active === "active" && s.mainPid && !(await this.m.procs.get(s.mainPid))) {
      const next: UnitState = { ...s, active: "failed", result: "signal", mainPid: s.mainPid };
      await this.save(n, next);
      return next;
    }
    return s;
  }

  private async save(n: string, s: UnitState) {
    await this.root(async () => {
      await this.m.fs.mkdir(STATE_DIR, { recursive: true });
      await this.m.fs.writeFile(`${STATE_DIR}/${unitName(n)}.json`, JSON.stringify(s));
    });
  }

  async enabled(n: string): Promise<boolean> {
    return this.root(async () => {
      try {
        await this.m.fs.lstat(`${WANTS}/${unitName(n)}`);
        return true;
      } catch {
        return false;
      }
    });
  }

  async enable(u: Unit): Promise<string> {
    if (await this.enabled(u.name)) return "";
    await this.root(async () => {
      await this.m.fs.mkdir(WANTS, { recursive: true });
      await this.m.fs.symlink(u.path, `${WANTS}/${u.name}`);
    });
    return `Created symlink ${WANTS}/${u.name} → ${u.path}.\n`;
  }

  async disable(u: Unit): Promise<string> {
    if (!(await this.enabled(u.name))) return "";
    await this.root(() => this.m.fs.rm(`${WANTS}/${u.name}`, { force: true }));
    return `Removed "${WANTS}/${u.name}".\n`;
  }

  /** Whether the unit file changed since the unit was last started (systemctl daemon-reload). */
  async changedOnDisk(u: Unit): Promise<boolean> {
    const s = await this.state(u.name);
    const reloaded = await this.read(`${STATE_DIR}/.reloaded`);
    return !!s.loadedHash && s.loadedHash !== hash(u.raw) && (reloaded === undefined || Number(reloaded) < (s.since ?? 0));
  }

  async daemonReload() {
    for (const u of await this.all()) {
      const s = await this.state(u.name);
      if (s.loadedHash) await this.save(u.name, { ...s, loadedHash: hash(u.raw) });
    }
  }

  async journal(e: Omit<JournalEntry, "t" | "host"> & { t?: number }) {
    const entry: JournalEntry = { t: e.t ?? Math.floor(this.m.now().getTime() / 1000), host: this.m.host, ...e };
    await this.root(async () => {
      await this.m.fs.mkdir("/var/log/journal", { recursive: true });
      await this.m.fs.appendFile(JOURNAL, `${JSON.stringify(entry)}\n`);
      await this.m.fs.appendFile("/var/log/syslog", `${journalLine(entry)}\n`);
    });
  }

  async entries(): Promise<JournalEntry[]> {
    const t = (await this.read(JOURNAL)) ?? "";
    return t
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as JournalEntry);
  }

  private sys(unit: string, msg: string, prio = 6) {
    return this.journal({ ident: "systemd", pid: 1, unit, prio, msg });
  }

  /** Starts a unit. Returns false when it failed. */
  async start(u: Unit): Promise<boolean> {
    const s = await this.state(u.name);
    if (s.active === "active") return true;
    await this.sys(u.name, `Starting ${u.name} - ${u.description}...`);
    const now = Math.floor(this.m.now().getTime() / 1000);
    const r = await this.run(u);
    if (!r.ok) {
      for (const l of r.logs) await this.journal({ ident: r.ident, pid: r.pid, unit: u.name, prio: 3, msg: l });
      await this.sys(u.name, `${u.name}: Main process exited, code=exited, status=${r.status}/FAILURE`, 4);
      await this.sys(u.name, `${u.name}: Failed with result 'exit-code'.`, 4);
      await this.sys(u.name, `Failed to start ${u.name} - ${u.description}.`, 3);
      await this.save(u.name, { active: "failed", since: now, result: "exit-code", exitStatus: r.status, mainPid: r.pid, execStart: u.execStart, loadedHash: hash(u.raw) });
      return false;
    }
    let main: number | undefined;
    for (const p of r.procs) {
      const proc = await this.m.procs.spawn({ ...p, ppid: main ?? 1, unit: u.name } as Proc);
      main ??= proc.pid;
    }
    for (const l of r.logs) await this.journal({ ident: r.ident, pid: main, unit: u.name, prio: 6, msg: l });
    if (u.type === "oneshot" || r.procs.length === 0) {
      await this.sys(u.name, `${u.name}: Deactivated successfully.`);
      await this.sys(u.name, `Finished ${u.name} - ${u.description}.`);
      await this.save(u.name, { active: "inactive", since: now, result: "success", exitStatus: 0, execStart: u.execStart, loadedHash: hash(u.raw) });
      return true;
    }
    await this.sys(u.name, `Started ${u.name} - ${u.description}.`);
    await this.save(u.name, { active: "active", since: now, mainPid: main, execStart: u.execStart, loadedHash: hash(u.raw) });
    return true;
  }

  async stop(u: Unit, quietly = false) {
    const s = await this.state(u.name);
    for (const p of await this.m.procs.list()) if (p.unit === u.name) await this.m.procs.remove(p.pid);
    if (s.active === "inactive") return;
    if (!quietly) {
      await this.sys(u.name, `Stopping ${u.name} - ${u.description}...`);
      await this.sys(u.name, `${u.name}: Deactivated successfully.`);
      await this.sys(u.name, `Stopped ${u.name} - ${u.description}.`);
    }
    await this.save(u.name, { active: "inactive", since: Math.floor(this.m.now().getTime() / 1000), loadedHash: s.loadedHash });
  }

  /** Starts every enabled unit, like a computer booting. */
  async boot() {
    let names: string[] = [];
    try {
      names = await this.root(() => this.m.fs.readdir(WANTS));
    } catch {
      return;
    }
    for (const n of names.sort()) {
      const u = await this.load(n);
      if (u) await this.start(u);
    }
  }

  /** Ports some process is listening on right now. */
  async listening(): Promise<{ port: number; addr: string; proto: string; proc: Proc }[]> {
    const out: { port: number; addr: string; proto: string; proc: Proc }[] = [];
    for (const p of await this.m.procs.list()) for (const l of p.listen ?? []) out.push({ port: l.port, addr: l.addr, proto: l.proto ?? "tcp", proc: p });
    return out.sort((a, b) => a.port - b.port);
  }

  // ----- the programs -----

  private async run(u: Unit): Promise<{ ok: true; procs: Omit<Proc, "pid" | "ppid">[]; logs: string[]; ident: string } | { ok: false; logs: string[]; status: number; ident: string; pid: number }> {
    const words = u.execStart.split(/\s+/).filter(Boolean);
    const prog = basename(words[0] ?? "");
    const base = { state: "S", cpu: 0, mem: 0.1, rss: 4200, vsz: 12000, start: "08:00", time: "0:00", tty: "?" };
    const failPid = await this.m.procs.peekPid();
    if (prog === "nginx") {
      const conf = await this.nginxConfig();
      if ("error" in conf) return { ok: false, status: 1, ident: "nginx", pid: failPid, logs: [conf.error, "nginx: configuration file /etc/nginx/nginx.conf test failed"] };
      for (const port of conf.ports) {
        const busy = (await this.listening()).find((l) => l.port === port);
        if (busy) return { ok: false, status: 1, ident: "nginx", pid: failPid, logs: [`nginx: [emerg] bind() to 0.0.0.0:${port} failed (98: Address already in use)`] };
      }
      return {
        ok: true,
        ident: "nginx",
        logs: [],
        procs: [
          { ...base, user: "root", comm: "nginx", cmd: "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;", rss: 1612, vsz: 55228, listen: conf.ports.map((port) => ({ port, addr: "0.0.0.0" })) },
          { ...base, user: "www-data", comm: "nginx", cmd: "nginx: worker process", rss: 5480, vsz: 55856 },
        ],
      };
    }
    if (prog === "sshd") {
      const cfg = (await this.read("/etc/ssh/sshd_config")) ?? "";
      const port = Number(/^\s*Port\s+(\d+)/m.exec(cfg)?.[1] ?? 22);
      return { ok: true, ident: "sshd", logs: [`Server listening on 0.0.0.0 port ${port}.`], procs: [{ ...base, user: "root", comm: "sshd", cmd: "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups", rss: 7936, vsz: 12020, listen: [{ port, addr: "0.0.0.0" }] }] };
    }
    if (prog === "cron") return { ok: true, ident: "cron", logs: ["(CRON) INFO (pidfile fd = 3)", "(CRON) INFO (Running @reboot jobs)"], procs: [{ ...base, user: "root", comm: "cron", cmd: "/usr/sbin/cron -f -P", rss: 2688, vsz: 6824 }] };
    if (prog === "node" && words[1]) {
      // The Inkwell shop: reads its settings file as its own user, then listens on the port in it.
      const confPath = "/etc/inkwell/shop.conf";
      const exists = (await this.read(confPath)) !== undefined;
      if (!exists) return { ok: false, status: 1, ident: "node", pid: failPid, logs: [`Error: ENOENT: no such file or directory, open '${confPath}'`] };
      if (!(await this.m.perms.userCan(confPath, u.user, "r"))) return { ok: false, status: 1, ident: "node", pid: failPid, logs: [`Error: EACCES: permission denied, open '${confPath}'`] };
      const conf = (await this.read(confPath)) ?? "";
      const port = Number(/^\s*port\s*=\s*(\d+)\s*$/m.exec(conf)?.[1]);
      if (!port) return { ok: false, status: 1, ident: "node", pid: failPid, logs: [`Error: ${confPath}: "port" is missing or not a number`] };
      const busy = (await this.listening()).find((l) => l.port === port);
      if (busy) return { ok: false, status: 1, ident: "node", pid: failPid, logs: [`Error: listen EADDRINUSE: address already in use :::${port}`] };
      return { ok: true, ident: "node", logs: [`Inkwell shop listening on port ${port}`], procs: [{ ...base, user: u.user, comm: "node", cmd: u.execStart, cpu: 0.4, mem: 1.2, rss: 48212, vsz: 1021336, listen: [{ port, addr: "*" }] }] };
    }
    // Anything else: run the command for real (as root), and keep it "running" unless it's a
    // one-shot job.
    const r = await this.m.asRoot(() => this.m.bash.exec(u.execStart, { cwd: "/", env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: "/root", USER: u.user } }));
    const logs = `${r.stdout}${r.stderr}`.split("\n").filter(Boolean);
    if (r.exitCode !== 0) return { ok: false, status: r.exitCode, ident: prog, pid: failPid, logs };
    if (u.type === "oneshot") return { ok: true, ident: prog, logs, procs: [] };
    return { ok: true, ident: prog, logs, procs: [{ ...base, user: u.user, comm: prog.slice(0, 15), cmd: u.execStart }] };
  }

  /** Reads nginx's site files: each server block's port, folder and redirect, or the first error. */
  async nginxConfig(): Promise<{ ports: number[]; sites: { port: number; root: string; ret?: { code: number; url: string } }[] } | { error: string }> {
    const dir = "/etc/nginx/sites-enabled";
    let names: string[] = [];
    try {
      names = await this.root(() => this.m.fs.readdir(dir));
    } catch {
      names = [];
    }
    type Site = { port: number; root: string; ret?: { code: number; url: string } };
    const sites: Site[] = [];
    for (const n of names.sort()) {
      const path = `${dir}/${n}`;
      const text = (await this.read(path)) ?? "";
      let depth = 0;
      const lines = text.split("\n");
      let cur: Site | undefined;
      for (const [i, raw] of lines.entries()) {
        const line = raw.replace(/#.*/, "").trim();
        if (!line) continue;
        if (depth === 0 && /^server\s*\{/.test(line)) {
          cur = { port: 80, root: "/var/www/html" };
          sites.push(cur);
        }
        for (const ch of line) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
          if (depth < 0) return { error: `nginx: [emerg] unexpected "}" in ${path}:${i + 1}` };
        }
        if (!/[;{}]$/.test(line)) return { error: `nginx: [emerg] directive "${line.split(/\s+/)[0]}" is not terminated by ";" in ${path}:${i + 2}` };
        if (!cur) continue;
        const l = /^listen\s+(?:[\d.]+:)?(\d+)/.exec(line);
        if (l) cur.port = Number(l[1]);
        const r = /^root\s+([^;]+);/.exec(line);
        if (r) cur.root = r[1].trim();
        const rt = /^return\s+(30[1278])\s+([^;]+);/.exec(line);
        if (rt) cur.ret = { code: Number(rt[1]), url: rt[2].trim() };
      }
      if (depth !== 0) return { error: `nginx: [emerg] unexpected end of file, expecting "}" in ${path}:${lines.length}` };
    }
    return { ports: [...new Set(sites.map((s) => s.port))], sites };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function journalTime(t: number): string {
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function journalLine(e: JournalEntry): string {
  return `${journalTime(e.t)} ${e.host} ${e.ident}${e.pid ? `[${e.pid}]` : ""}: ${e.msg}`;
}
