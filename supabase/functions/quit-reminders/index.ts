// Supabase Edge Function: sends Quit. reminder notifications.
// Called every 15 minutes by pg_cron (supabase/migrations/003_reminders_cron.sql), and by the app for a test notification.
// Deploy with JWT verification off; it is safe to call at any time because it only sends what is due, once.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically).

import webpush from 'npm:web-push@3.6.7'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { plan, type Message, type ReminderState } from './plan.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface Subscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  tz: string
  updated_at: string
}

async function sendAll(admin: SupabaseClient, subs: Subscription[], message: Message): Promise<number> {
  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 6 * 3600 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // The device unsubscribed or the app was removed: forget it.
      if (code === 404 || code === 410) await admin.from('quit_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      else console.error('push failed', code, (e as Error).message)
    }
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return json({ sent: 0, error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets are not set on the function' }, 500)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://github.com/TurboTime29/Quit-Vaping', publicKey, privateKey)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  if (body?.test) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const user = token ? (await admin.auth.getUser(token)).data.user : null
    if (!user) return json({ sent: 0, error: 'Sign in first' }, 401)
    const { data: subs } = await admin.from('quit_push_subscriptions').select('*').eq('user_id', user.id)
    const sent = await sendAll(admin, subs ?? [], { title: 'Reminders are on ✅', body: 'This is what a Quit. reminder looks like.', tag: 'test' })
    return json({ sent, error: sent ? undefined : 'No devices are registered for this account' })
  }

  const { data: subs, error } = await admin.from('quit_push_subscriptions').select('*')
  if (error) return json({ error: error.message }, 500)
  const byUser = new Map<string, Subscription[]>()
  for (const s of (subs ?? []) as Subscription[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  if (!byUser.size) return json({ users: 0, sent: 0 })

  const ids = [...byUser.keys()]
  const [{ data: profiles }, { data: states }] = await Promise.all([
    admin.from('quit_profiles').select('user_id, journey_start, settings').in('user_id', ids),
    admin.from('quit_reminder_state').select('*').in('user_id', ids),
  ])
  const stateByUser = new Map((states ?? []).map((s) => [s.user_id as string, s as ReminderState]))

  const now = new Date()
  let sent = 0
  for (const profile of profiles ?? []) {
    const reminders = profile.settings?.reminders
    if (!reminders?.daily && !reminders?.milestones) continue
    const userSubs = byUser.get(profile.user_id)!
    const { data: last } = await admin.from('quit_hits').select('ts')
      .eq('user_id', profile.user_id).eq('kind', 'hit').eq('backfill', false).eq('deleted', false)
      .order('ts', { ascending: false }).limit(1).maybeSingle()
    const anchorMs = Math.max(Date.parse(profile.journey_start), last ? Date.parse(last.ts) : 0)
    const tz = [...userSubs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0].tz

    const previous = stateByUser.get(profile.user_id) ?? null
    const result = plan({ now, tz, daily: reminders.daily ?? null, milestones: !!reminders.milestones, anchorMs, state: previous })
    for (const message of result.messages) sent += await sendAll(admin, userSubs, message)
    if (JSON.stringify(result.state) !== JSON.stringify(previous && { last_daily_date: previous.last_daily_date, anchor: previous.anchor, last_milestone_days: previous.last_milestone_days })) {
      await admin.from('quit_reminder_state').upsert({ user_id: profile.user_id, ...result.state, updated_at: now.toISOString() })
    }
  }
  return json({ users: byUser.size, sent })
})
