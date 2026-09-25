"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/profile/avatar";
import { signOut, useAuth } from "@/lib/auth";
import { liveStreak, rankFor, useProgress, useSyncStatus } from "@/lib/progress";

const SAVE_NOTE = {
  local: "Progress is saved in this browser.",
  saving: "Saving to your account…",
  saved: "✓ Progress saved to your account.",
  error: "⚠ Couldn't reach your account. Saved in this browser.",
};

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const p = useProgress();
  const auth = useAuth();
  const sync = useSyncStatus();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rank = rankFor(p?.xp ?? 0);
  const name = p?.profile?.name ?? "Detective";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Your profile"
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-9 place-items-center rounded-full ring-brand/40 transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar name={p?.profile?.name} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center gap-3 p-4">
            <Avatar name={p?.profile?.name} size={44} />
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              <p className="truncate text-xs text-muted">{auth.user?.email ?? "Not signed in"}</p>
            </div>
          </div>
          {p && (
            <div className="space-y-3 border-t border-border px-4 py-3">
              <div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{rank.title}</span>
                  <span className="text-muted tabular-nums">{p.xp} XP</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-xp" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{rank.next ? `${rank.toNext} XP to ${rank.next}` : "Top rank"}</p>
              </div>
              <p className="text-sm">
                🔥 <span className="font-medium">{liveStreak(p)}-day streak</span>
                <span className="text-muted"> · ❄️ {p.streak.freezes}</span>
              </p>
            </div>
          )}
          <div className="border-t border-border p-1.5 text-sm">
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-subtle">
              Your profile and progress
            </Link>
            {auth.status === "signed-in" && (
              <button role="menuitem" onClick={() => signOut()} className="block w-full rounded-lg px-3 py-2 text-left text-muted hover:bg-subtle hover:text-text">
                Sign out
              </button>
            )}
            {auth.status === "signed-out" && (
              <Link role="menuitem" href={`/login?next=${encodeURIComponent(pathname)}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 font-medium text-brand hover:bg-subtle">
                Sign in to save everywhere
              </Link>
            )}
          </div>
          <p className="border-t border-border bg-subtle/60 px-4 py-2 text-xs text-muted">{SAVE_NOTE[sync]}</p>
        </div>
      )}
    </div>
  );
}

