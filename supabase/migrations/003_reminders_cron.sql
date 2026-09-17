-- Runs the quit-reminders Edge Function every 15 minutes.
-- Before running: deploy the function, then replace YOUR-PROJECT-REF below with your project ref
-- (the "abcd1234" part of https://abcd1234.supabase.co). Safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'quit-reminders';

select cron.schedule(
  'quit-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/quit-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
