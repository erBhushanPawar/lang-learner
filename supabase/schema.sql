-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.

-- Profile info (name/avatar) synced across devices, one row per authenticated user.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar text not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

-- Lesson completion progress, one row per (user, lesson).
create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  done boolean not null default true,
  pct integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_progress enable row level security;

drop policy if exists "progress_select_own" on public.lesson_progress;
create policy "progress_select_own" on public.lesson_progress
  for select using (auth.uid() = user_id);

drop policy if exists "progress_upsert_own" on public.lesson_progress;
create policy "progress_upsert_own" on public.lesson_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "progress_update_own" on public.lesson_progress;
create policy "progress_update_own" on public.lesson_progress
  for update using (auth.uid() = user_id);
