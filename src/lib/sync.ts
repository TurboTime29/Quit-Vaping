import { useEffect, useState } from 'react'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useData } from '../store/data'
import { hitToRow, mergeRemote, profileToRow, type HitRow, type ProfileRow } from './merge'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
// Accept a pasted REST/dashboard URL and reduce it to the project origin.
const url = rawUrl ? (() => { try { return new URL(rawUrl).origin } catch { return undefined } })() : undefined
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { experimental: { passkey: true } } }) : null
export const syncEnabled = !!supabase

// ---------------------------------------------------------------- status

export type SyncStatus = 'disabled' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'
let status: SyncStatus = syncEnabled ? 'signed-out' : 'disabled'
let statusMsg = ''
let lastSyncedAt: number | null = null
const listeners = new Set<() => void>()
function setStatus(s: SyncStatus, msg = '') {
  status = s
  statusMsg = msg
  if (s === 'synced') lastSyncedAt = Date.now()
  listeners.forEach((l) => l())
}

export function useSyncStatus() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return { status, msg: statusMsg, lastSyncedAt }
}

let currentSession: Session | null = null
const sessionListeners = new Set<(s: Session | null) => void>()
if (supabase) {
  supabase.auth.getSession().then(({ data }) => onSession(data.session))
  supabase.auth.onAuthStateChange((_e, s) => onSession(s))
}
function onSession(s: Session | null) {
  const changedUser = s?.user.id !== currentSession?.user.id
  currentSession = s
  sessionListeners.forEach((l) => l(s))
  if (!s) setStatus(syncEnabled ? 'signed-out' : 'disabled')
  else if (changedUser) void syncNow()
}

export function useSession() {
  const [s, setS] = useState<Session | null>(currentSession)
  useEffect(() => {
    setS(currentSession)
    sessionListeners.add(setS)
    return () => { sessionListeners.delete(setS) }
  }, [])
  return s
}

// ---------------------------------------------------------------- auth

/** Sends the sign-in email (magic link; also a 6-digit code if the email template includes {{ .Token }}). */
export async function sendSignInEmail(email: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
  if (error) throw error
}

export const passkeySupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials

export async function signInWithPasskey() {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await supabase.auth.signInWithPasskey()
  if (error) throw error
}

export async function registerPasskey() {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await supabase.auth.registerPasskey()
  if (error) throw error
}

/**
 * Completes sign-in from what the user pastes out of the email: the magic link itself or a one-time code.
 * An iPhone home-screen app cannot receive the link (tapping it opens Safari, which has separate storage),
 * so the token hash in the pasted link is verified here instead.
 */
export async function verifySignIn(email: string, input: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const raw = input.trim()
  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw)
    const tokenHash = u.searchParams.get('token')
    if (tokenHash) {
      const type = (u.searchParams.get('type') || 'magiclink') as 'magiclink' | 'email' | 'signup' | 'recovery'
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      if (error) throw error
      return
    }
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''))
    if (hash.get('access_token') && hash.get('refresh_token')) {
      const { error } = await supabase.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! })
      if (error) throw error
      return
    }
    throw new Error('That is not the link from the email. In the email, press and hold "Log In" and choose Copy Link')
  }
  const { error } = await supabase.auth.verifyOtp({ email, token: raw.replace(/\s+/g, ''), type: 'email' })
  if (error) throw error
}

export async function signOut() {
  await supabase?.auth.signOut()
}

// ---------------------------------------------------------------- sync engine

const PAGE = 1000
const CHUNK = 500
/** Re-read this much before the cursor so rows committed slightly out of order are never skipped (merging is idempotent). */
const OVERLAP_MS = 60_000

async function pull(userId: string, since: string | null) {
  const { data: profile, error: pErr } = await supabase!.from('quit_profiles').select('*').eq('user_id', userId).maybeSingle()
  if (pErr) throw pErr
  const rows: HitRow[] = []
  const from = since ? new Date(Date.parse(since) - OVERLAP_MS).toISOString() : null
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase!.from('quit_hits').select('*').eq('user_id', userId)
    if (from) q = q.gte('server_at', from)
    const { data, error } = await q.order('server_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGE - 1)
    if (error) throw error
    rows.push(...(data as HitRow[]))
    if (!data || data.length < PAGE) break
  }
  return { profile: profile as ProfileRow | null, rows }
}

async function push(userId: string) {
  const s = useData.getState()
  const ids = Object.keys(s.dirtyHits)
  const snapshot = new Map(s.hits.filter((h) => s.dirtyHits[h.id]).map((h) => [h.id, h.updatedAt]))
  const profileVersion = s.dirtyProfile && s.profile ? s.profile.updatedAt : null

  if (profileVersion !== null) {
    const { error } = await supabase!.from('quit_profiles').upsert(profileToRow(userId, s.profile!))
    if (error) throw error
  }
  const rows = s.hits.filter((h) => snapshot.has(h.id)).map((h) => hitToRow(userId, h))
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase!.from('quit_hits').upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,id' })
    if (error) throw error
  }

  // Clear what was uploaded, unless it was edited again meanwhile. Uploaded tombstones are no longer needed locally.
  useData.setState((cur) => {
    const dirtyHits = { ...cur.dirtyHits }
    const version = new Map(cur.hits.map((h) => [h.id, h.updatedAt]))
    for (const id of ids) if (!snapshot.has(id) || version.get(id) === snapshot.get(id)) delete dirtyHits[id]
    return {
      dirtyHits,
      hits: cur.hits.some((h) => h.deleted && !dirtyHits[h.id]) ? cur.hits.filter((h) => !h.deleted || dirtyHits[h.id]) : cur.hits,
      dirtyProfile: cur.dirtyProfile && cur.profile?.updatedAt !== profileVersion,
    }
  })
}

let running = false
let again = false

/** Pull newer cloud rows, merge, then push local edits. Safe to call often; concurrent calls coalesce. */
export async function syncNow(): Promise<void> {
  const userId = currentSession?.user.id
  if (!supabase || !userId) return
  if (running) { again = true; return }
  if (typeof navigator !== 'undefined' && !navigator.onLine) { setStatus('offline'); return }
  running = true
  try {
    setStatus('syncing')
    const s = useData.getState()
    const firstSync = s.cursor?.userId !== userId
    const { profile, rows } = await pull(userId, firstSync ? null : s.cursor!.at)
    let maxAt = firstSync ? null : s.cursor!.at
    for (const r of rows) if (r.server_at && (!maxAt || Date.parse(r.server_at) > Date.parse(maxAt))) maxAt = r.server_at
    useData.setState((cur) => ({ ...mergeRemote(cur, profile, rows, firstSync), cursor: { userId, at: maxAt ?? new Date(0).toISOString() } }))
    await push(userId)
    setStatus('synced')
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    setStatus(/fetch|network/i.test(msg) ? 'offline' : 'error', msg)
  } finally {
    running = false
    if (again) { again = false; void syncNow() }
  }
}

/** Mount once at the app root: syncs a moment after each local edit, when the app comes back to the foreground, and when back online. */
export function useAutoSync() {
  useEffect(() => {
    if (!supabase) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useData.subscribe((s, prev) => {
      if (s.dirtyHits === prev.dirtyHits && s.dirtyProfile === prev.dirtyProfile) return
      if (!s.dirtyProfile && Object.keys(s.dirtyHits).length === 0) return
      clearTimeout(timer)
      timer = setTimeout(() => void syncNow(), 1500)
    })
    const onVisible = () => { if (document.visibilityState === 'visible') void syncNow() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      unsub()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [])
}
