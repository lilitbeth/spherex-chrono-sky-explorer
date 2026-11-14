-- SPHEREx Chrono-Sky Explorer — cloud progress storage.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.user_progress (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  state        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.user_progress enable row level security;

-- Each user can only read and write their own progress row.
drop policy if exists "progress_select_own" on public.user_progress;
create policy "progress_select_own" on public.user_progress
  for select using (auth.uid() = user_id);

drop policy if exists "progress_insert_own" on public.user_progress;
create policy "progress_insert_own" on public.user_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "progress_update_own" on public.user_progress;
create policy "progress_update_own" on public.user_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "progress_delete_own" on public.user_progress;
create policy "progress_delete_own" on public.user_progress
  for delete using (auth.uid() = user_id);
