"use client";
// Who is signed in. Sign-in is a one-time code sent by email: sendCode(), then verifyCode().
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

export type User = { id: string; email: string };

type AuthState =
  | { status: "loading"; user: null }
  | { status: "disabled"; user: null } // Supabase keys aren't set
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: User };

const LOADING: AuthState = { status: "loading", user: null };
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();
const userListeners = new Set<(u: User | null) => void>();

function set(next: AuthState) {
  const changed = state.status === "loading" || next.user?.id !== state.user?.id;
  state = next;
  listeners.forEach((l) => l());
  if (changed) userListeners.forEach((l) => l(next.user));
}

function fromSession(u: { id: string; email?: string } | undefined): AuthState {
  return u ? { status: "signed-in", user: { id: u.id, email: u.email ?? "" } } : { status: "signed-out", user: null };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const sb = supabase();
  if (!sb) return set({ status: "disabled", user: null });
  sb.auth.getSession().then(({ data }) => set(fromSession(data.session?.user)));
  sb.auth.onAuthStateChange((_event, session) => {
    // Token refreshes fire this too; only a different person counts as a change.
    if (session?.user.id !== state.user?.id) set(fromSession(session?.user));
  });
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => LOADING,
  );
}

/** Calls `fn` with the signed-in user (or null) now and whenever that changes. */
export function onUserChange(fn: (u: User | null) => void) {
  userListeners.add(fn);
  start();
  if (state.status !== "loading") fn(state.user);
}

export async function sendCode(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return "Sign-in isn't set up yet.";
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? error.message : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return "Sign-in isn't set up yet.";
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  return error ? "That code didn't work. Check it, or send a new one." : null;
}

export async function signOut() {
  await supabase()?.auth.signOut();
}
