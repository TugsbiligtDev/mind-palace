@AGENTS.md

# Mind Palace

Personal mystery-themed learning site. The full design plan is in `docs/plan.md`, so read it before starting any phase.

- Package manager: **pnpm** (never npm or yarn).
- Stack: Next.js (App Router) + Tailwind v4 + Supabase (email-code sign-in + Postgres) + Vercel. Progress is saved in the browser and, when signed in, synced to the `profiles` table (`supabase/setup.sql`, setup steps in `docs/setup-supabase.md`). No Google/OAuth sign-in (too complex) and no leaderboard: the owner decided against both.
- The owner has no coding background: explain changes in plain words, and never publish content without their approval.
- PostgreSQL course plan (all 51 modules, folders, status): `docs/postgresql-course.md`.
- DSA in JavaScript course plan (37 modules, folders, status): `docs/dsa-course.md`. Course id `dsa`; build Beginner (modules 1-12) first.
- Python course plan (56 modules, folders, status): `docs/python-course.md`. Course id `python`; Beginner (modules 1-21) and Intermediate (22-40) are built, Advanced and the optional branches (41-42, 55-56) are only planned. Code runs in the browser on Pyodide (real Python 3.14, `src/lib/py/`); `pnpm check:content` runs every Python snippet and graded answer on that same engine. Lesson tests can call the helpers `given_input([...], func)` and `pytest_run({...})` (see `src/lib/py/core.ts`).
- Practice hub: **10 case files per course** (enforced by `pnpm check:content`). Spare, already-checked cases live in `drafts/practice/` (not shown on the site) and can be swapped in.
