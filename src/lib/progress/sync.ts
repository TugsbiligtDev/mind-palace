"use client";
// Keeps a signed-in person's progress in their Supabase `profiles` row, so it follows them
// to any device. The browser copy stays the fast, always-available one.
import { useSyncExternalStore } from "react";
import { onUserChange, type User } from "../auth";
import { supabase } from "../supabase";
import { clearSignedOutCopy, empty, load, onWrite, readStored, save, setOwner, upgrade, type Progress } from "./store";

const PUSH_DELAY_MS = 1500;

type SyncStatus = "local" | "saving" | "saved" | "error";
let status: SyncStatus = "local";
const statusListeners = new Set<() => void>();

function setStatus(s: SyncStatus) {
  status = s;
  statusListeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
    () => "local",
  );
}

let user: User | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedulePush() {
  if (!user) return;
  clearTimeout(timer);
  timer = setTimeout(push, PUSH_DELAY_MS);
}

async function push() {
  const sb = supabase();
  const u = user;
  clearTimeout(timer);
  timer = undefined;
  if (!sb || !u) return;
  const p = load();
  setStatus("saving");
  const { error } = await sb.from("profiles").upsert({
    id: u.id,
    detective_name: p.profile?.name ?? u.email.split("@")[0],
    xp: p.xp,
    streak_current: p.streak.current,
    cases_solved: Object.values(p.cases).filter((c) => c.solved).length,
    progress: p,
    updated_at: new Date().toISOString(),
  });
  setStatus(error ? "error" : "saved");
  if (error) console.warn("[progress] saving to your account failed:", error.message);
}

// Combines two copies of progress (e.g. this browser + the account) without losing anything.
function merge(a: Progress, b: Progress): Progress {
  const [base, other] = a.xp >= b.xp ? [a, b] : [b, a];
  const out = structuredClone(base);
  for (const [k, l] of Object.entries(other.lessons)) {
    const m = out.lessons[k];
    out.lessons[k] = m ? { step: Math.max(m.step, l.step), done: m.done || l.done, stepsDone: [...new Set([...m.stepsDone, ...l.stepsDone])] } : l;
  }
  for (const [k, q] of Object.entries(other.quizzes)) {
    const m = out.quizzes[k];
    out.quizzes[k] = m ? { ...m, best: Math.max(m.best, q.best), passed: m.passed || q.passed, attempts: Math.max(m.attempts, q.attempts) } : q;
  }
  for (const [k, c] of Object.entries(other.cases)) {
    const m = out.cases[k];
    out.cases[k] = !m || (!m.solved && c.solved) ? c : m;
  }
  out.code = { ...other.code, ...out.code };
  out.profile ??= other.profile;
  out.last ??= other.last;
  out.streak.longest = Math.max(out.streak.longest, other.streak.longest);
  return out;
}

const hasProgress = (p: Progress | null): p is Progress =>
  !!p && (p.xp > 0 || Object.keys(p.lessons).length > 0 || Object.keys(p.cases).length > 0);

async function switchUser(next: User | null) {
  user = next;
  clearTimeout(timer);
  setOwner(next?.id ?? null);
  if (!next) return setStatus("local");

  const sb = supabase()!;
  setStatus("saving");
  const { data, error } = await sb.from("profiles").select("progress").eq("id", next.id).maybeSingle();
  if (user?.id !== next.id) return; // signed out again while loading
  if (error) {
    // Don't overwrite the account with a partial copy; keep working in this browser.
    console.warn("[progress] loading your account failed:", error.message);
    return setStatus("error");
  }

  const remote = data?.progress?.xp !== undefined ? upgrade(data.progress) : null;
  const signedOut = readStored(null);
  const copies = [remote, readStored(next.id), signedOut].filter(hasProgress);
  const merged = copies.reduce(merge, empty());
  merged.profile ??= { name: next.email.split("@")[0], createdAt: new Date().toISOString() };
  if (hasProgress(signedOut)) clearSignedOutCopy(); // it belongs to this account now
  save(merged);
  await push();
}

if (typeof window !== "undefined") {
  onWrite(schedulePush);
  onUserChange((u) => void switchUser(u));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer) void push();
  });
}
