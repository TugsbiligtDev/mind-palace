// Git's object format: blobs, trees and commits, hashed with SHA-1 and stored zlib-compressed
// under .git/objects, byte for byte like real Git. So the same files, message, author and time
// give the same commit hash as a real `git commit`.
import { decoder, encoder } from "../util";

export type ObjectType = "blob" | "tree" | "commit" | "tag";

export type TreeEntry = { mode: string; name: string; sha: string };

export type Person = { name: string; email: string; time: number; tz: string };

export type Commit = {
  tree: string;
  parents: string[];
  author: Person;
  committer: Person;
  message: string;
};

export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha1(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

/** The full object as Git stores it: "<type> <size>\0<content>". */
export function frame(type: ObjectType, content: Uint8Array): Uint8Array {
  return concat([encoder.encode(`${type} ${content.length}\0`), content]);
}

export function hashObject(type: ObjectType, content: Uint8Array): Promise<string> {
  return sha1(frame(type, content));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const deflate = (bytes: Uint8Array) => pipe(bytes, new CompressionStream("deflate"));
export const inflate = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream("deflate"));

export function parseFramed(raw: Uint8Array): { type: ObjectType; content: Uint8Array } {
  const nul = raw.indexOf(0);
  const header = decoder.decode(raw.subarray(0, nul));
  const type = header.split(" ")[0] as ObjectType;
  return { type, content: raw.subarray(nul + 1) };
}

// Trees sort by name, with folders compared as if their name ended in "/".
export function sortTree(entries: TreeEntry[]): TreeEntry[] {
  const key = (e: TreeEntry) => (e.mode === "40000" ? `${e.name}/` : e.name);
  return [...entries].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export function serializeTree(entries: TreeEntry[]): Uint8Array {
  return concat(sortTree(entries).flatMap((e) => [encoder.encode(`${e.mode} ${e.name}\0`), fromHex(e.sha)]));
}

export function parseTree(content: Uint8Array): TreeEntry[] {
  const out: TreeEntry[] = [];
  let i = 0;
  while (i < content.length) {
    const space = content.indexOf(0x20, i);
    const nul = content.indexOf(0, space);
    const mode = decoder.decode(content.subarray(i, space));
    const name = decoder.decode(content.subarray(space + 1, nul));
    const sha = toHex(content.subarray(nul + 1, nul + 21));
    out.push({ mode, name, sha });
    i = nul + 21;
  }
  return out;
}

function personLine(p: Person) {
  return `${p.name} <${p.email}> ${p.time} ${p.tz}`;
}

function parsePerson(s: string): Person {
  const m = /^(.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(s);
  if (!m) return { name: s, email: "", time: 0, tz: "+0000" };
  return { name: m[1], email: m[2], time: Number(m[3]), tz: m[4] };
}

export function serializeCommit(c: Commit): Uint8Array {
  const lines = [`tree ${c.tree}`, ...c.parents.map((p) => `parent ${p}`), `author ${personLine(c.author)}`, `committer ${personLine(c.committer)}`];
  const msg = c.message.endsWith("\n") ? c.message : `${c.message}\n`;
  return encoder.encode(`${lines.join("\n")}\n\n${msg}`);
}

export function parseCommit(content: Uint8Array): Commit {
  const text = decoder.decode(content);
  const split = text.indexOf("\n\n");
  const head = text.slice(0, split).split("\n");
  const c: Commit = { tree: "", parents: [], author: parsePerson(""), committer: parsePerson(""), message: text.slice(split + 2) };
  for (const line of head) {
    const sp = line.indexOf(" ");
    const k = line.slice(0, sp);
    const v = line.slice(sp + 1);
    if (k === "tree") c.tree = v;
    else if (k === "parent") c.parents.push(v);
    else if (k === "author") c.author = parsePerson(v);
    else if (k === "committer") c.committer = parsePerson(v);
  }
  return c;
}

/** The first line of a commit message. */
export function subject(c: Commit): string {
  return c.message.split("\n")[0];
}

export type Tag = { object: string; type: string; tag: string; tagger: Person; message: string };

export function serializeTag(t: Tag): Uint8Array {
  const msg = t.message.endsWith("\n") ? t.message : `${t.message}\n`;
  return encoder.encode(`object ${t.object}\ntype ${t.type}\ntag ${t.tag}\ntagger ${personLine(t.tagger)}\n\n${msg}`);
}

export function parseTag(content: Uint8Array): Tag {
  const text = decoder.decode(content);
  const split = text.indexOf("\n\n");
  const head = text.slice(0, split).split("\n");
  const t: Tag = { object: "", type: "commit", tag: "", tagger: parsePerson(""), message: text.slice(split + 2) };
  for (const line of head) {
    const sp = line.indexOf(" ");
    const k = line.slice(0, sp);
    const v = line.slice(sp + 1);
    if (k === "object") t.object = v;
    else if (k === "type") t.type = v;
    else if (k === "tag") t.tag = v;
    else if (k === "tagger") t.tagger = parsePerson(v);
  }
  return t;
}
