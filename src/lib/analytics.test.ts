import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Hit, type Profile } from '../types'
import {
  DAY_MS, compareWithYesterday, costPerPuff, dailyLimit, dailyStats, dateKey, formatClock, formatStreak, generateBackfill, heatmap,
  hourProfile, journeyHits, lastHitTime, taperToTarget, lastNDays, longestStreak, nextLimitDrop, parseDateKey, preQuitBaseline, realHits, reasonBreakdown, reasonStats, savings, startOfDay, topHours,
  totalAvoided, visibleHits, weekSummary, weekdayAverages,
} from './analytics'
import { HEALTH_MILESTONES, healthProgress } from './health'
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
  it('keeps pre-quit logs as history, drops tombstones, and counts only journey hits as slips', () => {
    const p = profile(at(2026, 9, 10))
    const hits = [hit('old', at(2026, 9, 9)), hit('bf', at(2026, 9, 1), { backfill: true }), hit('new', at(2026, 9, 11)), hit('gone', at(2026, 9, 12), { deleted: true })]
    expect(visibleHits(hits).map((h) => h.id)).toEqual(['old', 'bf', 'new'])
    expect(realHits(visibleHits(hits)).map((h) => h.id)).toEqual(['old', 'new'])
    expect(journeyHits(visibleHits(hits), p).map((h) => h.id)).toEqual(['new'])
    expect(lastHitTime(journeyHits(visibleHits(hits), p))).toBe(at(2026, 9, 11))
  })

  it('builds a gradual plan that reaches zero by the target date', () => {
    const start = at(2026, 9, 17, 12)
    const t = taperToTarget(120, start, at(2026, 10, 29)) // 6 weeks
    expect(t).toEqual({ startLimit: 120, weeklyDrop: 20, startedAt: start })
    expect(dailyLimit(t, at(2026, 10, 29))).toBe(0)
    expect(dailyLimit(t, at(2026, 10, 28))).toBe(20)
    expect(taperToTarget(7, start, at(2026, 9, 25)).weeklyDrop).toBe(7)
  })

  it('lists health milestones in order with sources', () => {
    expect(HEALTH_MILESTONES.map((m) => m.after)).toEqual([...HEALTH_MILESTONES.map((m) => m.after)].sort((a, b) => a - b))
    for (const m of HEALTH_MILESTONES) expect(m.source.url).toMatch(/^https:\/\//)
    expect(healthProgress(-5000).next!.label).toBe('20 minutes') // before a future quit date
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
  it('covers the 30 days before quitting and the quit day up to the minute before, with stable ids', () => {
    const quit = at(2026, 9, 17, 15, 4)
    const seeded = () => { let x = 42; return () => ((x = (x * 16807) % 2147483647) / 2147483647) }
    const a = generateBackfill(quit, 20, 0, seeded())
    const stats = dailyStats(a)
    expect(Math.max(...a.map((h) => h.ts))).toBe(quit - 60_000)
    expect(Math.min(...a.map((h) => h.ts))).toBeGreaterThanOrEqual(at(2026, 8, 18))
    expect(stats.get('2026-08-17')).toBeUndefined()
    expect(stats.get('2026-09-17')!.count).toBeGreaterThan(5) // quit morning and early afternoon
    expect(new Set(a.map((h) => h.id)).size).toBe(a.length)
    expect(generateBackfill(quit, 20, 0, seeded()).map((h) => h.id)).toEqual(a.map((h) => h.id))
  })

  it('keeps most hits in waking hours and only a few overnight (asleep 1:00 to 8:30)', () => {
    const quit = at(2026, 9, 17, 15)
    const a = generateBackfill(quit, 300, 0, Math.random, { start: '01:00', end: '08:30' })
    const minuteOfDay = (ts: number) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes() }
    const overnight = a.filter((h) => { const m = minuteOfDay(h.ts); return m >= 60 && m < 510 })
    expect(overnight).toHaveLength(31 * 5) // "a few" (3% of 300 is 9, capped at 5) for each of the 31 nights
    // Waking hits are spread across the whole 16.5 hours, including after midnight.
    const awake = a.filter((h) => !overnight.includes(h)).map((h) => minuteOfDay(h.ts))
    expect(awake.some((m) => m < 60)).toBe(true)
    expect(awake.some((m) => m >= 510 && m < 600)).toBe(true)
    expect(awake.some((m) => m >= 1380)).toBe(true)
    // Daily counts line up with the average.
    const perDay = dailyStats(a)
    expect(perDay.get('2026-09-10')!.count).toBeGreaterThan(280)
    expect(perDay.get('2026-09-10')!.count).toBeLessThan(320)
  })

  it('handles a bedtime before midnight and tiny averages', () => {
    const quit = at(2026, 9, 17, 15)
    const a = generateBackfill(quit, 1, 0, Math.random, { start: '23:00', end: '07:00' })
    expect(a.length).toBeGreaterThanOrEqual(30)
    expect(a.length).toBeLessThanOrEqual(31)
    for (const h of a) { const hr = new Date(h.ts).getHours(); expect(hr >= 7 && hr < 23).toBe(true) }
  })
})

describe('pre-quit baseline and savings', () => {
  const quit = at(2026, 9, 17, 15)
  const p = profile(quit, 100)

  it('measures avoided hits against backfilled history, ignoring wins and deleted records', () => {
    const backfill = generateBackfill(quit, 40, 0)
    const extras = [hit('win', quit - 3600_000, { kind: 'resisted' }), hit('gone', quit - 7200_000, { deleted: true })]
    const b = preQuitBaseline(p, [...backfill, ...extras])
    expect(b.source).toBe('history')
    expect(b.days).toBe(30)
    expect(b.perDay).toBeGreaterThan(38) // each full day averages 40; the partial quit day is left out
    expect(b.perDay).toBeLessThan(42)
    const now = quit + 2 * DAY_MS
    const real = [hit('r1', quit + 3600_000), hit('r2', quit + DAY_MS)]
    expect(totalAvoided(p, real, now, 40)).toBe(78) // 40 * 2 - 2, not 100 * 2 - 2
  })

  it('falls back to the Average Puffs setting without at least a week of pre-quit history', () => {
    expect(preQuitBaseline(p, [hit('after', quit + 1000)])).toEqual({ perDay: 100, source: 'setting', days: 0 })
    // One hit logged the day before quitting is not a habit measurement.
    expect(preQuitBaseline(p, [hit('yday', quit - DAY_MS)]).source).toBe('setting')
    const week = Array.from({ length: 7 * 30 }, (_, i) => hit(`w${i}`, startOfDay(quit, -7) + i * (DAY_MS / 30)))
    expect(preQuitBaseline(p, week)).toEqual({ perDay: 30, source: 'history', days: 7 })
  })

  it('adds up money saved, spent and pods', () => {
    const now = quit + 2 * DAY_MS
    const real = [hit('r1', quit + 3600_000), hit('r2', quit + DAY_MS)]
    const s = savings(p, real, { pricePerPod: 20, puffsPerPod: 1000 }, 40, now)
    expect(s.total).toBeCloseTo(78 * 0.02)
    expect(s.wouldHaveSpent).toBeCloseTo(80 * 0.02)
    expect(s.spent).toBeCloseTo(2 * 0.02)
    expect(s.pods).toBeCloseTo(0.078)
    expect(s.daily.at(-1)!.saved).toBeCloseTo(78 * 0.02)
    expect(s.daily[0].saved).toBeGreaterThan(0)
    expect(s.perDayRecent).toBeCloseTo(39 * 0.02)
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
    expect(h.last!.label).toBe('1 day')
    expect(h.next!.label).toBe('3 days')
    expect(h.progress).toBeCloseTo(0.75) // halfway from 1 day to 3 days is 2 days; 2.5 is three quarters
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
