import { supabase } from './sync'

/** Public half of the VAPID key pair (safe to publish). The private half is a Supabase function secret. */
export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? 'BPhPYPzhvWd6DRNu_FLjNy0TF86U1Akb7z5mpXHYFfSR2nURpOVwdJNXxB1wNzQb_0q2qBL0CdEN70KfNPnTV_k'

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export type PushAvailability = 'ok' | 'install-first' | 'unsupported'

export function pushAvailability(): PushAvailability {
  // iPhone only allows web push for apps added to the Home Screen (iOS 16.4+).
  if (isIOS() && !isStandalone()) return 'install-first'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('The offline app is still installing. Reload and try again.')
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushAvailability() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Asks permission (must run from a tap) and registers this device for reminders. */
export async function enablePush(userId: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for Quit. in the iPhone Settings app → Notifications.')
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const { error } = await supabase.from('quit_push_subscriptions').upsert({
    endpoint: sub.endpoint,
    user_id: userId,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    user_agent: navigator.userAgent.slice(0, 200),
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase?.from('quit_push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Asks the reminders function to send a test notification to this account's devices. */
export async function sendTestNotification(): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await supabase.functions.invoke('quit-reminders', { body: { test: true } })
  if (error) throw new Error(`${error.message}. Is the quit-reminders function deployed?`)
  if (!data?.sent) throw new Error(data?.error ?? 'No devices are registered for this account')
}
