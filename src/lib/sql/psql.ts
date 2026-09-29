// The psql meta-commands (\dt, \d, \l, …) that work in the browser sandbox.
import type { PGliteInterface } from "@electric-sql/pglite";
import type { Block, Piece, RunError } from "./core";

// Rows arrive as arrays (rowMode "array", so two columns both called "count" stay
// separate) or as objects keyed by column name (meta-command queries).
export function toRows(fields: { name: string }[], rows: unknown[]): (string | null)[][] {
  return rows.map((r) =>
    fields.map((f, i) => {
      const v = Array.isArray(r) ? r[i] : (r as Record<string, unknown>)[f.name];
      if (v === null || v === undefined) return null;
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }),
  );
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
  \\du                    list roles (users)

Only this subset of psql works in the browser. Try the rest in your Terminal.`;

function likePattern(p: string) {
  return p.replace(/\*/g, "%").replace(/\?/g, "_");
}

function splitPattern(arg: string | undefined): { schema: string; name: string } {
  if (!arg) return { schema: "public", name: "%" };
  const [a, b] = arg.includes(".") ? arg.split(".", 2) : ["public", arg];
  return { schema: likePattern(a.replace(/"/g, "")), name: likePattern(b.replace(/"/g, "")) };
}

// The name of the database this sandbox stands in for, stored by the course's dataset with
// ALTER DATABASE … SET. PGlite doesn't apply per-database settings to new sessions, so read
// the stored value from the catalog.
async function databaseName(db: PGliteInterface) {
  const r = await db.query<{ name: string }>(
    `SELECT substring(c FROM 'mindpalace\\.database=(.*)') AS name
     FROM pg_db_role_setting, unnest(setconfig) AS c
     WHERE c LIKE 'mindpalace.database=%'`,
  );
  return r.rows[0]?.name ?? "learn_sql";
}

export async function runMeta(db: PGliteInterface, piece: Extract<Piece, { kind: "meta" }>, blocks: Block[]): Promise<RunError | undefined> {
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
        rows: [await databaseName(db), "postgres", "template0", "template1"]
          .sort()
          .map((name) => [name, "detective", "UTF8"]),
      });
      return;
    }
    case "\\c":
    case "\\connect": {
      warnExtra(1);
      const target = args[0];
      const name = await databaseName(db);
      if (!target || target === name)
        blocks.push({ kind: "status", text: `You are now connected to database "${name}" as user "detective".` });
      else
        blocks.push({ kind: "status", text: `In this browser sandbox only "${name}" is available. Try \\c ${target} in your Terminal.` });
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
    case "\\du": {
      warnExtra(0);
      // The sandbox's own superuser is shown as "detective", matching \l and \c.
      const r = await db.query(
        `SELECT CASE WHEN rolname = current_user THEN 'detective' ELSE rolname END AS "Role name",
                concat_ws(', ',
                  CASE WHEN rolsuper THEN 'Superuser' END,
                  CASE WHEN rolcreaterole THEN 'Create role' END,
                  CASE WHEN rolcreatedb THEN 'Create DB' END,
                  CASE WHEN NOT rolcanlogin THEN 'Cannot login' END) AS "Attributes"
         FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY 1`,
      );
      blocks.push({ kind: "rows", title: "List of roles", columns: ["Role name", "Attributes"], rows: toRows(r.fields, r.rows) });
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
