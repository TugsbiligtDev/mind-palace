// Permission checks in front of the built-in commands, so a file the learner may not read or
// change gives the same "Permission denied" message as on a real Linux machine (the built-in
// commands would report "No such file or directory"). Each wrapper checks its operands, then
// hands the allowed ones to the original command.
import type { Command, ExecResult, ResolvedCommandContext } from "just-bash";
import type { Machine } from "../machine";
import { basename, dirname, join, parseArgs } from "../util";

type Check = (m: Machine, args: string[], ctx: ResolvedCommandContext) => Promise<{ denied: string[]; keep: string[] }>;

// Short options that take a value, per command, so "-n 5" isn't mistaken for a file called 5.
const VALUE_FLAGS: Record<string, string> = {
  head: "nc",
  tail: "nc",
  grep: "efmABC",
  egrep: "efmABC",
  fgrep: "efmABC",
  sort: "kotS",
  cut: "dfcb",
  sed: "ef",
  awk: "fvF",
  uniq: "fs",
  nl: "bwsv",
  wc: "",
  cat: "",
  tac: "s",
  diff: "U",
};

// Commands whose first operand is a pattern or program, not a file (unless -e/-f gave it).
const PATTERN_FIRST = new Set(["grep", "egrep", "fgrep", "sed", "awk"]);

const readCheck: Check = async (m, args, ctx) => {
  const name = ctx.env.get("MP_CMD") ?? "";
  const { values, at } = parseArgs(args, VALUE_FLAGS[name] ?? "");
  const files = PATTERN_FIRST.has(name) && !values.e && !values.f ? at.slice(1) : at;
  const denied: string[] = [];
  // Leave out the unreadable files by position: the pattern may be the same word (grep notes notes).
  const drop = new Set<number>();
  for (const i of files) {
    const f = args[i];
    if (f === "-") continue;
    const p = join(ctx.cwd, f);
    if ((await m.perms.exists(p)) && !(await m.perms.isDir(p)) && !(await m.perms.can(p, "r"))) {
      denied.push(f);
      drop.add(i);
    }
  }
  return { denied, keep: args.filter((_, i) => !drop.has(i)) };
};

// cat, grep, head…: report unreadable files, run the rest.
function readWrapper(m: Machine, name: string): Command {
  return {
    name,
    async execute(args, ctx) {
      const { denied, keep } = await readCheck(m, args, withName(ctx, name));
      if (denied.length === 0) return orig(ctx, args);
      let stderr = "";
      for (const f of denied) stderr += `${name}: ${f}: Permission denied\n`;
      const hasOtherFiles = parseArgs(keep, VALUE_FLAGS[name] ?? "").operands.length > (PATTERN_FIRST.has(name) ? 1 : 0);
      if (!hasOtherFiles) return { stdout: "", stderr, exitCode: name === "grep" ? 2 : 1 };
      const r = await orig(ctx, keep);
      return { stdout: r.stdout, stderr: stderr + r.stderr, exitCode: name === "grep" ? 2 : 1 };
    },
  };
}

function withName(ctx: ResolvedCommandContext, name: string): ResolvedCommandContext {
  const env = new Map(ctx.env);
  env.set("MP_CMD", name);
  return { ...ctx, env };
}

export function orig(ctx: ResolvedCommandContext, args: string[]): Promise<ExecResult> {
  if (!ctx.origCommand) return Promise.resolve({ stdout: "", stderr: "internal error: no original command\n", exitCode: 1 });
  return ctx.origCommand(args);
}

// Commands that create, change or delete entries: each operand needs write permission on its
// folder (or on the file, for touch). Messages match GNU coreutils.
function writeWrapper(m: Machine, name: string, message: (f: string) => string, needs: (p: string) => Promise<boolean>, onlyExisting = false): Command {
  return {
    name,
    async execute(args, ctx) {
      // chmod's first operand is the mode, which may itself start with "-" (chmod -x file).
      const targets = name === "chmod" ? args.flatMap((a, i) => (/^-[Rvcf]+$/.test(a) ? [] : [i])).slice(1) : parseArgs(args).at;
      let stderr = "";
      const drop = new Set<number>();
      for (const i of targets) {
        const f = args[i];
        const p = join(ctx.cwd, f);
        if (onlyExisting && !(await m.perms.exists(p))) continue;
        if (!(await needs(p))) {
          stderr += message(f);
          drop.add(i);
        }
      }
      if (drop.size === 0) return orig(ctx, args);
      const keep = args.filter((_, i) => !drop.has(i));
      const left = name === "chmod" ? keep.filter((a) => !/^-[Rvcf]+$/.test(a)).length > 1 : parseArgs(keep).operands.length > 0;
      if (!left) return { stdout: "", stderr, exitCode: 1 };
      const r = await orig(ctx, keep);
      return { stdout: r.stdout, stderr: stderr + r.stderr, exitCode: 1 };
    },
  };
}

// cp and mv: read the sources, write into the destination folder.
function copyWrapper(m: Machine, name: "cp" | "mv"): Command {
  return {
    name,
    async execute(args, ctx) {
      const { operands } = parseArgs(args, "t");
      if (operands.length < 2) return orig(ctx, args);
      const dest = join(ctx.cwd, operands.at(-1)!);
      const destIsDir = await m.perms.isDir(dest);
      for (const src of operands.slice(0, -1)) {
        const s = join(ctx.cwd, src);
        if (!(await m.perms.exists(s))) continue;
        const target = destIsDir ? join(dest, s.split("/").pop()!) : dest;
        if (name === "cp" && !(await m.perms.isDir(s)) && !(await m.perms.can(s, "r")))
          return { stdout: "", stderr: `cp: cannot open '${src}' for reading: Permission denied\n`, exitCode: 1 };
        if (name === "mv" && (!(await m.perms.can(dirname(s), "w")) || !(await m.perms.can(dirname(target), "w"))))
          return { stdout: "", stderr: `mv: cannot move '${src}' to '${operands.at(-1)}': Permission denied\n`, exitCode: 1 };
        if (name === "cp" && !(await m.perms.canWriteFile(target)))
          return { stdout: "", stderr: `cp: cannot create regular file '${operands.at(-1)}': Permission denied\n`, exitCode: 1 };
      }
      return orig(ctx, args);
    },
  };
}

// ln: a symbolic link needs write permission on its folder; a hard link also needs access to
// the file it links (Linux's protected_hardlinks).
function lnWrapper(m: Machine): Command {
  return {
    name: "ln",
    async execute(args, ctx) {
      const { flags, operands } = parseArgs(args, "tS");
      if (operands.length !== 2) return orig(ctx, args);
      const [src, to] = operands;
      const dest = join(ctx.cwd, to);
      const into = await m.perms.isDir(dest);
      const target = into ? join(dest, basename(src)) : dest;
      const shown = into ? `${to.replace(/\/$/, "")}/${basename(src)}` : to;
      const kind = flags.has("s") ? "symbolic link" : "hard link";
      if (!flags.has("s")) {
        const s = join(ctx.cwd, src);
        if ((await m.perms.exists(s)) && !(await m.perms.isDir(s)) && !(await m.perms.canLink(s)))
          return { stdout: "", stderr: `ln: failed to create hard link '${shown}' => '${src}': Operation not permitted\n`, exitCode: 1 };
      }
      if (!(await m.perms.canWriteFile(target))) return { stdout: "", stderr: `ln: failed to create ${kind} '${shown}': Permission denied\n`, exitCode: 1 };
      return orig(ctx, args);
    },
  };
}

export function guardCommands(m: Machine): Command[] {
  const reads = ["cat", "head", "wc", "grep", "egrep", "fgrep", "sort", "uniq", "cut", "sed", "awk", "nl", "tac", "diff"].map((n) => readWrapper(m, n));
  return [
    ...reads,
    copyWrapper(m, "cp"),
    copyWrapper(m, "mv"),
    lnWrapper(m),
    writeWrapper(m, "mkdir", (f) => `mkdir: cannot create directory '${f}': Permission denied\n`, async (p) => (await m.perms.exists(p)) || m.perms.canChangeDir(p)),
    writeWrapper(m, "rmdir", (f) => `rmdir: failed to remove '${f}': Permission denied\n`, (p) => m.perms.canChangeDir(p), true),
    writeWrapper(m, "touch", (f) => `touch: cannot touch '${f}': Permission denied\n`, (p) => m.perms.canWriteFile(p)),
    writeWrapper(m, "chmod", (f) => `chmod: changing permissions of '${f}': Operation not permitted\n`, async (p) => m.perms.isOwner(p), true),
    writeWrapper(m, "tee", (f) => `tee: ${f}: Permission denied\n`, (p) => m.perms.canWriteFile(p)),
  ];
}
