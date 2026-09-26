@AGENTS.md

# Mind Palace

Personal mystery-themed learning site. The full design plan is in `docs/plan.md`, so read it before starting any phase.

- Package manager: **pnpm** (never npm or yarn).
- Stack: Next.js (App Router) + Tailwind v4 + Supabase (email-code sign-in + Postgres) + Vercel. Progress is saved in the browser and, when signed in, synced to the `profiles` table (`supabase/setup.sql`, setup steps in `docs/setup-supabase.md`). No Google/OAuth sign-in (too complex) and no leaderboard: the owner decided against both.
- The owner has no coding background: explain changes in plain words, and never publish content without their approval.
- PostgreSQL course plan (all 51 modules, folders, status): `docs/postgresql-course.md`.
- Practice hub: **10 case files per course** (enforced by `pnpm check:content`). Spare, already-checked cases live in `drafts/practice/` (not shown on the site) and can be swapped in.
