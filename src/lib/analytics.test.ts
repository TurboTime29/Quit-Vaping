import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Hit, type Profile } from '../types'
import {
  DAY_MS, compareWithYesterday, costPerPuff, dailyLimit, dailyStats, dateKey, formatClock, formatStreak, generateBackfill, heatmap,
  hourProfile, lastHitTime, lastNDays, longestStreak, nextLimitDrop, parseDateKey, realHits, reasonBreakdown, reasonStats, topHours,
  totalAvoided, visibleHits, weekSummary, weekdayAverages,
} from './analytics'
import { healthProgress } from './health'
import { mergeRemote, hitToRow, profileToRow, rowToHit, rowToProfile } from './merge'
import { plan } from '../../supabase/functions/quit-reminders/plan.ts'

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const hit = (id: string, ts: number, extra: Partial<Hit> = {}): Hit => ({ id, ts, updatedAt: ts, ...extra })
const profile = (journeyStart: number, averagePuffsPerDay = 100): Profile => ({ journeyStart, averagePuffsPerDay, hasBackfilled: false, settings: DEFAULT_SETTINGS, updatedAt: journeyStart })

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
    expect(reasonStats(hits, 'Today', now).find((r) => r.reason === 'Stress')).toBeUndefined()
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

describe('v2.1 insights', () => {
  const now = at(2026, 9, 17, 12)

  it('keeps retired and custom reasons in the breakdown after the ordered list', () => {
    const hits = [hit('a', now - 1000, { reason: 'Social' }), hit('b', now - 2000, { reason: 'Habit' }), hit('c', now - 3000, { reason: 'Social' })]
    expect(reasonBreakdown(hits, -Infinity, Infinity).map((r) => r.reason)).toEqual(['Habit', 'Social'])
  })

  it('drops the taper limit every 7 calendar days and never below zero', () => {
    const taper = { startLimit: 20, weeklyDrop: 6, startedAt: at(2026, 9, 1, 18) }
    expect(dailyLimit(taper, at(2026, 9, 7, 23))).toBe(20)
    expect(dailyLimit(taper, at(2026, 9, 8, 0, 1))).toBe(14)
    expect(dailyLimit(taper, at(2026, 10, 30))).toBe(0)
    expect(nextLimitDrop(taper, at(2026, 9, 9))).toBe(at(2026, 9, 15))
    expect(nextLimitDrop(taper, at(2026, 10, 30))).toBeNull()
    expect(dailyLimit(null, now)).toBeNull()
  })

  it('prices puffs', () => {
    expect(costPerPuff({ pricePerPod: 20, puffsPerPod: 5000 })).toBeCloseTo(0.004)
    expect(costPerPuff({ pricePerPod: 20, puffsPerPod: 0 })).toBeNull()
  })

  it('summarises this week against last week', () => {
    const p = profile(at(2026, 9, 1), 10)
    const hits = [hit('t1', at(2026, 9, 16)), hit('t2', at(2026, 9, 11)), hit('l1', at(2026, 9, 10)), hit('l2', at(2026, 9, 5)), hit('l3', at(2026, 9, 4))]
    const wins = [hit('w', at(2026, 9, 15), { kind: 'resisted' })]
    const w = weekSummary(hits, hits, wins, p, now)
    expect([w.thisWeek, w.lastWeek, w.winsThisWeek]).toEqual([2, 3, 1])
    expect(w.changePct).toBeCloseTo(-33.33, 1)
    expect(w.avoidedThisWeek).toBe(63) // 10/day over 6.5 days - 2
  })

  it('finds peak hours and weekday averages', () => {
    const hits = [hit('a', at(2026, 9, 16, 9)), hit('b', at(2026, 9, 15, 9)), hit('c', at(2026, 9, 15, 21))]
    expect(topHours(hourProfile(hits, now))).toEqual([9, 21])
    const avg = weekdayAverages(hits, now, at(2026, 9, 14)) // Mon 14th .. Thu 17th: one of each weekday
    expect(avg[2]).toBe(2) // Tuesday the 15th
    expect(avg[0]).toBe(0)
  })

  it('builds a Sunday-first calendar ending this week', () => {
    const cols = heatmap(dailyStats([hit('a', at(2026, 9, 16, 9))]), now, 3)
    expect(cols).toHaveLength(3)
    expect(parseDateKey(cols[0][0].date).getDay()).toBe(0)
    expect(cols[2].find((c) => c.date === '2026-09-16')!.count).toBe(1)
    expect(cols[2].find((c) => c.date === '2026-09-18')!.future).toBe(true)
  })

  it('tracks health milestones from the current streak', () => {
    const h = healthProgress(2.5 * DAY_MS)
    expect(h.last!.label).toBe('2 days')
    expect(h.next!.label).toBe('3 days')
    expect(h.progress).toBeCloseTo(0.5)
  })

  it('round-trips notes, wins and settings through sync rows', () => {
    const h = hit('x', 1000, { kind: 'resisted', note: 'walked it off', reason: 'Social' })
    expect(rowToHit(hitToRow('u', h))).toEqual(h)
    const p = { ...profile(1000), settings: { ...DEFAULT_SETTINGS, taper: { startLimit: 10, weeklyDrop: 1, startedAt: 5 } } }
    expect(rowToProfile(profileToRow('u', p))).toEqual(p)
    expect(rowToProfile({ ...profileToRow('u', p), settings: {} as never }).settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('reminder planning', () => {
  const base = { tz: 'America/New_York', daily: '20:00', milestones: true }
  const utc = (iso: string) => new Date(iso)

  it('sends the daily check-in once inside the hour after the chosen local time', () => {
    const anchorMs = Date.parse('2026-09-15T12:00:00Z')
    const early = plan({ ...base, now: utc('2026-09-17T23:50:00Z'), anchorMs, state: null }) // 19:50 EDT
    expect(early.messages).toHaveLength(0)
    const due = plan({ ...base, now: utc('2026-09-18T00:05:00Z'), anchorMs, state: early.state }) // 20:05 EDT
    expect(due.messages.map((m) => m.tag)).toEqual(['daily'])
    expect(due.state.last_daily_date).toBe('2026-09-17')
    expect(plan({ ...base, now: utc('2026-09-18T00:20:00Z'), anchorMs, state: due.state }).messages).toHaveLength(0)
  })

  it('announces a milestone once, and never replays old ones for a new streak', () => {
    const anchorMs = Date.parse('2026-09-10T12:00:00Z')
    const first = plan({ ...base, daily: null, now: utc('2026-09-12T12:00:00Z'), anchorMs, state: null })
    expect(first.messages).toHaveLength(0) // first run records the 1-day milestone as already passed
    const crossed = plan({ ...base, daily: null, now: utc('2026-09-13T12:15:00Z'), anchorMs, state: first.state })
    expect(crossed.messages[0].title).toContain('3 days')
    expect(plan({ ...base, daily: null, now: utc('2026-09-13T12:30:00Z'), anchorMs, state: crossed.state }).messages).toHaveLength(0)
    const reset = plan({ ...base, daily: null, now: utc('2026-09-13T13:00:00Z'), anchorMs: Date.parse('2026-09-13T12:45:00Z'), state: crossed.state })
    expect(reset.messages).toHaveLength(0)
    expect(reset.state.last_milestone_days).toBe(0)
  })
})
