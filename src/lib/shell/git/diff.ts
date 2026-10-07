// Text comparison for Git: unified diffs (git diff, git show), the "1 file changed, 2
// insertions(+)" summaries, and the three-way merge that writes conflict markers.
import { diffLines, structuredPatch } from "diff";
import { diff3Merge } from "node-diff3";

export const ZERO = "0".repeat(40);

export type Change = {
  path: string;
  oldPath?: string; // for a rename
  old?: { sha: string; mode: string; text: string };
  new?: { sha: string; mode: string; text: string };
};

const color = (on: boolean, code: string, s: string) => (on ? `\x1b[${code}m${s}\x1b[m` : s);

function isBinary(text: string) {
  return text.includes("\u0000");
}

/** One file's section of `git diff`. */
export function unifiedDiff(c: Change, colorOn: boolean): string {
  const a = c.oldPath ?? c.path;
  const b = c.path;
  const out: string[] = [color(colorOn, "1", `diff --git a/${a} b/${b}`)];
  const short = (s: string) => s.slice(0, 7);
  if (!c.old && c.new) {
    out.push(color(colorOn, "1", `new file mode ${c.new.mode}`), color(colorOn, "1", `index 0000000..${short(c.new.sha)}`));
  } else if (c.old && !c.new) {
    out.push(color(colorOn, "1", `deleted file mode ${c.old.mode}`), color(colorOn, "1", `index ${short(c.old.sha)}..0000000`));
  } else if (c.old && c.new) {
    if (c.oldPath && c.oldPath !== c.path) {
      out.push(color(colorOn, "1", "similarity index 100%"), color(colorOn, "1", `rename from ${c.oldPath}`), color(colorOn, "1", `rename to ${c.path}`));
      if (c.old.sha === c.new.sha) return out.join("\n") + "\n";
    }
    if (c.old.mode !== c.new.mode) out.push(color(colorOn, "1", `old mode ${c.old.mode}`), color(colorOn, "1", `new mode ${c.new.mode}`));
    if (c.old.sha === c.new.sha) return out.join("\n") + "\n";
    out.push(color(colorOn, "1", `index ${short(c.old.sha)}..${short(c.new.sha)}${c.old.mode === c.new.mode ? ` ${c.new.mode}` : ""}`));
  }
  const oldText = c.old?.text ?? "";
  const newText = c.new?.text ?? "";
  if (isBinary(oldText) || isBinary(newText)) {
    out.push(`Binary files ${c.old ? `a/${a}` : "/dev/null"} and ${c.new ? `b/${b}` : "/dev/null"} differ`);
    return out.join("\n") + "\n";
  }
  if (oldText === newText) return out.join("\n") + "\n";
  out.push(color(colorOn, "1", `--- ${c.old ? `a/${a}` : "/dev/null"}`), color(colorOn, "1", `+++ ${c.new ? `b/${b}` : "/dev/null"}`));
  const patch = structuredPatch(a, b, oldText, newText, undefined, undefined, { context: 3 });
  for (const h of patch.hunks) {
    const range = (start: number, len: number) => (len === 1 ? `${start}` : `${len === 0 ? start : start},${len}`);
    out.push(color(colorOn, "36", `@@ -${range(h.oldLines === 0 ? h.oldStart - 1 : h.oldStart, h.oldLines)} +${range(h.newLines === 0 ? h.newStart - 1 : h.newStart, h.newLines)} @@`));
    for (const line of h.lines) {
      if (line.startsWith("+")) out.push(color(colorOn, "32", line));
      else if (line.startsWith("-")) out.push(color(colorOn, "31", line));
      else out.push(line);
    }
  }
  return out.join("\n") + "\n";
}

/** Lines added and removed between two versions of a file. */
export function countLines(oldText: string, newText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  if (oldText === newText) return { added, removed };
  for (const part of diffLines(oldText, newText)) {
    if (part.added) added += part.count ?? 0;
    else if (part.removed) removed += part.count ?? 0;
  }
  return { added, removed };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 files changed, 3 insertions(+), 1 deletion(-)". */
export function summaryLine(files: number, added: number, removed: number): string {
  const ins = `${added} insertion${added === 1 ? "" : "s"}(+)`;
  const del = `${removed} deletion${removed === 1 ? "" : "s"}(-)`;
  const parts = [plural(files, "file changed", "files changed")];
  if (!added && !removed) parts.push(ins, del);
  else {
    if (added) parts.push(ins);
    if (removed) parts.push(del);
  }
  return ` ${parts.join(", ")}`;
}

/** The per-file bars of `git merge` and `git diff --stat`: " notes.txt | 3 ++-". */
export function diffStat(changes: Change[], colorOn = false): string {
  if (changes.length === 0) return "";
  const rows = changes.map((c) => {
    const n = countLines(c.old?.text ?? "", c.new?.text ?? "");
    const name = c.oldPath && c.oldPath !== c.path ? `${c.oldPath} => ${c.path}` : c.path;
    return { name, ...n };
  });
  const nameW = Math.max(...rows.map((r) => r.name.length));
  const maxTotal = Math.max(...rows.map((r) => r.added + r.removed));
  const numW = String(maxTotal).length;
  const barRoom = Math.max(10, 80 - nameW - numW - 4);
  const scale = maxTotal > barRoom ? barRoom / maxTotal : 1;
  let added = 0;
  let removed = 0;
  const lines = rows.map((r) => {
    added += r.added;
    removed += r.removed;
    const plus = Math.round(r.added * scale) || (r.added ? 1 : 0);
    const minus = Math.round(r.removed * scale) || (r.removed ? 1 : 0);
    const bar = (plus ? color(colorOn, "32", "+".repeat(plus)) : "") + (minus ? color(colorOn, "31", "-".repeat(minus)) : "");
    return ` ${r.name.padEnd(nameW)} | ${String(r.added + r.removed).padStart(numW)}${bar ? ` ${bar}` : ""}`;
  });
  return `${lines.join("\n")}\n${summaryLine(rows.length, added, removed)}\n`;
}

/** create mode / delete mode / rename lines printed after a commit or merge summary. */
export function modeLines(changes: Change[]): string {
  const out: string[] = [];
  for (const c of [...changes].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!c.old && c.new) out.push(` create mode ${c.new.mode} ${c.path}`);
    else if (c.old && !c.new) out.push(` delete mode ${c.old.mode} ${c.path}`);
    else if (c.oldPath && c.oldPath !== c.path) out.push(` rename ${c.oldPath} => ${c.path} (100%)`);
    else if (c.old && c.new && c.old.mode !== c.new.mode) out.push(` mode change ${c.old.mode} => ${c.new.mode} ${c.path}`);
  }
  return out.length ? out.join("\n") + "\n" : "";
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((l) => `${l}\n`);
  if (text.endsWith("\n")) lines.pop();
  else lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  return lines;
}

/**
 * Git's three-way merge of one file: changes made on only one side are taken; the same change
 * on both sides is taken once; different changes to the same lines become a conflict block.
 */
export function mergeText(ours: string, base: string, theirs: string, labels: { ours: string; theirs: string; base?: string }, style: "merge" | "diff3" | "zdiff3" = "merge"): { text: string; conflicts: number } {
  const a = splitLines(ours);
  const o = splitLines(base);
  const b = splitLines(theirs);
  const regions = diff3Merge(a, o, b, { excludeFalseConflicts: true });
  let text = "";
  let conflicts = 0;
  const ensureNl = (s: string) => (s && !s.endsWith("\n") ? `${s}\n` : s);
  for (const r of regions) {
    if (r.ok) {
      text += r.ok.join("");
      continue;
    }
    const c = r.conflict!;
    const ca = [...c.a];
    const cb = [...c.b];
    // Like Git, keep lines both sides agree on outside the markers (not in diff3 style,
    // which shows the original lines too).
    let pre = "";
    let post = "";
    if (style !== "diff3") {
      while (ca.length && cb.length && ca[0] === cb[0]) {
        pre += ca.shift();
        cb.shift();
      }
      while (ca.length && cb.length && ca.at(-1) === cb.at(-1)) {
        post = ca.pop() + post;
        cb.pop();
      }
    }
    conflicts++;
    text += pre;
    text += `<<<<<<< ${labels.ours}\n${ensureNl(ca.join(""))}`;
    if (style !== "merge") text += `||||||| ${labels.base ?? "base"}\n${ensureNl(c.o.join(""))}`;
    text += `=======\n${ensureNl(cb.join(""))}>>>>>>> ${labels.theirs}\n`;
    text += post;
  }
  return { text, conflicts };
}

/** True while a file still has conflict markers in it. */
export function hasConflictMarkers(text: string): boolean {
  return /^<{7}( |$)/m.test(text) && /^={7}$/m.test(text) && /^>{7}( |$)/m.test(text);
}
