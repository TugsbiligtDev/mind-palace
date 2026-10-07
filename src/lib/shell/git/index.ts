// The `git` command of the practice terminal: a simulation of Git 2.56 written for the course.
// Each subcommand lives in its own file; this one parses the global options and dispatches.
import type { Command, ResolvedCommandContext } from "just-bash";
import type { Machine } from "../machine";
import { join } from "../util";
import { gitAdd, gitCommit, gitConfig, gitInit, gitMv, gitRestore, gitRm } from "./basic";
import { gitBranch, gitCheckout, gitMerge, gitMergeBase, gitSwitch } from "./branching";
import type { G } from "./context";
import { gitCatFile, gitDiff, gitLog, gitLsFiles, gitReflog, gitRevParse, gitShow } from "./history";
import { gitClone, gitFetch, gitLsRemote, gitPull, gitPush, gitRemote } from "./remote";
import { GitError } from "./repo";
import { gitStatus } from "./status";
import { gitCherryPick, gitClean, gitRebase, gitReset, gitRevert } from "./rewrite";
import { gitStash } from "./stash";
import { gitBlame, gitDescribe, gitTag } from "./tags";
import { Repo } from "./repo";

export const GIT_VERSION = "2.56.0";

const SUBCOMMANDS: Record<string, (g: G, args: string[]) => Promise<void>> = {
  init: gitInit,
  config: gitConfig,
  status: gitStatus,
  add: gitAdd,
  commit: gitCommit,
  restore: gitRestore,
  rm: gitRm,
  mv: gitMv,
  log: gitLog,
  diff: gitDiff,
  show: gitShow,
  branch: gitBranch,
  switch: gitSwitch,
  checkout: gitCheckout,
  merge: gitMerge,
  remote: gitRemote,
  clone: gitClone,
  push: gitPush,
  fetch: gitFetch,
  pull: gitPull,
  "rev-parse": gitRevParse,
  "ls-files": gitLsFiles,
  "cat-file": gitCatFile,
  reflog: gitReflog,
  reset: gitReset,
  revert: gitRevert,
  "cherry-pick": gitCherryPick,
  rebase: gitRebase,
  clean: gitClean,
  stash: gitStash,
  tag: gitTag,
  describe: gitDescribe,
  blame: gitBlame,
  "merge-base": gitMergeBase,
  "ls-remote": gitLsRemote,
};

// Taught later in the course (or not at all): say so instead of "not a git command".
const LATER: Record<string, string> = {
  bisect: "Advanced (Module 48)",
  "filter-repo": "Advanced (Module 49)",
  "range-diff": "Advanced (Module 48)",
  maintenance: "Advanced (Module 50)",
  submodule: "Advanced (Module 50)",
  lfs: "Advanced (Module 50)",
  history: "Advanced (Module 49)",
  rerere: "Advanced (Module 49)",
  "sparse-checkout": "Advanced (Module 50)",
  worktree: "Advanced (Module 50)",
};

const USAGE = `usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]
           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]
           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--no-lazy-fetch]
           [--no-optional-locks] [--no-advice] [--bare] [--git-dir=<path>]
           [--work-tree=<path>] [--namespace=<name>] [--config-env=<name>=<envvar>]
           <command> [<args>]

These are common Git commands used in various situations:

start a working area (see also: git help tutorial)
   clone     Clone a repository into a new directory
   init      Create an empty Git repository or reinitialize an existing one

work on the current change (see also: git help everyday)
   add       Add file contents to the index
   mv        Move or rename a file, a directory, or a symlink
   restore   Restore working tree files
   rm        Remove files from the working tree and from the index

examine the history and state (see also: git help revisions)
   diff      Show changes between commits, commit and working tree, etc
   log       Show commit logs
   show      Show various types of objects
   status    Show the working tree status

grow, mark and tweak your common history
   branch    List, create, or delete branches
   commit    Record changes to the repository
   merge     Join two or more development histories together
   rebase    Reapply commits on top of another base tip
   reset     Reset current HEAD to the specified state
   switch    Switch branches
   tag       Create, list, delete or verify tags

collaborate (see also: git help workflows)
   fetch     Download objects and refs from another repository
   pull      Fetch from and integrate with another repository or a local branch
   push      Update remote refs along with associated objects

'git help -a' and 'git help -g' list available subcommands and some
concept guides. See 'git help <command>' or 'git help <concept>'
to read about a specific subcommand or concept.
See 'git help git' for an overview of the system.
`;

const SHORT_HELP: Record<string, string> = {
  init: "usage: git init [-q | --quiet] [--bare] [-b <branch-name> | --initial-branch=<branch-name>] [<directory>]",
  add: "usage: git add [<options>] [--] <pathspec>...\n\n    -n, --[no-]dry-run    dry run\n    -v, --[no-]verbose    be verbose\n    -f, --[no-]force      allow adding otherwise ignored files\n    -u, --[no-]update     update tracked files\n    -A, --[no-]all        add changes from all tracked and untracked files\n    --[no-]resolved       stage only resolved conflicts (refuses while markers remain)",
  commit: "usage: git commit [-a | --interactive | --patch] [-s] [-v] [-u[<mode>]] [--amend]\n                  [--dry-run] [(-c | -C | --squash) <commit> | --fixup [(amend|reword):]<commit>]\n                  [-F <file> | -m <msg>] [--reset-author] [--allow-empty]\n                  [--allow-empty-message] [--no-verify] [-e] [--author=<author>]\n                  [--date=<date>] [--cleanup=<mode>] [--[no-]status]\n                  [-i | -o] [--pathspec-from-file=<file> [--pathspec-file-nul]]\n                  [(--trailer <token>[(=|:)<value>])...] [-S[<keyid>]]\n                  [--] [<pathspec>...]",
  status: "usage: git status [<options>] [--] [<pathspec>...]\n\n    -s, --[no-]short      show status concisely\n    -b, --[no-]branch     show branch information\n    -u, --untracked-files[=<mode>]\n                          show untracked files, optional modes: all, normal, no",
  log: "usage: git log [<options>] [<revision-range>] [[--] <path>...]\n\n    --oneline             one commit per line\n    --graph               draw the branch structure\n    --all                 every branch, not just the current one\n    -n <number>           only the newest <number> commits\n    --stat                which files each commit changed\n    -p                    the full changes of each commit",
  diff: "usage: git diff [<options>] [<commit>] [--] [<path>...]\n   or: git diff [<options>] --cached [--merge-base] [<commit>] [--] [<path>...]\n   or: git diff [<options>] [--merge-base] <commit> [<commit>...] <commit> [--] [<path>...]",
  restore: "usage: git restore [<options>] [--source=<branch>] <file>...\n\n    -s, --source <tree-ish>\n                          which tree-ish to checkout from\n    -S, --[no-]staged     restore the index\n    -W, --[no-]worktree   restore the working tree (default)",
  branch: "usage: git branch [<options>] [-r | -a] [--merged] [--no-merged]\n   or: git branch [<options>] [-f] [--recurse-submodules] <branch-name> [<start-point>]\n   or: git branch [<options>] [-l] [<pattern>...]\n   or: git branch [<options>] [-r] (-d | -D) <branch-name>...\n   or: git branch [<options>] (-m | -M) [<old-branch>] <new-branch>\n   or: git branch --delete-merged [--dry-run] [<pattern>...]",
  switch: "usage: git switch [<options>] [<branch>]\n   or: git switch [<options>] --detach [<start-point>]\n   or: git switch [<options>] (-c|-C|--orphan) <new-branch> [<start-point>]",
  merge: "usage: git merge [<options>] [<commit>...]\n   or: git merge --abort\n   or: git merge --continue",
  push: "usage: git push [<options>] [<repository> [<refspec>...]]",
  pull: "usage: git pull [<options>] [<repository> [<refspec>...]]",
  remote: "usage: git remote [-v | --verbose]\n   or: git remote add [-t <branch>] [-m <master>] [-f] [--tags | --no-tags] [--mirror=<fetch|push>] <name> <url>\n   or: git remote rename [--[no-]progress] <old> <new>\n   or: git remote remove <name>\n   or: git remote get-url [--push] [--all] <name>\n   or: git remote set-url [--push] <name> <newurl> [<oldurl>]",
};

const LEVENSHTEIN_MAX = 2;

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * The context a git subcommand runs in. Git writes progress and hints to standard error and
 * results to standard output; on screen they appear in the order they were written, so keep
 * that order too. `done` turns what was written into the command's result.
 */
export function makeG(m: Machine, ctx: ResolvedCommandContext) {
  let out = "";
  let err = "";
  let both = "";
  const g: G = {
    m,
    fs: ctx.fs,
    cwd: ctx.cwd,
    tty: ctx.env.get("MP_TTY") === "1",
    env: ctx.env,
    get out() {
      return out;
    },
    set out(v: string) {
      both += v.slice(out.length);
      out = v;
    },
    get err() {
      return err;
    },
    set err(v: string) {
      both += v.slice(err.length);
      err = v;
    },
  };
  const done = (exitCode: number, extraErr = "") => (g.tty ? { stdout: both + extraErr, stderr: "", exitCode } : { stdout: out, stderr: err + extraErr, exitCode });
  return { g, done };
}

export function gitCommand(m: Machine): Command {
  const command: Command = {
    name: "git",
    async execute(args, ctx) {
      const { g, done } = makeG(m, ctx);
      const rest = [...args];
      // Global options before the subcommand.
      while (rest.length && rest[0].startsWith("-")) {
        const a = rest.shift()!;
        if (a === "--version" || a === "-v") return { stdout: `git version ${GIT_VERSION}\n`, stderr: "", exitCode: 0 };
        if (a === "--help" || a === "-h") return { stdout: USAGE, stderr: "", exitCode: 0 };
        if (a === "-C") g.cwd = join(g.cwd, rest.shift() ?? ".");
        else if (a === "--no-pager" || a === "-P" || a === "--no-advice") continue;
        else if (a === "-c") rest.shift();
        else return { stdout: "", stderr: `unknown option: ${a}\n${USAGE}`, exitCode: 129 };
      }
      const sub = rest.shift();
      if (!sub) return { stdout: USAGE, stderr: "", exitCode: 1 };
      if (sub === "help") {
        const topic = rest[0];
        if (!topic) return { stdout: USAGE, stderr: "", exitCode: 0 };
        const page = SHORT_HELP[topic] ?? (SUBCOMMANDS[topic] ? `git ${topic}: see 'git ${topic} -h'.` : undefined);
        if (!page) return { stdout: "", stderr: `No manual entry for git-${topic}\n`, exitCode: 16 };
        return { stdout: `${page}\n`, stderr: "", exitCode: 0 };
      }
      if (rest[0] === "-h" && SUBCOMMANDS[sub]) return { stdout: `${SHORT_HELP[sub] ?? `usage: git ${sub} [<options>]`}\n`, stderr: "", exitCode: 129 };
      let run = SUBCOMMANDS[sub];
      if (!run) {
        // An alias (git config alias.st status). "!" runs a shell command instead.
        const repo = await Repo.find(g.fs, g.cwd, m.now);
        let alias: string | undefined;
        if (repo) alias = await repo.config(`alias.${sub}`);
        else {
          const { parseConfig, configEntries, GLOBAL_CONFIG } = await import("./repo");
          try {
            alias = configEntries(parseConfig(await g.fs.readFile(GLOBAL_CONFIG))).filter(([k]) => k === `alias.${sub.toLowerCase()}`).at(-1)?.[1];
          } catch {
            alias = undefined;
          }
        }
        if (alias) {
          if (alias.startsWith("!")) {
            const r = await ctx.exec!(`${alias.slice(1)} ${rest.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ")}`, { cwd: g.cwd, env: Object.fromEntries(ctx.env) });
            return r;
          }
          const words = alias.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^["']|["']$/g, "")) ?? [];
          return command.execute([...words, ...rest], ctx);
        }
      }
      run = SUBCOMMANDS[sub];
      if (!run) {
        if (LATER[sub]) return { stdout: "", stderr: `git: '${sub}' is a real Git command, but the practice terminal adds it in ${LATER[sub]}.\n`, exitCode: 1 };
        const close = Object.keys(SUBCOMMANDS).filter((c) => distance(c, sub) <= LEVENSHTEIN_MAX);
        const hint = close.length ? `\n\nThe most similar command${close.length > 1 ? "s are" : " is"}\n${close.map((c) => `\t${c}`).join("\n")}` : "";
        return { stdout: "", stderr: `git: '${sub}' is not a git command. See 'git --help'.${hint}\n`, exitCode: 1 };
      }
      try {
        await run(g, rest);
        return done(0);
      } catch (e) {
        if (e instanceof GitError) {
          const msg = e.message ? (e.message.endsWith("\n") ? e.message : `${e.message}\n`) : "";
          // `git commit` with nothing to commit prints the status on standard output.
          if (e.code === 1 && sub === "commit" && (msg.startsWith("On branch") || msg.startsWith("HEAD detached"))) {
            g.out += msg;
            return done(1);
          }
          g.out += e.stdout;
          return done(e.code, msg);
        }
        throw e;
      }
    },
  };
  return command;
}
