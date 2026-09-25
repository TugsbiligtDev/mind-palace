"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { sendCode, useAuth, verifyCode } from "@/lib/auth";

// Only ever send people to a page on this site after signing in.
const safeNext = (next: string | null) => (next?.startsWith("/") && !next.startsWith("//") ? next : "/profile");

export function LoginCard() {
  const auth = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === "signed-in") router.replace(next);
  }, [auth.status, next, router]);

  async function run(action: () => Promise<string | null>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    const err = await action();
    setBusy(false);
    if (err) setError(err);
    else onOk?.();
  }

  const input = "w-full rounded-lg border border-border bg-card px-3 py-2.5 outline-none focus:border-brand";
  const button = "mt-3 w-full rounded-lg bg-brand px-4 py-2.5 font-medium text-brand-contrast shadow-sm hover:opacity-90 disabled:opacity-40";

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <span className="grid size-12 place-items-center rounded-xl bg-brand text-lg font-semibold text-brand-contrast">M</span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in to Mind Palace</h1>
      <p className="mt-2 text-sm text-muted">Keep your progress on every device. No password needed.</p>

      {auth.status === "disabled" ? (
        <p className="mt-6 rounded-lg bg-subtle px-4 py-3 text-sm text-muted">
          Sign-in isn&apos;t switched on yet. Your progress is still saved in this browser.
        </p>
      ) : !sent ? (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => sendCode(email.trim()), () => setSent(true));
          }}
        >
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={`mt-1.5 ${input}`} />
          <button disabled={busy || !email.includes("@")} className={button}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => verifyCode(email.trim(), code.trim()));
          }}
        >
          <label htmlFor="code" className="text-sm font-medium">
            Code sent to {email}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            maxLength={10}
            placeholder="123456"
            className={`mt-1.5 font-mono text-lg tracking-[0.3em] ${input}`}
          />
          <button disabled={busy || code.length < 6} className={button}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            className="mt-3 w-full text-sm text-muted hover:text-text"
          >
            Use a different email, or send a new code
          </button>
        </form>
      )}

      {error && <p className="mt-4 rounded-lg bg-clue/10 px-3 py-2 text-sm text-clue">{error}</p>}
      <p className="mt-6 text-xs text-muted">
        Just looking around?{" "}
        <Link href="/courses" className="underline underline-offset-4">
          You don&apos;t need an account
        </Link>
        .
      </p>
    </div>
  );
}
