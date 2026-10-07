// Processes and the computer's resources: ps, top, htop, kill, pgrep, pkill, killall, jobs, fg,
// bg, nohup, free, uptime, df, du and who (Module 24, and later the server lessons).
import type { Command, ResolvedCommandContext } from "just-bash";
import type { Job, Machine } from "../machine";
import { type Proc, SIGNALS, clockTime, signalName } from "../procs";
import { USER, fail, join, ok, parseArgs } from "../util";
import { needPackage } from "./apt";

const cmd = (name: string, execute: Command["execute"]): Command => ({ name, execute });
const tty = (ctx: ResolvedCommandContext) => ctx.env.get("MP_TTY") === "1";

// ----- ps -----

function statFlags(p: Proc): string {
  let s = p.state;
  if (p.pid === 1 || p.cmd === "-bash" || /^sshd: .*listener/.test(p.cmd) || /master process/.test(p.cmd) || p.comm === "cron") s += "s";
  if (p.comm === "node") s += "l";
  if (p.comm === "ps" || p.comm === "grep") s += "+";
  return s;
}

const cpuTime = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

type Column = { head: string; width: number; left?: boolean; get: (p: Proc) => string };

const COLUMNS: Record<string, Column> = {
  pid: { head: "PID", width: 7, get: (p) => String(p.pid) },
  ppid: { head: "PPID", width: 7, get: (p) => String(p.ppid) },
  user: { head: "USER", width: 8, left: true, get: (p) => p.user },
  "%cpu": { head: "%CPU", width: 4, get: (p) => p.cpu.toFixed(1) },
  "%mem": { head: "%MEM", width: 4, get: (p) => p.mem.toFixed(1) },
  rss: { head: "RSS", width: 5, get: (p) => String(p.rss) },
  vsz: { head: "VSZ", width: 6, get: (p) => String(p.vsz) },
  stat: { head: "STAT", width: 4, left: true, get: statFlags },
  tty: { head: "TT", width: 8, left: true, get: (p) => p.tty },
  start: { head: "STARTED", width: 5, get: (p) => p.start },
  time: { head: "TIME", width: 8, get: (p) => cpuTime(p.time) },
  comm: { head: "COMMAND", width: 0, left: true, get: (p) => p.comm },
  cmd: { head: "CMD", width: 0, left: true, get: (p) => p.cmd },
  command: { head: "COMMAND", width: 0, left: true, get: (p) => p.cmd },
  args: { head: "COMMAND", width: 0, left: true, get: (p) => p.cmd },
};

function sortProcs(list: Proc[], spec: string): Proc[] {
  const desc = spec.startsWith("-");
  const key = spec.replace(/^[-+]/, "").toLowerCase();
  const val = (p: Proc): number | string => (key === "%cpu" || key === "pcpu" ? p.cpu : key === "%mem" || key === "pmem" ? p.mem : key === "rss" ? p.rss : key === "pid" ? p.pid : key === "user" ? p.user : p.pid);
  return [...list].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = x < y ? -1 : x > y ? 1 : a.pid - b.pid;
    return desc ? -c : c;
  });
}

async function psCommand(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  await m.reapJobs();
  let list = await m.procs.list();
  const me = m.perms.root ? "root" : USER;
  // `ps aux | grep sleep` also finds the grep itself, which surprises everyone once.
  const line = ctx.env.get("MP_LINE") ?? "";
  const grepped = /\|\s*grep\s+(?:-\w+\s+)*("[^"]+"|'[^']+'|\S+)/.exec(line)?.[1]?.replace(/^["']|["']$/g, "");
  const extra = async (): Promise<Proc[]> => {
    const next = await m.procs.peekPid();
    const self: Proc = { pid: next, ppid: 1001, user: me, comm: "ps", cmd: `ps ${args.join(" ")}`.trim(), state: "R", cpu: 0, mem: 0, rss: 4352, vsz: 11320, start: clockTime(m.now()), time: "0:00", tty: "pts/0" };
    const out = [self];
    if (grepped) out.push({ ...self, pid: next + 1, comm: "grep", cmd: `grep --color=auto ${grepped}`, state: "S", rss: 2304, vsz: 6544 });
    return out;
  };
  const sortSpec = args.find((a) => a.startsWith("--sort="))?.slice(7) ?? (args.includes("--sort") ? args[args.indexOf("--sort") + 1] : undefined);
  const plain = args.filter((a) => !a.startsWith("--sort") && a !== sortSpec);
  const bsd = plain.length === 1 && /^[aux]+$/.test(plain[0]) && plain[0].includes("x");
  const { flags, values, operands } = parseArgs(plain.filter((a) => !/^[aux]+$/.test(a)), "upoC");
  if (bsd || flags.has("e") || flags.has("A")) {
    list = [...list, ...(await extra())];
    if (sortSpec) list = sortProcs(list, sortSpec);
    if (bsd && plain[0].includes("u")) {
      const rows = list.map(
        (p) =>
          `${(p.user.length > 8 ? `${p.user.slice(0, 7)}+` : p.user).padEnd(8)}${String(p.pid).padStart(8)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(p.vsz).padStart(6)} ${String(p.rss).padStart(5)} ${p.tty.padEnd(8)} ${statFlags(p).padEnd(4)} ${p.start.padStart(5)} ${p.time.padStart(6)} ${p.cmd}`,
      );
      return ok(`USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n${rows.join("\n")}\n`);
    }
    if (flags.has("f")) {
      const rows = list.map((p) => `${(p.user.length > 8 ? `${p.user.slice(0, 7)}+` : p.user).padEnd(8)}${String(p.pid).padStart(8)}${String(p.ppid).padStart(8)}  ${p.cpu >= 1 ? Math.round(p.cpu) : 0} ${p.start.padEnd(5)} ${p.tty.padEnd(8)} ${cpuTime(p.time)} ${p.cmd}`);
      return ok(`UID          PID    PPID  C STIME TTY          TIME CMD\n${rows.join("\n")}\n`);
    }
  } else if (values.u !== undefined) list = [...list, ...(await extra())].filter((p) => values.u.split(",").includes(p.user));
  else if (values.p !== undefined) {
    const pids = values.p.split(",").map(Number);
    list = list.filter((p) => pids.includes(p.pid));
    if (!list.length && values.o === undefined) return { stdout: "    PID TTY          TIME CMD\n", stderr: "", exitCode: 1 };
  } else if (values.C !== undefined) list = list.filter((p) => p.comm === values.C);
  else list = [...list.filter((p) => p.tty === "pts/0" && p.user === USER), ...(await extra())];
  if (sortSpec) list = sortProcs(list, sortSpec);
  if (values.o !== undefined) {
    const cols = values.o.split(",").map((c) => c.trim().replace(/=$/, "").toLowerCase());
    const known = cols.map((c) => COLUMNS[c]);
    const bad = cols.find((c) => !COLUMNS[c]);
    if (bad) return fail(`error: unknown user-defined format specifier "${bad}"\n\nUsage:\n ps [options]\n\n Try 'ps --help <simple|list|output|threads|misc|all>'`);
    const cell = (c: Column, v: string, last: boolean) => (last && c.left ? v : c.left ? v.padEnd(c.width) : v.padStart(c.width));
    const head = known.map((c, i) => cell(c, c.head, i === known.length - 1)).join(" ");
    const rows = list.map((p) => known.map((c, i) => cell(c, c.get(p), i === known.length - 1)).join(" "));
    return ok(`${head}\n${rows.join("\n")}${rows.length ? "\n" : ""}`);
  }
  void operands;
  const rows = list.map((p) => `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${cpuTime(p.time)} ${p.comm}`);
  return ok(`    PID TTY          TIME CMD\n${rows.join("\n")}\n`);
}

// ----- top and htop -----

async function topText(m: Machine): Promise<string> {
  const list = sortProcs(await m.procs.list(), "-%cpu");
  const now = m.now();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const clock = `${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}`;
  const busy = list.reduce((s, p) => s + p.cpu, 0);
  const load = busy > 50 ? "1.02, 0.97, 0.88" : "0.08, 0.05, 0.01";
  const running = list.filter((p) => p.state === "R").length;
  const stopped = list.filter((p) => p.state === "T").length;
  const us = Math.min(99, busy / 2).toFixed(1);
  const used = 679.3 + list.reduce((s, p) => s + p.rss, 0) / 1024 / 4;
  const head =
    `top - ${clock} up 3 days,  1:28,  1 user,  load average: ${load}\n` +
    `Tasks: ${String(list.length).padStart(3)} total, ${String(running).padStart(3)} running, ${String(list.length - running - stopped).padStart(3)} sleeping, ${String(stopped).padStart(3)} stopped,   0 zombie\n` +
    `%Cpu(s): ${us.padStart(4)} us,  0.4 sy,  0.0 ni, ${(100 - Number(us) - 0.5).toFixed(1).padStart(4)} id,  0.0 wa,  0.0 hi,  0.1 si,  0.0 st\n` +
    `MiB Mem :   3911.4 total,   ${(3911.4 - used - 1260.6).toFixed(1)} free,    ${used.toFixed(1)} used,   1260.6 buff/cache\n` +
    `MiB Swap:      0.0 total,      0.0 free,      0.0 used.   ${(3911.4 - used).toFixed(1)} avail Mem\n\n`;
  const rows = list.map((p) => {
    const res = String(p.rss).padStart(7);
    return `${String(p.pid).padStart(7)} ${p.user.slice(0, 8).padEnd(8)}  20   0 ${String(p.vsz).padStart(7)} ${res} ${String(Math.round(p.rss * 0.6)).padStart(6)} ${p.state}  ${p.cpu.toFixed(1).padStart(4)}  ${p.mem.toFixed(1).padStart(4)}   ${p.time.padStart(4)}.00 ${p.comm}`;
  });
  return `${head}    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n${rows.join("\n")}\n`;
}


// ----- kill and friends -----

type Target = { pid: number; label: string; job?: Job };

async function deliver(m: Machine, t: Target, sig: string): Promise<string | undefined> {
  const p = await m.procs.get(t.pid);
  if (!p) return `bash: kill: (${t.label}) - No such process`;
  const me = m.perms.root ? "root" : USER;
  if (me !== "root" && p.user !== me) return `bash: kill: (${t.label}) - Operation not permitted`;
  if (p.pid === 1) return `bash: kill: (1) - Operation not permitted`;
  if (p.pid === 1001) return undefined; // your own shell: a real terminal would close; this one stays.
  const job = t.job ?? m.jobs.find((j) => j.pid === p.pid);
  const now = Math.floor(m.now().getTime() / 1000);
  if (sig === "STOP" || sig === "TSTP") {
    await m.procs.update(p.pid, { state: "T", endsAt: undefined });
    if (job) {
      if (p.endsAt !== undefined) job.left = Math.max(0, p.endsAt - now);
      job.state = "Stopped";
      job.told = false;
    }
    return undefined;
  }
  if (sig === "CONT") {
    if (p.state === "T") await m.procs.update(p.pid, { state: "S", endsAt: job?.left !== undefined ? now + job.left : undefined });
    if (job && job.state === "Stopped") job.state = "Running";
    return undefined;
  }
  if (p.ignoreTerm && sig !== "KILL") return undefined;
  // The process ends, and so do the processes it started (an nginx master takes its workers).
  for (const c of await m.procs.list()) if (c.ppid === p.pid) await m.procs.remove(c.pid);
  if (job) await m.endJob(job, sig === "KILL" ? "Killed" : "Terminated");
  else await m.procs.remove(p.pid);
  return undefined;
}

function jobByspec(m: Machine, spec: string): Job | undefined {
  const live = m.jobs.filter((j) => j.state === "Running" || j.state === "Stopped");
  if (spec === "%" || spec === "%%" || spec === "%+" || spec === "") return live.at(-1);
  if (spec === "%-") return live.at(-2);
  const n = /^%(\d+)$/.exec(spec)?.[1];
  if (n) return live.find((j) => j.n === Number(n));
  const name = spec.replace(/^%\??/, "");
  return live.find((j) => (spec.startsWith("%?") ? j.cmd.includes(name) : j.cmd.startsWith(name)));
}

function parseSignal(args: string[]): { sig: string; rest: string[] } | { error: string } {
  const rest = [...args];
  let sig = "TERM";
  if (rest[0] === "-s" || rest[0] === "-n") {
    rest.shift();
    const s = signalName(rest.shift() ?? "");
    if (!s) return { error: "invalid signal specification" };
    sig = s;
  } else if (rest[0] && /^-[A-Za-z0-9]+$/.test(rest[0]) && rest[0] !== "-l") {
    const s = signalName(rest[0].slice(1));
    if (!s) return { error: `${rest[0].slice(1)}: invalid signal specification` };
    sig = s;
    rest.shift();
  }
  if (rest[0] === "--") rest.shift();
  return { sig, rest };
}

function matcher(pattern: string, full: boolean, exact: boolean) {
  let re: RegExp;
  try {
    re = new RegExp(exact ? `^(?:${pattern})$` : pattern);
  } catch {
    re = /$^/;
  }
  return (p: Proc) => p.pid !== 1001 && p.pid !== 1 && re.test(full ? p.cmd : p.comm);
}

export function systemCommands(m: Machine): Command[] {
  return [
    cmd("ps", (args, ctx) => psCommand(m, args, ctx)),

    cmd("top", async (args, ctx) => {
      const text = await topText(m);
      if (m.interactive && tty(ctx) && !args.includes("-b")) {
        await m.page(text, "top (press q to quit)");
        return ok();
      }
      return ok(text);
    }),

    cmd("htop", async (_args, ctx) => {
      const missing = await needPackage(m, "htop");
      if (missing) return missing;
      const list = sortProcs(await m.procs.list(), "-%cpu");
      const busy = list.reduce((s, p) => s + p.cpu, 0);
      const bar = (pct: number) => `[${"|".repeat(Math.round(pct / 4)).padEnd(25)}${pct.toFixed(1).padStart(5)}%]`;
      const head = `    0${bar(Math.min(100, busy))}   Tasks: ${list.length}, 0 thr; ${list.filter((p) => p.state === "R").length} running\n    1${bar(1.3)}   Load average: ${busy > 50 ? "1.02 0.97 0.88" : "0.08 0.05 0.01"}\n  Mem${bar(17.4).replace("%]", "%]")}   Uptime: 3 days, 01:28:14\n  Swp[${" ".repeat(25)}  0K/0K]\n\n`;
      const rows = list.map((p) => `${String(p.pid).padStart(7)} ${p.user.slice(0, 9).padEnd(9)} 20   0 ${String(p.vsz).padStart(6)} ${String(p.rss).padStart(6)} ${p.state} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(4)} ${p.time.padStart(7)} ${p.cmd}`);
      const text = `${head}    PID USER      PRI  NI   VIRT    RES S  CPU% MEM%   TIME+  Command\n${rows.join("\n")}\n\nF1Help  F2Setup  F3Search F4Filter F5Tree  F6SortBy F7Nice  F8Nice  F9Kill  F10Quit\n`;
      if (m.interactive && tty(ctx)) {
        await m.page(text, "htop (press q to quit; to kill a process here, use kill in the terminal)");
        return ok();
      }
      return ok(text);
    }),

    cmd("kill", async (args) => {
      if (args[0] === "-l" || args[0] === "-L") {
        if (args[1]) {
          const s = signalName(args[1]);
          return s ? ok(`${/^\d+$/.test(args[1]) ? s : SIGNALS[s]}\n`) : fail(`bash: kill: ${args[1]}: invalid signal specification`);
        }
        return ok(" 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1\n11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM\n16) SIGSTKFLT\t17) SIGCHLD\t18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP\n");
      }
      const parsed = parseSignal(args);
      if ("error" in parsed) return fail(`bash: kill: ${parsed.error}\nkill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]`);
      if (!parsed.rest.length) return fail("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]", 2);
      await m.reapJobs();
      let err = "";
      for (const a of parsed.rest) {
        if (a.startsWith("%")) {
          const j = jobByspec(m, a);
          if (!j) {
            err += `bash: kill: ${a}: no such job\n`;
            continue;
          }
          const e = await deliver(m, { pid: j.pid, label: a, job: j }, parsed.sig);
          if (e) err += `${e}\n`;
          continue;
        }
        if (!/^-?\d+$/.test(a)) {
          err += `bash: kill: ${a}: arguments must be process or job IDs\n`;
          continue;
        }
        const e = await deliver(m, { pid: Number(a), label: a }, parsed.sig);
        if (e) err += `${e}\n`;
      }
      return { stdout: "", stderr: err, exitCode: err ? 1 : 0 };
    }),

    cmd("pgrep", async (args) => {
      const { flags, values, operands } = parseArgs(args, "u");
      if (!operands[0]) return fail("pgrep: no matching criteria specified\nTry `pgrep --help' for more information.", 2);
      const match = matcher(operands[0], flags.has("f"), flags.has("x"));
      const list = (await m.procs.list()).filter((p) => match(p) && (values.u === undefined || values.u.split(",").includes(p.user)));
      if (!list.length) return { stdout: "", stderr: "", exitCode: 1 };
      return ok(list.map((p) => (flags.has("a") ? `${p.pid} ${p.cmd}` : flags.has("l") ? `${p.pid} ${p.comm}` : String(p.pid))).join("\n") + "\n");
    }),

    cmd("pkill", async (args) => {
      const parsed = parseSignal(args);
      if ("error" in parsed) return fail(`pkill: ${parsed.error}`);
      const { flags, values, operands } = parseArgs(parsed.rest, "u");
      if (!operands[0]) return fail("pkill: no matching criteria specified\nTry `pkill --help' for more information.", 2);
      const match = matcher(operands[0], flags.has("f"), flags.has("x"));
      const list = (await m.procs.list()).filter((p) => match(p) && (values.u === undefined || values.u.split(",").includes(p.user)));
      if (!list.length) return { stdout: "", stderr: "", exitCode: 1 };
      let err = "";
      for (const p of list) {
        const e = await deliver(m, { pid: p.pid, label: String(p.pid) }, parsed.sig);
        if (e) err += `pkill: killing pid ${p.pid} failed: Operation not permitted\n`;
      }
      return { stdout: "", stderr: err, exitCode: err ? 1 : 0 };
    }),

    cmd("killall", async (args) => {
      const parsed = parseSignal(args);
      if ("error" in parsed) return fail(`killall: ${parsed.error}`);
      const names = parsed.rest.filter((a) => !a.startsWith("-"));
      if (!names.length) return fail("Usage: killall [OPTION]... [--] NAME...", 1);
      let err = "";
      for (const n of names) {
        const list = (await m.procs.list()).filter((p) => p.comm === n && p.pid !== 1001);
        if (!list.length) err += `${n}: no process found\n`;
        for (const p of list) {
          const e = await deliver(m, { pid: p.pid, label: String(p.pid) }, parsed.sig);
          if (e) err += `${n}(${p.pid}): Operation not permitted\n`;
        }
      }
      return { stdout: "", stderr: err, exitCode: err ? 1 : 0 };
    }),

    cmd("jobs", async (args) => {
      await m.reapJobs();
      const { flags } = parseArgs(args);
      let out = "";
      for (const j of m.jobs) {
        if (flags.has("p")) out += `${j.pid}\n`;
        else out += `${m.jobLine(j, flags.has("l"))}\n`;
        if (j.state !== "Running" && j.state !== "Stopped") j.told = true;
      }
      m.jobs = m.jobs.filter((j) => j.state === "Running" || j.state === "Stopped");
      return ok(out);
    }),

    cmd("fg", async (args, ctx) => {
      await m.reapJobs();
      const j = jobByspec(m, args[0] ?? "");
      if (!j) return fail(`bash: fg: ${args[0] ?? "current"}: no such job`);
      const p = await m.procs.get(j.pid);
      const now = Math.floor(m.now().getTime() / 1000);
      const left = j.state === "Stopped" ? (j.left ?? 0) : p?.endsAt !== undefined ? Math.max(0, p.endsAt - now) : undefined;
      j.state = "Running";
      j.told = true;
      await m.procs.update(j.pid, { state: "S", endsAt: undefined });
      m.foreground = j;
      const line = left !== undefined && /^(nohup\s+)?sleep\s/.test(j.cmd) ? `sleep ${left}` : j.cmd;
      const r = await ctx.exec!(line, { cwd: ctx.cwd, env: Object.fromEntries(ctx.env) });
      return { stdout: `${j.cmd}\n${r.stdout}`, stderr: r.stderr, exitCode: r.exitCode };
    }),

    cmd("bg", async (args) => {
      await m.reapJobs();
      const j = jobByspec(m, args[0] ?? "");
      if (!j) return fail(`bash: bg: ${args[0] ?? "current"}: no such job`);
      if (j.state === "Running") return fail(`bash: bg: job ${j.n} already in background`);
      const now = Math.floor(m.now().getTime() / 1000);
      j.state = "Running";
      j.told = true;
      await m.procs.update(j.pid, { state: "S", endsAt: j.left !== undefined ? now + j.left : undefined });
      const mark = m.jobs.filter((x) => x.state === "Running" || x.state === "Stopped").at(-1) === j ? "+" : "-";
      return ok(`[${j.n}]${mark} ${j.cmd} &\n`);
    }),

    cmd("nohup", async (args, ctx) => {
      if (!args.length) return fail("nohup: missing operand\nTry 'nohup --help' for more information.", 125);
      const quoted = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ");
      const r = await ctx.exec!(`${quoted} >> nohup.out 2>&1`, { cwd: ctx.cwd, env: Object.fromEntries(ctx.env) });
      return { stdout: "", stderr: `nohup: ignoring input and appending output to 'nohup.out'\n${r.stderr}`, exitCode: r.exitCode };
    }),

    cmd("free", async (args) => {
      const { flags } = parseArgs(args);
      if (flags.has("h"))
        return ok("               total        used        free      shared  buff/cache   available\nMem:           3.8Gi       679Mi       2.2Gi       1.1Mi       1.2Gi       3.1Gi\nSwap:             0B          0B          0B\n");
      if (flags.has("m"))
        return ok("               total        used        free      shared  buff/cache   available\nMem:            3911         679        2211           1        1260        3140\nSwap:              0           0           0\n");
      return ok("               total        used        free      shared  buff/cache   available\nMem:         4005284      695612     2264112        1124     1290896     3215788\nSwap:              0           0           0\n");
    }),

    cmd("uptime", async (args) => {
      const now = m.now();
      const p2 = (n: number) => String(n).padStart(2, "0");
      const list = await m.procs.list();
      const busy = list.reduce((s, p) => s + p.cpu, 0) > 50;
      if (args.includes("-p")) return ok("up 3 days, 1 hour, 28 minutes\n");
      return ok(` ${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())} up 3 days,  1:28,  1 user,  load average: ${busy ? "1.02, 0.97, 0.88" : "0.08, 0.05, 0.01"}\n`);
    }),

    // For lesson set-ups only (root): start a pretend program, e.g.
    // practice-spawn --pid 4242 --user learner --cpu 97.5 --ignore-term -- /usr/local/bin/report-builder --all
    cmd("practice-spawn", async (args) => {
      if (!m.perms.root) return fail("bash: practice-spawn: command not found", 127);
      const dash = args.indexOf("--");
      const { values, long, flags } = parseArgs(dash >= 0 ? args.slice(0, dash) : args, "");
      void values;
      void flags;
      const opt = (k: string) => {
        const i = args.indexOf(`--${k}`);
        return i >= 0 && i < (dash >= 0 ? dash : args.length) ? args[i + 1] : undefined;
      };
      const cmdline = dash >= 0 ? args.slice(dash + 1).join(" ") : "";
      if (!cmdline) return fail("practice-spawn: give the command after --");
      const word = cmdline.split(" ")[0];
      const p = await m.procs.spawn({
        pid: opt("pid") ? Number(opt("pid")) : 0,
        ppid: Number(opt("ppid") ?? 1),
        user: opt("user") ?? "root",
        comm: (opt("comm") ?? word.split("/").pop()!).slice(0, 15),
        cmd: cmdline,
        state: opt("state") ?? (Number(opt("cpu") ?? 0) > 50 ? "R" : "S"),
        cpu: Number(opt("cpu") ?? 0),
        mem: Number(opt("mem") ?? 0.2),
        rss: Number(opt("rss") ?? 9000),
        vsz: Number(opt("vsz") ?? 22000),
        start: opt("start") ?? "08:12",
        time: opt("time") ?? (Number(opt("cpu") ?? 0) > 50 ? "52:17" : "0:00"),
        tty: opt("tty") ?? "?",
        ignoreTerm: long.includes("ignore-term"),
      });
      return ok(`${p.pid}\n`);
    }),
    cmd("nproc", async () => ok("2\n")),
    cmd("lsb_release", async (args) => {
      if (args.includes("-d")) return ok("Description:\tUbuntu 24.04.3 LTS\n");
      if (args.includes("-c")) return ok("Codename:\tnoble\n");
      return ok("Distributor ID:\tUbuntu\nDescription:\tUbuntu 24.04.3 LTS\nRelease:\t24.04\nCodename:\tnoble\n", "No LSB modules are available.\n");
    }),
    cmd("who", async () => ok(`${USER}  pts/0        2026-10-06 08:59 (10.0.2.2)\n`)),

    cmd("df", async (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const human = flags.has("h");
      const rows: [string, string, string, string, string, string][] = human
        ? [
            ["tmpfs", "392M", "1.1M", "391M", "1%", "/run"],
            ["/dev/sda1", "29G", "7.8G", "21G", "28%", "/"],
            ["tmpfs", "2.0G", "0", "2.0G", "0%", "/dev/shm"],
            ["tmpfs", "5.0M", "0", "5.0M", "0%", "/run/lock"],
            ["/dev/sda15", "105M", "6.1M", "99M", "6%", "/boot/efi"],
            ["tmpfs", "392M", "12K", "392M", "1%", "/run/user/1000"],
          ]
        : [
            ["tmpfs", "400528", "1124", "399404", "1%", "/run"],
            ["/dev/sda1", "30298176", "8126708", "22154852", "28%", "/"],
            ["tmpfs", "2002640", "0", "2002640", "0%", "/dev/shm"],
            ["tmpfs", "5120", "0", "5120", "0%", "/run/lock"],
            ["/dev/sda15", "106858", "6186", "100672", "6%", "/boot/efi"],
            ["tmpfs", "400528", "12", "400516", "1%", "/run/user/1000"],
          ];
      let shown = rows;
      if (operands.length) {
        shown = [];
        for (const o of operands) {
          const p = join(ctx.cwd, o.replace(/^~/, m.env.HOME ?? "/"));
          if (!(await m.perms.exists(p))) return fail(`df: ${o}: No such file or directory`);
          const best = [...rows].filter((r) => p === r[5] || p.startsWith(r[5] === "/" ? "/" : `${r[5]}/`)).sort((a, b) => b[5].length - a[5].length)[0];
          if (best && !shown.includes(best)) shown.push(best);
        }
      }
      const head: [string, string, string, string, string, string] = ["Filesystem", human ? "Size" : "1K-blocks", "Used", human ? "Avail" : "Available", "Use%", "Mounted on"];
      const w = [15, human ? 5 : 9, human ? 5 : 8, human ? 5 : 9, 4];
      const fmt = (r: string[]) => `${r[0].padEnd(w[0])}${r.slice(1, 5).map((c, i) => c.padStart(w[i + 1] + 1)).join("")} ${r[5]}`;
      return ok(`${fmt(head)}\n${shown.map(fmt).join("\n")}\n`);
    }),

    cmd("du", async (args, ctx) => {
      const { flags, long, values, operands } = parseArgs(args, "d");
      const human = flags.has("h") || long.includes("human-readable");
      const summary = flags.has("s") || long.includes("summarize");
      const all = flags.has("a") || long.includes("all");
      const depthOpt = values.d ?? long.find((l) => l.startsWith("max-depth="))?.slice(10);
      const maxDepth = summary ? 0 : depthOpt !== undefined ? Number(depthOpt) : Infinity;
      const size = (kb: number) => {
        if (!human) return String(kb);
        if (kb < 1024) return `${kb}K`;
        const units = ["M", "G", "T"];
        let v = kb / 1024;
        let u = 0;
        while (v >= 1024 && u < units.length - 1) {
          v /= 1024;
          u++;
        }
        return `${v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : Math.ceil(v)}${units[u]}`;
      };
      let out = "";
      let err = "";
      let total = 0;
      const walk = async (path: string, shown: string, depth: number): Promise<number> => {
        const st = await ctx.fs.lstat(path);
        if (!st.isDirectory) {
          const kb = Math.max(4, Math.ceil(st.size / 4096) * 4);
          if ((all && depth <= maxDepth) || depth === 0) out += `${size(kb)}\t${shown}\n`;
          return kb;
        }
        let kb = 4;
        if (!(await m.perms.can(path, "r"))) {
          err += `du: cannot read directory '${shown}': Permission denied\n`;
        } else {
          for (const n of (await ctx.fs.readdir(path)).sort()) kb += await walk(`${path}/${n}`.replace("//", "/"), `${shown}/${n}`.replace("//", "/"), depth + 1);
        }
        if (depth <= maxDepth) out += `${size(kb)}\t${shown}\n`;
        return kb;
      };
      for (const o of operands.length ? operands : ["."]) {
        const p = join(ctx.cwd, o.replace(/^~/, m.env.HOME ?? "/"));
        if (!(await m.perms.exists(p))) {
          err += `du: cannot access '${o}': No such file or directory\n`;
          continue;
        }
        total += await walk(p, o === "." || o === "/" ? o : o.replace(/\/$/, ""), 0);
      }
      if (flags.has("c")) out += `${size(total)}\ttotal\n`;
      return { stdout: out, stderr: err, exitCode: err ? 1 : 0 };
    }),
  ];
}

