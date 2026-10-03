"use client";
// The rules of the game (XP, streaks, ranks) and every action that changes progress.
import { empty, load, save, update, write, XP, type Progress } from "./store";

export { useProgress, type Progress } from "./store";
export { useSyncStatus } from "./sync";

export const RANKS = [
  { title: "Rookie", min: 0 },
  { title: "Detective", min: 250 },
  { title: "Inspector", min: 700 },
  { title: "Chief Inspector", min: 1500 },
  { title: "Mastermind", min: 3000 },
] as const;

const FREEZE_EVERY_XP = 300;
const MAX_FREEZES = 2;

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

/** The streak as it stands today: shows 0 once a day has been missed without enough freezes. */
export function liveStreak(p: Progress) {
  const s = p.streak;
  if (!s.lastActive) return 0;
  const missed = daysBetween(s.lastActive, day(new Date())) - 1;
  return missed <= s.freezes ? s.current : 0;
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
  update((p) => ({ ...p, profile: { name: name.trim(), createdAt: p.profile?.createdAt ?? new Date().toISOString() } }));
}

export function setLast(href: string, label: string) {
  const p = load();
  if (p.last?.href === href && p.last.label === label) return;
  update((p) => ({ ...p, last: { href, label } }));
}

export function saveCode(slot: string, code: string) {
  const p = load();
  if (p.code[slot] === code) return;
  write({ ...p, code: { ...p.code, [slot]: code } });
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

export function resetProgress() {
  save({ ...empty(), resetAt: new Date().toISOString() });
}
