@AGENTS.md

# Mind Palace

Personal mystery-themed learning site. The full design plan is in `docs/plan.md`, so read it before starting any phase.

- Package manager: **pnpm** (never npm or yarn).
- Stack: Next.js (App Router) + Tailwind v4 + Supabase (email-code sign-in + Postgres) + Vercel. Progress is saved in the browser and, when signed in, synced to the `profiles` table (`supabase/setup.sql`, setup steps in `docs/setup-supabase.md`). No Google/OAuth sign-in (too complex) and no leaderboard: the owner decided against both.
- The owner has no coding background: explain changes in plain words, and never publish content without their approval.
- PostgreSQL course plan (all 51 modules, folders, status): `docs/postgresql-course.md`.
- DSA in JavaScript course plan (37 modules, folders, status): `docs/dsa-course.md`. Course id `dsa`; build Beginner (modules 1-12) first.
- Python course plan (56 modules, folders, status): `docs/python-course.md`. Course id `python`; Beginner (modules 1-21) and Intermediate (22-40) are built, Advanced and the optional branches (41-42, 55-56) are only planned. Code runs in the browser on Pyodide (real Python 3.14, `src/lib/py/`); `pnpm check:content` runs every Python snippet and graded answer on that same engine. Lesson tests can call the helpers `given_input([...], func)` and `pytest_run({...})` (see `src/lib/py/core.ts`).
- HTML & CSS course plan (52 modules, folders, status): `docs/html-css-course.md`. Course id `html-css`, engine `web`: lessons use `web` steps (index.html + style.css tabs, live preview, graded by check expressions run in a hidden iframe; see `src/lib/web/core.ts`). `pnpm check:content` renders them in Playwright's headless Chrome (one-time setup: `pnpm exec playwright-core install chromium-headless-shell`).
- No Practice hub: the owner removed it on 2026-10-01 (practice lives inside each course as reviews and capstones). Old case files are in git history before that date.
- GitHub Actions (`.github/workflows/check.yml`) runs lint, types and `pnpm check:content` on pushes to main and on pull requests. It's not part of `pnpm build` (it ran Vercel's build out of memory).
