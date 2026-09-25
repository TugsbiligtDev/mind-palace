# Mind Palace

A private, mystery-themed learning site: short lessons, quizzes, and case files to practise on.
Code runs in the browser. Progress is saved in the browser, and also to Supabase for anyone
signed in (email code, no password). Setup: `docs/setup-supabase.md`.

## Run it

```bash
pnpm install
cp .env.example .env.local   # then fill in the two Supabase values
pnpm dev             # http://localhost:3000
pnpm check:content   # checks every course file and SQL answer (also runs before each build)
```

## Where things live

| Folder | What's in it |
|---|---|
| `content/<course>/` | A course: `track.yaml`, then `beginner/`, `intermediate/`, `advanced/`, each with topic folders (`topic.yaml`, `lesson.yaml`, `quiz.yaml`) |
| `content/practice/<course>/` | Practice-hub case files, at most 10 per course |
| `content/story/bible.yaml` | The detective world every case is written in |
| `drafts/` | Finished content that isn't on the site |
| `src/app/` | Pages (one folder per web address) |
| `src/components/` | Page building blocks, grouped by page |
| `src/lib/content/` | Reads and validates `content/` |
| `src/lib/progress/` | XP, streaks, ranks and saved progress |
| `src/lib/sql/` | The in-browser PostgreSQL that runs and grades SQL |
| `supabase/setup.sql` | The database table and its security rules (paste into Supabase's SQL Editor) |

The design plan is in `docs/plan.md`.
