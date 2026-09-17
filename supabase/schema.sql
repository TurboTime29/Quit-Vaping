-- Quit. cloud sync schema.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run. Safe to re-run.
-- Tables are prefixed quit_ so this can share a Supabase project with other apps.

create table if not exists public.quit_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  average_puffs_per_day integer not null check (average_puffs_per_day > 0),
  journey_start timestamptz not null,
  has_backfilled boolean not null default false,
  updated_at bigint not null,                       -- client edit time (ms), last write wins
  server_at timestamptz not null default now()      -- set by trigger, used as the pull cursor
);

create table if not exists public.quit_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  ts timestamptz not null,
  reason text check (reason in ('Stress', 'Habit', 'Focus', 'Bored', 'Other')),
  backfill boolean not null default false,
  deleted boolean not null default false,           -- tombstone so deletions reach other devices
  updated_at bigint not null,
  server_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists quit_hits_user_server_at on public.quit_hits (user_id, server_at);

-- Stamp server_at on every write, and never let an older edit overwrite a newer one.
create or replace function public.quit_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    old.server_at := now();  -- keep the newer row, but re-announce it so the out-of-date device pulls it
    return old;
  end if;
  new.server_at := now();
  return new;
end $$;

drop trigger if exists quit_profiles_touch on public.quit_profiles;
create trigger quit_profiles_touch before insert or update on public.quit_profiles
  for each row execute function public.quit_touch();

drop trigger if exists quit_hits_touch on public.quit_hits;
create trigger quit_hits_touch before insert or update on public.quit_hits
  for each row execute function public.quit_touch();

-- Row level security: each user only ever sees their own rows.
alter table public.quit_profiles enable row level security;
alter table public.quit_hits enable row level security;

drop policy if exists "own profile" on public.quit_profiles;
create policy "own profile" on public.quit_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own hits" on public.quit_hits;
create policy "own hits" on public.quit_hits for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.quit_profiles, public.quit_hits to authenticated;
