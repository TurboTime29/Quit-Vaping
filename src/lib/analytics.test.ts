import { describe, expect, it } from 'vitest'
import type { Hit, Profile } from '../types'
import {
  DAY_MS, compareWithYesterday, dailyStats, dateKey, formatClock, formatStreak, generateBackfill, lastHitTime, lastNDays,
  longestStreak, parseDateKey, realHits, reasonStats, totalAvoided, visibleHits,
} from './analytics'
import { mergeRemote, hitToRow, profileToRow } from './merge'

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const hit = (id: string, ts: number, extra: Partial<Hit> = {}): Hit => ({ id, ts, updatedAt: ts, ...extra })
const profile = (journeyStart: number, averagePuffsPerDay = 100): Profile => ({ journeyStart, averagePuffsPerDay, hasBackfilled: false, updatedAt: journeyStart })

describe('dates', () => {
  it('parses date keys as local dates', () => {
    expect(dateKey(parseDateKey('2026-09-17'))).toBe('2026-09-17')
    expect(parseDateKey('2026-09-17').getDate()).toBe(17)
  })
})

describe('visible hits', () => {
  it('hides (but keeps) real hits before the journey start and drops tombstones', () => {
    const p = profile(at(2026, 9, 10))
    const hits = [hit('old', at(2026, 9, 9)), hit('bf', at(2026, 9, 1), { backfill: true }), hit('new', at(2026, 9, 11)), hit('gone', at(2026, 9, 12), { deleted: true })]
    expect(visibleHits(hits, p).map((h) => h.id)).toEqual(['bf', 'new'])
    expect(realHits(visibleHits(hits, p)).map((h) => h.id)).toEqual(['new'])
    expect(lastHitTime(realHits(visibleHits(hits, p)))).toBe(at(2026, 9, 11))
  })
})

describe('stats', () => {
  const now = at(2026, 9, 17, 12)
  const p = profile(at(2026, 9, 15, 12), 48)
  const hits = [hit('a', at(2026, 9, 16, 9)), hit('b', at(2026, 9, 16, 11, 30), { reason: 'Stress' }), hit('c', at(2026, 9, 16, 18)), hit('d', at(2026, 9, 17, 8), { reason: 'Habit' })]
  const stats = dailyStats(hits)

  it('buckets by local day and hour', () => {
    expect(stats.get('2026-09-16')!.count).toBe(3)
    expect(stats.get('2026-09-16')!.hourly[11]).toBe(1)
    const week = lastNDays(stats, now)
    expect(week).toHaveLength(7)
    expect(week[6].date).toBe('2026-09-17')
    expect(week[0].date).toBe('2026-09-11')
  })

  it('compares with the same time yesterday', () => {
    const c = compareWithYesterday(hits, stats, p, now)
    expect(c.sameTimeYesterday).toBe(2)
    expect(c.totalYesterday).toBe(3)
    expect(c.avoidedToday).toBe(23) // 48 * 0.5 day - 1
  })

  it('counts avoided hits since the journey start', () => {
    expect(totalAvoided(p, hits, now)).toBe(92) // 48 * 2 days - 4
  })

  it('finds the longest streak including the running one', () => {
    expect(longestStreak(p, hits, now)).toBe(at(2026, 9, 16, 9) - at(2026, 9, 15, 12))
    expect(longestStreak(p, [], now)).toBe(2 * DAY_MS)
  })

  it('computes reason percentages per timeframe', () => {
    const all = reasonStats(hits, 'All Time', now)
    expect(all.find((r) => r.reason === 'Stress')!.percentage).toBe(50)
    expect(reasonStats(hits, 'Today', now).find((r) => r.reason === 'Stress')!.count).toBe(0)
    expect(reasonStats(hits, 'Yesterday', now).find((r) => r.reason === 'Stress')!.count).toBe(1)
  })

  it('formats clocks and streaks', () => {
    expect(formatClock(DAY_MS + 3661_000)).toEqual(['01', '01', '01', '01'])
    expect(formatStreak(90_000)).toBe('1m 30s')
    expect(formatStreak(2 * DAY_MS + 3_600_000)).toBe('2d 1h 0m')
  })
})

describe('backfill', () => {
  it('generates 30 days before the quit date with stable ids', () => {
    const quit = at(2026, 9, 17, 15)
    const a = generateBackfill(quit, 20, 0)
    expect(a).toHaveLength(30 * 20)
    expect(Math.max(...a.map((h) => h.ts))).toBeLessThan(at(2026, 9, 17))
    expect(Math.min(...a.map((h) => h.ts))).toBeGreaterThanOrEqual(at(2026, 8, 18))
    expect(new Set(a.map((h) => h.id)).size).toBe(a.length)
    expect(generateBackfill(quit, 20, 0).map((h) => h.id)).toEqual(a.map((h) => h.id))
  })
})

describe('mergeRemote', () => {
  const uid = 'u1'
  const p = profile(1000)

  it('takes the cloud profile on first sync and queues local hits for upload', () => {
    const local = { profile: profile(5000), hits: [hit('x', 6000)], dirtyProfile: true, dirtyHits: {} }
    const out = mergeRemote(local, profileToRow(uid, p), [hitToRow(uid, hit('y', 2000))], true)
    expect(out.profile!.journeyStart).toBe(1000)
    expect(out.dirtyProfile).toBe(false)
    expect(out.hits.map((h) => h.id).sort()).toEqual(['x', 'y'])
    expect(out.dirtyHits).toEqual({ x: true })
  })

  it('keeps newer unsynced local edits and applies remote deletes', () => {
    const local = {
      profile: p,
      hits: [hit('keep', 100, { updatedAt: 900, reason: 'Bored' }), hit('del', 200), hit('stale', 300, { updatedAt: 300 })],
      dirtyProfile: false,
      dirtyHits: { keep: true as const, stale: true as const },
    }
    const remote = [
      hitToRow(uid, hit('keep', 100, { updatedAt: 500 })),
      hitToRow(uid, hit('del', 200, { deleted: true, updatedAt: 800 })),
      hitToRow(uid, hit('stale', 350, { updatedAt: 400 })),
    ]
    const out = mergeRemote(local, null, remote, false)
    const byId = Object.fromEntries(out.hits.map((h) => [h.id, h]))
    expect(byId.keep.reason).toBe('Bored')
    expect(byId.del).toBeUndefined()
    expect(byId.stale.ts).toBe(350)
    expect(out.dirtyHits).toEqual({ keep: true })
  })
})
