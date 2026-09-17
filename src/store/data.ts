import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { generateBackfill } from '../lib/analytics'
import { normalizeSettings, type Approach, type Cost, type Hit, type Profile, type ProfileSettings, type SleepWindow, type Taper, type ThemeMode } from '../types'

export interface NewHit {
  reason?: string
  note?: string
  kind?: 'resisted'
  /** Defaults to now (for logging a missed hit earlier). */
  ts?: number
}

export interface JourneySetup {
  averagePuffsPerDay: number
  approach: Approach
  /** Quit time (cold turkey) or when tracking starts (gradual). Defaults to now. */
  journeyStart?: number
  taper?: Taper | null
  targetDate?: number | null
  cost?: Cost | null
}

export interface DataState {
  profile: Profile | null
  hits: Hit[]
  theme: ThemeMode

  // Sync bookkeeping (see lib/sync.ts). Dirty items are local edits the cloud has not seen yet.
  dirtyProfile: boolean
  dirtyHits: Record<string, true>
  /** Server timestamp of the newest row pulled, per signed-in user. */
  cursor: { userId: string; at: string } | null

  startJourney: (setup: JourneySetup) => void
  updateProfile: (updates: Partial<Pick<Profile, 'averagePuffsPerDay' | 'journeyStart'>>) => void
  updateSettings: (updates: Partial<ProfileSettings>) => void
  /** Logs a hit or resisted craving and returns its id (for undo). */
  recordHit: (hit?: NewHit) => string
  updateHit: (id: string, updates: Partial<Pick<Hit, 'ts' | 'reason' | 'note' | 'kind'>>) => void
  deleteHit: (id: string) => void
  /** Regenerates 30 days of pre-quit history around the given sleep window (remembered in settings). */
  backfillHistory: (sleep?: SleepWindow) => void
  toggleTheme: () => void
  importBackup: (backup: Backup) => void
  /** Wipes journey, history and sync state on this device (keeps the theme). */
  eraseLocal: () => void
}

export interface Backup {
  app: 'quit-vaping'
  version: 1
  exportedAt: string
  profile: Profile | null
  hits: Hit[]
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const markDirty = (dirty: Record<string, true>, ids: Iterable<string>) => {
  const next = { ...dirty }
  for (const id of ids) next[id] = true
  return next
}

const clean = (h: Hit): Hit => {
  // Drop empty optional fields so records stay small and compare equal after a round trip.
  const out = { ...h }
  if (!out.reason) delete out.reason
  if (!out.note?.trim()) delete out.note
  if (!out.kind) delete out.kind
  return out
}

export const useData = create<DataState>()(
  persist(
    (set) => ({
      profile: null,
      hits: [],
      theme: 'dark',
      dirtyProfile: false,
      dirtyHits: {},
      cursor: null,

      startJourney: ({ averagePuffsPerDay, approach, journeyStart, taper, targetDate, cost }) =>
        set({
          profile: {
            averagePuffsPerDay,
            journeyStart: journeyStart ?? Date.now(),
            hasBackfilled: false,
            settings: { ...normalizeSettings(null), approach, taper: taper ?? null, targetDate: targetDate ?? null, cost: cost ?? null },
            updatedAt: Date.now(),
          },
          dirtyProfile: true,
        }),

      updateProfile: (updates) =>
        set((s) => (s.profile ? { profile: { ...s.profile, ...updates, updatedAt: Date.now() }, dirtyProfile: true } : {})),

      updateSettings: (updates) =>
        set((s) => (s.profile ? { profile: { ...s.profile, settings: { ...s.profile.settings, ...updates }, updatedAt: Date.now() }, dirtyProfile: true } : {})),

      recordHit: (input = {}) => {
        const now = Date.now()
        const hit = clean({ id: newId(), ts: input.ts ?? now, reason: input.reason, note: input.note?.trim(), kind: input.kind, updatedAt: now })
        set((s) => ({ hits: [...s.hits, hit], dirtyHits: markDirty(s.dirtyHits, [hit.id]) }))
        return hit.id
      },

      updateHit: (id, updates) =>
        set((s) => ({
          hits: s.hits.map((h) => (h.id === id ? clean({ ...h, ...updates, updatedAt: Date.now() }) : h)),
          dirtyHits: markDirty(s.dirtyHits, [id]),
        })),

      deleteHit: (id) =>
        set((s) => ({
          hits: s.hits.map((h) => (h.id === id ? { ...h, deleted: true, updatedAt: Date.now() } : h)),
          dirtyHits: markDirty(s.dirtyHits, [id]),
        })),

      backfillHistory: (sleepWindow) =>
        set((s) => {
          if (!s.profile) return {}
          const now = Date.now()
          const sleep = sleepWindow ?? s.profile.settings.sleep
          // A future quit date: fill in the history before today; the user logs the days until quitting.
          const fresh = generateBackfill(Math.min(s.profile.journeyStart, now), s.profile.averagePuffsPerDay, now, Math.random, sleep)
          const freshIds = new Set(fresh.map((h) => h.id))
          // Old backfill records not regenerated (different days or a lower average) become tombstones.
          const stale = s.hits.filter((h) => h.backfill && !h.deleted && !freshIds.has(h.id)).map((h) => ({ ...h, deleted: true, updatedAt: now }))
          const kept = s.hits.filter((h) => !h.backfill)
          return {
            hits: [...fresh, ...stale, ...kept],
            profile: { ...s.profile, hasBackfilled: true, settings: { ...s.profile.settings, sleep }, updatedAt: now },
            dirtyProfile: true,
            dirtyHits: markDirty(s.dirtyHits, [...fresh, ...stale].map((h) => h.id)),
          }
        }),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      importBackup: (b) =>
        set((s) => {
          const now = Date.now()
          const byId = new Map(s.hits.map((h) => [h.id, h]))
          for (const h of b.hits) byId.set(h.id, { ...h, updatedAt: now })
          return {
            profile: b.profile ? { ...b.profile, settings: normalizeSettings(b.profile.settings), updatedAt: now } : s.profile,
            hits: [...byId.values()],
            dirtyProfile: !!b.profile || s.dirtyProfile,
            dirtyHits: markDirty(s.dirtyHits, b.hits.map((h) => h.id)),
          }
        }),

      eraseLocal: () => set({ profile: null, hits: [], dirtyProfile: false, dirtyHits: {}, cursor: null }),
    }),
    {
      name: 'quit-data',
      // v2 added profile settings, v3 the sleep window: normalising fills in whatever an older save is missing.
      version: 3,
      migrate: (persisted, version) => {
        const s = persisted as DataState
        if (version < 3 && s.profile) s.profile = { ...s.profile, settings: normalizeSettings(s.profile.settings) }
        return s
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const raw = localStorage.getItem(name)
          // Never silently lose history: keep an unreadable copy aside before the app starts fresh over it.
          if (raw) try { JSON.parse(raw) } catch { localStorage.setItem(`${name}-unreadable-${Date.now()}`, raw) }
          return raw
        },
        setItem: (name, value) => localStorage.setItem(name, value),
        removeItem: (name) => localStorage.removeItem(name),
      })),
    },
  ),
)

export function exportBackup(s: Pick<DataState, 'profile' | 'hits'>): Backup {
  return { app: 'quit-vaping', version: 1, exportedAt: new Date().toISOString(), profile: s.profile, hits: s.hits.filter((h) => !h.deleted) }
}
