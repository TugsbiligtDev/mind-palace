// zip and unzip (Module 25), writing real .zip files (stored, no compression), plus tar's file
// list on standard output like GNU tar, and the modern tools Module 23 mentions (fd, bat, fzf)
// in the forms Ubuntu installs them (fdfind, batcat).
import type { Command, ResolvedCommandContext } from "just-bash";
import type { Machine } from "../machine";
import { basename, fail, join, ok, parseArgs } from "../util";
import { needPackage } from "./apt";
import { orig } from "./guard";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Entry = { name: string; data: Uint8Array; dir: boolean };

function writeZip(entries: Entry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = e.dir ? 0 : crc32(e.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 10, true);
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0x4800, true); // time
    local.setUint16(12, 0x5946, true); // date (2024)
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, e.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 0x031e, true);
    c.setUint16(6, 10, true);
    c.setUint16(12, 0x4800, true);
    c.setUint16(14, 0x5946, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, e.data.length, true);
    c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(38, (e.dir ? 0o40755 : 0o100644) << 16, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + e.data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function readZip(b: Uint8Array): Entry[] | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Entry[] = [];
  let at = 0;
  const dec = new TextDecoder();
  while (at + 30 <= b.length && v.getUint32(at, true) === 0x04034b50) {
    const method = v.getUint16(at + 8, true);
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const extra = v.getUint16(at + 28, true);
    const name = dec.decode(b.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    if (method !== 0) return undefined;
    out.push({ name, data: b.subarray(start, start + size), dir: name.endsWith("/") });
    at = start + size;
  }
  return out.length || (b.length >= 4 && v.getUint32(0, true) === 0x06054b50) ? out : undefined;
}

async function collect(ctx: ResolvedCommandContext, m: Machine, path: string, shown: string, recursive: boolean, out: Entry[]) {
  if (await m.perms.isDir(path)) {
    out.push({ name: `${shown.replace(/\/$/, "")}/`, data: new Uint8Array(), dir: true });
    if (!recursive) return;
    for (const n of (await ctx.fs.readdir(path)).sort()) await collect(ctx, m, `${path}/${n}`, `${shown.replace(/\/$/, "")}/${n}`, true, out);
    return;
  }
  out.push({ name: shown, data: await ctx.fs.readFileBuffer(path), dir: false });
}

export function archiveCommands(m: Machine): Command[] {
  return [
    {
      name: "zip",
      async execute(args, ctx) {
        const missing = await needPackage(m, "zip");
        if (missing) return missing;
        const { flags, operands } = parseArgs(args);
        const [zipName, ...files] = operands;
        if (!zipName || !files.length) return fail("zip error: Nothing to do! (try: zip -r archive.zip folder)", 12);
        const archive = join(ctx.cwd, zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
        const entries: Entry[] = [];
        let out = "";
        for (const f of files) {
          const p = join(ctx.cwd, f);
          if (!(await m.perms.exists(p))) {
            out += `\tzip warning: name not matched: ${f}\n`;
            continue;
          }
          await collect(ctx, m, p, f, flags.has("r"), entries);
        }
        if (!entries.length) return fail(`${out}\nzip error: Nothing to do! (${zipName})`, 12);
        for (const e of entries) if (!flags.has("q")) out += `  adding: ${e.name} (stored 0%)\n`;
        await ctx.fs.writeFile(archive, writeZip(entries) as unknown as string);
        return ok(out);
      },
    },
    {
      name: "unzip",
      async execute(args, ctx) {
        const missing = await needPackage(m, "unzip");
        if (missing) return missing;
        const { flags, values, operands } = parseArgs(args, "d");
        const name = operands[0];
        if (!name) return fail("UnZip 6.00 of 20 April 2009, by Debian. Original by Info-ZIP.\n\nUsage: unzip [-Z] [-opts[modifiers]] file[.zip] [list] [-x xlist] [-d exdir]");
        const p = join(ctx.cwd, name);
        let bytes: Uint8Array;
        try {
          bytes = await ctx.fs.readFileBuffer(p);
        } catch {
          return fail(`unzip:  cannot find or open ${name}, ${name}.zip or ${name}.ZIP.`, 9);
        }
        const entries = readZip(bytes);
        if (!entries) return fail(`Archive:  ${name}\n  End-of-central-directory signature not found.  Either this file is not\n  a zipfile, or it constitutes one disk of a multi-part archive.`, 9);
        if (flags.has("l")) {
          const total = entries.reduce((n, e) => n + e.data.length, 0);
          return ok(`Archive:  ${name}\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n${entries.map((e) => `${String(e.data.length).padStart(9)}  2026-10-06 09:00   ${e.name}`).join("\n")}\n---------                     -------\n${String(total).padStart(9)}                     ${entries.length} file${entries.length === 1 ? "" : "s"}\n`);
        }
        const dest = values.d ? join(ctx.cwd, values.d) : ctx.cwd;
        let out = `Archive:  ${name}\n`;
        for (const e of entries) {
          const target = `${dest}/${e.name}`.replace(/\/$/, "");
          if (e.dir) {
            await ctx.fs.mkdir(target, { recursive: true });
            out += `   creating: ${values.d ? `${values.d.replace(/\/$/, "")}/` : ""}${e.name}\n`;
            continue;
          }
          if ((await m.perms.exists(target)) && !flags.has("o")) {
            const a = (await m.ask(`replace ${e.name}? [y]es, [n]o, [A]ll, [N]one, [r]ename: `, { fallback: "y" })).trim();
            if (!/^[yA]/.test(a)) continue;
          }
          await ctx.fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
          await ctx.fs.writeFile(target, e.data as unknown as string);
          out += ` extracting: ${values.d ? `${values.d.replace(/\/$/, "")}/` : ""}${e.name}\n`;
        }
        return ok(flags.has("q") ? "" : out);
      },
    },
    {
      // GNU tar prints the -v list on standard output (just-bash's goes to standard error).
      name: "tar",
      async execute(args, ctx) {
        const r = await orig(ctx, args);
        const verbose = args.some((a) => /^-?[a-zA-Z]*v/.test(a) && !a.startsWith("--"));
        const creating = args.some((a) => /^-?[a-zA-Z]*c/.test(a) && !a.startsWith("--"));
        let stderr = r.stderr;
        let stdout = r.stdout;
        if (verbose && r.exitCode === 0) {
          stdout += stderr;
          stderr = "";
        }
        if (creating && args.some((a) => a.startsWith("/")) && !stderr.includes("Removing leading")) stderr = `tar: Removing leading \`/' from member names\n${stderr}`;
        return { stdout, stderr, exitCode: r.exitCode };
      },
    },
    {
      name: "fdfind",
      async execute(args, ctx) {
        const missing = await needPackage(m, "fdfind");
        if (missing) return missing;
        const { flags, values, operands } = parseArgs(args, "et");
        const [pattern = ".", dir = "."] = operands;
        const re = new RegExp(pattern, /[A-Z]/.test(pattern) ? "" : "i");
        const out: string[] = [];
        const walk = async (p: string, shown: string) => {
          for (const n of (await ctx.fs.readdir(p)).sort()) {
            if (n.startsWith(".") && !flags.has("H")) continue;
            const full = `${p}/${n}`;
            const rel = shown ? `${shown}/${n}` : n;
            const isDir = await m.perms.isDir(full);
            const okType = !values.t || (values.t === "f" ? !isDir : values.t === "d" ? isDir : true);
            const okExt = !values.e || n.endsWith(`.${values.e}`);
            if (re.test(n) && okType && okExt) out.push(isDir ? `${rel}/` : rel);
            if (isDir) await walk(full, rel);
          }
        };
        const base = join(ctx.cwd, dir);
        if (!(await m.perms.isDir(base))) return fail(`[fd error]: Search path '${dir}' is not a directory.`);
        await walk(base, dir === "." ? "" : dir.replace(/\/$/, ""));
        return { stdout: out.length ? `${out.join("\n")}\n` : "", stderr: "", exitCode: 0 };
      },
    },
    {
      name: "batcat",
      async execute(args, ctx) {
        const missing = await needPackage(m, "batcat");
        if (missing) return missing;
        const files = args.filter((a) => !a.startsWith("-"));
        let out = "";
        for (const f of files) {
          let text: string;
          try {
            text = await ctx.fs.readFile(join(ctx.cwd, f));
          } catch {
            return fail(`[bat error]: '${f}': No such file or directory (os error 2)`);
          }
          const lines = text.replace(/\n$/, "").split("\n");
          const w = String(lines.length).length + 2;
          out += `${"─".repeat(w + 1)}┬${"─".repeat(40)}\n${" ".repeat(w + 1)}│ File: ${basename(f)}\n${"─".repeat(w + 1)}┼${"─".repeat(40)}\n${lines.map((l, i) => `${String(i + 1).padStart(w)} │ ${l}`).join("\n")}\n${"─".repeat(w + 1)}┴${"─".repeat(40)}\n`;
        }
        return ok(out);
      },
    },
    {
      name: "fzf",
      async execute(args, ctx) {
        const missing = await needPackage(m, "fzf");
        if (missing) return missing;
        const input = String(ctx.stdin ?? "");
        const q = args.find((a, i) => args[i - 1] === "-f" || args[i - 1] === "--filter") ?? args.find((a) => a.startsWith("--filter="))?.slice(9);
        if (q === undefined) return fail("fzf: the practice terminal can't draw fzf's full-screen picker. Try the filter mode instead: ls | fzf -f text");
        const chars = [...q.toLowerCase()];
        const hits = input.split("\n").filter((l) => {
          let at = 0;
          for (const ch of chars) {
            at = l.toLowerCase().indexOf(ch, at);
            if (at < 0) return false;
            at++;
          }
          return l.length > 0;
        });
        return { stdout: hits.length ? `${hits.join("\n")}\n` : "", stderr: "", exitCode: hits.length ? 0 : 1 };
      },
    },
  ];
}
