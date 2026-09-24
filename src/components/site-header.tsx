"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { rankFor, useProgress } from "@/lib/progress";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "HQ" },
  { href: "/courses", label: "Courses" },
  { href: "/case-files", label: "Case files" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const p = useProgress();
  const rank = p ? rankFor(p.xp) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm text-brand-contrast">M</span>
          <span className="hidden sm:inline">Mind Palace</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  active ? "bg-subtle font-medium text-text" : "text-muted hover:text-text"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {p && rank && (
            <>
              <span className="hidden items-center gap-1 rounded-full bg-xp/10 px-2.5 py-1 font-medium text-xp sm:flex" title="Daily streak">
                🔥 {p.streak.current}
                {p.streak.freezes > 0 && <span className="text-xs opacity-80">· ❄️{p.streak.freezes}</span>}
              </span>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 font-medium text-brand" title={`${p.xp} XP`}>
                {rank.title} · {p.xp} XP
              </span>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
