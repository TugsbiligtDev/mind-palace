# Mind Palace

A private, mystery-themed learning site: short lessons, quizzes, reviews and capstone projects.
Code runs in the browser. Progress is saved in the browser, and also to Supabase for anyone
signed in (email code, no password). Setup: `docs/setup-supabase.md`.

## Run it

```bash
pnpm install
cp .env.example .env.local   # then fill in the two Supabase values
pnpm dev             # http://localhost:3000
pnpm check:content   # checks every course file, code snippet and graded answer (GitHub runs it on main and pull requests)
```

## Where things live

| Folder | What's in it |
|---|---|
| `content/<course>/` | A course: `track.yaml`, then `beginner/`, `intermediate/`, `advanced/`, each with topic folders (`topic.yaml`, `lesson.yaml`, `quiz.yaml`) |
| `content/story/bible.yaml` | The detective world the site is written in |
| `src/app/` | Pages (one folder per web address) |
| `src/components/` | Page building blocks, grouped by page (`code/` is the editor every exercise uses) |
| `src/lib/content/` | Reads and validates `content/` |
| `src/lib/progress/` | XP, streaks, ranks and saved progress |
| `src/lib/sql/`, `py/`, `js/`, `web/` | The in-browser engines that run and grade each course's code |
| `scripts/check-content.ts` | The content check |
| `.github/workflows/check.yml` | Runs lint, type and content checks on GitHub on main and pull requests |
| `supabase/setup.sql` | The database table and its security rules (paste into Supabase's SQL Editor) |

The design plan is in `docs/plan.md`.
