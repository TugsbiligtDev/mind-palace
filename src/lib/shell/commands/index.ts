// Every command the practice terminal adds to (or puts in front of) just-bash's built-ins.
import type { Command } from "just-bash";
import { gitCommand } from "../git";
import type { Machine } from "../machine";
import { ghCommand } from "./gh";
import { githubCommands } from "./github";
import { guardCommands } from "./guard";
import { lsCommand } from "./ls";
import { miscCommands } from "./misc";
import { aptCommands, needPackage } from "./apt";
import { orig } from "./guard";
import { systemCommands } from "./system";
import { adminCommands } from "./admin";
import { netCommands } from "./net";
import { shellcheckCommand } from "./shellcheck";
import { archiveCommands } from "./archive";

// --help for the commands whose just-bash versions don't have it (GNU wording, shortened).
const HELP: Record<string, string> = {
  mkdir: `Usage: mkdir [OPTION]... DIRECTORY...
Create the DIRECTORY(ies), if they do not already exist.

  -m, --mode=MODE   set file mode (as in chmod), not a=rwx - umask
  -p, --parents     no error if existing, make parent directories as needed
  -v, --verbose     print a message for each created directory
      --help        display this help and exit
`,
  touch: `Usage: touch [OPTION]... FILE...
Update the access and modification times of each FILE to the current time.

A FILE argument that does not exist is created empty, unless -c is supplied.

  -c, --no-create        do not create any files
  -d, --date=STRING      use STRING instead of current time
      --help             display this help and exit
`,
  rm: `Usage: rm [OPTION]... [FILE]...
Remove (unlink) the FILE(s).

  -f, --force           ignore nonexistent files and arguments, never prompt
  -i                    prompt before every removal
  -r, -R, --recursive   remove directories and their contents recursively
  -d, --dir             remove empty directories
  -v, --verbose         explain what is being done
      --help            display this help and exit

By default, rm does not remove directories.  Use the --recursive (-r or -R)
option to remove each listed directory, too, along with all of its contents.

Note that if you use rm to remove a file, it might be possible to recover
some of its contents, given sufficient expertise and/or time.  For greater
assurance that the contents are unrecoverable, consider using shred(1).
`,
};

function withHelp(c: Command): Command {
  const help = HELP[c.name];
  if (!help) return c;
  return { ...c, execute: (args, ctx) => (args.includes("--help") ? Promise.resolve({ stdout: help, stderr: "", exitCode: 0 }) : c.execute(args, ctx)) };
}

// GNU tools accept a short option glued to its value (xargs -n1, paste -sd,); just-bash's
// versions want them apart.
function splitGlued(name: string, valued: string): Command {
  return {
    name,
    execute(args, ctx) {
      const out: string[] = [];
      for (const a of args) {
        const m = /^-([a-zA-Z]+)$/.exec(a);
        if (!m || a.length < 3) {
          out.push(a);
          continue;
        }
        // -sd, : flags until the first one that takes a value, then the rest is its value.
        const body = m[1];
        const i = [...body].findIndex((c) => valued.includes(c));
        if (i === -1) out.push(...[...body].map((c) => `-${c}`));
        else {
          out.push(...[...body.slice(0, i)].map((c) => `-${c}`), `-${body[i]}`);
          if (body.slice(i + 1)) out.push(body.slice(i + 1));
        }
      }
      // Values that aren't letters (-n1, -I{}, -d,) don't match the pattern above.
      const fixed = out.flatMap((a) => {
        const v = /^-([a-zA-Z])(.+)$/.exec(a);
        return v && valued.includes(v[1]) && !/^[a-zA-Z]+$/.test(v[2]) ? [`-${v[1]}`, v[2]] : [a];
      });
      // paste with no file reads standard input (GNU does that by itself).
      if (name === "paste" && !fixed.some((a, i) => !a.startsWith("-") && !(fixed[i - 1] === "-d"))) fixed.push("-");
      return orig(ctx, fixed);
    },
  };
}

// Programs from packages a fresh Ubuntu server doesn't have.
function fromPackage(m: Machine, name: string): Command {
  return {
    name,
    async execute(args, ctx) {
      const missing = ctx.env.get("MP_BUILTIN_PKG") ? undefined : await needPackage(m, name);
      return missing ?? orig(ctx, args);
    },
  };
}

// sort with keys (-k2,2n), a separator (-t,) or human sizes (-h): just-bash gets multi-key and
// human sorting wrong, so those are done here, the way GNU sort does them.
function keySort(base: Command): Command {
  return {
    name: "sort",
    async execute(input, ctx) {
      const args = [...input];
      const needsUs = args.some((a) => /^-[a-zA-Z]*[kht]/.test(a) || a.startsWith("--key") || a === "--human-numeric-sort" || a.startsWith("--field-separator"));
      if (!needsUs) return base.execute(args, ctx);
      const keys: { s: number; sc: number; e?: number; ec?: number; flags: string }[] = [];
      let sep: string | undefined;
      let global = "";
      const files: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        let m: RegExpExecArray | null;
        if ((m = /^(?:-k|--key=?)(.*)$/.exec(a))) {
          const spec = m[1] || args[++i] || "";
          const [p1, p2] = spec.split(",");
          const f1 = /^(\d+)(?:\.(\d+))?([a-zA-Z]*)$/.exec(p1);
          const f2 = p2 ? /^(\d+)(?:\.(\d+))?([a-zA-Z]*)$/.exec(p2) : null;
          if (!f1) return { stdout: "", stderr: `sort: invalid field specification '${spec}'\n`, exitCode: 2 };
          keys.push({ s: Number(f1[1]), sc: Number(f1[2] ?? 1), e: f2 ? Number(f2[1]) : undefined, ec: f2?.[2] ? Number(f2[2]) : undefined, flags: f1[3] + (f2?.[3] ?? "") });
        } else if ((m = /^(?:-t|--field-separator=?)(.*)$/.exec(a))) sep = m[1] || args[++i];
        else if (a === "--human-numeric-sort") global += "h";
        else if (a === "--reverse") global += "r";
        else if (a === "--numeric-sort") global += "n";
        else if (a === "--unique") global += "u";
        else if (/^-[a-zA-Z][a-zA-Z0-9.,]*$/.test(a)) {
          // Bundled flags, possibly ending in an option with its value: -nrk2, -t,
          const body = a.slice(1);
          const k = body.search(/[kt]/);
          if (k < 0 && /\d/.test(body)) {
            files.push(a);
            continue;
          }
          if (k < 0) global += body;
          else {
            global += body.slice(0, k);
            const rest = body.slice(k + 1);
            // Put the option back as its own argument, with its value glued on.
            args.splice(i + 1, 0, `-${body[k]}${rest || (args.splice(i + 1, 1)[0] ?? "")}`);
          }
        } else if (a === "-") files.push("-");
        else files.push(a);
      }
      let text = "";
      if (files.length && !(files.length === 1 && files[0] === "-")) {
        for (const f of files) {
          try {
            text += await ctx.fs.readFile(f.startsWith("/") ? f : `${ctx.cwd}/${f}`);
          } catch {
            return { stdout: "", stderr: `sort: cannot read: ${f}: No such file or directory\n`, exitCode: 2 };
          }
        }
      } else text = String(ctx.stdin ?? "");
      const lines = text.split("\n");
      if (lines.at(-1) === "") lines.pop();
      const fields = (l: string): string[] => {
        if (sep !== undefined) return l.split(sep);
        // Blank-separated: each field keeps the blanks in front of it, like GNU sort.
        return l.match(/\s*\S+/g) ?? [""];
      };
      const keyText = (l: string, k: (typeof keys)[number]) => {
        const f = fields(l);
        const join = sep ?? "";
        const from = (f[k.s - 1] ?? "").slice(k.sc - 1);
        if (k.e === undefined) return [from, ...f.slice(k.s)].join(join);
        if (k.e === k.s) return k.ec ? from.slice(0, k.ec - k.sc + 1) : from;
        return [from, ...f.slice(k.s, k.e - 1), k.ec ? (f[k.e - 1] ?? "").slice(0, k.ec) : (f[k.e - 1] ?? "")].join(join);
      };
      const units = "KMGTPE";
      const human = (t: string) => {
        const m = /^\s*(-?\d+(?:\.\d+)?)([KMGTPE])?/i.exec(t);
        if (!m) return -Infinity;
        return Number(m[1]) * 1024 ** (m[2] ? units.indexOf(m[2].toUpperCase()) + 1 : 0);
      };
      const num = (t: string) => {
        const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(t);
        return m ? Number(m[1]) : 0;
      };
      const cmpBy = (a: string, b: string, flags: string) => {
        const f = flags || global.replace(/[ru]/g, "");
        let c: number;
        if (f.includes("h")) c = human(a) - human(b);
        else if (f.includes("n")) c = num(a) - num(b);
        else {
          let x = f.includes("b") ? a.trimStart() : a;
          let y = f.includes("b") ? b.trimStart() : b;
          if (f.includes("f")) {
            x = x.toLowerCase();
            y = y.toLowerCase();
          }
          c = x < y ? -1 : x > y ? 1 : 0;
        }
        const reverse = flags ? flags.includes("r") : global.includes("r");
        return reverse ? -c : c;
      };
      const all = keys.length ? keys : [{ s: 1, sc: 1, flags: "" } as (typeof keys)[number]];
      const sorted = [...lines].sort((a, b) => {
        for (const k of all) {
          const c = keys.length ? cmpBy(keyText(a, k), keyText(b, k), k.flags) : cmpBy(a, b, "");
          if (c) return c;
        }
        if (global.includes("s")) return 0;
        const last = a < b ? -1 : a > b ? 1 : 0;
        return global.includes("r") ? -last : last;
      });
      let out = sorted;
      const same = (x: string, y: string) => all.every((k) => (keys.length ? cmpBy(keyText(x, k), keyText(y, k), k.flags) : cmpBy(x, y, "")) === 0);
      if (global.includes("u")) out = sorted.filter((l, i) => i === 0 || !same(l, sorted[i - 1]));
      return { stdout: out.length ? `${out.join("\n")}\n` : "", stderr: "", exitCode: 0 };
    },
  };
}

export function customCommands(m: Machine): Command[] {
  return [
    lsCommand(m),
    ...guardCommands(m),
    ...miscCommands(m),
    ...systemCommands(m),
    ...aptCommands(m),
    ...adminCommands(m),
    ...netCommands(m),
    shellcheckCommand(m),
    ...archiveCommands(m),
    splitGlued("xargs", "nIdPLsE"),
    splitGlued("paste", "d"),
    fromPackage(m, "jq"),
    fromPackage(m, "rg"),
    gitCommand(m),
    ...githubCommands(m),
    ghCommand(m),
  ]
    .map((c) => (c.name === "sort" ? keySort(c) : c))
    .map(withHelp);
}

// Commands that need a file in /usr/bin so `which` and `ls /usr/bin` find them.
export const STUB_NAMES = [
  "git", "gh", "ssh", "ssh-keygen", "ssh-add", "ssh-agent", "man", "less", "more", "nano", "sudo", "id", "groups", "chown", "uname", "tldr",
  "ps", "top", "nproc", "lsb_release", "htop", "kill", "pgrep", "pkill", "killall", "nohup", "free", "uptime", "who", "df", "apt", "apt-get", "dpkg", "cowsay",
  "systemctl", "service", "journalctl", "curl", "wget", "ping", "dig", "host", "nslookup", "nc", "ss", "ip", "ufw", "scp", "rsync", "ssh-copy-id", "adduser", "useradd", "usermod", "userdel", "deluser", "gpasswd", "groupadd", "passwd", "getent", "su", "visudo", "crontab",
];
