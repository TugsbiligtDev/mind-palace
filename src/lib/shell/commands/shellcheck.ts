// ShellCheck for the practice terminal (Module 29): the checks a beginner script trips over
// most, reported in ShellCheck's own format with its codes (SC2086 and friends), so what the
// learner sees here is what the real tool says.
import type { Command } from "just-bash";
import type { Machine } from "../machine";
import { fail, join, ok, parseArgs } from "../util";
import { needPackage } from "./apt";

type Level = "error" | "warning" | "info" | "style";
type Finding = { line: number; col: number; code: number; level: Level; msg: string; fix?: string };

const WIKI: Record<number, string> = {
  1068: "Don't put spaces around the = in assignments.",
  2006: "Use $(...) notation instead of legacy backticks `...`.",
  2034: "foo appears unused. Verify use (or export if used externally).",
  2045: "Iterating over ls output is fragile. Use globs.",
  2046: "Quote this to prevent word splitting.",
  2068: "Double quote array expansions to avoid re-splitting elements.",
  2086: "Double quote to prevent globbing and word splitting.",
  2148: "Tips depend on target shell and yours is unknown. Add a shebang or a 'shell' directive.",
  2162: "read without -r will mangle backslashes.",
  2164: "Use 'cd ... || exit' or 'cd ... || return' in case cd fails.",
  2181: "Check exit code directly with e.g. 'if mycmd;', not indirectly with $?.",
  2010: "Don't use ls | grep. Use a glob or a for loop with a condition to allow non-alphanumeric filenames.",
  2155: "Declare and assign separately to avoid masking return values.",
};

/**
 * Splits a line into its code part (comments removed) and, for each character, its quoting:
 * 0 outside quotes, 1 in single quotes, 2 in double quotes. Inside `$( … )` quoting starts
 * afresh, even within double quotes, as in bash.
 */
function scan(line: string) {
  const state: number[] = [];
  const stack: { q: number; depth: number }[] = [];
  let q = 0;
  let depth = 0;
  let end = line.length;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q === 0 && c === "#" && (i === 0 || /[\s;|&(]/.test(line[i - 1]))) {
      end = i;
      break;
    }
    if (q !== 1 && c === "\\") {
      state.push(q, q);
      i++;
      continue;
    }
    if (q !== 1 && c === "$" && line[i + 1] === "(") {
      state.push(q, q);
      stack.push({ q, depth });
      q = 0;
      depth = 0;
      i++;
      continue;
    }
    if (q === 0 && stack.length) {
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) {
          const prev = stack.pop()!;
          q = prev.q;
          depth = prev.depth;
          state.push(q);
          continue;
        }
        depth--;
      }
    }
    if (q === 0 && c === "'") q = 1;
    else if (q === 1 && c === "'") {
      state.push(1);
      q = 0;
      continue;
    } else if (q === 0 && c === '"') q = 2;
    else if (q === 2 && c === '"') {
      state.push(2);
      q = 0;
      continue;
    }
    state.push(q);
  }
  return { code: line.slice(0, end), state };
}

export function lint(text: string): Finding[] {
  const lines = text.split("\n");
  const out: Finding[] = [];
  if (!lines[0]?.startsWith("#!")) out.push({ line: 1, col: 1, code: 2148, level: "error", msg: WIKI[2148] });
  const assigned = new Map<string, { line: number; col: number }>();
  const used = new Set<string>();
  let inHeredoc: string | undefined;
  for (const [i, raw] of lines.entries()) {
    const n = i + 1;
    if (inHeredoc) {
      if (raw.trim() === inHeredoc) inHeredoc = undefined;
      for (const m of raw.matchAll(/\$\{?(\w+)/g)) used.add(m[1]);
      continue;
    }
    const hd = /<<-?\s*['"]?(\w+)['"]?/.exec(raw);
    if (hd) inHeredoc = hd[1];
    if (i === 0 && raw.startsWith("#!")) continue;
    const { code, state } = scan(raw);
    if (!code.trim()) continue;
    // Variables read anywhere (for SC2034), including inside quotes.
    for (const m of code.matchAll(/\$\{?([A-Za-z_]\w*)/g)) used.add(m[1]);
    for (const m of code.matchAll(/\$\{?(#|@|\*|[0-9])/g)) used.add(m[1]);
    // Assignments: name=value at the start of a command.
    const asg = /^(\s*(?:export\s+|local\s+|readonly\s+)?)([A-Za-z_]\w*)=/.exec(code);
    if (asg && !/^\s*(export|local|readonly)/.test(code)) assigned.set(asg[2], assigned.get(asg[2]) ?? { line: n, col: asg[1].length + 1 });
    const spaced = /^\s*([A-Za-z_]\w*)\s+=\s*\S/.exec(code);
    if (spaced && !/^\s*(if|while|test|\[)/.test(code)) out.push({ line: n, col: code.indexOf(spaced[1]) + spaced[1].length + 2, code: 1068, level: "error", msg: WIKI[1068] });
    const bt = code.indexOf("`");
    if (bt >= 0 && state[bt] !== 1) out.push({ line: n, col: bt + 1, code: 2006, level: "style", msg: WIKI[2006], fix: code.replace(/`([^`]*)`/, "$($1)") });
    const forLs = /\bfor\s+\w+\s+in\s+(\$\(\s*ls\b[^)]*\)|`ls[^`]*`)/.exec(code);
    if (forLs) out.push({ line: n, col: code.indexOf(forLs[1]) + 1, code: 2045, level: "error", msg: WIKI[2045] });
    if (/\bls\b[^|]*\|\s*grep\b/.test(code)) out.push({ line: n, col: code.search(/\bls\b/) + 1, code: 2010, level: "warning", msg: WIKI[2010] });
    const cd = /(^|[;&|]\s*|\bthen\s+|\bdo\s+)cd\s+[^;&|]+$/.exec(code.trim());
    if (cd && !/\|\|\s*(exit|return)/.test(code) && !/\bset\s+-e/.test(text)) out.push({ line: n, col: code.indexOf("cd") + 1, code: 2164, level: "warning", msg: WIKI[2164], fix: `${code.trimEnd()} || exit` });
    if (/^\s*(while\s+)?read\b(?!.*\s-r)/.test(code) || /\|\s*while\s+read\b(?!.*\s-r)/.test(code)) {
      const at = code.indexOf("read");
      out.push({ line: n, col: at + 1, code: 2162, level: "info", msg: WIKI[2162] });
    }
    if (/\[\s*\$\?\s*-(eq|ne)\s*0\s*\]|\[\[\s*\$\?\s*-(eq|ne)/.test(code)) out.push({ line: n, col: code.indexOf("$?") + 1, code: 2181, level: "style", msg: WIKI[2181] });
    // Unquoted expansions in command words (not in [[ ]], assignments, arithmetic or case words).
    const dbl = code.indexOf("[[");
    const dblEnd = code.indexOf("]]");
    for (const m of code.matchAll(/\$(\{[^}]*\}|[A-Za-z_]\w*|[@*#?$!0-9]|\()/g)) {
      const at = m.index!;
      if (state[at] !== 0) continue;
      if (dbl >= 0 && at > dbl && (dblEnd < 0 || at < dblEnd)) continue;
      const before = code.slice(0, at);
      if (/\$\(\($|\(\([^)]*$/.test(before)) continue; // arithmetic
      if (/(^|\s)[A-Za-z_]\w*=$/.test(before) || /(^|\s)[A-Za-z_]\w*=\S*$/.test(before)) continue; // x=$y
      if (/\bcase\s+$/.test(before)) continue;
      if (/\bfor\s+\w+\s+in\s+[^;]*$/.test(before) && m[1] !== "(") continue;
      const name = m[1];
      if (name === "?" || name === "#" || name === "$" || name === "!") continue;
      if (name === "(") {
        if (/\bfor\s+\w+\s+in\s+$/.test(before)) continue;
        if (/\becho\s+$/.test(before) || /^\s*$/.test(before) || /\b(local|export|readonly)\s+\w+=$/.test(before)) continue;
        out.push({ line: n, col: at + 1, code: 2046, level: "warning", msg: WIKI[2046] });
        continue;
      }
      if (name === "@" || name === "*" || /^\{\w+\[[@*]\]\}$/.test(name)) {
        out.push({ line: n, col: at + 1, code: 2068, level: "error", msg: WIKI[2068] });
        continue;
      }
      const word = /^\{?(\w+)/.exec(name)![1];
      const quoted = code.slice(0, at) + `"$${name}"` + code.slice(at + 1 + name.length);
      out.push({ line: n, col: at + 1, code: 2086, level: "info", msg: WIKI[2086], fix: quoted });
      void word;
    }
  }
  for (const [v, where] of assigned) {
    if (used.has(v) || /^[A-Z_]+$/.test(v) && ["PATH", "IFS", "LANG", "LC_ALL"].includes(v)) continue;
    out.push({ line: where.line, col: where.col, code: 2034, level: "warning", msg: WIKI[2034].replace("foo", v) });
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

const RANK: Record<Level, number> = { error: 0, warning: 1, info: 2, style: 3 };

export function shellcheckCommand(m: Machine): Command {
  return {
    name: "shellcheck",
    async execute(args, ctx) {
      const missing = await needPackage(m, "shellcheck");
      if (missing) return missing;
      const { values, long, operands } = parseArgs(args, "Sfe");
      if (long.includes("version")) return ok("ShellCheck - shell script analysis tool\nversion: 0.9.0\nlicense: GNU General Public License, version 3\nwebsite: https://www.shellcheck.net\n");
      if (!operands.length) return fail("No files specified.\n\nUsage: shellcheck [OPTIONS...] FILES...", 3);
      const minLevel = (values.S ?? long.find((l) => l.startsWith("severity="))?.slice(9) ?? "style") as Level;
      const exclude = new Set((values.e ?? "").split(",").filter(Boolean).map((c) => Number(c.replace(/^SC/i, ""))));
      const format = values.f ?? long.find((l) => l.startsWith("format="))?.slice(7) ?? "tty";
      let out = "";
      let err = "";
      const codes = new Set<number>();
      let any = false;
      for (const f of operands) {
        let text: string;
        try {
          text = await ctx.fs.readFile(join(ctx.cwd, f));
        } catch {
          err += `${f}: ${f}: openBinaryFile: does not exist (No such file or directory)\n`;
          continue;
        }
        // `# shellcheck disable=SC2086` on the line before switches a check off there.
        const lines = text.split("\n");
        const findings = lint(text).filter((x) => RANK[x.level] <= RANK[minLevel] && !exclude.has(x.code) && !new RegExp(`shellcheck\\s+disable=.*SC${x.code}`).test(lines[x.line - 2] ?? ""));
        if (!findings.length) continue;
        any = true;
        if (format === "gcc") {
          for (const x of findings) out += `${f}:${x.line}:${x.col}: ${x.level === "style" ? "note" : x.level === "info" ? "note" : x.level}: ${x.msg} [SC${x.code}]\n`;
          continue;
        }
        const byLine = new Map<number, Finding[]>();
        for (const x of findings) byLine.set(x.line, [...(byLine.get(x.line) ?? []), x]);
        for (const [line, list] of byLine) {
          out += `\nIn ${f} line ${line}:\n${lines[line - 1]}\n`;
          for (const x of list) {
            out += `${" ".repeat(x.col - 1)}^-- SC${x.code} (${x.level}): ${x.msg}\n`;
            codes.add(x.code);
          }
          const fix = list.find((x) => x.fix);
          if (fix && list.every((x) => x.code === fix.code)) {
            let fixed = lines[line - 1];
            for (const x of [...list].sort((a, b) => b.col - a.col)) if (x.code === 2086) fixed = fixed.slice(0, x.col - 1) + fixed.slice(x.col - 1).replace(/^\$(\{[^}]*\}|\w+)/, '"$$$1"');
            if (fix.code !== 2086) fixed = fix.fix!;
            out += `\nDid you mean:\n${fixed}\n`;
          }
        }
      }
      if (any && format !== "gcc") out += `\nFor more information:\n${[...codes].sort().map((c) => `  https://www.shellcheck.net/wiki/SC${c} -- ${WIKI[c].replace("foo", "x").slice(0, 46)}${WIKI[c].length > 46 ? " ..." : ""}`).join("\n")}\n`;
      return { stdout: out, stderr: err, exitCode: any ? 1 : err ? 2 : 0 };
    },
  };
}
