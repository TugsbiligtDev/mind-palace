// Shared SQL engine: runs learner input (SQL + a psql meta-command subset) against a
// PGlite database and returns psql-like output. Used by the browser worker and by the
// content check script, so both grade answers the exact same way.
import type { PGliteInterface } from "@electric-sql/pglite";

export type Block =
  | { kind: "rows"; title?: string; columns: string[]; rows: (string | null)[][] }
  | { kind: "status"; text: string };

export type RunError = { message: string; line?: number; lineText?: string; caret?: number };

export type RunOutput = { blocks: Block[]; error?: RunError };

// Keep every value as the raw text Postgres sends, exactly like psql prints it.
// `types` is PGlite's table of type IDs (passed in so this file never loads PGlite itself).
export function rawTextParsers(types: Record<string, unknown>): Record<number, (x: string) => string> {
  return Object.fromEntries(
    Object.values(types)
      .filter((v): v is number => typeof v === "number")
      .map((oid) => [oid, (x: string) => x]),
  );
}

type Piece = { kind: "sql"; text: string; startLine: number } | { kind: "meta"; text: string; line: number };

function splitInput(input: string): Piece[] {
  const pieces: Piece[] = [];
  let sql: string[] = [];
  let sqlStart = 1;
  input.split("\n").forEach((line, i) => {
    if (line.trim().startsWith("\\")) {
      if (sql.join("").trim()) pieces.push({ kind: "sql", text: sql.join("\n"), startLine: sqlStart });
      sql = [];
      pieces.push({ kind: "meta", text: line.trim(), line: i + 1 });
      sqlStart = i + 2;
    } else {
      if (sql.length === 0) sqlStart = i + 1;
      sql.push(line);
    }
  });
  if (sql.join("").trim()) pieces.push({ kind: "sql", text: sql.join("\n"), startLine: sqlStart });
  return pieces;
}

function toRows(fields: { name: string }[], rows: unknown[]): (string | null)[][] {
  return rows.map((r) =>
    fields.map((f) => {
      const v = (r as Record<string, unknown>)[f.name];
      if (v === null || v === undefined) return null;
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }),
  );
}

function commandTag(sql: string, affected: number): string {
  const word = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (word === "INSERT") return `INSERT 0 ${affected}`;
  if (["UPDATE", "DELETE", "MERGE"].includes(word)) return `${word} ${affected}`;
  return word.replace(/;$/, "") || "OK";
}

// Split one SQL chunk into statements (psql sends them one at a time), keeping each
// statement's character offset so error positions map back to the learner's line.
function statements(text: string): { sql: string; offset: number }[] {
  const out: { sql: string; offset: number }[] = [];
  let start = 0;
  let quote: string | null = null;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    if (raw.replace(/--[^\n]*/g, "").trim()) out.push({ sql: raw.trim(), offset: start + lead });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!quote && c === "-" && text[i + 1] === "-") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === ";") {
      push(i + 1);
      start = i + 1;
    }
  }
  push(text.length);
  return out;
}

function locate(piece: Extract<Piece, { kind: "sql" }>, pos: number, message: string): RunError {
  const lines = piece.text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pos <= offset + lines[i].length + 1)
      return { message, line: piece.startLine + i, lineText: lines[i], caret: pos - offset - 1 };
    offset += lines[i].length + 1;
  }
  return { message };
}

async function runSqlPiece(db: PGliteInterface, piece: Extract<Piece, { kind: "sql" }>, blocks: Block[]) {
  for (const stmt of statements(piece.text)) {
    try {
      const [res] = await db.exec(stmt.sql);
      if (!res) continue;
      if (res.fields.length > 0)
        blocks.push({ kind: "rows", columns: res.fields.map((f) => f.name), rows: toRows(res.fields, res.rows) });
      else blocks.push({ kind: "status", text: commandTag(stmt.sql, res.affectedRows ?? 0) });
    } catch (e) {
      const err = e as { message: string; position?: string | number };
      const pos = err.position ? Number(err.position) : undefined;
      return pos ? locate(piece, stmt.offset + pos, err.message) : ({ message: err.message } satisfies RunError);
    }
  }
  return undefined;
}

const HELP = `General
  \\q                     quit psql (does nothing here)
  \\?                     show this help

Informational
  \\l                     list databases
  \\c DBNAME              connect to a database
  \\d NAME                describe a table
  \\d                     list tables, views and sequences
  \\dt [PATTERN]          list tables (e.g. \\dt  or  \\dt evidence.*)
  \\dn                    list schemas

Only this subset of psql works in the browser. Try the rest in your Terminal.`;

function likePattern(p: string) {
  return p.replace(/\*/g, "%").replace(/\?/g, "_");
}

function splitPattern(arg: string | undefined): { schema: string; name: string } {
  if (!arg) return { schema: "public", name: "%" };
  const [a, b] = arg.includes(".") ? arg.split(".", 2) : ["public", arg];
  return { schema: likePattern(a.replace(/"/g, "")), name: likePattern(b.replace(/"/g, "")) };
}

async function runMeta(db: PGliteInterface, piece: Extract<Piece, { kind: "meta" }>, blocks: Block[]): Promise<RunError | undefined> {
  const [cmd, ...args] = piece.text.split(/\s+/);
  const warnExtra = (n: number) =>
    args.slice(n).forEach((a) => blocks.push({ kind: "status", text: `${cmd}: extra argument "${a}" ignored` }));

  switch (cmd) {
    case "\\?":
      blocks.push({ kind: "status", text: HELP });
      return;
    case "\\q":
      blocks.push({ kind: "status", text: "(In real psql this quits. Here there's nothing to quit, so keep investigating!)" });
      return;
    case "\\l": {
      warnExtra(0);
      blocks.push({
        kind: "rows",
        title: "List of databases",
        columns: ["Name", "Owner", "Encoding"],
        rows: [
          ["learn_sql", "detective", "UTF8"],
          ["postgres", "detective", "UTF8"],
          ["template0", "detective", "UTF8"],
          ["template1", "detective", "UTF8"],
        ],
      });
      return;
    }
    case "\\c":
    case "\\connect": {
      warnExtra(1);
      const target = args[0];
      if (!target || target === "learn_sql")
        blocks.push({ kind: "status", text: 'You are now connected to database "learn_sql" as user "detective".' });
      else
        blocks.push({ kind: "status", text: `In this browser sandbox only "learn_sql" is available. Try \\c ${target} in your Terminal.` });
      return;
    }
    case "\\dn": {
      warnExtra(0);
      const r = await db.query(
        `SELECT nspname AS "Name", 'detective' AS "Owner" FROM pg_namespace
         WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`,
      );
      blocks.push({ kind: "rows", title: "List of schemas", columns: ["Name", "Owner"], rows: toRows(r.fields, r.rows) });
      return;
    }
    case "\\dt":
    case "\\d": {
      if (cmd === "\\d" && args[0]) {
        warnExtra(1);
        const { schema, name } = splitPattern(args[0]);
        const r = await db.query(
          `SELECT a.attname AS "Column", format_type(a.atttypid, a.atttypmod) AS "Type",
             CASE WHEN a.attnotnull THEN 'not null' ELSE '' END AS "Nullable",
             COALESCE(pg_get_expr(d.adbin, d.adrelid),
               CASE a.attidentity WHEN 'a' THEN 'generated always as identity'
                                  WHEN 'd' THEN 'generated by default as identity' ELSE '' END) AS "Default",
             n.nspname AS schema, c.relname AS rel
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           WHERE c.relname LIKE $1 AND n.nspname LIKE $2 AND a.attnum > 0 AND NOT a.attisdropped
             AND c.relkind IN ('r', 'v', 'm', 'p')
           ORDER BY n.nspname, c.relname, a.attnum`,
          [name, schema],
        );
        if (r.rows.length === 0) {
          blocks.push({ kind: "status", text: `Did not find any relation named "${args[0]}".` });
          return;
        }
        const groups = new Map<string, (string | null)[][]>();
        for (const row of r.rows as Record<string, string>[]) {
          const key = `${row.schema}.${row.rel}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push([row.Column, row.Type, row.Nullable, row.Default]);
        }
        for (const [key, rows] of groups)
          blocks.push({ kind: "rows", title: `Table "${key}"`, columns: ["Column", "Type", "Nullable", "Default"], rows });
        return;
      }
      warnExtra(1);
      const { schema, name } = splitPattern(args[0]);
      const kinds = cmd === "\\dt" ? "('r','p')" : "('r','p','v','m','S')";
      const r = await db.query(
        `SELECT n.nspname AS "Schema", c.relname AS "Name",
           CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table' WHEN 'v' THEN 'view'
                          WHEN 'm' THEN 'materialized view' WHEN 'S' THEN 'sequence' END AS "Type",
           'detective' AS "Owner"
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ${kinds} AND n.nspname LIKE $1 AND c.relname LIKE $2
         ORDER BY 1, 2`,
        [schema, name],
      );
      if (r.rows.length === 0) {
        blocks.push({
          kind: "status",
          text: args[0] ? `Did not find any ${cmd === "\\dt" ? "tables" : "relations"} named "${args[0]}".` : "Did not find any relations.",
        });
        return;
      }
      blocks.push({
        kind: "rows",
        title: cmd === "\\dt" ? "List of tables" : "List of relations",
        columns: ["Schema", "Name", "Type", "Owner"],
        rows: toRows(r.fields, r.rows),
      });
      return;
    }
    case "\\x":
    case "\\timing":
    case "\\e":
    case "\\copy":
      blocks.push({ kind: "status", text: `${cmd} works in real psql, but not in this browser sandbox. Try it in your Terminal.` });
      return;
    default:
      return { message: `invalid command ${cmd}\nTry \\? for help.`, line: piece.line };
  }
}

export async function runInput(db: PGliteInterface, input: string): Promise<RunOutput> {
  const blocks: Block[] = [];
  for (const piece of splitInput(input)) {
    const error = piece.kind === "sql" ? await runSqlPiece(db, piece, blocks) : await runMeta(db, piece, blocks);
    if (error) return { blocks, error };
  }
  return { blocks };
}

export function lastRows(out: RunOutput): Extract<Block, { kind: "rows" }> | undefined {
  return [...out.blocks].reverse().find((b): b is Extract<Block, { kind: "rows" }> => b.kind === "rows");
}

// Two result sets match when they have the same number of columns and the same rows
// (column names are ignored; order only matters when `ordered` is set).
export function sameRows(
  a: Extract<Block, { kind: "rows" }> | undefined,
  b: Extract<Block, { kind: "rows" }> | undefined,
  ordered: boolean,
): boolean {
  if (!a || !b || a.columns.length !== b.columns.length || a.rows.length !== b.rows.length) return false;
  const key = (r: (string | null)[]) => JSON.stringify(r.map(normalizeNumber));
  const ak = a.rows.map(key);
  const bk = b.rows.map(key);
  if (!ordered) {
    ak.sort();
    bk.sort();
  }
  return ak.every((k, i) => k === bk[i]);
}

// "60.00" and "60.0000" are the same number: compare numeric-looking values by value.
function normalizeNumber(v: string | null) {
  if (v === null || !/^-?\d+\.\d+$/.test(v)) return v;
  return v.replace(/\.?0+$/, "");
}

// Text form of a result used by "predict the output" questions: one line per row,
// values joined by " | ", NULL shown as NULL.
export function resultText(block: Extract<Block, { kind: "rows" }> | undefined): string {
  if (!block) return "";
  return block.rows.map((r) => r.map((v) => (v === null ? "NULL" : v)).join(" | ")).join("\n");
}

export type CaseCheck =
  | { mode: "result"; solution: string; ordered?: boolean }
  | { mode: "state"; solution: string; state_query: string };

export type Verdict = { correct: boolean; output: RunOutput; message: string };

// Grade a learner's attempt. `fresh` must return a brand-new database copy each call.
export async function grade(fresh: () => Promise<PGliteInterface>, input: string, check: CaseCheck): Promise<Verdict> {
  const mine = await fresh();
  const output = await runInput(mine, input);
  if (output.error) return { correct: false, output, message: "Your SQL hit an error, so fix that first." };

  const ref = await fresh();
  const refOut = await runInput(ref, check.solution);
  if (refOut.error) throw new Error(`Reference solution failed: ${refOut.error.message}`);

  if (check.mode === "result") {
    const ok = sameRows(lastRows(output), lastRows(refOut), check.ordered ?? false);
    return {
      correct: ok,
      output,
      message: ok ? "The evidence checks out." : wrongRowsMessage(lastRows(output), lastRows(refOut)),
    };
  }
  const myState = lastRows(await runInput(mine, check.state_query));
  const refState = lastRows(await runInput(ref, check.state_query));
  const ok = sameRows(myState, refState, true);
  return {
    correct: ok,
    output,
    message: ok ? "The records are restored exactly." : "The database doesn't look right yet. Check which rows you changed.",
  };
}

function wrongRowsMessage(mine: Extract<Block, { kind: "rows" }> | undefined, ref: Extract<Block, { kind: "rows" }> | undefined) {
  if (!mine) return "Your query didn't return any rows to check. The last statement should be a SELECT.";
  if (ref && mine.columns.length !== ref.columns.length)
    return `Not quite: the answer needs ${ref.columns.length} column${ref.columns.length === 1 ? "" : "s"}, and you returned ${mine.columns.length}.`;
  if (ref && mine.rows.length !== ref.rows.length)
    return `Not quite: the answer has ${ref.rows.length} row${ref.rows.length === 1 ? "" : "s"}, and you returned ${mine.rows.length}.`;
  return "Close: the shape is right, but some values don't match.";
}
