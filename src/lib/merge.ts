import type { Hit, HitReason, Profile } from '../types'
import type { DataState } from '../store/data'

export interface ProfileRow {
  user_id: string
  average_puffs_per_day: number
  journey_start: string
  has_backfilled: boolean
  updated_at: number
  server_at?: string
}

export interface HitRow {
  user_id: string
  id: string
  ts: string
  reason: HitReason | null
  backfill: boolean
  deleted: boolean
  updated_at: number
  server_at?: string
}

export const profileToRow = (userId: string, p: Profile): ProfileRow => ({
  user_id: userId,
  average_puffs_per_day: p.averagePuffsPerDay,
  journey_start: new Date(p.journeyStart).toISOString(),
  has_backfilled: p.hasBackfilled,
  updated_at: p.updatedAt,
})

export const rowToProfile = (r: ProfileRow): Profile => ({
  averagePuffsPerDay: r.average_puffs_per_day,
  journeyStart: Date.parse(r.journey_start),
  hasBackfilled: r.has_backfilled,
  updatedAt: Number(r.updated_at),
})

export const hitToRow = (userId: string, h: Hit): HitRow => ({
  user_id: userId,
  id: h.id,
  ts: new Date(h.ts).toISOString(),
  reason: h.reason ?? null,
  backfill: !!h.backfill,
  deleted: !!h.deleted,
  updated_at: h.updatedAt,
})

export const rowToHit = (r: HitRow): Hit => {
  const h: Hit = { id: r.id, ts: Date.parse(r.ts), updatedAt: Number(r.updated_at) }
  if (r.reason) h.reason = r.reason
  if (r.backfill) h.backfill = true
  if (r.deleted) h.deleted = true
  return h
}

type Mergeable = Pick<DataState, 'profile' | 'hits' | 'dirtyProfile' | 'dirtyHits'>

/**
 * Folds pulled cloud rows into local state. Last write wins per record, except that a local edit the cloud
 * has not seen yet survives an older cloud copy. On a device's first sync for an account the cloud profile
 * wins (so a freshly onboarded phone does not reset an existing journey) and every local record is queued for upload.
 */
export function mergeRemote(state: Mergeable, remoteProfile: ProfileRow | null, remoteHits: HitRow[], firstSync: boolean): Mergeable {
  let { profile, dirtyProfile } = state
  const dirtyHits = { ...state.dirtyHits }

  if (firstSync) {
    for (const h of state.hits) dirtyHits[h.id] = true
    dirtyProfile = !!profile
  }

  if (remoteProfile) {
    const remote = rowToProfile(remoteProfile)
    if (!profile || firstSync || !dirtyProfile || remote.updatedAt >= profile.updatedAt) {
      profile = remote
      dirtyProfile = false
    }
  }

  const byId = new Map(state.hits.map((h) => [h.id, h]))
  for (const row of remoteHits) {
    const remote = rowToHit(row)
    const local = byId.get(remote.id)
    if (local && dirtyHits[local.id] && local.updatedAt > remote.updatedAt) continue
    delete dirtyHits[remote.id]
    if (remote.deleted) byId.delete(remote.id)
    else byId.set(remote.id, remote)
  }

  return { profile, dirtyProfile, hits: [...byId.values()], dirtyHits }
}
