"use client";
import Link from "next/link";
import { useProgress } from "@/lib/progress";

export function HeroActions() {
  const p = useProgress();

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        {p?.last ? (
          <Link href={p.last.href} className="rounded-lg bg-brand px-5 py-2.5 font-medium text-brand-contrast shadow-sm hover:opacity-90">
            Continue where you left off →
          </Link>
        ) : (
          <Link href="/courses" className="rounded-lg bg-brand px-5 py-2.5 font-medium text-brand-contrast shadow-sm hover:opacity-90">
            Start learning →
          </Link>
        )}
      </div>
      {p?.last && <p className="mt-3 text-sm text-muted">Last time: {p.last.label}</p>}
    </div>
  );
}
