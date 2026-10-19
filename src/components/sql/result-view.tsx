"use client";
import { useEffect, useRef, useState } from "react";
import type { Block, RunOutput } from "@/lib/sql/core";

// Drawing tens of thousands of rows freezes the page (the Intermediate dataset has 39,000
// orders), so only the first rows are shown. Grading always uses the full result.
const SHOWN_ROWS = 200;
// Long results scroll inside a box of about 10 rows, so the feedback and Continue button under
// them stay on screen. When the table really overflows (down or sideways), say so: the
// scrollbars are easy to miss.
function useOverflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState({ down: false, side: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOver({ down: el.scrollHeight > el.clientHeight + 1, side: el.scrollWidth > el.clientWidth + 1 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...over };
}

function RowsTable({ block }: { block: Extract<Block, { kind: "rows" }> }) {
  const { ref, down, side } = useOverflow();
  return (
    <div>
      {block.title && <p className="mb-1.5 text-center font-mono text-xs text-muted">{block.title}</p>}
      <div ref={ref} className="max-h-80 overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse font-mono text-[0.8rem]">
          <thead className="sticky top-0 bg-subtle">
            <tr>
              {block.columns.map((c, i) => (
                <th key={i} className="border-b border-border px-3 py-1.5 text-left font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.slice(0, SHOWN_ROWS).map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                {r.map((v, j) => (
                  <td key={j} className="px-3 py-1 whitespace-pre">
                    {v === null ? <span className="text-muted/70 italic">NULL</span> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!block.title?.startsWith("Table ") && (
        <p className="mt-1 font-mono text-xs text-muted">
          ({block.rows.length} row{block.rows.length === 1 ? "" : "s"}
          {block.rows.length > SHOWN_ROWS && `, showing the first ${SHOWN_ROWS}. Add LIMIT, WHERE or GROUP BY to see less`})
          {down && " Scroll inside the table to see every row."}
          {side && ` ${block.columns.length} columns: scroll sideways to see them all.`}
        </p>
      )}
    </div>
  );
}

export function ResultView({ output }: { output: RunOutput }) {
  const { blocks, error } = output;
  if (!blocks.length && !error) return <p className="font-mono text-xs text-muted">No output.</p>;
  return (
    <div className="space-y-3">
      {blocks.map((b, i) =>
        b.kind === "rows" ? (
          <RowsTable key={i} block={b} />
        ) : (
          <pre key={i} className="font-mono text-xs whitespace-pre-wrap text-muted">
            {b.text}
          </pre>
        ),
      )}
      {error && (
        <pre className="overflow-x-auto rounded-lg border border-clue/30 bg-clue/5 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-clue">
          {`ERROR:  ${error.message}`}
          {error.lineText !== undefined &&
            `\nLINE ${error.line}: ${error.lineText}` +
              (error.caret !== undefined ? `\n${" ".repeat(`LINE ${error.line}: `.length + error.caret)}^` : "")}
        </pre>
      )}
    </div>
  );
}
