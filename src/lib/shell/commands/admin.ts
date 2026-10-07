// Looking after a Linux server (Module 31): services with systemctl and service, logs with
// journalctl, users and groups (adduser, useradd, usermod, userdel, passwd, getent), and
// scheduled jobs with crontab. Services and the journal are modelled in ../units.ts.
import type { Command, ResolvedCommandContext } from "just-bash";
import type { Machine } from "../machine";
import { type JournalEntry, type Unit, journalLine, unitName } from "../units";
import { HOME, USER, fail, ok, parseArgs, pwHash } from "../util";
import { readDb } from "./misc";

const cmd = (name: string, execute: Command["execute"]): Command => ({ name, execute });
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const tty = (ctx: ResolvedCommandContext) => ctx.env.get("MP_TTY") === "1";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function longTime(t: number): string {
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

function ago(t: number, now: number): string {
  const s = Math.max(0, now - t);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min ago`;
  return `${Math.floor(s / 86400)} day${s >= 172800 ? "s" : ""} ago`;
}

// ----- systemctl -----

const NEEDS_ROOT = new Set(["start", "stop", "restart", "reload", "enable", "disable", "daemon-reload", "mask", "unmask", "try-restart", "reload-or-restart", "kill"]);

async function statusText(m: Machine, u: Unit, colorOn: boolean): Promise<{ text: string; code: number }> {
  const s = await m.services.state(u.name);
  const now = Math.floor(m.now().getTime() / 1000);
  const enabled = (await m.services.enabled(u.name)) ? "enabled" : "disabled";
  const green = (x: string) => (colorOn ? `\x1b[1;32m${x}\x1b[0m` : x);
  const red = (x: string) => (colorOn ? `\x1b[1;31m${x}\x1b[0m` : x);
  const dot = s.active === "active" ? green("●") : s.active === "failed" ? red("×") : "○";
  const since = s.since ? ` since ${longTime(s.since)}; ${ago(s.since, now)}` : "";
  let active: string;
  if (s.active === "active") active = `${green("active (running)")}${since}`;
  else if (s.active === "failed") active = `${red(`failed (Result: ${s.result ?? "exit-code"})`)}${since}`;
  else active = `inactive (dead)${since}`;
  const lines = [`${dot} ${u.name} - ${u.description}`, `     Loaded: loaded (${u.path}; ${enabled}; preset: enabled)`, `     Active: ${active}`];
  if (u.docs) lines.push(`       Docs: ${u.docs.split(/\s+/).join("\n             ")}`);
  const procs = (await m.procs.list()).filter((p) => p.unit === u.name);
  if (s.active === "failed" && s.mainPid) {
    lines.push(`    Process: ${s.mainPid} ExecStart=${s.execStart ?? u.execStart} (code=exited, status=${s.exitStatus ?? 1}/FAILURE)`);
    lines.push(`   Main PID: ${s.mainPid} (code=exited, status=${s.exitStatus ?? 1}/FAILURE)`);
    lines.push(`        CPU: 31ms`);
  } else if (s.active === "inactive" && s.result === "success") {
    lines.push(`    Process: ${(s.mainPid ?? 0) || "-"} ExecStart=${s.execStart ?? u.execStart} (code=exited, status=0/SUCCESS)`);
  } else if (procs.length) {
    const main = procs[0];
    lines.push(`   Main PID: ${main.pid} (${main.comm})`, `      Tasks: ${procs.length} (limit: 4558)`, `     Memory: ${(procs.reduce((x, p) => x + p.rss, 0) / 1024).toFixed(1)}M (peak: ${(procs.reduce((x, p) => x + p.rss, 0) / 1024 + 0.4).toFixed(1)}M)`, `        CPU: 41ms`);
    lines.push(`     CGroup: /system.slice/${u.name}`);
    procs.forEach((p, i) => lines.push(`             ${i === procs.length - 1 ? "└─" : "├─"}${p.pid} "${p.cmd}"`));
  }
  const logs = (await m.services.entries()).filter((e) => e.unit === u.name).slice(-10);
  let text = lines.join("\n");
  if (logs.length) text += `\n\n${logs.map(journalLine).join("\n")}`;
  if (await m.services.changedOnDisk(u)) text += `\nWarning: The unit file, source configuration file or drop-ins of ${u.name} changed on disk. Run 'systemctl daemon-reload' to reload units.`;
  return { text: `${text}\n`, code: s.active === "active" ? 0 : 3 };
}

async function systemctl(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  const { long, flags, operands } = parseArgs(args.filter((a) => a !== "--no-pager" && a !== "--quiet" && a !== "-q"));
  const quiet = args.includes("--quiet") || args.includes("-q");
  const [verb = "list-units", ...names] = operands;
  const type = long.find((l) => l.startsWith("type="))?.slice(5);
  const stateFilter = long.find((l) => l.startsWith("state="))?.slice(6);
  if (NEEDS_ROOT.has(verb) && !m.perms.root) {
    const what = names[0] ? unitName(names[0]) : "";
    if (verb === "daemon-reload") return fail(`Failed to reload daemon: Access denied\n${dim("(Changing services needs root: try sudo systemctl daemon-reload.)")}`);
    return fail(`Failed to ${verb} ${what}: Interactive authentication required.\nSee system logs and 'systemctl status ${what}' for details.\n${dim(`(Changing services needs root: try sudo systemctl ${verb} ${names.join(" ")}.)`)}`);
  }
  if (verb === "list-units" || verb === "list-unit-files") {
    if (type && type !== "service") return ok(`0 loaded units listed.\n`);
    const units = await m.services.all();
    const rows: string[][] = [];
    for (const u of units) {
      const s = await m.services.state(u.name);
      if (verb === "list-unit-files") {
        rows.push([u.name, (await m.services.enabled(u.name)) ? "enabled" : "disabled", "enabled"]);
        continue;
      }
      if (s.active === "inactive" && !long.includes("all") && stateFilter !== "inactive") continue;
      const sub = s.active === "active" ? "running" : s.active === "failed" ? "failed" : "dead";
      if (stateFilter && stateFilter !== s.active && stateFilter !== sub) continue;
      if (long.includes("failed") && s.active !== "failed") continue;
      rows.push([`${s.active === "failed" ? "●" : " "} ${u.name}`, "loaded", s.active, sub, u.description]);
    }
    if (verb === "list-unit-files") {
      const w = Math.max(9, ...rows.map((r) => r[0].length));
      return ok(`${"UNIT FILE".padEnd(w)} STATE    PRESET\n${rows.map((r) => `${r[0].padEnd(w)} ${r[1].padEnd(8)} ${r[2]}`).join("\n")}\n\n${rows.length} unit files listed.\n`);
    }
    const w = Math.max(6, ...rows.map((r) => r[0].length));
    const body = rows.map((r) => `${r[0].padEnd(w)} ${r[1].padEnd(6)} ${r[2].padEnd(8)} ${r[3].padEnd(7)} ${r[4]}`).join("\n");
    return ok(`  ${"UNIT".padEnd(w - 2)} LOAD   ACTIVE   SUB     DESCRIPTION\n${body}${body ? "\n" : ""}\nLegend: LOAD   → Reflects whether the unit definition was properly loaded.\n        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n        SUB    → The low-level unit activation state, values depend on unit type.\n\n${rows.length} loaded units listed.\n`);
  }
  if (verb === "--failed" || long.includes("failed")) return systemctl(m, ["list-units", "--failed"], ctx);
  if (verb === "daemon-reload") {
    await m.services.daemonReload();
    return ok();
  }
  if (!names.length) return fail(`Too few arguments.`);
  let out = "";
  let err = "";
  let code = 0;
  for (const n of names) {
    const u = await m.services.load(n);
    if (!u) {
      if (verb === "is-active") {
        out += "inactive\n";
        code = 3;
        continue;
      }
      if (verb === "is-enabled") return fail(`Failed to get unit file state for ${unitName(n)}: No such file or directory`);
      err += verb === "status" ? `Unit ${unitName(n)} could not be found.\n` : `Failed to ${verb} ${unitName(n)}: Unit ${unitName(n)} not found.\n`;
      code = verb === "status" ? 4 : 5;
      continue;
    }
    const failedJob = () => {
      err += `Job for ${u.name} failed because the control process exited with error code.\nSee "systemctl status ${u.name}" and "journalctl -xeu ${u.name}" for details.\n`;
      code = 1;
    };
    const warnChanged = async () => {
      if (await m.services.changedOnDisk(u)) err += `Warning: The unit file, source configuration file or drop-ins of ${u.name} changed on disk. Run 'systemctl daemon-reload' to reload units.\n`;
    };
    switch (verb) {
      case "status": {
        const r = await statusText(m, u, tty(ctx));
        out += r.text;
        code = Math.max(code, r.code);
        break;
      }
      case "is-active": {
        const s = await m.services.state(u.name);
        if (!quiet) out += `${s.active}\n`;
        if (s.active !== "active") code = 3;
        break;
      }
      case "is-failed": {
        const s = await m.services.state(u.name);
        if (!quiet) out += `${s.active}\n`;
        if (s.active !== "failed") code = 1;
        break;
      }
      case "is-enabled": {
        const e = await m.services.enabled(u.name);
        if (!quiet) out += `${e ? "enabled" : "disabled"}\n`;
        if (!e) code = 1;
        break;
      }
      case "start":
        await warnChanged();
        if (!(await m.services.start(u))) failedJob();
        break;
      case "stop":
        await warnChanged();
        await m.services.stop(u);
        break;
      case "restart":
      case "reload-or-restart":
      case "try-restart":
        await warnChanged();
        if (verb === "try-restart" && (await m.services.state(u.name)).active !== "active") break;
        await m.services.stop(u, true);
        if (!(await m.services.start(u))) failedJob();
        break;
      case "reload": {
        const s = await m.services.state(u.name);
        if (s.active !== "active") {
          err += `${u.name} is not active, cannot reload.\n`;
          code = 1;
          break;
        }
        if (u.name === "nginx.service") {
          const conf = await m.services.nginxConfig();
          if ("error" in conf) {
            await m.services.journal({ ident: "nginx", unit: u.name, prio: 3, msg: conf.error });
            err += `Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.\n`;
            code = 1;
            break;
          }
          const master = (await m.procs.list()).find((p) => p.unit === u.name && p.listen);
          if (master) await m.procs.update(master.pid, { listen: conf.ports.map((port) => ({ port, addr: "0.0.0.0" })) });
        }
        await m.services.journal({ ident: "systemd", pid: 1, unit: u.name, prio: 6, msg: `Reloaded ${u.name} - ${u.description}.` });
        break;
      }
      case "enable":
        out += await m.services.enable(u);
        if (long.includes("now") && !(await m.services.start(u))) failedJob();
        if (!u.wantedBy) err += `The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,\nAlso=, or Alias= settings in the [Install] section, and DefaultInstance= for\ntemplate units). This means they are not meant to be enabled or disabled using systemctl.\n`;
        break;
      case "disable":
        out += await m.services.disable(u);
        if (long.includes("now")) await m.services.stop(u);
        break;
      case "cat":
        out += `# ${u.path}\n${u.raw}`;
        break;
      case "show": {
        const s = await m.services.state(u.name);
        out += `Id=${u.name}\nDescription=${u.description}\nActiveState=${s.active}\nUnitFileState=${(await m.services.enabled(u.name)) ? "enabled" : "disabled"}\nMainPID=${s.active === "active" ? (s.mainPid ?? 0) : 0}\nUser=${u.user}\nExecStart=${u.execStart}\n`;
        break;
      }
      default:
        return fail(`Unknown command verb '${verb}'.`);
    }
  }
  void flags;
  // A long status goes through the pager on a real terminal; here it's printed.
  return { stdout: out, stderr: err, exitCode: code };
}

// ----- journalctl -----

function parseWhen(s: string, now: number): number | undefined {
  const t = s.trim().toLowerCase();
  const startOfDay = (n: number) => n - (n % 86400);
  if (t === "now") return now;
  if (t === "today") return startOfDay(now);
  if (t === "yesterday") return startOfDay(now) - 86400;
  const rel = /^(-?\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hour|hours|d|day|days)(\s+ago)?$/.exec(t);
  if (rel) {
    const n = Math.abs(Number(rel[1]));
    const unit = rel[2][0] === "s" ? 1 : rel[2][0] === "m" ? 60 : rel[2][0] === "h" ? 3600 : 86400;
    return now - n * unit;
  }
  const abs = /^(\d{4}-\d{2}-\d{2})(?:[ t](\d{2}:\d{2}(?::\d{2})?))?$/.exec(t);
  if (abs) return Math.floor(Date.parse(`${abs[1]}T${abs[2] ?? "00:00:00"}${abs[2]?.length === 5 ? ":00" : ""}Z`) / 1000);
  return undefined;
}

const PRIOS: Record<string, number> = { emerg: 0, alert: 1, crit: 2, err: 3, error: 3, warning: 4, warn: 4, notice: 5, info: 6, debug: 7 };

async function journalctl(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  const units: string[] = [];
  let n: number | undefined;
  let prio: number | undefined;
  let since: number | undefined;
  let until: number | undefined;
  let follow = false;
  let reverse = false;
  let catOnly = false;
  let grep: string | undefined;
  const now = Math.floor(m.now().getTime() / 1000);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const val = () => (a.includes("=") ? a.slice(a.indexOf("=") + 1) : args[++i]);
    if (a === "-u" || a.startsWith("--unit")) units.push(unitName(val() ?? ""));
    else if (/^-u.+/.test(a)) units.push(unitName(a.slice(2)));
    else if (a === "-n" || a.startsWith("--lines")) n = Number(val());
    else if (/^-n\d+$/.test(a)) n = Number(a.slice(2));
    else if (a === "-p" || a.startsWith("--priority")) {
      const v = (val() ?? "").toLowerCase();
      prio = /^\d$/.test(v) ? Number(v) : PRIOS[v];
      if (prio === undefined) return fail(`Unknown log level ${v}`);
    } else if (a === "-S" || a.startsWith("--since")) {
      const v = val() ?? "";
      since = parseWhen(v, now);
      if (since === undefined) return fail(`Failed to parse timestamp: ${v}`);
    } else if (a === "-U" || a.startsWith("--until")) {
      const v = val() ?? "";
      until = parseWhen(v, now);
      if (until === undefined) return fail(`Failed to parse timestamp: ${v}`);
    } else if (a === "-g" || a.startsWith("--grep")) grep = val();
    else if (a === "-f" || a === "--follow") follow = true;
    else if (a === "-r" || a === "--reverse") reverse = true;
    else if (a === "-o" || a.startsWith("--output")) catOnly = val() === "cat";
    else if (/^-[xebk]+$/.test(a) || a === "--no-pager" || a === "--boot") {
      if (a.includes("e") && n === undefined) n = 1000;
    } else if (a.startsWith("-")) return fail(`journalctl: unrecognized option '${a}'`);
  }
  let list: JournalEntry[] = await m.services.entries();
  if (units.length) list = list.filter((e) => e.unit && units.includes(e.unit));
  if (prio !== undefined) list = list.filter((e) => e.prio <= prio!);
  if (since !== undefined) list = list.filter((e) => e.t >= since!);
  if (until !== undefined) list = list.filter((e) => e.t <= until!);
  if (grep) {
    const re = new RegExp(grep, /[A-Z]/.test(grep) ? "" : "i");
    list = list.filter((e) => re.test(e.msg));
  }
  if (n !== undefined) list = list.slice(-n);
  if (reverse) list.reverse();
  const red = (s: string, e: JournalEntry) => (tty(ctx) && e.prio <= 3 ? `\x1b[1;31m${s}\x1b[0m` : tty(ctx) && e.prio === 4 ? `\x1b[1;33m${s}\x1b[0m` : s);
  let out = list.map((e) => red(catOnly ? e.msg : journalLine(e), e)).join("\n");
  out = out ? `${out}\n` : "-- No entries --\n";
  if (follow && tty(ctx)) out += `${dim("(journalctl -f would now keep waiting and print new lines as they arrive, until you press Ctrl+C. The practice terminal stops here.)")}\n`;
  if (m.interactive && tty(ctx) && !follow && out.split("\n").length > 26 && !args.includes("--no-pager")) {
    await m.page(out, "journalctl");
    return ok();
  }
  return ok(out);
}

// ----- users and groups -----

async function writeDb(m: Machine, path: string, rows: string[][]) {
  await m.asRoot(() => m.fs.writeFile(path, `${rows.map((r) => r.join(":")).join("\n")}\n`));
}


async function setPassword(m: Machine, user: string, pw: string) {
  const rows = await readDb(m, "/etc/shadow");
  const day = String(Math.floor(m.now().getTime() / 86400000));
  const row = rows.find((r) => r[0] === user);
  if (row) {
    row[1] = pwHash(pw);
    row[2] = day;
  } else rows.push([user, pwHash(pw), day, "0", "99999", "7", "", "", ""]);
  await writeDb(m, "/etc/shadow", rows);
}

async function askPassword(m: Machine, first = "New password: "): Promise<{ ok: boolean; text: string }> {
  const a = await m.ask(first, { secret: true, fallback: "" });
  const b = await m.ask("Retype new password: ", { secret: true, fallback: "" });
  if (!a) return { ok: false, text: "No password has been supplied.\n" };
  if (a !== b) return { ok: false, text: "Sorry, passwords do not match.\n" };
  return { ok: true, text: a };
}

const validName = (n: string) => /^[a-z_][a-z0-9_-]{0,31}$/.test(n);

async function createUser(m: Machine, name: string, opts: { home: boolean; shell: string; groups: string[]; gecos?: string; system?: boolean }) {
  const users = await readDb(m, "/etc/passwd");
  const groups = await readDb(m, "/etc/group");
  const used = new Set([...users.map((u) => Number(u[2])), ...groups.map((g) => Number(g[2]))]);
  let id = opts.system ? 999 : 1001;
  while (used.has(id)) id += opts.system ? -1 : 1;
  groups.push([name, "x", String(id), ""]);
  users.push([name, "x", String(id), String(id), opts.gecos ?? "", `/home/${name}`, opts.shell]);
  for (const g of opts.groups) {
    const row = groups.find((r) => r[0] === g);
    if (row) row[3] = [...(row[3] ? row[3].split(",") : []), name].join(",");
  }
  await writeDb(m, "/etc/passwd", users);
  await writeDb(m, "/etc/group", groups);
  const shadow = await readDb(m, "/etc/shadow");
  shadow.push([name, "!", String(Math.floor(m.now().getTime() / 86400000)), "0", "99999", "7", "", "", ""]);
  await writeDb(m, "/etc/shadow", shadow);
  if (opts.home) {
    await m.asRoot(async () => {
      const home = `/home/${name}`;
      await m.fs.mkdir(home, { recursive: true });
      await m.fs.writeFile(`${home}/.bashrc`, "# ~/.bashrc: executed by bash(1) for non-login shells.\n");
      await m.fs.writeFile(`${home}/.profile`, "# ~/.profile: executed by the command interpreter for login shells.\n");
      await m.fs.chmod(home, 0o750);
      for (const p of [home, `${home}/.bashrc`, `${home}/.profile`]) m.perms.setOwner(p, name, name);
    });
  }
  return id;
}

function adminCommands(m: Machine): Command[] {
  const needRoot = (name: string, msg?: string) => (m.perms.root ? undefined : fail(msg ?? `${name}: Permission denied.\n${name}: cannot lock /etc/passwd; try again later.`));
  return [
    cmd("adduser", async (args) => {
      const long: string[] = [];
      const ops: string[] = [];
      let gecos: string | undefined;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--gecos" || a === "--comment") gecos = args[++i] ?? "";
        else if (a.startsWith("--gecos=") || a.startsWith("--comment=")) gecos = a.slice(a.indexOf("=") + 1);
        else if (a.startsWith("--")) long.push(a.slice(2));
        else if (!a.startsWith("-")) ops.push(a);
      }
      if (!m.perms.root) return fail("fatal: Only root may add a user or group to the system.");
      if (ops.length === 2) {
        // adduser USER GROUP: add an existing user to a group.
        const [user, group] = ops;
        const groups = await readDb(m, "/etc/group");
        const row = groups.find((g) => g[0] === group);
        if (!(await readDb(m, "/etc/passwd")).some((u) => u[0] === user)) return fail(`fatal: The user \`${user}' does not exist.`);
        if (!row) return fail(`fatal: The group \`${group}' does not exist.`);
        const members = row[3] ? row[3].split(",") : [];
        if (members.includes(user)) return ok(`info: The user \`${user}' is already a member of \`${group}'.\n`);
        row[3] = [...members, user].join(",");
        await writeDb(m, "/etc/group", groups);
        return ok(`info: Adding user \`${user}' to group \`${group}' ...\n`);
      }
      const name = ops[0];
      if (!name) return fail("fatal: Only one or two names allowed.");
      if (!validName(name)) return fail(`fatal: Please enter a username matching the regular expression\nconfigured via the NAME_REGEX configuration variable.  Use the \`--allow-bad-names'\noption to relax this check or reconfigure NAME_REGEX in configuration.`);
      if ((await readDb(m, "/etc/passwd")).some((u) => u[0] === name)) return fail(`fatal: The user \`${name}' already exists.`);
      const id = await createUser(m, name, { home: true, shell: "/bin/bash", groups: ["users"], gecos: gecos ?? "" });
      let out = `info: Adding user \`${name}' ...\ninfo: Selecting UID/GID from range 1000 to 59999 ...\ninfo: Adding new group \`${name}' (${id}) ...\ninfo: Adding new user \`${name}' (${id}) with group \`${name} (${id})' ...\ninfo: Creating home directory \`/home/${name}' ...\ninfo: Copying files from \`/etc/skel' ...\n`;
      if (!long.includes("disabled-password") && !long.includes("disabled-login")) {
        const pw = await askPassword(m, `${out}New password: `);
        out = "";
        if (pw.ok) {
          await setPassword(m, name, pw.text);
          out += "passwd: password updated successfully\n";
        } else out += `${pw.text}passwd: Authentication token manipulation error\npasswd: password unchanged\n`;
      }
      if (gecos === undefined) {
        const fields = ["Full Name", "Room Number", "Work Phone", "Home Phone", "Other"];
        const answers: string[] = [];
        let q = `${out}Changing the user information for ${name}\nEnter the new value, or press ENTER for the default\n`;
        out = "";
        for (const f of fields) {
          answers.push((await m.ask(`${q}\t${f} []: `, { fallback: "" })).trim());
          q = "";
        }
        await m.ask("Is the information correct? [Y/n] ", { fallback: "y" });
        const users = await readDb(m, "/etc/passwd");
        const row = users.find((u) => u[0] === name)!;
        row[4] = answers[0] ? `${answers.join(",").replace(/,+$/, "")}` : "";
        await writeDb(m, "/etc/passwd", users);
      }
      out += `info: Adding new user \`${name}' to supplemental / extra groups \`users' ...\ninfo: Adding user \`${name}' to group \`users' ...\n`;
      return ok(out);
    }),

    cmd("useradd", async (args) => {
      const denied = needRoot("useradd");
      if (denied) return denied;
      const { flags, values, operands } = parseArgs(args, "sGgcdu");
      const name = operands[0];
      if (!name) return fail("Usage: useradd [options] LOGIN", 2);
      if (!validName(name)) return fail(`useradd: invalid user name '${name}': use --badname to ignore`, 3);
      if ((await readDb(m, "/etc/passwd")).some((u) => u[0] === name)) return fail(`useradd: user '${name}' already exists`, 9);
      const groups = values.G ? values.G.split(",") : [];
      const known = (await readDb(m, "/etc/group")).map((g) => g[0]);
      const bad = groups.find((g) => !known.includes(g));
      if (bad) return fail(`useradd: group '${bad}' does not exist`, 6);
      await createUser(m, name, { home: flags.has("m"), shell: values.s ?? "/bin/sh", groups, gecos: values.c ?? "", system: flags.has("r") });
      return ok();
    }),

    cmd("usermod", async (args) => {
      const denied = needRoot("usermod");
      if (denied) return denied;
      const { flags, values, operands } = parseArgs(args, "Gsgcdl");
      const name = operands[0];
      if (!name) return fail("Usage: usermod [options] LOGIN", 2);
      const users = await readDb(m, "/etc/passwd");
      const row = users.find((u) => u[0] === name);
      if (!row) return fail(`usermod: user '${name}' does not exist`, 6);
      if (values.G !== undefined) {
        const want = values.G.split(",").filter(Boolean);
        const groups = await readDb(m, "/etc/group");
        const bad = want.find((g) => !groups.some((r) => r[0] === g));
        if (bad) return fail(`usermod: group '${bad}' does not exist`, 6);
        for (const g of groups) {
          if (g[0] === name) continue;
          const members = g[3] ? g[3].split(",").filter(Boolean) : [];
          const has = members.includes(name);
          // Without -a, -G *replaces* the list: groups not named are left.
          if (want.includes(g[0]) && !has) members.push(name);
          if (!want.includes(g[0]) && has && !flags.has("a")) members.splice(members.indexOf(name), 1);
          g[3] = members.join(",");
        }
        await writeDb(m, "/etc/group", groups);
      } else if (flags.has("a")) return fail("usermod: -a flag is only allowed with the -G flag\nUsage: usermod [options] LOGIN", 2);
      if (values.s) row[6] = values.s;
      if (values.c !== undefined) row[4] = values.c;
      await writeDb(m, "/etc/passwd", users);
      if (flags.has("L") || flags.has("U")) {
        const shadow = await readDb(m, "/etc/shadow");
        const s = shadow.find((r) => r[0] === name);
        if (s) s[1] = flags.has("L") ? (s[1].startsWith("!") ? s[1] : `!${s[1]}`) : s[1].replace(/^!/, "");
        await writeDb(m, "/etc/shadow", shadow);
      }
      return ok();
    }),

    cmd("userdel", async (args) => {
      const denied = needRoot("userdel");
      if (denied) return denied;
      const { flags, operands } = parseArgs(args);
      const name = operands[0];
      const users = await readDb(m, "/etc/passwd");
      if (!users.some((u) => u[0] === name)) return fail(`userdel: user '${name}' does not exist`, 6);
      if (name === USER) return fail(`userdel: user ${name} is currently used by process 1001`, 8);
      await writeDb(m, "/etc/passwd", users.filter((u) => u[0] !== name));
      await writeDb(m, "/etc/shadow", (await readDb(m, "/etc/shadow")).filter((u) => u[0] !== name));
      const groups = (await readDb(m, "/etc/group")).filter((g) => g[0] !== name);
      for (const g of groups) g[3] = (g[3] ?? "").split(",").filter((x) => x && x !== name).join(",");
      await writeDb(m, "/etc/group", groups);
      if (flags.has("r")) await m.asRoot(() => m.fs.rm(`/home/${name}`, { recursive: true, force: true }));
      return ok("", flags.has("r") ? `userdel: ${name} mail spool (/var/mail/${name}) not found\n` : "");
    }),

    // deluser USER GROUP (Ubuntu) and gpasswd -d USER GROUP: take someone out of a group.
    cmd("deluser", async (args) => {
      if (!m.perms.root) return fail("fatal: Only root may remove a user or group from the system.");
      const ops = args.filter((a) => !a.startsWith("-"));
      if (ops.length === 2) return removeFromGroup(m, ops[0], ops[1], `info: Removing user \`${ops[0]}' from group \`${ops[1]}' ...\n`);
      return fail("deluser: the practice terminal uses deluser only as `deluser USER GROUP`. To delete a user: userdel -r USER");
    }),
    cmd("gpasswd", async (args) => {
      if (!m.perms.root) return fail("gpasswd: Permission denied.");
      const i = args.indexOf("-d");
      const j = args.indexOf("-a");
      if (i >= 0 && args[i + 1] && args[i + 2]) return removeFromGroup(m, args[i + 1], args[i + 2], `Removing user ${args[i + 1]} from group ${args[i + 2]}\n`);
      if (j >= 0 && args[j + 1] && args[j + 2]) {
        const groups = await readDb(m, "/etc/group");
        const row = groups.find((g) => g[0] === args[j + 2]);
        if (!row) return fail(`gpasswd: group '${args[j + 2]}' does not exist in /etc/group`, 3);
        row[3] = [...new Set([...(row[3] ? row[3].split(",") : []), args[j + 1]])].join(",");
        await writeDb(m, "/etc/group", groups);
        return ok(`Adding user ${args[j + 1]} to group ${args[j + 2]}\n`);
      }
      return fail("Usage: gpasswd [option] GROUP\n  -a, --add USER     add USER to GROUP\n  -d, --delete USER  remove USER from GROUP", 2);
    }),
    cmd("groupadd", async (args) => {
      const denied = needRoot("groupadd", "groupadd: Permission denied.\ngroupadd: cannot lock /etc/group; try again later.");
      if (denied) return denied;
      const name = args.find((a) => !a.startsWith("-"));
      if (!name) return fail("Usage: groupadd [options] GROUP", 2);
      const groups = await readDb(m, "/etc/group");
      if (groups.some((g) => g[0] === name)) return fail(`groupadd: group '${name}' already exists`, 9);
      let id = 1001;
      while (groups.some((g) => Number(g[2]) === id)) id++;
      groups.push([name, "x", String(id), ""]);
      await writeDb(m, "/etc/group", groups);
      return ok();
    }),

    cmd("passwd", async (args) => {
      const { flags, operands } = parseArgs(args);
      const who = operands[0] ?? (m.perms.root ? "root" : USER);
      if (who !== USER && !m.perms.root) return fail("passwd: You may not view or modify password information for " + who + ".");
      if (!(await readDb(m, "/etc/passwd")).some((u) => u[0] === who)) return fail(`passwd: user '${who}' does not exist`);
      if (flags.has("S")) {
        const s = (await readDb(m, "/etc/shadow")).find((r) => r[0] === who);
        const state = !s || s[1].startsWith("!") || s[1] === "*" ? "L" : s[1] ? "P" : "NP";
        const d = new Date(Number(s?.[2] ?? 0) * 86400000);
        const p = (n: number) => String(n).padStart(2, "0");
        return ok(`${who} ${state} ${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} 0 99999 7 -1\n`);
      }
      if (flags.has("l") || flags.has("u")) {
        if (!m.perms.root) return fail("passwd: Permission denied.");
        const shadow = await readDb(m, "/etc/shadow");
        const s = shadow.find((r) => r[0] === who);
        if (s) s[1] = flags.has("l") ? (s[1].startsWith("!") ? s[1] : `!${s[1]}`) : s[1].replace(/^!/, "");
        await writeDb(m, "/etc/shadow", shadow);
        return ok(`passwd: password changed.\n`);
      }
      let pre = "";
      if (!m.perms.root) {
        pre = `Changing password for ${who}.\n`;
        const cur = await m.ask(`${pre}Current password: `, { secret: true, fallback: "" });
        pre = "";
        if (!cur) return fail("passwd: Authentication token manipulation error\npasswd: password unchanged");
      }
      const pw = await askPassword(m, `${pre}New password: `);
      if (!pw.ok) return fail(`${pw.text}passwd: Authentication token manipulation error\npasswd: password unchanged`, 10);
      await setPassword(m, who, pw.text);
      return ok("passwd: password updated successfully\n");
    }),

    cmd("getent", async (args) => {
      const [db, key] = args;
      const file = db === "passwd" ? "/etc/passwd" : db === "group" ? "/etc/group" : db === "shadow" ? "/etc/shadow" : undefined;
      if (!file) return fail(`Unknown database: ${db ?? ""}\nTry \`getent --help' or \`getent --usage' for more information.`);
      if (db === "shadow" && !m.perms.root) return { stdout: "", stderr: "", exitCode: 2 };
      const rows = (await readDb(m, file)).filter((r) => !key || r[0] === key);
      if (!rows.length) return { stdout: "", stderr: "", exitCode: 2 };
      return ok(rows.map((r) => r.join(":")).join("\n") + "\n");
    }),

    cmd("su", async () => fail(`su: the practice terminal can't log in as another user. On a real server, \`sudo -i\` opens a root shell and \`su - name\` switches user (it asks for that user's password).`)),

    cmd("visudo", async () => fail(`visudo: the practice terminal doesn't edit /etc/sudoers. The safe way to give someone sudo on Ubuntu is to add them to the sudo group: sudo usermod -aG sudo name`)),

    cmd("systemctl", (args, ctx) => systemctl(m, args, ctx)),
    cmd("service", async (args, ctx) => {
      if (args[0] === "--status-all") {
        let out = "";
        for (const u of await m.services.all()) out += ` [ ${(await m.services.state(u.name)).active === "active" ? "+" : "-"} ]  ${u.name.replace(/\.service$/, "")}\n`;
        return ok(out);
      }
      const [name, verb] = args;
      if (!name || !verb) return fail("Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]");
      return systemctl(m, [verb, name], ctx);
    }),
    cmd("journalctl", (args, ctx) => journalctl(m, args, ctx)),

    cmd("crontab", (args, ctx) => crontab(m, args, ctx)),
  ];
}

async function removeFromGroup(m: Machine, user: string, group: string, message: string) {
  const groups = await readDb(m, "/etc/group");
  const row = groups.find((g) => g[0] === group);
  if (!row) return fail(`fatal: The group \`${group}' does not exist.`);
  const members = row[3] ? row[3].split(",") : [];
  if (!members.includes(user)) return fail(`fatal: The user \`${user}' is not a member of group \`${group}'.`);
  row[3] = members.filter((x) => x !== user).join(",");
  await writeDb(m, "/etc/group", groups);
  return ok(message);
}

// ----- crontab -----

const CRON_TEMPLATE = `# Edit this file to introduce tasks to be run by cron.
#
# Each task to run has to be defined through a single line
# indicating with different fields when the task will be run
# and what command to run for the task
#
# To define the time you can provide concrete values for
# minute (m), hour (h), day of month (dom), month (mon),
# and day of week (dow) or use '*' in these fields (for 'any').
#
# Notice that tasks will be started based on the cron's system
# daemon's notion of time and timezones.
#
# Output of the crontab jobs (including errors) is sent through
# email to the user the crontab file belongs to (unless redirected).
#
# For example, you can run a backup of all your user accounts
# at 5 a.m every week with:
# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/
#
# For more information see the manual pages of crontab(5) and cron(8)
#
# m h  dom mon dow   command
`;

const FIELDS: [string, number, number, string[]?][] = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["day-of-month", 1, 31],
  ["month", 1, 12, ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]],
  ["day-of-week", 0, 7, ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]],
];

function validField(text: string, lo: number, hi: number, names?: string[]): boolean {
  const num = (s: string) => {
    const i = names?.indexOf(s.toLowerCase()) ?? -1;
    if (i >= 0) return i + (lo === 1 ? 1 : 0);
    return /^\d+$/.test(s) ? Number(s) : NaN;
  };
  return text.split(",").every((item) => {
    const [range, step] = item.split("/");
    if (step !== undefined && !/^\d+$/.test(step)) return false;
    if (range === "*") return true;
    const [a, b] = range.split("-");
    const x = num(a);
    if (Number.isNaN(x) || x < lo || x > hi) return false;
    if (b === undefined) return step === undefined;
    const y = num(b);
    return !Number.isNaN(y) && y >= x && y <= hi;
  });
}

/** The first error in a crontab, as cron reports it: line number and what's wrong. */
export function crontabError(text: string): { line: number; what: string } | undefined {
  const lines = text.split("\n");
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) continue;
    if (line.startsWith("@")) {
      const [special, ...rest] = line.split(/\s+/);
      if (!["@reboot", "@yearly", "@annually", "@monthly", "@weekly", "@daily", "@midnight", "@hourly"].includes(special)) return { line: i + 1, what: "bad time specifier" };
      if (!rest.length) return { line: i + 1, what: "bad command" };
      continue;
    }
    const parts = line.split(/\s+/);
    for (const [j, [name, lo, hi, names]] of FIELDS.entries()) {
      if (parts[j] === undefined || !validField(parts[j], lo, hi, names)) return { line: i + 1, what: `bad ${name}` };
    }
    if (parts.length < 6) return { line: i + 1, what: "bad command" };
  }
  if (text && !text.endsWith("\n")) return { line: lines.length, what: "premature EOF" };
  return undefined;
}

async function crontab(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  const { flags, values, operands } = parseArgs(args, "u");
  const me = m.perms.root ? "root" : USER;
  const who = values.u ?? me;
  if (values.u && !m.perms.root && values.u !== USER) return fail(`must be privileged to use -u`);
  const file = `/var/spool/cron/crontabs/${who}`;
  const current = await m.asRoot(async () => {
    try {
      return await m.fs.readFile(file);
    } catch {
      return undefined;
    }
  });
  const install = async (text: string) => {
    await m.asRoot(async () => {
      await m.fs.mkdir("/var/spool/cron/crontabs", { recursive: true });
      await m.fs.writeFile(file, text);
      await m.fs.chmod(file, 0o600);
    });
    m.perms.setOwner(file, who, "crontab");
  };
  if (flags.has("l")) {
    if (current === undefined) return fail(`no crontab for ${who}`);
    return ok(current);
  }
  if (flags.has("r")) {
    if (current === undefined) return fail(`no crontab for ${who}`);
    await m.asRoot(() => m.fs.rm(file, { force: true }));
    return ok();
  }
  if (flags.has("e")) {
    const tmp = `/tmp/crontab.Kq3ZpB/crontab`;
    const start = current ?? CRON_TEMPLATE;
    const edited = await m.edit(tmp, start);
    if (edited === null || edited === start) return ok("", current === undefined && edited !== null ? "" : "No modification made\n");
    const e = crontabError(edited);
    if (e) {
      await m.ask(`"${tmp}":${e.line}: ${e.what}\nerrors in crontab file, can't install.\nDo you want to retry the same edit? (y/n) `, { fallback: "n" });
      return fail(`crontab: edits left in ${tmp}`);
    }
    await install(edited);
    return ok("", "crontab: installing new crontab\n");
  }
  const src = operands[0];
  if (!src) return fail(`crontab: usage error: file name or - (for stdin) must be specified\nusage:\tcrontab [ -u user ] file\n\tcrontab [ -u user ] [ -i ] { -e | -l | -r }`);
  let text: string;
  try {
    text = src === "-" ? String(ctx.stdin ?? "") : await ctx.fs.readFile(src.startsWith("/") ? src : `${ctx.cwd}/${src}`.replace(/^~/, HOME));
  } catch {
    return fail(`${src}: No such file or directory`);
  }
  const e = crontabError(text);
  if (e) return fail(`"${src}":${e.line}: ${e.what}\nerrors in crontab file, can't install.`);
  await install(text);
  return ok();
}

export { adminCommands };
