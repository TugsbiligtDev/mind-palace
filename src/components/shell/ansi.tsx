// Turns terminal output with ANSI color codes (as ls, grep and git print them) into colored
// spans. Only the codes the practice terminal produces: bold, dim, and the 8 basic colors.
import type { ReactNode } from "react";

const COLORS: Record<number, string> = {
  30: "text-term-black",
  31: "text-term-red",
  32: "text-term-green",
  33: "text-term-yellow",
  34: "text-term-blue",
  35: "text-term-magenta",
  36: "text-term-cyan",
  37: "text-term-white",
};

export function Ansi({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let bold = false;
  let dim = false;
  let fg: string | undefined;
  let last = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let m: RegExpExecArray | null;
  const push = (s: string) => {
    if (!s) return;
    const cls = [fg, bold && "font-bold", dim && "opacity-60"].filter(Boolean).join(" ");
    parts.push(cls ? <span key={parts.length} className={cls}>{s}</span> : s);
  };
  // Other escape codes (cursor moves) are dropped.
  const clean = text.replace(/\x1b\[[0-9;]*[A-LN-Za-ln-z]/g, "");
  while ((m = re.exec(clean))) {
    push(clean.slice(last, m.index));
    last = re.lastIndex;
    const codes = m[1] === "" ? [0] : m[1].split(";").map(Number);
    for (const c of codes) {
      if (c === 0) {
        bold = false;
        dim = false;
        fg = undefined;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) {
        bold = false;
        dim = false;
      } else if (c === 39) fg = undefined;
      else if (COLORS[c]) fg = COLORS[c];
    }
  }
  push(clean.slice(last));
  return <>{parts}</>;
}

/** When the output clears the screen (clear, Ctrl+L): what it prints after the last clear. */
export function afterClear(text: string): string | undefined {
  const at = text.lastIndexOf("\x1b[2J");
  if (at < 0) return undefined;
  // clear also sends "move to the top" (ESC[H, ESC[3J), which the screen doesn't need.
  return text.slice(at + 4).replace(/^(?:\x1b\[[0-9;]*[HJ])+/, "");
}
