// Commands the practice terminal adds or replaces: who you are (whoami, id, groups, sudo,
// chown), reading (less, man, tldr), editing (nano), history, which, and friendly answers
// for things that only exist on a Mac (open, code).
import type { Command, ResolvedCommandContext } from "just-bash";
import type { Machine } from "../machine";
import { USER, fail, join, ok, parseArgs, quote, tildify } from "../util";
import { orig } from "./guard";
import { MAN_PAGES, TLDR_PAGES } from "./pages";
import { MORE_MAN, MORE_TLDR } from "./pages-more";

const cmd = (name: string, execute: Command["execute"]): Command => ({ name, execute });

const tty = (ctx: ResolvedCommandContext) => ctx.env.get("MP_TTY") === "1";
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

/** The rows of /etc/passwd or /etc/group, split on ":". */
export async function readDb(m: Machine, path: string): Promise<string[][]> {
  try {
    return (await m.asRoot(() => m.fs.readFile(path)))
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.split(":"));
  } catch {
    return [];
  }
}

export function miscCommands(m: Machine): Command[] {
  const me = () => (m.perms.root ? "root" : USER);

  return [
    cmd("whoami", async () => ok(`${me()}\n`)),
    cmd("hostname", async (args) => {
      if (args.includes("-I")) return ok(m.host === "inkwell" ? "10.0.2.15 \n" : `${(await import("../world")).SIM_HOSTS.find((h) => h.name === m.host)?.ip ?? "10.0.2.15"} \n`);
      return ok(`${m.host}\n`);
    }),
    cmd("uname", async (args) => {
      const { flags } = parseArgs(args);
      if (flags.has("a")) return ok(`Linux ${m.host} 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 x86_64 x86_64 GNU/Linux\n`);
      if (flags.has("r")) return ok("6.8.0-45-generic\n");
      return ok("Linux\n");
    }),
    cmd("id", async (args) => {
      const who = args.find((a) => !a.startsWith("-")) ?? me();
      const users = await readDb(m, "/etc/passwd");
      const u = users.find((l) => l[0] === who);
      if (!u) return fail(`id: '${who}': no such user`);
      const groups = await readDb(m, "/etc/group");
      const gid = (name: string) => groups.find((g) => g[0] === name)?.[2] ?? "?";
      const mine = await m.perms.groupsOf(who);
      const primary = groups.find((g) => g[2] === u[3])?.[0] ?? who;
      const list = [primary, ...mine.filter((g) => g !== primary)];
      if (args.includes("-u")) return ok(`${u[2]}\n`);
      if (args.includes("-Gn") || (args.includes("-G") && args.includes("-n"))) return ok(`${list.join(" ")}\n`);
      return ok(`uid=${u[2]}(${who}) gid=${u[3]}(${primary}) groups=${list.map((g) => `${gid(g)}(${g})`).join(",")}\n`);
    }),
    cmd("groups", async (args) => {
      const names = args.length ? args : [me()];
      let out = "";
      for (const n of names) {
        if (!(await readDb(m, "/etc/passwd")).some((l) => l[0] === n)) return fail(`groups: '${n}': no such user`);
        const list = n === "root" ? ["root"] : await m.perms.groupsOf(n);
        out += args.length ? `${n} : ${list.join(" ")}\n` : `${list.join(" ")}\n`;
      }
      return ok(out);
    }),

    cmd("sudo", async (args, ctx) => {
      if (args.length === 0 || args[0] === "-h" || args[0] === "--help") return ok("usage: sudo command [arg ...]\nRun a command as the administrator (root).\n");
      if (args[0] === "-i" || args[0] === "-s" || args[0] === "su")
        return fail("sudo: the practice terminal doesn't open a root shell. Put sudo in front of each command instead.");
      const line = args.map(quote).join(" ");
      const notice = m.sudoNotice();
      const stdin = typeof ctx.stdin === "string" ? ctx.stdin : ctx.stdin ? new TextDecoder().decode(ctx.stdin as unknown as Uint8Array) : "";
      m.perms.sudoDepth++;
      let r;
      try {
        r = await m.asRoot(() => ctx.exec!(line, { cwd: ctx.cwd, env: Object.fromEntries(ctx.env), stdin }));
      } finally {
        m.perms.sudoDepth--;
      }
      return { stdout: r.stdout, stderr: notice + r.stderr, exitCode: r.exitCode };
    }),

    cmd("chown", async (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      if (operands.length < 2) return fail("chown: missing operand\nTry 'chown --help' for more information.");
      const [spec, ...files] = operands;
      const [user, group] = spec.split(":");
      if (user && !(await readDb(m, "/etc/passwd")).some((l) => l[0] === user)) return fail(`chown: invalid user: '${spec}'`);
      if (group && !(await readDb(m, "/etc/group")).some((l) => l[0] === group)) return fail(`chown: invalid group: '${spec}'`);
      let stderr = "";
      for (const f of files) {
        const p = join(ctx.cwd, f);
        if (!(await m.perms.exists(p))) {
          stderr += `chown: cannot access '${f}': No such file or directory\n`;
          continue;
        }
        if (!m.perms.root) {
          stderr += `chown: changing ownership of '${f}': Operation not permitted\n`;
          continue;
        }
        const all = flags.has("R") ? [p, ...(await allUnder(ctx, p))] : [p];
        for (const q of all) m.perms.setOwner(q, user || undefined, group || undefined);
      }
      return { stdout: "", stderr, exitCode: stderr ? 1 : 0 };
    }),

    // rm with permission checks and -i (asks before each file).
    cmd("rm", async (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const interactive = flags.has("i");
      let stderr = "";
      const keep: string[] = [];
      for (const f of operands) {
        const p = join(ctx.cwd, f);
        if (!(await m.perms.exists(p))) {
          keep.push(f); // the original reports the missing file (or ignores it with -f)
          continue;
        }
        if (!(await m.perms.canChangeDir(p))) {
          stderr += `rm: cannot remove '${f}': Permission denied\n`;
          continue;
        }
        if (interactive) {
          const isDir = await m.perms.isDir(p);
          if (isDir && !flags.has("r") && !flags.has("R")) {
            keep.push(f);
            continue;
          }
          const empty = !isDir && (await ctx.fs.stat(p)).size === 0;
          const what = isDir ? "directory" : empty ? "regular empty file" : "regular file";
          const answer = await m.ask(`rm: remove ${what} '${f}'? `);
          if (!/^y/i.test(answer.trim())) continue;
        }
        keep.push(f);
      }
      const rest = args.filter((a) => a.startsWith("-") && a !== "-i").filter((a) => !/^-i+$/.test(a));
      const cleaned = rest.map((a) => (/^-[a-zA-Z]+$/.test(a) ? a.replace(/i/g, "") : a)).filter((a) => a !== "-");
      if (keep.length === 0) return { stdout: "", stderr, exitCode: stderr ? 1 : 0 };
      const r = await orig(ctx, [...cleaned, "--", ...keep]);
      return { stdout: r.stdout, stderr: stderr + r.stderr, exitCode: stderr ? 1 : r.exitCode };
    }),

    // tail with permission checks, and -f explained (a page can't wait for new lines).
    cmd("tail", async (args, ctx) => {
      const { flags, operands } = parseArgs(args, "nc");
      for (const f of operands) {
        const p = join(ctx.cwd, f);
        if ((await m.perms.exists(p)) && !(await m.perms.can(p, "r"))) return fail(`tail: cannot open '${f}' for reading: Permission denied`);
      }
      if (!flags.has("f") && !flags.has("F")) return orig(ctx, args);
      const r = await orig(ctx, args.map((a) => (/^-[a-zA-Z0-9]+$/.test(a) ? a.replace(/[fF]/g, "") : a)).filter((a) => a !== "-"));
      const note = `${dim("(tail -f would now keep waiting and print new lines as they're added, until you press Ctrl+C. The practice terminal stops here.)")}\n`;
      return { stdout: r.stdout + (tty(ctx) ? note : ""), stderr: r.stderr, exitCode: r.exitCode };
    }),

    pager(m, "less"),
    pager(m, "more"),

    cmd("man", async (args, ctx) => {
      const { operands } = parseArgs(args);
      if (operands.length === 0) return fail("What manual page do you want?\nFor example, try 'man man'.");
      const name = operands.at(-1)!;
      const page = MAN_PAGES[name] ?? MORE_MAN[name];
      if (!page) return fail(`No manual entry for ${name}`, 16);
      if (m.interactive && tty(ctx)) {
        await m.page(page, `${name.toUpperCase()}(1)`);
        return ok();
      }
      return ok(page);
    }),

    cmd("tldr", async (args) => {
      const name = args.filter((a) => !a.startsWith("-")).join("-");
      if (!name) return fail("Usage: tldr <command>\nShows the most common ways to use a command.");
      const page = TLDR_PAGES[name] ?? MORE_TLDR[name];
      if (!page) return fail(`tldr: no page for '${name}' in the practice terminal (the real tldr has thousands).`);
      return ok(page);
    }),

    editorCommand(m, "nano"),
    editorCommand(m, "vim"),
    editorCommand(m, "vi"),
    cmd("vimtutor", async () => fail("vimtutor: the practice terminal doesn't include the vim tutorial. On your Mac or a server, run vimtutor: it's a 30-minute guided lesson inside vim.")),

    cmd("history", async (args) => {
      if (args[0] === "-c") {
        m.history.length = 0;
        return ok();
      }
      const n = Number(args[0]);
      const start = Number.isInteger(n) && n > 0 ? Math.max(0, m.history.length - n) : 0;
      return ok(
        m.history
          .slice(start)
          .map((c, i) => `${String(start + i + 1).padStart(5)}  ${c}\n`)
          .join(""),
      );
    }),

    cmd("which", async (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const dirs = (ctx.env.get("PATH") ?? "").split(":").filter(Boolean);
      let out = "";
      let missing = 0;
      for (const name of operands) {
        let found = false;
        for (const d of dirs) {
          const p = join(join(ctx.cwd, d), name);
          if ((await m.perms.exists(p)) && !(await m.perms.isDir(p)) && (await m.perms.can(p, "x"))) {
            out += `${p}\n`;
            found = true;
            if (!flags.has("a")) break;
          }
        }
        if (!found) missing++;
      }
      return { stdout: out, stderr: "", exitCode: missing ? 1 : 0 };
    }),

    macOnly("open", "open is a macOS command (it opens a file or folder in its app). Try it in your Mac's Terminal."),
    macOnly("code", "code opens VS Code. The practice computer doesn't have VS Code: try `code .` in your Mac's Terminal."),
    macOnly("brew", "brew (Homebrew) is the Mac's package manager, so this Linux computer doesn't have it. Ubuntu uses apt instead."),
    macOnly("mdfind", "mdfind searches with Spotlight, which only exists on a Mac. On Linux, use find."),
  ];
}

/** nano and vim: open the file in the editor over the terminal; what's saved is written back. */
function editorCommand(m: Machine, name: "nano" | "vim" | "vi"): Command {
  const label = name === "nano" ? "nano" : "vim";
  return cmd(name, async (args, ctx) => {
    const { operands } = parseArgs(args);
    if (!m.interactive && !m.root.quiet && !m.root.scripted.edits.length) return fail(`${label}: the editor only opens in the lesson's terminal`);
    if (operands.length === 0) return fail(`${label}: give the file to edit, for example: ${name} notes.txt`);
    const file = operands[0];
    const p = join(ctx.cwd, file);
    if (await m.perms.isDir(p)) return fail(name === "nano" ? `nano: "${file}" is a directory` : `"${file}" is a directory`);
    const exists = await m.perms.exists(p);
    if (exists && !(await m.perms.can(p, "r"))) return fail(name === "nano" ? `nano: Error reading ${file}: Permission denied` : `"${file}" [Permission Denied]`);
    const before = exists ? await ctx.fs.readFile(p) : "";
    const after = await m.edit(name === "nano" ? tildify(p) : file, before, label);
    // Unchanged (or nothing saved): the disk is left alone, and no new file appears.
    if (after === null || after === before) return ok();
    if (!(await m.perms.canWriteFile(p))) return fail(name === "nano" ? `[ Error writing ${file}: Permission denied ]` : `E212: Can't open file for writing`);
    await ctx.fs.writeFile(p, after);
    return ok();
  });
}

function macOnly(name: string, note: string): Command {
  return cmd(name, async () => fail(`bash: ${name}: command not found\n${dim(`(${note})`)}`, 127));
}

function pager(m: Machine, name: string): Command {
  return cmd(name, async (args, ctx) => {
    const { operands } = parseArgs(args);
    let text: string;
    let title: string;
    if (operands.length === 0) {
      text = new TextDecoder().decode(ctx.stdin as unknown as Uint8Array);
      title = "(standard input)";
      if (typeof ctx.stdin === "string") text = ctx.stdin;
    } else {
      const f = operands[0];
      const p = join(ctx.cwd, f);
      if (!(await m.perms.exists(p))) return fail(`${f}: No such file or directory`);
      if (await m.perms.isDir(p)) return fail(`${f} is a directory`);
      if (!(await m.perms.can(p, "r"))) return fail(`${f}: Permission denied`);
      text = await ctx.fs.readFile(p);
      title = f;
    }
    if (m.interactive && tty(ctx)) {
      await m.page(text, title);
      return ok();
    }
    return ok(text);
  });
}

async function allUnder(ctx: ResolvedCommandContext, dir: string): Promise<string[]> {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = await ctx.fs.readdir(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    out.push(p);
    if ((await ctx.fs.lstat(p)).isDirectory) out.push(...(await allUnder(ctx, p)));
  }
  return out;
}
