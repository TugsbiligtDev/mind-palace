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
  // Solved Practice-hub cases. The hub was removed; old records are kept so saved progress still loads.
  cases: Record<string, { solved: boolean; hints: number; attempts: number; xp?: number; solvedAt?: string }>;
  code: Record<string, string>; // "topicKey#step-3"
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

export function upgrade(raw: Omit<Partial<Progress>, "v"> & { v?: number }): Progress {
  const p = { ...empty(), ...raw, v: 3 } as Progress;
  // The Practice hub and its case pages were removed; don't offer a "Continue" link to one.
  if (/^\/practice(\/|$)|^\/courses\/.+\/case$/.test(p.last?.href ?? "")) p.last = undefined;
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
