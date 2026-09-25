import Link from "next/link";

// Only SQL can run in the browser so far; other languages need their own runner first.
export function NoRunnerYet({ language, backHref = "/practice" }: { language: string; backHref?: string }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
      <p className="text-4xl">🛠️</p>
      <h1 className="mt-4 text-xl font-semibold">This can&apos;t run yet</h1>
      <p className="mt-2 text-muted">The {language} code runner is still being built.</p>
      <Link href={backHref} className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast">
        Go back
      </Link>
    </div>
  );
}
