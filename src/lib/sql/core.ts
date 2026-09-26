// Shared SQL engine: runs learner input (SQL + a psql meta-command subset) against a
// PGlite database and returns psql-like output. Used by the browser worker and by the
// content check script, so both grade answers the exact same way.
import type { PGliteInterface } from "@electric-sql/pglite";
import { runMeta, toRows } from "./psql";

export type Block =
  | { kind: "rows"; title?: string; columns: string[]; rows: (string | null)[][] }
  | { kind: "status"; text: string };

export type RunError = { message: string; line?: number; lineText?: string; caret?: number };

export type RunOutput = { blocks: Block[]; error?: RunError };

// Keep every value as the raw text Postgres sends, exactly like psql prints it.
// `types` is PGlite's table of type IDs (passed in so this file never loads PGlite itself).
export function rawTextParsers(types: Record<string, unknown>): Record<number, (x: string) => string> {
  return Object.fromEntries(
    [...Object.values(types).filter((v): v is number => typeof v === "number"), ...ARRAY_TYPE_OIDS].map((oid) => [
      oid,
      (x: string) => x,
    ]),
  );
}

// PGlite's `types` table lists only plain types, and PGlite installs its own array parsers
// after startup, so arrays would print as ["a","b"]. These built-in array types are kept
// as psql's {a,b} text, passed with every query (per-query parsers take priority).
const ARRAY_TYPE_OIDS = [
  1000, // bool[]
  1005, // int2[]
  1007, // int4[]
  1016, // int8[]
  1021, // float4[]
  1022, // float8[]
  1231, // numeric[]
  1009, // text[]
  1014, // char[]
  1015, // varchar[]
  1182, // date[]
  1183, // time[]
  1115, // timestamp[]
  1185, // timestamptz[]
  1187, // interval[]
  199, // json[]
  3807, // jsonb[]
  2951, // uuid[]
  1041, // inet[]
];
const RAW_ARRAYS = Object.fromEntries(ARRAY_TYPE_OIDS.map((oid) => [oid, (x: string) => x]));

// A brand-new copy of `db` for one run. PGlite's own clone() drops the parsers above
// (dates would print as 2026-03-01T00:00:00.000Z), so copy the data directory ourselves.
// The time zone is pinned to UTC so every learner, and the content check, sees the same
// timestamps whatever their computer's zone is.
export async function freshCopy(
  db: PGliteInterface & { dumpDataDir(compression?: "none"): Promise<File | Blob> },
  pglite: { PGlite: { create(options: object): Promise<PGliteInterface> }; types: Record<string, unknown> },
): Promise<PGliteInterface> {
  const copy = await pglite.PGlite.create({ loadDataDir: await db.dumpDataDir("none"), parsers: rawTextParsers(pglite.types) });
  await copy.exec("SET TimeZone = 'UTC'");
  return copy;
}

export type Piece ={ kind: "sql"; text: string; startLine: number } | { kind: "meta"; text: string; line: number };

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

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function commandTag(sql: string, affected: number): string {
  const word = stripComments(sql).trim().split(/\s+/)[0]?.toUpperCase() ?? "";
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
    if (stripComments(raw).trim()) out.push({ sql: raw.trim(), offset: start + lead });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!quote && c === "-" && text[i + 1] === "-") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    if (!quote && c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    // Dollar quoting ($$ … $$ or $tag$ … $tag$) wraps function bodies, which contain semicolons.
    const dollar = !quote && c === "$" ? /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i)) : null;
    if (dollar) {
      const end = text.indexOf(dollar[0], i + dollar[0].length);
      i = end === -1 ? text.length : end + dollar[0].length - 1;
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
      const [res] = await db.exec(stmt.sql, { rowMode: "array", parsers: RAW_ARRAYS });
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
