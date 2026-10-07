// Small helpers shared by the practice terminal's commands.
import type { ExecResult } from "just-bash";

export const USER = "learner";
export const HOST = "inkwell";
export const HOME = `/home/${USER}`;

export const ok = (stdout = "", stderr = "", exitCode = 0): ExecResult => ({ stdout, stderr, exitCode });
export const fail = (stderr: string, exitCode = 1): ExecResult => ({ stdout: "", stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`, exitCode });

// "a b" -> 'a b', so a path can be pasted back into a command line.
export function quote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export function join(dir: string, name: string): string {
  if (name.startsWith("/")) return normalize(name);
  return normalize(`${dir}/${name}`);
}

export function normalize(p: string): string {
  const parts: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function dirname(p: string): string {
  const n = normalize(p);
  const i = n.lastIndexOf("/");
  return i <= 0 ? "/" : n.slice(0, i);
}

export function basename(p: string): string {
  const n = normalize(p);
  return n.slice(n.lastIndexOf("/") + 1) || "/";
}

// ~/case instead of /home/learner/case, the way bash shows the current folder in the prompt.
export function tildify(p: string): string {
  if (p === HOME) return "~";
  return p.startsWith(`${HOME}/`) ? `~${p.slice(HOME.length)}` : p;
}

// Splits "-la" into "-l -a" style flags. Returns the set of single-letter flags, the long
// options (without "--") and the remaining operands. Everything after "--" is an operand.
// `withValue` lists short flags that take the next word as their value (e.g. "n" for head -n 5).
// `at` holds where each operand is in `args`.
export function parseArgs(args: string[], withValue = "") {
  const flags = new Set<string>();
  const long: string[] = [];
  const values: Record<string, string> = {};
  const operands: string[] = [];
  const at: number[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      for (let j = i + 1; j < args.length; j++) {
        operands.push(args[j]);
        at.push(j);
      }
      break;
    }
    if (a.startsWith("--")) long.push(a.slice(2));
    else if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (withValue.includes(f)) {
          values[f] = a.slice(j + 1) || args[++i] || "";
          break;
        }
        flags.add(f);
      }
    } else {
      operands.push(a);
      at.push(i);
    }
  }
  return { flags, long, values, operands, at };
}

/** Text with the terminal's color and cursor codes removed. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function toText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : decoder.decode(content);
}

/** A stand-in for a password hash in /etc/shadow: the same password always gives the same text. */
export function pwHash(pw: string): string {
  let h = 5381;
  for (const c of pw) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return `$y$j9T$${h.toString(36)}$${(h * 7919).toString(36)}practice`;
}

/** Your password on the practice servers (Part 8), as the lessons tell you. */
export const SERVER_PASSWORD = "bookworm";
