import Link from "next/link";
import { CourseCards } from "@/components/course/course-cards";
import { HeroActions } from "@/components/landing/hero-actions";
import { loadAllTracks, loadStory } from "@/lib/content/load";
import { loadPractice } from "@/lib/content/practice";

const STEPS = [
  {
    n: "01",
    title: "Learn",
    body: "Short lessons, one idea per step. Read on the left, run real code on the right, right in your browser.",
  },
  {
    n: "02",
    title: "Check",
    body: "A quick quiz after every module: multiple choice, predict the output, fill in the blank. Retake it as often as you like.",
  },
  {
    n: "03",
    title: "Solve",
    body: "Case files in the Practice hub. Real data, a mystery to crack, hidden checks and three hints if you get stuck.",
  },
];

export default function Landing() {
  const story = loadStory();
  const tracks = loadAllTracks();
  const cases = loadPractice();
  const lessons = tracks.reduce((n, t) => n + t.levels.reduce((m, l) => m + l.topics.length, 0), 0);
  const sample = cases.find((c) => c.series?.episode === 4) ?? cases[0];

  return (
    <div className="flex flex-col">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
        <div>
          <p className="text-sm font-medium tracking-wide text-brand uppercase">{story.agency}</p>
          <h1 className="mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Learn to code by solving mysteries.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Bite-sized lessons and quizzes teach the ideas. Case files put them to work: query real data, follow the clues
            and close the case. Everything runs in your browser.
          </p>
          <HeroActions />
          <dl className="mt-10 flex gap-8 text-sm">
            {[
              [lessons, "lessons"],
              [lessons, "quizzes"],
              ...(cases.length ? [[cases.length, "case files"]] : []),
            ].map(([n, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="text-2xl font-semibold tabular-nums">{n}</span>
                  <span className="ml-1.5 text-muted">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:mx-0">
          <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand/15 via-transparent to-xp/10 blur-2xl" />
          <article className="rotate-[-1.2deg] rounded-2xl border border-paper-border bg-paper p-6 shadow-lg sm:p-7">
            <div className="flex items-baseline justify-between border-b border-dashed border-paper-border pb-3">
              <p className="font-mono text-xs tracking-widest text-muted uppercase">
                {sample ? `Case file · Episode ${sample.series?.episode ?? 1}` : "Case files"}
              </p>
              <span className="rotate-[-4deg] rounded border-2 border-clue px-2 py-0.5 font-mono text-[11px] font-bold text-clue">
                {sample ? "OPEN" : "SOON"}
              </span>
            </div>
            <h2 className="mt-4 font-serif text-2xl leading-tight">{sample?.title ?? "New cases are on the way"}</h2>
            <p className="mt-3 font-serif text-[15px] leading-relaxed text-muted">
              The case files are being rewritten for the bookstore data. Until then, every lesson runs on it: 39,419
              orders, 660 refunds and thousands of customers, waiting for your questions&hellip;
            </p>
          </article>
          <div className="relative mt-[-0.75rem] ml-6 rotate-[0.8deg] overflow-hidden rounded-2xl border border-border bg-card shadow-lg sm:ml-12">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-clue/60" />
              <span className="size-2.5 rounded-full bg-xp/60" />
              <span className="size-2.5 rounded-full bg-success/60" />
              <span className="ml-2 font-mono text-xs text-muted">bookstore</span>
            </div>
            <pre className="overflow-x-auto bg-code px-4 py-4 font-mono text-[13px] leading-relaxed">
              <span className="text-brand">SELECT</span> method, <span className="text-brand">count</span>(*){"\n"}
              <span className="text-brand">FROM</span> payments{"\n"}
              <span className="text-brand">WHERE</span> kind = <span className="text-success">&apos;refund&apos;</span>{"\n"}
              <span className="text-brand">GROUP BY</span> method;
            </pre>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
              <span className="text-success">✓ 4 rows</span>
              <span className="font-medium text-xp">+100 XP</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <p className="font-mono text-sm text-brand">{s.n}</p>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Pick a course</h2>
            <p className="mt-2 text-muted">Three levels each: Beginner, Intermediate and Advanced.</p>
          </div>
          <Link href="/courses" className="text-sm font-medium text-brand hover:underline">
            All courses →
          </Link>
        </div>
        <CourseCards />
      </section>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <span>{story.agency}</span>
          <span>A private learning site for a few friends.</span>
        </div>
      </footer>
    </div>
  );
}
