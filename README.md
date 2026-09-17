# Quit.

A quit-vaping tracker: log every hit with a reason, watch the time since your last one, compare with yesterday, and see your streaks and how many hits you have avoided.

**Features:** hit logging with reasons (customisable), notes and undo · resisted cravings ("wins") · log a missed hit at any time · daily limit goal that tapers weekly · money saved · health milestone timeline · Insights (this week vs last, peak hours, weekday averages, 30/90-day trend, calendar heatmap) · craving tools (urge-surfing countdown, box breathing) · reminder notifications (daily check-in, streak milestones) · cloud sync, backup, and account deletion.

Originally built with Rork (Expo / React Native; the untouched export is the first commit). Rebuilt as a web app that installs to the iPhone home screen and syncs through Supabase.

**Live:** https://turbotime29.github.io/Quit-Vaping/

## Stack

Vite + React 19 + TypeScript + Tailwind v4 + zustand (saved to localStorage) + vite-plugin-pwa, HashRouter, deployed to GitHub Pages by `.github/workflows/deploy.yml`. Optional cloud sync with Supabase (`src/lib/sync.ts`, schema in `supabase/schema.sql`).

```bash
npm install
npm run dev     # http://localhost:5173/Quit-Vaping/
npm test        # stats, sync-merge and reminder-scheduling unit tests
npm run build
```

## How sync works

Local-first: every tap is saved on the device immediately and works offline. When signed in, each hit is its own row in `quit_hits` (with a tombstone for deletions) and the settings live in `quit_profiles`. The app pulls rows changed since its last sync, merges them (newest edit wins per record), then uploads its own unsynced edits, a moment after each change and whenever the app comes back to the foreground. A trigger in the database refuses to let an older edit overwrite a newer one.

## Set up Supabase (one time, ~10 minutes)

If you already created a Supabase project for another app (for example FireRed Companion), **reuse it**: the tables here are prefixed `quit_`, you get one login for both apps, and free projects pause after a week without use, so one shared project stays awake more easily. Otherwise create a new one at [supabase.com](https://supabase.com) → New project (free plan, any region near you, save the database password somewhere).

1. **Create the tables.** Dashboard → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**. Then do the same with `supabase/migrations/002_features.sql`. Each should say "Success. No rows returned". (Supabase warns about "destructive operations" because the scripts replace their own policies and constraints; no data is deleted.)
2. **Allow the app's address.** **Authentication → URL Configuration**:
   - Site URL: `https://turbotime29.github.io/Quit-Vaping/` (if this project is shared, leave the existing Site URL as it is)
   - Redirect URLs → Add URL: `https://turbotime29.github.io/**` and `http://localhost:5173/**`
3. **Email sign-in** is on by default (**Authentication → Sign In / Providers → Email**). The built-in email sender is limited to a few emails per hour, which is fine for personal use.
4. **Passkeys (optional, recommended):** **Authentication → Passkeys** (may be under Sign In / Providers): enable, Relying Party ID `turbotime29.github.io`, origins `https://turbotime29.github.io` and `http://localhost:5173`.
5. **Copy the keys.** **Project Settings → API** (or the **Connect** button): copy the **Project URL** and the **anon / publishable** key. The anon key is meant to be public, since row level security keeps each user's data private.
6. **Give them to GitHub.** Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key
7. **Redeploy.** Repo → **Actions → Deploy to GitHub Pages → Run workflow**. After it finishes (~1 minute), Settings in the app shows **Account & Sync**.

For local dev, copy `.env.example` to `.env` and fill in the same two values.

## Reminder notifications (optional)

Reminders need a small server piece: the `quit-reminders` Supabase Edge Function (`supabase/functions/quit-reminders/`), run every 15 minutes by `pg_cron`. It sends a daily check-in at the time you pick and an alert when your streak passes 1 day, 3 days, 1 week and so on. It is safe to run at any time: it only sends what is due, once.

1. **Deploy the function** (from this folder, after `npx supabase login`):
   ```bash
   npx supabase functions deploy quit-reminders --project-ref YOUR-PROJECT-REF --no-verify-jwt
   ```
2. **Set its secrets.** The VAPID key pair signs the notifications; the public key is already in `src/lib/push.ts`, the private key was generated into `.secrets/vapid.json` (gitignored, never commit it):
   ```bash
   npx supabase secrets set --project-ref YOUR-PROJECT-REF VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
   ```
   (Or Dashboard → Edge Functions → Secrets.) If you ever regenerate the keys, update `VAPID_PUBLIC_KEY` in `src/lib/push.ts` too and turn notifications off and on again on each device.
3. **Schedule it.** Edit `supabase/migrations/003_reminders_cron.sql` (replace `YOUR-PROJECT-REF`) and run it in the SQL Editor.
4. In the Home Screen app: Settings → **Reminders** → turn on notifications, pick a time, then **Send a test notification**.

iPhone needs iOS 16.4+ and the app opened from the Home Screen for notifications.

## Install on iPhone

Open the live link in **Safari** → Share → **Add to Home Screen**. It opens full screen and works offline.

Signing in from the home-screen app: tap **Send**, then in the Mail app **press and hold the "Log In" link → Copy Link**, switch back and paste it. (Tapping the link opens Safari, which has separate storage from the home-screen app.) Once signed in, tap **Add passkey** so next time it's just Face ID.

Note: a home-screen app and a Safari tab do not share storage on iPhone. Pick one (the home-screen app) or sign in on both.
