// The practice computer's running programs (processes). Each one is a folder in /proc, the way
// Linux shows them: /proc/<pid>/cmdline and /proc/<pid>/status are the real files, and
// /proc/<pid>/stat holds what ps and top need (in our own format). Processes come from three
// places: the system itself (systemd, the learner's bash), services (systemctl, see units.ts)
// and the learner's background jobs (`sleep 600 &`).
import type { IFileSystem } from "just-bash";

export type Proc = {
  pid: number;
  ppid: number;
  user: string;
  /** The full command line, as ps aux shows it. */
  cmd: string;
  /** The program's short name, as top and pgrep show it. */
  comm: string;
  /** S sleeping, R running, T stopped, Z zombie. */
  state: string;
  cpu: number;
  mem: number;
  rss: number;
  vsz: number;
  start: string;
  time: string;
  tty: string;
  /** The service this process belongs to (nginx.service). */
  unit?: string;
  /** Ignores SIGTERM and SIGINT, so only kill -9 stops it. */
  ignoreTerm?: boolean;
  /** Ports this process listens on. */
  listen?: { port: number; addr: string; proto?: string }[];
  /** For a background `sleep`: when it finishes (seconds since 1970). */
  endsAt?: number;
};

export const PROC = "/proc";
const LAST_PID = "/proc/sys/kernel/ns_last_pid";

export class ProcTable {
  constructor(
    private fs: IFileSystem,
    private asRoot: <T>(fn: () => Promise<T>) => Promise<T>,
  ) {}

  async list(): Promise<Proc[]> {
    return this.asRoot(async () => {
      let names: string[] = [];
      try {
        names = await this.fs.readdir(PROC);
      } catch {
        return [];
      }
      const out: Proc[] = [];
      for (const n of names) {
        if (!/^\d+$/.test(n)) continue;
        try {
          out.push(JSON.parse(await this.fs.readFile(`${PROC}/${n}/stat`)) as Proc);
        } catch {
          /* not one of ours */
        }
      }
      return out.sort((a, b) => a.pid - b.pid);
    });
  }

  async get(pid: number): Promise<Proc | undefined> {
    return this.asRoot(async () => {
      try {
        return JSON.parse(await this.fs.readFile(`${PROC}/${pid}/stat`)) as Proc;
      } catch {
        return undefined;
      }
    });
  }

  async nextPid(): Promise<number> {
    return this.asRoot(async () => {
      let last = 4200;
      try {
        last = Number((await this.fs.readFile(LAST_PID)).trim()) || last;
      } catch {
        /* first one */
      }
      const pid = last + 1;
      await this.fs.mkdir("/proc/sys/kernel", { recursive: true });
      await this.fs.writeFile(LAST_PID, `${pid}\n`);
      return pid;
    });
  }

  /** The pid the next new process will get (without using it up). */
  async peekPid(): Promise<number> {
    return this.asRoot(async () => {
      try {
        return Number((await this.fs.readFile(LAST_PID)).trim()) + 1 || 4201;
      } catch {
        return 4201;
      }
    });
  }

  async write(p: Proc) {
    await this.asRoot(async () => {
      const dir = `${PROC}/${p.pid}`;
      await this.fs.mkdir(dir, { recursive: true });
      await this.fs.writeFile(`${dir}/cmdline`, `${p.cmd.split(" ").join("\0")}\0`);
      const states: Record<string, string> = { S: "S (sleeping)", R: "R (running)", T: "T (stopped)", Z: "Z (zombie)" };
      await this.fs.writeFile(`${dir}/status`, `Name:\t${p.comm}\nState:\t${states[p.state] ?? p.state}\nPid:\t${p.pid}\nPPid:\t${p.ppid}\nUid:\t${p.user}\nVmRSS:\t${p.rss} kB\n`);
      await this.fs.writeFile(`${dir}/stat`, JSON.stringify(p));
    });
  }

  /** Starts a process; fills in the pid if it's 0. */
  async spawn(p: Omit<Proc, "pid"> & { pid?: number }): Promise<Proc> {
    const proc = { ...p, pid: p.pid || (await this.nextPid()) } as Proc;
    await this.write(proc);
    return proc;
  }

  async remove(pid: number) {
    await this.asRoot(() => this.fs.rm(`${PROC}/${pid}`, { recursive: true, force: true }));
  }

  async update(pid: number, change: Partial<Proc>) {
    const p = await this.get(pid);
    if (p) await this.write({ ...p, ...change });
  }
}

export function clockTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// Signals by name and number, as `kill -l` lists the common ones.
export const SIGNALS: Record<string, number> = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, USR1: 10, USR2: 12, TERM: 15, CONT: 18, STOP: 19, TSTP: 20 };

export function signalName(s: string): string | undefined {
  const up = s.toUpperCase().replace(/^SIG/, "");
  if (/^\d+$/.test(up)) return Object.entries(SIGNALS).find(([, n]) => n === Number(up))?.[0];
  return up in SIGNALS ? up : undefined;
}
