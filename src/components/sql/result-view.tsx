import type { Block, RunOutput } from "@/lib/sql/core";

function RowsTable({ block }: { block: Extract<Block, { kind: "rows" }> }) {
  return (
    <div>
      {block.title && <p className="mb-1.5 text-center font-mono text-xs text-muted">{block.title}</p>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse font-mono text-[0.8rem]">
          <thead className="bg-subtle">
            <tr>
              {block.columns.map((c, i) => (
                <th key={i} className="border-b border-border px-3 py-1.5 text-left font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
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
          ({block.rows.length} row{block.rows.length === 1 ? "" : "s"})
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
