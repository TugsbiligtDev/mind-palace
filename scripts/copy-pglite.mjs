// Copies the PostgreSQL engine files (WebAssembly) into public/ so the browser can load them.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("@electric-sql/pglite"));
const out = path.join(process.cwd(), "public", "pglite");
fs.mkdirSync(out, { recursive: true });
for (const file of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
  fs.copyFileSync(path.join(dist, file), path.join(out, file));
}
console.log("Copied PGlite engine files to public/pglite");
