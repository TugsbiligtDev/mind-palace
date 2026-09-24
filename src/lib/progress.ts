"use client";
// Learner progress: XP, rank, streak, and what's been completed. Everything goes through
// load()/save() here, so moving storage to Supabase later only changes this file.
import { useSyncExternalStore } from "react";

export const XP = { lessonStep: 2, lesson: 20, quiz: 30, case: 100, hintCost: 15, caseMin: 40 } as const;

export const RANKS = [
  { title: "Rookie", min: 0 },
  { title: "Detective", min: 250 },
  { title: "Inspector", min: 700 },
  { title: "Chief Inspector", min: 1500 },
] as const;

const FREEZE_EVERY_XP = 300;
const MAX_FREEZES = 2;
const STORAGE_KEY = "mind-palace:progress:v1";

export type Progress = {
  v: 1;
  profile?: { name: string; createdAt: string };
  xp: number;
  streak: { current: number; longest: number; lastActive?: string; freezes: number };
  lessons: Record<string, { step: number; done: boolean; stepsDone: number[] }>;
  quizzes: Record<string, { best: number; total: number; passed: boolean; attempts: number }>;
  cases: Record<string, { solved: boolean; hints: number; attempts: number; xp?: number }>;
  code: Record<string, string>; // last code typed, keyed by "topicKey#step-3" or "topicKey#case"
  last?: { href: string; label: string };
};

const empty = (): Progress => ({
  v: 1,
  xp: 0,
  streak: { current: 0, longest: 0, freezes: 0 },
  lessons: {},
  quizzes: {},
  cases: {},
  code: {},
});

let cache: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...empty(), ...(JSON.parse(raw) as Progress) } : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

function save(next: Progress) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: progress still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
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

function update(fn: (p: Progress) => Progress) {
  save(fn(structuredClone(load())));
}

const day = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// Keeps the daily streak honest; missed days are covered by freezes if there are enough.
function touchStreak(p: Progress): Progress {
  const today = day(new Date());
  const s = p.streak;
  if (s.lastActive === today) return p;
  if (!s.lastActive) s.current = 1;
  else {
    const missed = daysBetween(s.lastActive, today) - 1;
    if (missed <= 0) s.current += 1;
    else if (missed <= s.freezes) {
      s.freezes -= missed;
      s.current += 1;
    } else s.current = 1;
  }
  s.lastActive = today;
  s.longest = Math.max(s.longest, s.current);
  return p;
}

function addXp(p: Progress, amount: number): Progress {
  const before = Math.floor(p.xp / FREEZE_EVERY_XP);
  p.xp += amount;
  const earned = Math.floor(p.xp / FREEZE_EVERY_XP) - before;
  p.streak.freezes = Math.min(MAX_FREEZES, p.streak.freezes + earned);
  return touchStreak(p);
}

export function rankFor(xp: number) {
  let i = 0;
  RANKS.forEach((r, idx) => {
    if (xp >= r.min) i = idx;
  });
  const next = RANKS[i + 1];
  return {
    title: RANKS[i].title,
    next: next?.title,
    progress: next ? (xp - RANKS[i].min) / (next.min - RANKS[i].min) : 1,
    toNext: next ? next.min - xp : 0,
  };
}

export function setProfile(name: string) {
  update((p) => ({ ...p, profile: { name: name.trim(), createdAt: new Date().toISOString() } }));
}

export function setLast(href: string, label: string) {
  update((p) => ({ ...p, last: { href, label } }));
}

export function saveCode(slot: string, code: string) {
  const p = load();
  if (p.code[slot] === code) return;
  cache = { ...p, code: { ...p.code, [slot]: code } };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {}
  // No listener notification: typing shouldn't re-render the whole page.
}

export function setLessonStep(key: string, step: number) {
  update((p) => {
    const l = p.lessons[key] ?? { step: 0, done: false, stepsDone: [] };
    p.lessons[key] = { ...l, step };
    return p;
  });
}

export function completeStep(key: string, step: number) {
  update((p) => {
    const l = p.lessons[key] ?? { step: 0, done: false, stepsDone: [] };
    if (l.stepsDone.includes(step)) return touchStreak(p);
    p.lessons[key] = { ...l, stepsDone: [...l.stepsDone, step] };
    return addXp(p, XP.lessonStep);
  });
}

export function completeLesson(key: string) {
  update((p) => {
    const l = p.lessons[key] ?? { step: 0, done: false, stepsDone: [] };
    if (l.done) return p;
    p.lessons[key] = { ...l, done: true };
    return addXp(p, XP.lesson);
  });
}

/** Records a quiz attempt. Returns the XP earned (only the first pass earns XP). */
export function recordQuiz(key: string, score: number, total: number, pass: number): number {
  let earned = 0;
  update((p) => {
    const q = p.quizzes[key] ?? { best: 0, total, passed: false, attempts: 0 };
    const passed = score >= pass;
    earned = passed && !q.passed ? XP.quiz : 0;
    p.quizzes[key] = { best: Math.max(q.best, score), total, passed: q.passed || passed, attempts: q.attempts + 1 };
    return earned ? addXp(p, earned) : touchStreak(p);
  });
  return earned;
}

export function takeHint(caseKey: string) {
  update((p) => {
    const c = p.cases[caseKey] ?? { solved: false, hints: 0, attempts: 0 };
    p.cases[caseKey] = { ...c, hints: Math.min(3, c.hints + 1) };
    return p;
  });
}

export function caseReward(hints: number) {
  return Math.max(XP.caseMin, XP.case - hints * XP.hintCost);
}

/** Records a case attempt. Returns XP earned (first solve only). */
export function recordCase(caseKey: string, solved: boolean): number {
  let earned = 0;
  update((p) => {
    const c = p.cases[caseKey] ?? { solved: false, hints: 0, attempts: 0 };
    earned = solved && !c.solved ? caseReward(c.hints) : 0;
    p.cases[caseKey] = { ...c, solved: c.solved || solved, attempts: c.attempts + 1, xp: c.xp ?? (earned || undefined) };
    return earned ? addXp(p, earned) : touchStreak(p);
  });
  return earned;
}

export function resetProgress() {
  save(empty());
}

// Unlock rules (soft lock): lessons are always open; a case opens once its quiz is passed
// and the previous case in the season is solved.
export function caseState(p: Progress | null, topicKeys: string[], index: number) {
  const key = topicKeys[index];
  const quizPassed = !!p?.quizzes[key]?.passed;
  const prevSolved = index === 0 || !!p?.cases[topicKeys[index - 1]]?.solved;
  const solved = !!p?.cases[key]?.solved;
  return { quizPassed, prevSolved, unlocked: quizPassed && prevSolved, solved };
}
