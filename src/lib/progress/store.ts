"use client";
// Saves and loads progress in this browser's localStorage, upgrading older saved formats.
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "mind-palace:progress:v1";
const LAST_OWNER_KEY = "mind-palace:last-user";

export type Progress = {
  v: 3;
  profile?: { name: string; createdAt: string };
  xp: number;
  streak: { current: number; longest: number; lastActive?: string; freezes: number };
  lessons: Record<string, { step: number; done: boolean; stepsDone: number[] }>;
  quizzes: Record<string, { best: number; total: number; passed: boolean; attempts: number }>;
  // Keyed by case id, "<course>/<file>", e.g. "postgresql/big-spenders".
  cases: Record<string, { solved: boolean; hints: number; attempts: number; xp?: number; solvedAt?: string }>;
  code: Record<string, string>; // "topicKey#step-3" or "case:<case id>"
  last?: { href: string; label: string };
};

export const empty = (): Progress => ({
  v: 3,
  xp: 0,
  streak: { current: 0, longest: 0, freezes: 0 },
  lessons: {},
  quizzes: {},
  cases: {},
  code: {},
});

// v1 kept each story case inside its course topic; v2 used case ids without the course.
const V1_CASES: Record<string, string> = {
  "postgresql/beginner/00-landscape": "wanderly-01-the-locked-archive",
  "postgresql/beginner/01-syntax": "wanderly-02-the-garbled-telegram",
  "postgresql/beginner/02-select": "wanderly-03-the-passenger-manifest",
  "postgresql/beginner/03-where": "wanderly-04-the-traveler-without-a-trace",
  "postgresql/beginner/04-order-by": "wanderly-05-the-priciest-night",
  "postgresql/beginner/05-data-types": "wanderly-06-the-float-forgery",
  "postgresql/beginner/06-functions": "wanderly-07-the-coded-names",
  "postgresql/beginner/07-aggregation": "wanderly-08-follow-the-money",
  "postgresql/beginner/08-writing-data": "wanderly-09-restore-the-record",
};

function upgradeCaseId(key: string, v: number) {
  const id = v < 2 ? V1_CASES[key] : key.includes("/") ? undefined : key;
  return id ? `postgresql/${id}` : key;
}

export function upgrade(raw: Omit<Partial<Progress>, "v"> & { v?: number }): Progress {
  const v = raw.v ?? 1;
  const p = { ...empty(), ...raw, v: 3 } as Progress;
  if (v >= 3) return p;
  p.cases = Object.fromEntries(Object.entries(p.cases).map(([k, c]) => [upgradeCaseId(k, v), c]));
  p.code = Object.fromEntries(
    Object.entries(p.code).map(([k, c]) => {
      if (v < 2 && k.endsWith("#case")) return [`case:${upgradeCaseId(k.slice(0, -5), v)}`, c];
      if (v === 2 && k.startsWith("case:")) return [`case:${upgradeCaseId(k.slice(5), v)}`, c];
      return [k, c];
    }),
  );
  const href = p.last?.href ?? "";
  const oldCase = href.match(/^\/courses\/(.+)\/case$/)?.[1] ?? href.match(/^\/practice\/([^/]+)$/)?.[1];
  if (oldCase) {
    const id = upgradeCaseId(oldCase, v);
    p.last = id.startsWith("postgresql/") ? { ...p.last!, href: `/practice/${id}` } : undefined;
  }
  return p;
}

let cache: Progress | null = null;
let owner: string | null = null;
let ownerKnown = false;
const listeners = new Set<() => void>();
const writeHooks = new Set<() => void>();

// Signed-in people get their own copy. Until sign-in is checked, assume the same person
// as last time so their progress shows straight away.
function storageKey(id = owner) {
  if (id) return `${STORAGE_KEY}:${id}`;
  const last = safeGet(LAST_OWNER_KEY);
  return last && !ownerKnown ? `${STORAGE_KEY}:${last}` : STORAGE_KEY;
}

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: progress still works for this visit.
  }
}

/** Saved progress for a signed-in person, or for the signed-out browser when id is null. */
export function readStored(id: string | null): Progress | null {
  const raw = safeGet(id ? `${STORAGE_KEY}:${id}` : STORAGE_KEY);
  try {
    return raw ? upgrade(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearSignedOutCopy() {
  safeSet(STORAGE_KEY, null);
}

export function setOwner(id: string | null) {
  owner = id;
  ownerKnown = true;
  safeSet(LAST_OWNER_KEY, id);
  cache = null;
  listeners.forEach((l) => l());
}

export function onWrite(fn: () => void) {
  writeHooks.add(fn);
}

export function load(): Progress {
  cache ??= readStored(owner ?? (ownerKnown ? null : safeGet(LAST_OWNER_KEY))) ?? empty();
  return cache;
}

/** Saves without re-rendering (used while typing code). */
export function write(next: Progress) {
  cache = next;
  safeSet(storageKey(), JSON.stringify(next));
  writeHooks.forEach((h) => h());
}

export function save(next: Progress) {
  write(next);
  listeners.forEach((l) => l());
}

export function update(fn: (p: Progress) => Progress) {
  save(fn(structuredClone(load())));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey()) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current progress, or null during server render / before hydration. */
export function useProgress(): Progress | null {
  return useSyncExternalStore(subscribe, load, () => null);
}
