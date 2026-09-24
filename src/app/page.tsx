export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-brand">Case file #000</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Mind Palace</h1>
      <p className="mt-4 text-lg text-muted">Learn to code by solving mysteries.</p>

      <div className="mt-10 rounded-xl border border-border bg-paper p-6 shadow-sm">
        <p className="font-serif text-lg italic leading-relaxed">
          &ldquo;The agency doors are still locked, detective. Construction crews are working
          through the night. Come back soon — your first case is waiting.&rdquo;
        </p>
        <p className="mt-4 font-mono text-sm text-muted">&gt; status: under construction</p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-python/10 px-3 py-1 font-medium text-python">Python</span>
        <span className="rounded-full bg-dsa/10 px-3 py-1 font-medium text-dsa">DSA</span>
        <span className="rounded-full bg-xp/10 px-3 py-1 font-medium text-xp">0 XP · Rookie</span>
      </div>
    </main>
  );
}
