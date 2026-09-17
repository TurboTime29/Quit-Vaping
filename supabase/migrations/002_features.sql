-- Quit. v2.1: notes, resisted cravings, custom reasons, goal/cost/reminder settings, push reminders, account deletion.
-- Run once in Supabase → SQL Editor after schema.sql. Safe to re-run (the "destructive operation" warning is only
-- about replacing this app's own constraints, policies and functions; no data is deleted).

-- Profile settings (reasons list, daily limit goal, cost, reminders) as one flexible JSON value.
alter table public.quit_profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- Hits: optional note, and "resisted" records for cravings beaten. Reasons are user-defined now.
alter table public.quit_hits add column if not exists note text;
alter table public.quit_hits add column if not exists kind text not null default 'hit';
alter table public.quit_hits drop constraint if exists quit_hits_reason_check;
alter table public.quit_hits drop constraint if exists quit_hits_reason_length;
alter table public.quit_hits add constraint quit_hits_reason_length check (char_length(reason) <= 40);
alter table public.quit_hits drop constraint if exists quit_hits_note_length;
alter table public.quit_hits add constraint quit_hits_note_length check (char_length(note) <= 500);
alter table public.quit_hits drop constraint if exists quit_hits_kind_check;
alter table public.quit_hits add constraint quit_hits_kind_check check (kind in ('hit', 'resisted'));

-- Devices registered for reminder notifications.
create table if not exists public.quit_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quit_push_subscriptions_user on public.quit_push_subscriptions (user_id);
alter table public.quit_push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.quit_push_subscriptions;
create policy "own push subscriptions" on public.quit_push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.quit_push_subscriptions to authenticated;

-- What the reminders function has already sent. No policies: only the function (service role) uses it.
create table if not exists public.quit_reminder_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_daily_date text,
  anchor text,
  last_milestone_days integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.quit_reminder_state enable row level security;

-- Settings → Delete my Quit. data: removes this app's rows for the signed-in user (the login stays).
create or replace function public.quit_delete_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.quit_hits where user_id = uid;
  delete from public.quit_profiles where user_id = uid;
  delete from public.quit_push_subscriptions where user_id = uid;
  delete from public.quit_reminder_state where user_id = uid;
end $$;
revoke all on function public.quit_delete_my_data() from public, anon;
grant execute on function public.quit_delete_my_data() to authenticated;

-- Settings → Delete account: removes the login itself. Every table referencing auth.users with
-- "on delete cascade" loses that user's rows too, including other apps sharing this Supabase project.
create or replace function public.quit_delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.quit_delete_account() from public, anon;
grant execute on function public.quit_delete_account() to authenticated;
