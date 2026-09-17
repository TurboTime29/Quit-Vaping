import type { DailyStats, Hit, HitReason, Profile } from '../types'
import { REASONS } from '../types'

export const DAY_MS = 24 * 60 * 60 * 1000

export function dateKey(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Parses YYYY-MM-DD as a local date (new Date('YYYY-MM-DD') would be UTC midnight, i.e. the previous day in the Americas). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(ms: number, offsetDays = 0): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays).getTime()
}

/**
 * Hits that count: not deleted, and either generated backfill or logged on/after the journey start.
 * Hits before the journey start are hidden rather than erased, so moving the start date back restores them.
 */
export function visibleHits(hits: Hit[], profile: Profile | null): Hit[] {
  const start = profile?.journeyStart ?? -Infinity
  return hits.filter((h) => !h.deleted && (h.backfill || h.ts >= start))
}

export function realHits(visible: Hit[]): Hit[] {
  return visible.filter((h) => !h.backfill)
}

export function lastHitTime(real: Hit[]): number | null {
  let max: number | null = null
  for (const h of real) if (max === null || h.ts > max) max = h.ts
  return max
}

export function dailyStats(visible: Hit[]): Map<string, DailyStats> {
  const map = new Map<string, DailyStats>()
  for (const h of visible) {
    const d = new Date(h.ts)
    const key = dateKey(d)
    let s = map.get(key)
    if (!s) map.set(key, (s = { date: key, count: 0, hourly: new Array(24).fill(0) }))
    s.count++
    s.hourly[d.getHours()]++
  }
  return map
}

export function emptyDay(key: string): DailyStats {
  return { date: key, count: 0, hourly: new Array(24).fill(0) }
}

export function lastNDays(stats: Map<string, DailyStats>, now: number, n = 7): DailyStats[] {
  const out: DailyStats[] = []
  for (let i = n - 1; i >= 0; i--) {
    const key = dateKey(startOfDay(now, -i))
    out.push(stats.get(key) ?? emptyDay(key))
  }
  return out
}

/** Hits a user would have taken since the journey began at their old average, minus the ones they did take. */
export function totalAvoided(profile: Profile | null, real: Hit[], now: number): number {
  if (!profile) return 0
  const days = (now - profile.journeyStart) / DAY_MS
  return Math.floor(Math.max(0, profile.averagePuffsPerDay * days - real.length))
}

/** Longest gap between hits (journey start counts as the first boundary, now as the last). */
export function longestStreak(profile: Profile | null, real: Hit[], now: number): number {
  const times = real.map((h) => h.ts).sort((a, b) => a - b)
  let prev = profile?.journeyStart ?? times[0]
  if (prev === undefined) return 0
  let max = 0
  for (const t of times) {
    max = Math.max(max, t - prev)
    prev = t
  }
  return Math.max(max, now - prev)
}

export interface YesterdayComparison {
  sameTimeYesterday: number
  totalYesterday: number
  avoidedToday: number
}

export function compareWithYesterday(visible: Hit[], stats: Map<string, DailyStats>, profile: Profile | null, now: number): YesterdayComparison {
  const yStart = startOfDay(now, -1)
  const yKey = dateKey(yStart)
  const cutoff = yStart + (now - startOfDay(now)) // same wall-clock time yesterday (ignores DST shifts)
  let sameTimeYesterday = 0
  for (const h of visible) if (h.ts >= yStart && h.ts <= cutoff && dateKey(h.ts) === yKey) sameTimeYesterday++

  const todayStart = startOfDay(now)
  // On the day the journey starts, only count the part of the day after it started.
  const from = profile && dateKey(profile.journeyStart) === dateKey(now) ? profile.journeyStart : todayStart
  const expected = (profile?.averagePuffsPerDay ?? 0) * ((now - from) / DAY_MS)
  const today = stats.get(dateKey(now))?.count ?? 0
  return {
    sameTimeYesterday,
    totalYesterday: stats.get(yKey)?.count ?? 0,
    avoidedToday: Math.max(0, Math.floor(expected - today)),
  }
}

export type ReasonTimeframe = 'All Time' | 'Last 7 Days' | 'Yesterday' | 'Today'
export const TIMEFRAMES: ReasonTimeframe[] = ['All Time', 'Last 7 Days', 'Yesterday', 'Today']

export interface ReasonStat { reason: HitReason; count: number; percentage: number }

export function reasonStats(visible: Hit[], timeframe: ReasonTimeframe, now: number): ReasonStat[] {
  const today = startOfDay(now)
  const [from, to] =
    timeframe === 'Today' ? [today, Infinity]
    : timeframe === 'Yesterday' ? [startOfDay(now, -1), today]
    : timeframe === 'Last 7 Days' ? [startOfDay(now, -6), Infinity] // same 7 days as the chart
    : [-Infinity, Infinity]
  const counts = new Map<HitReason, number>()
  let total = 0
  for (const h of visible) {
    if (!h.reason || h.ts < from || h.ts >= to) continue
    counts.set(h.reason, (counts.get(h.reason) ?? 0) + 1)
    total++
  }
  return REASONS.map((reason) => {
    const count = counts.get(reason) ?? 0
    return { reason, count, percentage: total ? (count / total) * 100 : 0 }
  })
}

export function formatClock(ms: number): [string, string, string, string] {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return [p(Math.floor(s / 86400)), p(Math.floor(s / 3600) % 24), p(Math.floor(s / 60) % 60), p(s % 60)]
}

export function formatStreak(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12AM'
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return '12PM'
  return `${hour - 12}PM`
}

/**
 * 30 days of synthetic pre-quit history at the user's old average: ~10% overnight (mostly 6-8am wake-up hits),
 * the rest spread over 8am-midnight. IDs are per day and index, so redoing the backfill overwrites the same records.
 */
export function generateBackfill(quitAt: number, averagePuffsPerDay: number, now: number, random = Math.random): Hit[] {
  const hits: Hit[] = []
  const sleep = Math.max(1, Math.round(averagePuffsPerDay * 0.1))
  const wake = Math.max(0, averagePuffsPerDay - sleep)
  for (let d = 30; d >= 1; d--) {
    const day = new Date(startOfDay(quitAt, -d))
    const key = dateKey(day).replace(/-/g, '')
    let i = 0
    const push = (hour: number) => {
      const ts = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(random() * 60), Math.floor(random() * 60)).getTime()
      hits.push({ id: `bf-${key}-${i++}`, ts, backfill: true, updatedAt: now })
    }
    for (let k = 0; k < sleep; k++) push(random() < 0.7 ? 6 + Math.floor(random() * 2) : Math.floor(random() * 3))
    for (let k = 0; k < wake; k++) push(8 + Math.floor(random() * 16))
  }
  return hits
}
