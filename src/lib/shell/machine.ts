// The practice terminal's computer: a simulated Linux machine (just-bash plus the commands in
// ./commands) that remembers its current folder, variables and aliases between commands, the
// way a real terminal session does. The same class runs in the browser and in the content check.
import { Bash, InMemoryFs, MountableFs, getCommandNames, parse, serialize, type IFileSystem, type ScriptNode } from "just-bash";
import { customCommands, STUB_NAMES } from "./commands";
import { Repo } from "./git/repo";
import { PermissionError, Perms } from "./perms";
import { ProcTable, clockTime } from "./procs";
import { Services } from "./units";
import { installBase } from "./commands/apt";
import { HOME, HOST, SERVER_PASSWORD, USER, basename, join, pwHash, tildify } from "./util";
import { HOSTS_ROOT, SIM_HOSTS, type SimHost } from "./world";

// What a command needs from the page around the terminal: a full-screen pager (man, less), an
// editor (nano) and a yes/no question (rm -i). Without a page (the content check, replaying
// saved history) pagers print their text, the editor leaves the file alone and questions get "n".
export type ShellUi = {
  page: (text: string, title: string) => Promise<void>;
  edit: (path: string, content: string, editor: "nano" | "vim") => Promise<string | null>;
  ask: (question: string, secret?: boolean) => Promise<string>;
};

export type RunResult = { stdout: string; stderr: string; exitCode: number; echo?: string };

// What a session did, saved so a reload can rebuild the same machine: each command line, and
// each answer given to the page during it (text saved in the editor, a typed "y"), in order.
export type JournalEntry = { line: string } | { reply: string | null };

// just-bash blocks timers while a script runs (a sandbox measure), so keep our own references
// from before any script starts.
const later = globalThis.setTimeout.bind(globalThis);
const cancel = globalThis.clearTimeout.bind(globalThis);

const baseEnv = (host: string): Record<string, string> => ({
  HOME,
  USER,
  LOGNAME: USER,
  SHELL: "/bin/bash",
  HOSTNAME: host,
  PATH: "/usr/local/bin:/usr/bin:/bin",
  TERM: "xterm-256color",
  LANG: "en_US.UTF-8",
  EDITOR: "nano",
});

// Variables that belong to one command line and must not leak into the next.
const TRANSIENT = new Set(["MP_TTY", "MP_LINE", "BASH_COMMAND", "LINENO", "OPTIND"]);

const files = (host: string): Record<string, string> => ({
  "/etc/hostname": `${host}\n`,
  "/etc/hosts": `127.0.0.1\tlocalhost\n127.0.1.1\t${host}\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\n`,
  "/etc/os-release": `PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.3 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\n`,
  "/etc/passwd": `root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nsystemd-resolve:x:991:991:systemd Resolver:/:/usr/sbin/nologin\nsyslog:x:102:102::/nonexistent:/usr/sbin/nologin\nsshd:x:105:65534::/run/sshd:/usr/sbin/nologin\n${USER}:x:1000:1000:Learner:${HOME}:/bin/bash\n`,
  "/etc/group": `root:x:0:\nadm:x:4:syslog,${USER}\nsudo:x:27:${USER}\nwww-data:x:33:\nshadow:x:42:\nusers:x:100:\nsyslog:x:102:\ncrontab:x:107:\n${USER}:x:1000:\n`,
  "/etc/shadow": `root:*:20000:0:99999:7:::\ndaemon:*:20000:0:99999:7:::\nwww-data:*:20000:0:99999:7:::\nsyslog:*:20000:0:99999:7:::\nsshd:*:20000:0:99999:7:::\n${USER}:${pwHash(host === HOST ? "practice" : SERVER_PASSWORD)}:20000:0:99999:7:::\n`,
  "/etc/sudoers": "#\n# This file MUST be edited with the 'visudo' command as root.\n#\nDefaults\tenv_reset\nDefaults\tsecure_path=\"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\"\n\n# User privilege specification\nroot\tALL=(ALL:ALL) ALL\n\n# Members of the admin group may gain root privileges\n%admin ALL=(ALL) ALL\n\n# Allow members of group sudo to execute any command\n%sudo\tALL=(ALL:ALL) ALL\n\n@includedir /etc/sudoers.d\n",
  "/etc/shells": "/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/zsh\n/usr/bin/zsh\n",
  "/etc/ssh/sshd_config": "# This is the sshd server system-wide configuration file.  See sshd_config(5).\n\nInclude /etc/ssh/sshd_config.d/*.conf\n\n#Port 22\n#PermitRootLogin prohibit-password\n#PubkeyAuthentication yes\nPasswordAuthentication yes\nKbdInteractiveAuthentication no\nUsePAM yes\nX11Forwarding yes\nPrintMotd no\nSubsystem\tsftp\t/usr/lib/openssh/sftp-server\n",
  "/usr/lib/systemd/system/ssh.service": "[Unit]\nDescription=OpenBSD Secure Shell server\nDocumentation=man:sshd(8) man:sshd_config(5)\nAfter=network.target\n\n[Service]\nExecStart=/usr/sbin/sshd -D\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n",
  "/usr/lib/systemd/system/cron.service": "[Unit]\nDescription=Regular background program processing daemon\nDocumentation=man:cron(8)\n\n[Service]\nExecStart=/usr/sbin/cron -f -P\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n",
  "/etc/crontab": "# /etc/crontab: system-wide crontab\n# Unlike any other crontab you don't have to run the `crontab'\n# command to install the new version when you edit this file\n# and files in /etc/cron.d. These files also have username fields,\n# that none of the other crontabs do.\n\nSHELL=/bin/sh\n\n# m h dom mon dow user\tcommand\n17 *\t* * *\troot\tcd / && run-parts --report /etc/cron.hourly\n25 6\t* * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }\n",
  "/proc/cpuinfo": "processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) CPU @ 2.20GHz\ncpu MHz\t\t: 2199.998\ncache size\t: 56320 KB\ncpu cores\t: 2\n\nprocessor\t: 1\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) CPU @ 2.20GHz\ncpu MHz\t\t: 2199.998\ncache size\t: 56320 KB\ncpu cores\t: 2\n",
  "/proc/meminfo": "MemTotal:        4005284 kB\nMemFree:         2264112 kB\nMemAvailable:    3215788 kB\nBuffers:           52412 kB\nCached:           987616 kB\nSwapTotal:             0 kB\nSwapFree:              0 kB\n",
  "/proc/loadavg": "0.08 0.05 0.01 1/142 4200\n",
  "/proc/uptime": "264532.18 520011.37\n",
  "/var/log/syslog": "",
  "/var/log/auth.log": "",
  [`${HOME}/.bashrc`]: `# ~/.bashrc: read by bash when an interactive terminal opens.\n\n# Your aliases go here, for example:\n# alias ll='ls -alF'\n`,
  [`${HOME}/.profile`]: `# ~/.profile: read when you log in.\nif [ -f "$HOME/.bashrc" ]; then\n    . "$HOME/.bashrc"\nfi\n`,
});

const BUILTINS = ["cd", "alias", "unalias", "export", "source", "history", "exit", "type", "help", "read", "set", "unset", "shopt", "jobs", "fg", "bg", "kill", "wait"];
const GIT_SUBCOMMANDS = ["add", "blame", "branch", "checkout", "cherry-pick", "clean", "clone", "commit", "config", "describe", "diff", "fetch", "init", "log", "merge", "mv", "pull", "push", "rebase", "reflog", "remote", "reset", "restore", "revert", "rm", "show", "stash", "status", "switch", "tag"];

const DIRS = ["/etc/ssh", "/etc/systemd/system/multi-user.target.wants", "/usr/lib/systemd/system", "/var/log/journal", "/var/www", "/var/spool/cron/crontabs", "/var/lib/apt/lists", "/run", "/tmp", "/opt", "/root", "/usr/local/bin", "/usr/share", "/srv", "/proc/sys/kernel", HOME];

/** A job started from the shell: `sleep 600 &`, or a command paused with Ctrl+Z. */
export type Job = { n: number; pid: number; cmd: string; state: "Running" | "Stopped" | "Done" | "Terminated" | "Killed"; told: boolean; left?: number };

/** An open `ssh` session: lines typed go to the other computer until `exit`. */
type Session = { m: Machine; sim: SimHost; shown: string };

// A line ending in a lone & (outside quotes) runs in the background.
function backgroundPart(line: string): string | undefined {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"') i++;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "\\") i++;
    else if (c === "&" && line[i + 1] !== "&" && line[i - 1] !== "&" && line[i - 1] !== ">" && line[i + 1] !== ">" && !line.slice(i + 1).trim()) return line.slice(0, i).trim();
  }
  return undefined;
}

// Commands that change how the rest of the line runs, so a line using them runs in one piece.
const WHOLE_LINE = new Set(["exit", "logout", "return", "break", "continue", "set", "shopt", "alias", "unalias", "source", ".", "exec", "trap", "eval"]);

/**
 * `a; b || c` as its separate commands, each with the operator before it. just-bash collects a
 * line's normal output and its error messages separately, so a line run in one go shows every
 * error after all the output; running it piece by piece keeps them in the order they happened.
 * Undefined when the line is a single command, or something safer to run in one go.
 */
function splitLine(line: string): { op: string; text: string }[] | undefined {
  if (line.includes("\n") || line.includes("<<")) return undefined;
  let ast: ScriptNode;
  try {
    ast = parse(line);
  } catch {
    return undefined;
  }
  const pieces: { op: string; text: string }[] = [];
  for (const st of ast.statements) {
    if (st.background || st.deferredError) return undefined;
    for (const [i, p] of st.pipelines.entries()) {
      for (const c of p.commands) {
        if (c.type !== "SimpleCommand") return undefined;
        const name = c.name ? serialize({ type: "Script", statements: [{ type: "Statement", pipelines: [{ ...p, commands: [{ ...c, args: [], redirections: [], assignments: [] }] }], operators: [], background: false }] }) : "";
        if (WHOLE_LINE.has(name.replace(/^!\s*/, "").trim())) return undefined;
      }
      const text = serialize({ type: "Script", statements: [{ type: "Statement", pipelines: [p], operators: [], background: false }] });
      pieces.push({ op: i ? st.operators[i - 1] : ";", text });
    }
  }
  return pieces.length > 1 ? pieces : undefined;
}

// "sleep 600" or "sleep 2m": how many seconds a background sleep lasts.
function sleepSeconds(cmd: string): number | undefined {
  const m = /^(?:nohup\s+)?sleep\s+(\d+(?:\.\d+)?)([smhd]?)$/.exec(cmd.trim());
  if (!m) return undefined;
  return Number(m[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[m[2] || "s"] ?? 1);
}

export class Machine {
  readonly fs: IFileSystem;
  readonly perms: Perms;
  readonly bash: Bash;
  readonly procs: ProcTable;
  readonly services: Services;
  /** This computer's name: inkwell for the practice computer, shop for the web shop's server. */
  readonly host: string;
  /** The practice computer, when this is a server reached over ssh (questions and editors go through it). */
  readonly parent?: Machine;
  /** The servers this computer can reach, booted the first time they're used. */
  private servers = new Map<string, Machine>();
  private serverFs = new Map<string, IFileSystem>();
  /** The ssh session the learner is typing into, if any. */
  session?: Session;
  jobs: Job[] = [];
  /** Set by `fg` while a job runs in front again, so Ctrl+Z can pause the same job. */
  foreground?: Job;
  /** Background commands run instantly (their sleeps are skipped). */
  private fastSleep = false;
  /** Set while hidden checks run: nothing may ask the learner anything. */
  probing = false;
  /**
   * Answers and editor changes for the content check, which can't type into a question or an
   * editor: a solution line can end in `# answers: y n` or `# edit: 2s/pick/fixup/` (a sed
   * script applied to whatever the command opens in the editor).
   */
  scripted: { answers: string[]; edits: string[] } = { answers: [], edits: [] };
  env: Record<string, string>;
  history: string[] = [];
  journal: JournalEntry[] = [];
  ui?: ShellUi;
  /** Set while replaying saved history, so nothing asks or pauses. */
  quiet = false;
  /** Where the terminal starts (the set-up script's last folder); hidden checks run from here. */
  startCwd = HOME;
  /** The clock for commit dates and new files; fixed in the content check. */
  now: () => Date;
  private sudoNoticeShown = false;
  private clock?: { left: number; started: number; timer: ReturnType<typeof later>; limit: AbortController };
  private timedOutFlag = false;

  private timedOut(c: AbortController) {
    this.timedOutFlag = true;
    c.abort();
  }

  /** Pauses the 8-second limit while waiting for the learner (pager, editor, a question). */
  async waitForLearner<T>(fn: () => Promise<T>): Promise<T> {
    const c = this.clock;
    if (c) {
      cancel(c.timer);
      c.left -= Date.now() - c.started;
    }
    try {
      return await fn();
    } finally {
      if (c && this.clock === c) {
        c.started = Date.now();
        c.timer = later(() => this.timedOut(c.limit), Math.max(0, c.left));
      }
    }
  }

  /** Shows text in the full-screen pager (man, less, long git output). */
  page(text: string, title: string): Promise<void> {
    if (this.parent) return this.waitForLearner(() => this.parent!.page(text, title));
    return this.waitForLearner(() => this.ui!.page(text, title));
  }

  constructor(opts: { now?: () => Date; host?: string; raw?: IFileSystem; parent?: Machine } = {}) {
    this.now = opts.now ?? (() => new Date());
    this.host = opts.host ?? HOST;
    this.parent = opts.parent;
    this.env = { ...baseEnv(this.host), PWD: HOME, OLDPWD: HOME };
    let raw = opts.raw;
    if (!raw) {
      // The servers' own files live in /srv/hosts/<name>, each a separate file system.
      const base = new InMemoryFs();
      // A real folder under the mount points, so `mkdir /srv/www` works like elsewhere.
      base.mkdirSync(HOSTS_ROOT, { recursive: true });
      const top = new MountableFs({ base });
      for (const h of SIM_HOSTS) {
        const fs = new InMemoryFs();
        top.mount(`${HOSTS_ROOT}/${h.name}`, fs);
        this.serverFs.set(h.name, fs);
      }
      raw = top;
    }
    this.perms = new Perms(raw);
    this.fs = this.perms.wrap(raw);
    this.procs = new ProcTable(this.fs, (fn) => this.asRoot(fn));
    this.services = new Services(this);
    this.bash = new Bash({
      fs: this.fs,
      cwd: HOME,
      env: baseEnv(this.host),
      customCommands: customCommands(this),
      processInfo: { pid: 1001, ppid: 1000, uid: 1000, gid: 1000 },
      // Replaying a saved session shouldn't wait out its old `sleep 30`s.
      sleep: (ms) => (this.quiet || this.fastSleep || this.root.quiet ? Promise.resolve() : new Promise((done) => later(done, ms))),
      // The 8-second limit is our own (see run): it pauses while the learner reads a page or edits a file.
      executionLimits: { maxExecutionTimeMs: 3_600_000, maxLoopIterations: 100_000, maxCommandCount: 200_000 },
    });
  }

  /** A ready machine: the standard Linux folders, then the lesson's own set-up script (run as root). */
  static async create(setup = "", opts: { now?: () => Date } = {}): Promise<Machine> {
    const m = new Machine(opts);
    await m.install(false);
    if (setup.trim()) {
      const r = await m.asRoot(() => m.bash.exec(setup, { cwd: HOME, env: m.env, replaceEnv: true, rawScript: true }));
      if (r.exitCode !== 0) throw new Error(`the set-up script failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
      m.keep(r.env);
    }
    await m.startUp();
    // Like a new terminal window, read ~/.bashrc (so aliases saved there work).
    const rc = await m.bash.exec("shopt -s expand_aliases\nsource ~/.bashrc 2>/dev/null", { cwd: m.cwd, env: m.env, replaceEnv: true });
    m.keep(rc.env);
    m.env["?"] = "0";
    m.startCwd = m.cwd;
    return m;
  }

  /** The standard Linux files. A server keeps what a lesson's set-up already put in its folder. */
  private async install(keepExisting: boolean) {
    await this.asRoot(async () => {
      for (const d of DIRS) await this.fs.mkdir(d, { recursive: true });
      for (const [path, content] of Object.entries(files(this.host))) {
        if (keepExisting && (await this.perms.exists(path))) continue;
        await this.fs.mkdir(path.slice(0, path.lastIndexOf("/")) || "/", { recursive: true });
        await this.fs.writeFile(path, content);
      }
      await this.fs.chmod("/tmp", 0o1777);
      await this.fs.chmod("/root", 0o700);
      await this.fs.chmod("/etc/shadow", 0o640);
      await this.fs.chmod("/etc/sudoers", 0o440);
      this.perms.setOwner("/etc/shadow", "root", "shadow");
      for (const log of ["/var/log/syslog", "/var/log/auth.log"]) {
        await this.fs.chmod(log, 0o640);
        this.perms.setOwner(log, "syslog", "adm");
      }
      await this.fs.chmod("/var/spool/cron/crontabs", 0o1730);
      for (const unit of ["ssh.service", "cron.service"]) {
        const link = `/etc/systemd/system/multi-user.target.wants/${unit}`;
        if (!(await this.perms.exists(link))) await this.fs.symlink(`/usr/lib/systemd/system/${unit}`, link);
      }
      // Stubs so `which git` and `ls /usr/bin` find the commands this site adds.
      for (const name of STUB_NAMES) await this.fs.writeFile(`/usr/bin/${name}`, "#!/bin/sh\n# (built into the practice terminal)\n");
      // Programs are executable (just-bash leaves its own stubs at 644).
      for (const dir of ["/bin", "/usr/bin"]) for (const name of await this.fs.readdir(dir)) await this.fs.chmod(`${dir}/${name}`, 0o755);
      await installBase(this);
      // This computer's SSH host key (what known_hosts remembers about it).
      if (!(await this.perms.exists("/etc/ssh/ssh_host_ed25519_key.pub")))
        await this.fs.writeFile("/etc/ssh/ssh_host_ed25519_key.pub", `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${btoa(`practice-host-${this.host}-key-0001`).replace(/=+$/, "").padEnd(43, "A").slice(0, 43)} root@${this.host}\n`);
      // The first processes, with the low numbers a freshly booted computer has.
      await this.fs.writeFile("/proc/sys/kernel/ns_last_pid", "600\n");
      const base = { state: "S", cpu: 0, mem: 0.3, start: "Oct03", time: "0:04", tty: "?" };
      await this.procs.spawn({ ...base, pid: 1, ppid: 0, user: "root", comm: "systemd", cmd: "/sbin/init", rss: 12856, vsz: 22336 });
      await this.procs.spawn({ ...base, pid: 2, ppid: 0, user: "root", comm: "kthreadd", cmd: "[kthreadd]", rss: 0, vsz: 0, time: "0:00", mem: 0 });
      await this.procs.spawn({ ...base, pid: 412, ppid: 1, user: "root", comm: "systemd-journal", cmd: "/usr/lib/systemd/systemd-journald", rss: 15232, vsz: 50612 });
      await this.procs.spawn({
        ...base,
        pid: 520,
        ppid: 1,
        user: "systemd-resolve",
        comm: "systemd-resolve",
        cmd: "/usr/lib/systemd/systemd-resolved",
        rss: 12544,
        vsz: 21604,
        listen: [
          { port: 53, addr: "127.0.0.53%lo", proto: "udp" },
          { port: 53, addr: "127.0.0.53%lo", proto: "tcp" },
        ],
      });
    });
  }

  /** Boots the services, then opens the learner's login shell. */
  private async startUp() {
    await this.asRoot(async () => {
      await this.services.boot();
      await this.fs.writeFile("/proc/sys/kernel/ns_last_pid", "1000\n");
      await this.procs.spawn({ pid: 1001, ppid: 1000, user: USER, comm: "bash", cmd: "-bash", state: "S", cpu: 0, mem: 0.1, rss: 5376, vsz: 8820, start: "08:59", time: "0:00", tty: "pts/0" });
      await this.fs.writeFile("/proc/sys/kernel/ns_last_pid", "4200\n");
    });
  }

  private prepared = new Map<string, Machine>();

  /** A server's standard files, written once (a lesson's set-up then changes them as it likes). */
  async prepareServer(name: string): Promise<Machine | undefined> {
    const top = this.root;
    if (top !== this) return top.prepareServer(name);
    const found = this.prepared.get(name);
    if (found) return found;
    const raw = this.serverFs.get(name);
    if (!raw) return undefined;
    const s = new Machine({ now: this.now, host: name, raw, parent: this });
    await s.install(true);
    this.prepared.set(name, s);
    return s;
  }

  /** A server on the pretend network, booted from its folder the first time it's needed. */
  async server(name: string): Promise<Machine | undefined> {
    const top = this.root;
    if (top !== this) return top.server(name);
    const found = this.servers.get(name);
    if (found) return found;
    const s = await this.prepareServer(name);
    if (!s) return undefined;
    await s.startUp();
    const rc = await s.bash.exec("shopt -s expand_aliases\nsource ~/.bashrc 2>/dev/null", { cwd: HOME, env: s.env, replaceEnv: true });
    s.keep(rc.env);
    s.env["?"] = "0";
    this.servers.set(name, s);
    return s;
  }

  /** The practice computer itself (this one, unless this is a server). */
  get root(): Machine {
    return this.parent ?? this;
  }

  /** Runs a command on this computer without touching the learner's session (ssh host cmd). */
  async exec(cmd: string, stdin = ""): Promise<RunResult> {
    const r = await this.bash.exec(`shopt -s expand_aliases\n${cmd}`, { cwd: HOME, env: this.env, replaceEnv: true, stdin });
    return { stdout: r.stdout, stderr: r.stderr.replace(/^bash: line \d+: /gm, "bash: "), exitCode: r.exitCode };
  }

  get cwd() {
    return this.env.PWD || HOME;
  }

  prompt(): string {
    if (this.session) return this.session.m.prompt();
    return `${USER}@${this.host}:${tildify(this.cwd)}$ `;
  }

  async asRoot<T>(fn: () => Promise<T>): Promise<T> {
    this.perms.rootDepth++;
    try {
      return await fn();
    } finally {
      this.perms.rootDepth--;
    }
  }

  /** Shown once per session the first time sudo runs. */
  sudoNotice(): string {
    if (this.sudoNoticeShown || this.quiet || this.root.quiet || this.root.probing) return "";
    this.sudoNoticeShown = true;
    return `[sudo] password for ${USER}: (the practice computer doesn't ask for it)\n`;
  }

  private keep(env: Record<string, string>) {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) if (!TRANSIENT.has(k)) next[k] = v;
    this.env = next;
  }

  // One thing at a time: a command the learner typed and the hidden checks after it share the
  // machine's state (sudo, the 8-second clock), so each waits for the one before to finish.
  private turn: Promise<unknown> = Promise.resolve();

  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.turn.then(fn, fn);
    this.turn = next.catch(() => undefined);
    return next;
  }

  /** Runs one line the learner typed, the way an interactive bash would. */
  run(input: string, opts: { signal?: AbortSignal } = {}): Promise<RunResult> {
    return this.exclusive(() => this.runLine(input, opts));
  }

  private async runLine(input: string, opts: { signal?: AbortSignal }): Promise<RunResult> {
    const line = input.replace(/\s+$/, "");
    if (this.session) {
      const s = this.session;
      if (line.trim()) {
        if (!/^\s/.test(line)) this.history.push(line.trim());
        this.journal.push({ line: line.trim() });
      }
      if (/^\s*(exit|logout)(\s+\d+)?\s*$/.test(line)) {
        this.session = undefined;
        return { stdout: "logout\n", stderr: `Connection to ${s.shown} closed.\n`, exitCode: 0 };
      }
      return s.m.run(line, opts);
    }
    if (!line.trim()) return { stdout: "", stderr: "", exitCode: Number(this.env["?"] ?? 0) };

    const expanded = this.expandHistory(line);
    if ("error" in expanded) return { stdout: "", stderr: `bash: ${expanded.error}: event not found\n`, exitCode: 1 };
    const cmd = expanded.line;
    // Like bash, a line starting with a space stays out of the history.
    if (!/^\s/.test(line)) this.history.push(cmd);
    this.journal.push({ line: cmd });

    await this.registerPathPrograms();

    const bg = backgroundPart(cmd);
    if (bg !== undefined) {
      const r = await this.background(bg);
      return { ...r, echo: expanded.echo };
    }

    const pieces = splitLine(cmd);
    if (!pieces) return this.execLine(cmd, opts, expanded.echo);
    let text = "";
    let code = Number(this.env["?"] ?? 0);
    for (const p of pieces) {
      if ((p.op === "&&" && code !== 0) || (p.op === "||" && code === 0)) continue;
      const r = await this.execLine(p.text, opts);
      text += r.stdout + r.stderr;
      code = r.exitCode;
      // Ctrl+C or Ctrl+Z stops the whole line, not just one command of it.
      if (code === 130 || code === 148) break;
    }
    this.env["?"] = String(code);
    return { stdout: text, stderr: "", exitCode: code, echo: expanded.echo };
  }

  /** Runs one command (or a line that has to run in one go) in the learner's shell. */
  private async execLine(cmd: string, opts: { signal?: AbortSignal }, echo?: string): Promise<RunResult> {
    // cd is part of bash itself, so check the simple `cd folder` here: entering a folder needs
    // its x (search) permission.
    const cdTo = /^\s*cd\s+(\S+)\s*$/.exec(cmd)?.[1];
    if (cdTo && !this.perms.root) {
      const target = join(this.cwd, cdTo.replace(/^~(?=\/|$)/, HOME));
      if ((await this.perms.isDir(target)) && !(await this.perms.can(target, "x"))) {
        this.env["?"] = "1";
        return { stdout: "", stderr: `bash: cd: ${cdTo}: Permission denied\n`, exitCode: 1, echo };
      }
    }

    // ls prints columns on screen but one name per line into a pipe or a file. A command can't
    // see where its output goes, so guess from the line: no pipe, redirect or substitution.
    const tty = !/[|>`]|\$\(/.test(cmd);
    // Stop a command that computes for more than 8 seconds (an endless loop), not counting time
    // spent waiting for the learner in the pager or the editor.
    const limit = new AbortController();
    const stop = () => limit.abort();
    opts.signal?.addEventListener("abort", stop);
    this.clock = { left: 8000, started: Date.now(), timer: later(() => this.timedOut(limit), 8000), limit };
    let r;
    try {
      // $? is the previous line's exit code: set it with a subshell that exits with that code.
      const prev = Number(this.env["?"] ?? 0);
      r = await this.bash.exec(`shopt -s expand_aliases\n${prev ? `(exit ${prev})\n` : ""}${cmd}`, {
        cwd: this.cwd,
        env: tty ? { ...this.env, MP_TTY: "1", MP_LINE: cmd } : { ...this.env, MP_LINE: cmd },
        replaceEnv: true,
        signal: limit.signal,
      });
    } catch (e) {
      // A redirect into a file the learner may not write (`echo hi > /etc/hosts`).
      if (e instanceof PermissionError || (e as { code?: string }).code === "EACCES") {
        const path = (e as PermissionError).path ?? "";
        this.env["?"] = "1";
        return { stdout: "", stderr: `bash: ${path ? tildify(path).replace(`${this.cwd}/`, "") : basename(cmd)}: Permission denied\n`, exitCode: 1, echo };
      }
      const msg = (e as Error).message || String(e);
      this.env["?"] = "1";
      return { stdout: "", stderr: `bash: ${msg}\n`, exitCode: 1, echo };
    } finally {
      if (this.clock) cancel(this.clock.timer);
      this.clock = undefined;
      opts.signal?.removeEventListener("abort", stop);
    }
    if (limit.signal.aborted) {
      const timedOut = this.timedOutFlag;
      this.timedOutFlag = false;
      const fgJob = this.foreground;
      this.foreground = undefined;
      // Ctrl+Z: the command is paused and becomes a stopped job (exit status 148).
      if (!timedOut && opts.signal?.reason === "stop") {
        const job = fgJob ?? (await this.newJob(cmd, sleepSeconds(cmd)));
        job.state = "Stopped";
        job.told = true;
        if (!this.jobs.includes(job)) this.jobs.push(job);
        await this.procs.update(job.pid, { state: "T" });
        this.env["?"] = "148";
        return { stdout: r.stdout, stderr: `^Z\n${this.jobLine(job)}\n`, exitCode: 148, echo };
      }
      if (fgJob) await this.endJob(fgJob, "Done", true);
      // Ctrl+C: bash prints ^C and gives the prompt back (exit status 130).
      this.env["?"] = "130";
      const isSleep = sleepSeconds(cmd) !== undefined || (fgJob && sleepSeconds(fgJob.cmd) !== undefined);
      return {
        stdout: r.stdout,
        stderr: timedOut
          ? isSleep
            ? `\n(The practice terminal stops a command after 8 seconds. A real terminal would keep waiting: press Ctrl+C to cancel, or Ctrl+Z to pause it.)\n`
            : `\nbash: stopped after 8 seconds (an endless loop?). The practice terminal stops long-running commands.\n`
          : "^C\n",
        exitCode: 130,
        echo: echo,
      };
    }
    // just-bash's safety limits speak to programmers; say it the way the course does. And an
    // interactive bash doesn't number lines in its errors.
    const stderr = r.stderr
      .replace(/^bash: line \d+: /gm, "bash: ").replace(/^.*(?:too many|maximum|exceeded|increase executionLimits).*$/gim, "bash: stopped: this command ran too long (an endless loop?). The practice terminal stops long-running commands.");
    r = { ...r, stderr: await this.deniedRedirects(stderr) };
    this.keep(r.env);
    this.env["?"] = String(r.exitCode);
    if (this.foreground) {
      await this.endJob(this.foreground, "Done", true);
      this.foreground = undefined;
    }
    // Jobs that finished or were stopped meanwhile are reported before the next prompt.
    const notes = await this.jobNotices();
    // bash forgets a folder that no longer exists only when you leave it; just-bash may reset it.
    // sudo asks for the password before the command runs, so its notice comes first on screen.
    const notice = /^\[sudo\] password for .*\n/m.exec(r.stderr)?.[0] ?? "";
    return { stdout: notice + r.stdout, stderr: r.stderr.replace(notice, "") + notes, exitCode: r.exitCode, echo };
  }

  // just-bash reports any input redirect it can't open (`cat < /etc/shadow`) as a missing file.
  private async deniedRedirects(stderr: string): Promise<string> {
    let out = stderr;
    for (const [whole, f] of stderr.matchAll(/^bash: (.+): No such file or directory$/gm)) {
      const p = join(this.cwd, f.replace(/^~(?=\/|$)/, HOME));
      if ((await this.perms.exists(p)) && !(await this.perms.can(p, "r"))) out = out.replace(whole, `bash: ${f}: Permission denied`);
    }
    return out;
  }

  // ----- jobs -----

  private async newJob(cmd: string, seconds?: number): Promise<Job> {
    const n = Math.max(0, ...this.jobs.map((j) => j.n)) + 1;
    const now = this.now();
    const word = cmd.trim().replace(/^nohup\s+/, "").split(/\s+/)[0] ?? "bash";
    const proc = await this.procs.spawn({
      ppid: 1001,
      user: this.perms.root ? "root" : USER,
      comm: basename(word).slice(0, 15),
      cmd: cmd.trim().replace(/^nohup\s+/, ""),
      state: "S",
      cpu: 0,
      mem: 0,
      rss: 1792,
      vsz: 5688,
      start: clockTime(now),
      time: "0:00",
      tty: "pts/0",
      endsAt: seconds !== undefined ? Math.floor(now.getTime() / 1000) + seconds : undefined,
    });
    return { n, pid: proc.pid, cmd: cmd.trim(), state: "Running", told: true };
  }

  /** `cmd &`: a background sleep keeps running; anything else runs now, as if very fast. */
  private async background(cmd: string): Promise<RunResult> {
    const seconds = sleepSeconds(cmd);
    const job = await this.newJob(cmd, seconds);
    this.jobs.push(job);
    let out = `[${job.n}] ${job.pid}\n`;
    let err = "";
    if (/^nohup\s/.test(cmd)) err += "nohup: ignoring input and appending output to 'nohup.out'\n";
    if (seconds === undefined) {
      this.fastSleep = true;
      try {
        const run = cmd.replace(/^nohup\s+(.*)$/, "$1 >> nohup.out 2>&1");
        const r = await this.bash.exec(`shopt -s expand_aliases\n${run}`, { cwd: this.cwd, env: this.env, replaceEnv: true });
        out += r.stdout;
        err += r.stderr.replace(/^bash: line \d+: /gm, "bash: ");
      } finally {
        this.fastSleep = false;
      }
      await this.endJob(job, "Done");
    }
    this.env["!"] = String(job.pid);
    this.env["?"] = "0";
    return { stdout: out, stderr: err + (await this.jobNotices()), exitCode: 0 };
  }

  async endJob(job: Job, how: "Done" | "Terminated" | "Killed", silent = false) {
    job.state = how;
    job.told = silent;
    await this.procs.remove(job.pid);
    if (silent) this.jobs = this.jobs.filter((j) => j !== job);
  }

  /** Background sleeps that have run out by now. */
  async reapJobs() {
    const now = Math.floor(this.now().getTime() / 1000);
    for (const j of this.jobs) {
      if (j.state !== "Running") continue;
      const p = await this.procs.get(j.pid);
      if (!p) {
        if (j.state === "Running") await this.endJob(j, "Terminated");
        continue;
      }
      if (p.endsAt !== undefined && p.endsAt <= now) await this.endJob(j, "Done");
    }
  }

  async jobNotices(): Promise<string> {
    await this.reapJobs();
    let out = "";
    for (const j of this.jobs) {
      if (j.told) continue;
      j.told = true;
      out += `${this.jobLine(j)}\n`;
    }
    this.jobs = this.jobs.filter((j) => j.state === "Running" || j.state === "Stopped");
    return out;
  }

  /** "[1]+  Stopped                 sleep 600", the way bash lists a job. */
  jobLine(j: Job, withPid = false): string {
    const live = this.jobs.filter((x) => x.state === "Running" || x.state === "Stopped" || x === j);
    const mark = live.at(-1) === j ? "+" : live.at(-2) === j ? "-" : " ";
    const cmd = j.state === "Running" ? `${j.cmd} &` : j.cmd;
    return `[${j.n}]${mark}  ${withPid ? `${j.pid} ` : ""}${j.state.padEnd(24)}${cmd}`;
  }

  // Programs the learner made (a script in ~/bin, say) run by name only once their folder is on
  // $PATH, like in a real shell. just-bash only knows its own commands, so before each line, every
  // executable file in a PATH folder outside the system ones becomes a command that runs it.
  private pathPrograms = new Set<string>();

  private async registerPathPrograms() {
    const known = new Set([...getCommandNames(), ...STUB_NAMES, ...BUILTINS]);
    for (const dir of (this.env.PATH ?? "").split(":")) {
      if (!dir || ["/usr/bin", "/bin", "/usr/local/bin"].includes(dir)) continue;
      let names: string[];
      try {
        names = await this.fs.readdir(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (known.has(name) || this.pathPrograms.has(name)) continue;
        this.pathPrograms.add(name);
        this.bash.registerCommand({
          name,
          execute: async (args, ctx) => {
            // Look the name up again: the file may be gone, or its folder off the PATH by now.
            for (const d of (ctx.env.get("PATH") ?? "").split(":")) {
              const file = join(d, name);
              if (!d || !(await this.perms.exists(file)) || (await this.perms.isDir(file))) continue;
              if (!(await this.perms.can(file, "x"))) return { stdout: "", stderr: `bash: ${file}: Permission denied\n`, exitCode: 126 };
              const quoted = [file, ...args].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ");
              return ctx.exec!(`bash ${quoted}`, { cwd: ctx.cwd, env: Object.fromEntries(ctx.env), stdin: ctx.stdin as unknown as string });
            }
            return { stdout: "", stderr: `bash: ${name}: command not found\n`, exitCode: 127 };
          },
        });
      }
    }
  }

  /** Runs hidden check commands (for grading) in a row, without touching history or the session. */
  probeAll(cmds: string[]): Promise<string[]> {
    return this.exclusive(async () => {
      const out: string[] = [];
      for (const c of cmds) out.push(await this.probe(c));
      return out;
    });
  }

  private async probe(cmd: string): Promise<string> {
    this.probing = true;
    try {
      const r = await this.bash.exec(`shopt -s expand_aliases\n${cmd}`, { cwd: this.startCwd, env: this.env, replaceEnv: true });
      return r.stdout + r.stderr;
    } finally {
      this.probing = false;
    }
  }

  // The editor and questions go through these, so their answers are saved with the session and
  // a replay gets the same answers without asking again.
  private replies: (string | null)[] = [];

  /** Opens the editor; resolves to the saved text, or null if the learner left without saving. */
  async edit(path: string, content: string, editor: "nano" | "vim" = "nano"): Promise<string | null> {
    if (this.parent) return this.waitForLearner(() => this.parent!.edit(path, content, editor));
    if (this.probing) return null;
    if (this.quiet) return this.replies.length ? (this.replies.shift() ?? null) : null;
    if (!this.ui) {
      const script = this.scripted.edits.shift();
      if (script === undefined) return null;
      return this.asRoot(async () => {
        await this.fs.writeFile("/tmp/.mp-edit", content);
        await this.bash.exec(`sed -i -e '${script.replace(/'/g, `'\\''`)}' /tmp/.mp-edit`, { cwd: "/" });
        const out = await this.fs.readFile("/tmp/.mp-edit");
        await this.fs.rm("/tmp/.mp-edit", { force: true });
        return out;
      });
    }
    const reply = await this.waitForLearner(() => this.ui!.edit(path, content, editor));
    this.journal.push({ reply });
    return reply;
  }

  /** Asks a question in the terminal (rm -i); "n" when there's no one to ask. */
  async ask(question: string, opts: { secret?: boolean; fallback?: string } = {}): Promise<string> {
    if (this.parent) return this.waitForLearner(() => this.parent!.ask(question, opts));
    const fallback = opts.fallback ?? "n";
    if (this.probing) return fallback;
    if (!this.ui && !this.quiet && this.scripted.answers.length) return this.scripted.answers.shift()!;
    if (this.quiet) return this.replies.length ? (this.replies.shift() ?? fallback) : fallback;
    if (!this.ui) return fallback;
    const reply = await this.waitForLearner(() => this.ui!.ask(question, opts.secret));
    // Saved as typed, passwords too: a replay must set the same password (`passwd`) and log in
    // with it (`ssh`). They're practice passwords on a pretend computer, and the lessons say so.
    this.journal.push({ reply });
    return reply;
  }

  /** Whether commands may open the pager or the editor (a page is attached and it's not a replay). */
  get interactive(): boolean {
    if (this.parent) return this.parent.interactive;
    return !!this.ui && !this.quiet && !this.probing;
  }

  /** Rebuilds a saved session without showing anything. */
  async replay(journal: JournalEntry[]) {
    this.quiet = true;
    try {
      for (let i = 0; i < journal.length; i++) {
        const e = journal[i];
        if (!("line" in e)) continue;
        this.replies = [];
        for (let j = i + 1; j < journal.length && !("line" in journal[j]); j++) this.replies.push((journal[j] as { reply: string | null }).reply);
        await this.runLine(e.line, {});
      }
      this.journal = [...journal];
    } finally {
      this.quiet = false;
      this.replies = [];
    }
  }

  /**
   * Tab completion for the text before the cursor: a command name in the first position, a git
   * subcommand or branch after "git", otherwise a file or folder. Returns the completed text, or
   * the choices to list when there's more than one.
   */
  async complete(before: string): Promise<{ text: string; options: string[] }> {
    if (this.session) return this.session.m.complete(before);
    const wordStart = Math.max(before.lastIndexOf(" "), before.lastIndexOf("|"), before.lastIndexOf(";"), before.lastIndexOf("&"), before.lastIndexOf(">")) + 1;
    const word = before.slice(wordStart);
    const head = before.slice(0, wordStart);
    const words = head.trim().split(/\s+/).filter(Boolean);
    const commandPosition = !head.trim() || /[|;&]\s*$/.test(head);
    let candidates: string[] = [];
    let isPath = false;
    if (commandPosition && !word.includes("/")) {
      const aliases = Object.keys(this.env)
        .filter((k) => k.startsWith("BASH_ALIAS_"))
        .map((k) => k.slice(11));
      candidates = [...new Set([...getCommandNames(), ...STUB_NAMES, ...BUILTINS, ...aliases])].filter((c) => c.startsWith(word)).sort();
    } else if (words[0] === "git" && words.length === 1) {
      candidates = GIT_SUBCOMMANDS.filter((c) => c.startsWith(word));
    } else if (words[0] === "git" && ["switch", "merge", "checkout", "branch", "rebase", "push", "log", "diff", "cherry-pick", "reset", "revert", "show"].includes(words[1]) && !word.includes("/")) {
      const repo = await Repo.find(this.fs, this.cwd, this.now);
      const refs = repo ? [...(await repo.listRefs("refs/heads")), ...(await repo.listRefs("refs/remotes"))] : [];
      const names = refs.map((r) => r.name.replace(/^refs\/(heads|remotes)\//, "")).filter((n) => !n.endsWith("/HEAD"));
      candidates = [...new Set(names)].filter((b) => b.startsWith(word)).sort();
      if (candidates.length === 0) isPath = true;
    } else isPath = true;
    if (isPath) {
      const slash = word.lastIndexOf("/");
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : "";
      const prefix = word.slice(slash + 1);
      const dir = dirPart.startsWith("~") ? HOME + dirPart.slice(1) : join(this.cwd, dirPart || ".");
      let names: string[] = [];
      try {
        names = await this.fs.readdir(dir);
      } catch {
        names = [];
      }
      const matches = names.filter((n) => n.startsWith(prefix) && (prefix.startsWith(".") || !n.startsWith("."))).sort();
      const decorated: string[] = [];
      for (const n of matches) decorated.push((await this.perms.isDir(join(dir, n))) ? `${n}/` : n);
      if (decorated.length === 1) {
        const one = decorated[0];
        const escaped = one.replace(/([ '"()&;|<>$\\])/g, "\\$1");
        return { text: head + dirPart + escaped + (one.endsWith("/") ? "" : " "), options: [] };
      }
      return this.common(head, dirPart, prefix, decorated);
    }
    if (candidates.length === 1) return { text: `${head}${candidates[0]} `, options: [] };
    return this.common(head, "", word, candidates);
  }

  private common(head: string, dirPart: string, prefix: string, options: string[]): { text: string; options: string[] } {
    if (options.length === 0) return { text: head + dirPart + prefix, options: [] };
    let common = options[0];
    for (const o of options) while (!o.startsWith(common)) common = common.slice(0, -1);
    if (common.length > prefix.length) return { text: head + dirPart + common.replace(/\/$/, ""), options: [] };
    return { text: head + dirPart + prefix, options };
  }

  // !! (the last command), !$ (its last word), !n, !-n and !text, like bash.
  private expandHistory(line: string): { line: string; echo?: string } | { error: string } {
    if (!line.includes("!")) return { line };
    let changed = false;
    let error: string | undefined;
    const h = this.history;
    // Skip single-quoted text, where bash doesn't expand "!".
    const out = line.replace(/'[^']*'|!(!|\$|-?\d+|[A-Za-z][\w.-]*)/g, (m, ev: string | undefined) => {
      if (!ev) return m;
      let found: string | undefined;
      if (ev === "!") found = h.at(-1);
      else if (ev === "$") found = h.at(-1)?.trim().split(/\s+/).at(-1);
      else if (/^-?\d+$/.test(ev)) {
        const n = Number(ev);
        found = n < 0 ? h.at(n) : h[n - 1];
      } else found = [...h].reverse().find((c) => c.startsWith(ev));
      if (found === undefined) {
        error ??= m;
        return m;
      }
      changed = true;
      return found;
    });
    if (error) return { error };
    return changed ? { line: out, echo: out } : { line };
  }
}
