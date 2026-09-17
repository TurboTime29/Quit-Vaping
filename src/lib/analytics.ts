import type { Cost, DailyStats, Hit, Profile, Taper } from '../types'
import { DEFAULT_REASONS } from '../types'

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

/** Whole calendar days from a to b (DST-safe). */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

/**
 * Records that count: not deleted, and either generated backfill or logged on/after the journey start.
 * Records before the journey start are hidden rather than erased, so moving the start date back restores them.
 * Includes resisted cravings; use onlyHits() for hit statistics.
 */
export function visibleHits(hits: Hit[], profile: Profile | null): Hit[] {
  const start = profile?.journeyStart ?? -Infinity
  return hits.filter((h) => !h.deleted && (h.backfill || h.ts >= start))
}

export const onlyHits = (visible: Hit[]) => visible.filter((h) => h.kind !== 'resisted')
export const onlyWins = (visible: Hit[]) => visible.filter((h) => h.kind === 'resisted')
/** Hits the user actually logged (no generated backfill). */
export const realHits = (hits: Hit[]) => hits.filter((h) => !h.backfill)

export function lastHitTime(real: Hit[]): number | null {
  let max: number | null = null
  for (const h of real) if (max === null || h.ts > max) max = h.ts
  return max
}

export function countBetween(hits: Hit[], from: number, to = Infinity): number {
  let n = 0
  for (const h of hits) if (h.ts >= from && h.ts < to) n++
  return n
}

export function dailyStats(hits: Hit[]): Map<string, DailyStats> {
  const map = new Map<string, DailyStats>()
  for (const h of hits) {
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

export function compareWithYesterday(hits: Hit[], stats: Map<string, DailyStats>, profile: Profile | null, now: number): YesterdayComparison {
  const yStart = startOfDay(now, -1)
  const yKey = dateKey(yStart)
  const cutoff = yStart + (now - startOfDay(now)) // same wall-clock time yesterday (ignores DST shifts)
  let sameTimeYesterday = 0
  for (const h of hits) if (h.ts >= yStart && h.ts <= cutoff && dateKey(h.ts) === yKey) sameTimeYesterday++

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

export interface ReasonStat { reason: string; count: number; percentage: number }

/** Reason breakdown for hits in [from, to), ordered like the user's reason list, then any retired reasons. */
export function reasonBreakdown(hits: Hit[], from: number, to: number, order: string[] = DEFAULT_REASONS): ReasonStat[] {
  const counts = new Map<string, number>()
  let total = 0
  for (const h of hits) {
    if (!h.reason || h.ts < from || h.ts >= to) continue
    counts.set(h.reason, (counts.get(h.reason) ?? 0) + 1)
    total++
  }
  const extra = [...counts.keys()].filter((r) => !order.includes(r)).sort((a, b) => counts.get(b)! - counts.get(a)!)
  return [...order.filter((r) => counts.has(r)), ...extra].map((reason) => {
    const count = counts.get(reason)!
    return { reason, count, percentage: (count / total) * 100 }
  })
}

export function reasonStats(hits: Hit[], timeframe: ReasonTimeframe, now: number, order?: string[]): ReasonStat[] {
  const today = startOfDay(now)
  const [from, to] =
    timeframe === 'Today' ? [today, Infinity]
    : timeframe === 'Yesterday' ? [startOfDay(now, -1), today]
    : timeframe === 'Last 7 Days' ? [startOfDay(now, -6), Infinity] // same 7 days as the chart
    : [-Infinity, Infinity]
  return reasonBreakdown(hits, from, to, order)
}

// ------------------------------------------------------------------ goals, money

/** Today's limit under a taper goal: starts at startLimit and drops by weeklyDrop every 7 days, never below 0. */
export function dailyLimit(taper: Taper | null, now: number): number | null {
  if (!taper) return null
  const weeks = Math.max(0, Math.floor(daysBetween(taper.startedAt, now) / 7))
  return Math.max(0, Math.round(taper.startLimit - taper.weeklyDrop * weeks))
}

/** Start of the next week in which the limit drops, or null once it has reached 0. */
export function nextLimitDrop(taper: Taper | null, now: number): number | null {
  if (!taper || taper.weeklyDrop <= 0 || dailyLimit(taper, now) === 0) return null
  const weeks = Math.max(0, Math.floor(daysBetween(taper.startedAt, now) / 7))
  return startOfDay(taper.startedAt, (weeks + 1) * 7)
}

export const costPerPuff = (cost: Cost | null): number | null =>
  cost && cost.puffsPerPod > 0 && cost.pricePerPod >= 0 ? cost.pricePerPod / cost.puffsPerPod : null

export function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount >= 1000 ? 0 : 2 })
}

// ------------------------------------------------------------------ insights

export interface WeekSummary {
  thisWeek: number
  lastWeek: number
  /** Percent change vs last week, or null when last week had no hits. */
  changePct: number | null
  winsThisWeek: number
  /** Hits avoided in the last 7 days compared with the old daily average (journey time only). */
  avoidedThisWeek: number
}

/** Rolling 7 days (today and the 6 before) against the 7 days before that. */
export function weekSummary(hits: Hit[], real: Hit[], wins: Hit[], profile: Profile | null, now: number): WeekSummary {
  const thisStart = startOfDay(now, -6)
  const lastStart = startOfDay(now, -13)
  const thisWeek = countBetween(hits, thisStart)
  const lastWeek = countBetween(hits, lastStart, thisStart)
  let avoidedThisWeek = 0
  if (profile) {
    const from = Math.max(thisStart, profile.journeyStart)
    const expected = profile.averagePuffsPerDay * Math.max(0, now - from) / DAY_MS
    avoidedThisWeek = Math.max(0, Math.floor(expected - countBetween(real, from)))
  }
  return {
    thisWeek,
    lastWeek,
    changePct: lastWeek ? ((thisWeek - lastWeek) / lastWeek) * 100 : null,
    winsThisWeek: countBetween(wins, thisStart),
    avoidedThisWeek,
  }
}

/** Hits per hour of day over the last `days` days. */
export function hourProfile(hits: Hit[], now: number, days = 28): number[] {
  const from = startOfDay(now, -(days - 1))
  const out = new Array(24).fill(0)
  for (const h of hits) if (h.ts >= from) out[new Date(h.ts).getHours()]++
  return out
}

export function topHours(counts: number[], n = 3): number[] {
  return counts.map((c, h) => [c, h]).filter(([c]) => c > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, n).map(([, h]) => h)
}

/** Average hits per weekday (0 = Sunday) over the last `weeks` weeks, counting only days since `since`. */
export function weekdayAverages(hits: Hit[], now: number, since: number, weeks = 4): number[] {
  const from = Math.max(startOfDay(now, -(weeks * 7 - 1)), startOfDay(since))
  const totals = new Array(7).fill(0)
  const days = new Array(7).fill(0)
  for (let t = from; t <= now; t = startOfDay(t, 1)) days[new Date(t).getDay()]++
  for (const h of hits) if (h.ts >= from) totals[new Date(h.ts).getDay()]++
  return totals.map((t, i) => (days[i] ? t / days[i] : 0))
}

export interface HeatCell { date: string; count: number; future: boolean }

/** Calendar grid of `weeks` columns (Sunday-first), ending with the current week. */
export function heatmap(stats: Map<string, DailyStats>, now: number, weeks = 17): HeatCell[][] {
  const today = startOfDay(now)
  const start = startOfDay(today, -(new Date(today).getDay() + (weeks - 1) * 7))
  const columns: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const t = startOfDay(start, w * 7 + d)
      const key = dateKey(t)
      col.push({ date: key, count: stats.get(key)?.count ?? 0, future: t > today })
    }
    columns.push(col)
  }
  return columns
}

// ------------------------------------------------------------------ formatting

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

/** Short duration without seconds, e.g. "3d 4h", "5h 12m", "8m". */
export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24, min = m % 60
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return min ? `${h}h ${min}m` : `${h}h`
  return `${min}m`
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
