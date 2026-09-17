import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { generateBackfill } from '../lib/analytics'
import type { Hit, HitReason, Profile, ThemeMode } from '../types'

export interface DataState {
  profile: Profile | null
  hits: Hit[]
  theme: ThemeMode

  // Sync bookkeeping (see lib/sync.ts). Dirty items are local edits the cloud has not seen yet.
  dirtyProfile: boolean
  dirtyHits: Record<string, true>
  /** Server timestamp of the newest row pulled, per signed-in user. */
  cursor: { userId: string; at: string } | null

  startJourney: (averagePuffsPerDay: number) => void
  updateProfile: (updates: Partial<Pick<Profile, 'averagePuffsPerDay' | 'journeyStart'>>) => void
  recordHit: (reason?: HitReason) => void
  updateHit: (id: string, updates: { ts?: number; reason?: HitReason }) => void
  deleteHit: (id: string) => void
  backfillHistory: () => void
  toggleTheme: () => void
  importBackup: (backup: Backup) => void
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

export const useData = create<DataState>()(
  persist(
    (set) => ({
      profile: null,
      hits: [],
      theme: 'dark',
      dirtyProfile: false,
      dirtyHits: {},
      cursor: null,

      startJourney: (averagePuffsPerDay) =>
        set({ profile: { averagePuffsPerDay, journeyStart: Date.now(), hasBackfilled: false, updatedAt: Date.now() }, dirtyProfile: true }),

      updateProfile: (updates) =>
        set((s) => (s.profile ? { profile: { ...s.profile, ...updates, updatedAt: Date.now() }, dirtyProfile: true } : {})),

      recordHit: (reason) =>
        set((s) => {
          const now = Date.now()
          const hit: Hit = { id: newId(), ts: now, reason, updatedAt: now }
          return { hits: [...s.hits, hit], dirtyHits: markDirty(s.dirtyHits, [hit.id]) }
        }),

      updateHit: (id, updates) =>
        set((s) => ({
          hits: s.hits.map((h) => (h.id === id ? { ...h, ...updates, updatedAt: Date.now() } : h)),
          dirtyHits: markDirty(s.dirtyHits, [id]),
        })),

      deleteHit: (id) =>
        set((s) => ({
          hits: s.hits.map((h) => (h.id === id ? { ...h, deleted: true, updatedAt: Date.now() } : h)),
          dirtyHits: markDirty(s.dirtyHits, [id]),
        })),

      backfillHistory: () =>
        set((s) => {
          if (!s.profile) return {}
          const now = Date.now()
          const fresh = generateBackfill(s.profile.journeyStart, s.profile.averagePuffsPerDay, now)
          const freshIds = new Set(fresh.map((h) => h.id))
          // Old backfill records not regenerated (different days or a lower average) become tombstones.
          const stale = s.hits.filter((h) => h.backfill && !h.deleted && !freshIds.has(h.id)).map((h) => ({ ...h, deleted: true, updatedAt: now }))
          const kept = s.hits.filter((h) => !h.backfill)
          const hits = [...fresh, ...stale, ...kept]
          return {
            hits,
            profile: { ...s.profile, hasBackfilled: true, updatedAt: now },
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
            profile: b.profile ? { ...b.profile, updatedAt: now } : s.profile,
            hits: [...byId.values()],
            dirtyProfile: !!b.profile || s.dirtyProfile,
            dirtyHits: markDirty(s.dirtyHits, b.hits.map((h) => h.id)),
          }
        }),
    }),
    {
      name: 'quit-data',
      version: 1,
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
