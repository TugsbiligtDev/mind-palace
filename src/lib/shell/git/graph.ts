// The ASCII commit graph of `git log --graph`: one column per line of history that is still
// open, "*" for a commit, "|\" where a merge splits and "|/" where two lines join again.
// Simpler than Git's own renderer, but the same picture for the small histories in the course.

export type GraphCommit = { sha: string; parents: string[]; lines: string[] };

export function renderGraph(commits: GraphCommit[]): string {
  const shown = new Set(commits.map((c) => c.sha));
  let cols: string[] = [];
  const out: string[] = [];
  const bars = (n: number) => "| ".repeat(n).trimEnd();

  for (const c of commits) {
    let idx = cols.indexOf(c.sha);
    if (idx === -1) {
      cols.push(c.sha);
      idx = cols.length - 1;
    }
    const parents = c.parents.filter((p) => shown.has(p));
    const merge = parents.length > 1;
    const row = cols.map((_, i) => (i === idx ? "*" : "|")).join(" ");
    out.push(`${row}${merge ? "   " : " "}${c.lines[0] ?? ""}`.trimEnd());

    // The commit's place now waits for its parents.
    const next = [...cols];
    next.splice(idx, 1, ...parents);
    const rest = c.lines.slice(1);
    if (merge) {
      // "|\" opens a column for the second parent; columns to the right step aside.
      const left = "| ".repeat(idx);
      const right = " \\".repeat(Math.max(0, cols.length - idx - 1));
      out.push(`${left}|\\${right ? ` ${right.trimStart()}` : ""}`.trimEnd());
    }
    cols = next;
    for (const line of rest) out.push(`${bars(cols.length)}${cols.length ? " " : ""}${line}`.trimEnd() || bars(cols.length));

    // Two columns waiting for the same commit join with "|/".
    for (;;) {
      let joined = false;
      for (let j = cols.length - 1; j > 0 && !joined; j--) {
        const i = cols.indexOf(cols[j]);
        if (i === j) continue;
        const chars = ("| ".repeat(cols.length)).split("");
        // The joining column's bar becomes a "/" leaning towards the column it joins.
        chars[2 * j] = " ";
        chars[2 * j - 1] = "/";
        for (let k = j + 1; k < cols.length; k++) {
          chars[2 * k] = " ";
          chars[2 * k - 1] = "/";
        }
        out.push(chars.join("").trimEnd());
        cols.splice(j, 1);
        joined = true;
      }
      if (!joined) break;
    }
  }
  return out.map((l) => `${l}\n`).join("");
}
