# Mystery-Driven Learning Platform — MVP Design Plan

## Context
A personal interactive learning site (Coursera structure + LeetCode practice + DataCamp in-browser exercises + Skillshare projects), used by the owner and 2–3 friends.
The owner has zero tech background. Claude Code writes all code; the owner directs, reviews on preview links, and approves.
MVP goal: see how the site looks and flows, and whether mystery-game practice is fun. Python first, DSA right after.
Budget: $0, permanently free tiers only. Laptop-first. Owner time: 3–5 h/week → realistic MVP (phases 0–5) in about 11–14 weeks (database + login add ~1–2 weeks).

## 1. Product/UX
Pages:
1. **Agency HQ (dashboard):** detective name + rank, XP, streak, **Continue** button (goes to the exact step last used), case board.
2. **Catalog:** Track (Python, DSA) → Level (Beginner / Intermediate / Advanced) → Topics.
3. **Lesson view:** bite-sized steps; explanation left, "try it" editor + output right.
4. **Knowledge check:** 3–5 questions (multiple choice, predict the output, fill in the blank).
5. **Case view:** case-file story panel, clues, editor, Submit runs hidden tests, 3 tiered hints ("ask the informant", each costs XP), story reveal on success.
6. **Case files (progress):** solved cases, level map, rank progress.
7. **Take it to your laptop (optional):** macOS setup guide; never required.

Flow: first visit → pick detective name → pick Python Beginner → Topic 1 lesson → quiz → Case 1 → HQ.
Rules: everything runs 100% in the browser at all levels. Soft lock: lessons always readable; a case unlocks after its quiz (≥3/5); cases unlock in story order. Quiz retakes unlimited (shuffled), XP only on the first pass.

## 2. Visual design — "Calm premium" (feel: Linear, Stripe, Brilliant.org)
- Lots of white space, one main accent per screen, soft shadows, 12px radius, WCAG AA contrast.
- Light: bg `#FAFAF9`, card `#FFFFFF`, border `#E7E5E4`, text `#1C1917`, muted `#78716C`.
- Dark: bg `#0B0F19`, card `#111827`, border `#1F2937`, text `#E5E7EB`, muted `#9CA3AF`.
- Brand/buttons: indigo `#4F46E5` (dark `#818CF8`). Tracks: Python teal `#0D9488`, DSA violet `#7C3AED`.
- Game: XP amber `#F59E0B`, success `#16A34A`, clue/error `#E11D48`. Case-file panels: warm paper `#FBF7EF` (light).
- Fonts (Google Fonts, free): Inter (UI), Source Serif 4 (story text), JetBrains Mono (code).
- Theme follows the macOS setting, plus a manual toggle.
- Game mechanics (MVP): XP + ranks (Rookie → Detective → Inspector → Chief), daily streak with earned freezes. Point values/thresholds tuned by playtesting.

## 3. Tech stack (revised 2026-09-24: owner switched to Next.js + a database for cross-device progress)
| Part | Choice |
|---|---|
| Site | Next.js (App Router, TypeScript); course content stays as files in the repo |
| Styling | Tailwind CSS (class-based dark mode) |
| Editor | CodeMirror 6 |
| Python | Pyodide in a Web Worker (client component); timeout kills infinite loops; hidden tests run in the same worker |
| Login | Supabase Auth: email one-time code / magic link, no passwords |
| Database | Supabase PostgreSQL (free tier) with Row Level Security, so each user only sees their own rows |
| Code | GitHub, private repo `TugsbiligtDev/mind-palace` |
| Hosting | Vercel Hobby (free, personal use), preview URL per branch; `noindex` + robots.txt |

Why Supabase: login + Postgres in one free service, and it's the SQL the owner is learning. Known catches: the free project pauses after ~7 days without traffic (one-click restore); the built-in email sender is rate-limited (fine for 3–4 users; custom SMTP later if needed).
Pyodide limits to design around: ~10 MB first load (cached afterwards), `input()` needs special handling, no terminal/git.

## 4. Content structure + saved progress (replaces DB schema)
```
content/
  story/bible.yaml        # city, agency, recurring cast (mentor, informant, rival), tone
  python/
    track.yaml            # title, color, Python version, lastReviewed
    beginner/
      level.yaml          # season name, season thread, topic order
      01-variables/
        topic.yaml        # title, summary, XP
        lesson.mdx        # steps (incl. fixed "why this matters" + recap); 🔹 = info-only step
        quiz.yaml         # 3–5 questions + explanations
        case.yaml         # story, clues, starter code, reference solution, hidden tests, 3 hints, reveal
  dsa/ ...               # same shape; unlocks after python/beginner
```
Schemas are enforced by a zod validation step in the build, so a broken file fails the build, never the live site.
Story model: TV series (like Sherlock). Recurring cast and world; each case is an episode; a thread per level pays off in a finale case.
Progress lives in Supabase Postgres (content stays in files; the database only stores people and progress):
- `profiles` (id = auth user, detective_name, xp, streak_current, streak_longest, last_active_date, freezes, last_location jsonb)
- `lesson_progress` (user_id, topic_id, steps_done, completed_at)
- `quiz_attempts` (user_id, topic_id, score, passed, created_at)
- `case_progress` (user_id, case_id, solved_at, hints_used, attempts, code)
Rank is derived from xp. RLS: `user_id = auth.uid()` on every table. Auto-saved on every action; resume via `last_location`.

## 5. Content pipeline — `/new-course` project skill
Owner plans the course in Claude.ai chat → types `/new-course` in Claude Code and pastes the brief (format like the owner's PostgreSQL brief).
1. Parse the brief (module → topic, subtopic → step, 🔹 → info step, hint-before-solution → tiered hints).
2. Propose the level split (Beginner/Intermediate/Advanced) and case outlines → **STOP for owner approval**.
3. Generate the whole level, topic by topic, on a content branch; record progress so the run can resume across sessions (Pro plan limits).
4. Automatic checks per topic: schema; run every snippet and predict-the-output answer (Pyodide in Node); reference solution passes the hidden tests, starter code fails them.
5. Automatic AI reviewer pass (fresh subagent, strict teacher) → report of issues with explanations; Claude fixes them before handoff.
6. Push the branch → Vercel preview link → **STOP for owner review** → merge on approval = live.
Standing rules in the project `CLAUDE.md`: follow the schemas and story bible, never publish without approval.

## 6. MVP scope + build order
0. Setup: GitHub + Vercel (+ Supabase) accounts, empty Next.js site deployed.
1. Look & flow prototype: all pages, design system, light/dark, 2 hand-made sample Python topics.
2. Learning core: lesson steps + Pyodide runner, quizzes, soft unlocks, email-code login, Supabase progress + resume.
3. Game layer: cases, hidden tests, hints, XP/ranks, streak + freezes.
4. Pipeline: content schemas, check script, AI reviewer, story bible, `/new-course`, CLAUDE.md.
5. First real course: owner's Python brief → Python Beginner → preview → publish.

Next after MVP: DSA Beginner via `/new-course`. Later: badges, stars, friends leaderboard, SQL track (PGlite), more skills. Ethical hacking: link out to TryHackMe/HackTheBox.

Risks: Pro plan limits (resumable generation); subtly wrong explanations (AI reviewer + owner play-through); dependence on Claude for maintenance (simple stack, git undo, CLAUDE.md); scope creep (no new track until the current level is completed); building instead of learning (fixed phases); Supabase free-tier pause after ~7 idle days; auth email rate limits.

## Verification
- Each phase: open the Vercel preview link and walk the flow: HQ → Python Beginner → lesson steps (run code) → quiz → case (hint, submit, reveal) → XP/rank/streak update → close the tab, reopen → Continue returns to the same step.
- Toggle light/dark and check the macOS auto theme. Log in on a second browser and confirm progress follows.
- Pipeline: run the content check script on sample content (it must catch a deliberately wrong predict-the-output answer); run `/new-course` on a small brief and confirm both STOP gates happen.
- A friend opens the live link on their laptop.
