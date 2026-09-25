-- Mind Palace database. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run again after changes.

-- One row per person. The readable columns are for browsing in the Table Editor;
-- `progress` holds every detail (lessons, quizzes, cases, saved code).
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  detective_name  text not null default 'Detective',
  xp              integer not null default 0,
  streak_current  integer not null default 0,
  cases_solved    integer not null default 0,
  progress        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Bring an older version of the table up to date (no-ops on a fresh one).
alter table public.profiles drop column if exists avatar_url;
alter table public.profiles drop column if exists streak_longest;
alter table public.profiles drop column if exists streak_freezes;
alter table public.profiles drop column if exists last_active;
update public.profiles set detective_name = 'Detective' where detective_name is null;
alter table public.profiles alter column detective_name set default 'Detective';
alter table public.profiles alter column detective_name set not null;

-- Row Level Security: each person can read and change only their own row.
alter table public.profiles enable row level security;

drop policy if exists "Read your own profile" on public.profiles;
create policy "Read your own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Create your own profile" on public.profiles;
create policy "Create your own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "Update your own profile" on public.profiles;
create policy "Update your own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- Removed features: clean up if an earlier version of this file created them.
drop function if exists public.leaderboard();
