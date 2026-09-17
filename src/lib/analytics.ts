import type { Cost, DailyStats, Hit, Profile, SleepWindow, Taper } from '../types'
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
 * Every record that is not deleted: backfill, hits logged before the quit date (pre-quit history) and after,
 * and resisted cravings. Use onlyHits() for hit statistics and journeyHits() for progress since quitting.
 */
export function visibleHits(hits: Hit[]): Hit[] {
  return hits.filter((h) => !h.deleted)
}

export const onlyHits = (visible: Hit[]) => visible.filter((h) => h.kind !== 'resisted')
export const onlyWins = (visible: Hit[]) => visible.filter((h) => h.kind === 'resisted')
/** Hits the user actually logged (no generated backfill). */
export const realHits = (hits: Hit[]) => hits.filter((h) => !h.backfill)
/** Hits logged on or after the journey start: what streaks, totals and "avoided" are about. */
export const journeyHits = (hits: Hit[], profile: Profile | null) => realHits(hits).filter((h) => h.ts >= (profile?.journeyStart ?? -Infinity))
export const isPreQuit = (h: Hit, profile: Profile | null) => !!profile && h.ts < profile.journeyStart

/**
 * A gradual plan that reaches zero by the target date: start at the current average and drop by the same amount
 * each week (rounded up, so zero arrives on or before the target).
 */
export function taperToTarget(averagePerDay: number, startedAt: number, target: number): Taper {
  const weeks = Math.max(1, Math.floor(daysBetween(startedAt, target) / 7))
  return { startLimit: averagePerDay, weeklyDrop: Math.max(1, Math.ceil(averagePerDay / weeks)), startedAt }
}

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

export interface Baseline {
  /** Hits per day before quitting. */
  perDay: number
  /** 'history' when measured from logged or backfilled hits before the journey start, else the Average Puffs setting. */
  source: 'history' | 'setting'
  /** Days of pre-quit history the average covers (0 for the setting). */
  days: number
}

/** Days of pre-quit history needed before it replaces the Average Puffs setting as the baseline. */
export const MIN_BASELINE_DAYS = 7

/**
 * The pre-quit daily rate that "avoided" and "saved" are measured against: hits recorded in up to 30 full days
 * before the journey start (backfilled or logged, never resisted cravings or deleted records), falling back to
 * the Average Puffs Per Day setting until that history covers at least a week.
 */
export function preQuitBaseline(profile: Profile | null, allHits: Hit[], windowDays = 30): Baseline {
  const fallback: Baseline = { perDay: profile?.averagePuffsPerDay ?? 0, source: 'setting', days: 0 }
  if (!profile) return fallback
  // Whole calendar days only: the quit day is partial (hits stop when the journey starts), so it would skew the rate.
  const end = startOfDay(profile.journeyStart)
  const earliest = startOfDay(profile.journeyStart, -windowDays)
  let first = Infinity
  let count = 0
  for (const h of allHits) {
    if (h.deleted || h.kind === 'resisted' || h.ts >= end || h.ts < earliest) continue
    count++
    if (h.ts < first) first = h.ts
  }
  if (!count) return fallback
  const days = daysBetween(first, end)
  // A few days of logging (often starting mid-day) is too little to measure a habit: keep the user's own estimate.
  return days >= MIN_BASELINE_DAYS ? { perDay: count / days, source: 'history', days } : fallback
}

/** Hits a user would have taken since the journey began at their pre-quit rate, minus the ones they did take. */
export function totalAvoided(profile: Profile | null, real: Hit[], now: number, perDay = profile?.averagePuffsPerDay ?? 0): number {
  if (!profile) return 0
  const days = (now - profile.journeyStart) / DAY_MS
  return Math.floor(Math.max(0, perDay * days - real.length))
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

export function compareWithYesterday(hits: Hit[], stats: Map<string, DailyStats>, profile: Profile | null, now: number, perDay = profile?.averagePuffsPerDay ?? 0): YesterdayComparison {
  const yStart = startOfDay(now, -1)
  const yKey = dateKey(yStart)
  const cutoff = yStart + (now - startOfDay(now)) // same wall-clock time yesterday (ignores DST shifts)
  let sameTimeYesterday = 0
  for (const h of hits) if (h.ts >= yStart && h.ts <= cutoff && dateKey(h.ts) === yKey) sameTimeYesterday++

  const todayStart = startOfDay(now)
  // On the day the journey starts, only count the part of the day after it started.
  const from = profile && dateKey(profile.journeyStart) === dateKey(now) ? profile.journeyStart : todayStart
  const expected = (profile ? perDay : 0) * ((now - from) / DAY_MS)
  // Only hits since `from`: on the quit day, backfilled hits from before quitting are not "taken" on the journey.
  const today = countBetween(hits, from)
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

export interface Savings {
  /** Money saved since the journey start (hits avoided x cost per puff). */
  total: number
  /** What the pre-quit rate would have cost since the journey start, and what the hits taken did cost. */
  wouldHaveSpent: number
  spent: number
  /** Pods or disposables not bought. */
  pods: number
  /** Saving rate over the last 7 days (or the journey so far if shorter), per day. */
  perDayRecent: number
  /** Cumulative savings at the end of each journey day (today counts up to now). */
  daily: { date: string; saved: number }[]
}

export function savings(profile: Profile, real: Hit[], cost: Cost, perDay: number, now: number): Savings {
  const perPuff = costPerPuff(cost) ?? 0
  const start = profile.journeyStart
  const avoided = totalAvoided(profile, real, now, perDay)
  const wouldHaveSpent = perDay * Math.max(0, now - start) / DAY_MS * perPuff
  const spent = countBetween(real, start) * perPuff

  const recentFrom = Math.max(start, startOfDay(now, -6))
  const recentDays = Math.max(1 / 24, (now - recentFrom) / DAY_MS)
  const perDayRecent = Math.max(0, perDay * recentDays - countBetween(real, recentFrom)) / recentDays * perPuff

  const daily: { date: string; saved: number }[] = []
  const days = daysBetween(start, now)
  const sorted = real.filter((h) => h.ts >= start).map((h) => h.ts).sort((a, b) => a - b)
  let taken = 0
  let i = 0
  for (let d = 0; d <= days; d++) {
    const end = Math.min(now, startOfDay(start, d + 1))
    while (i < sorted.length && sorted[i] < end) { taken++; i++ }
    const expected = perDay * Math.max(0, end - start) / DAY_MS
    daily.push({ date: dateKey(startOfDay(start, d)), saved: Math.max(0, expected - taken) * perPuff })
  }

  return { total: avoided * perPuff, wouldHaveSpent, spent, pods: cost.puffsPerPod ? avoided / cost.puffsPerPod : 0, perDayRecent, daily }
}

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
export function weekSummary(hits: Hit[], real: Hit[], wins: Hit[], profile: Profile | null, now: number, perDay = profile?.averagePuffsPerDay ?? 0): WeekSummary {
  const thisStart = startOfDay(now, -6)
  const lastStart = startOfDay(now, -13)
  const thisWeek = countBetween(hits, thisStart)
  const lastWeek = countBetween(hits, lastStart, thisStart)
  let avoidedThisWeek = 0
  if (profile) {
    const from = Math.max(thisStart, profile.journeyStart)
    const expected = perDay * Math.max(0, now - from) / DAY_MS
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

const minutesOf = (hhmm: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  return m ? (Number(m[1]) * 60 + Number(m[2])) % 1440 : fallback
}

/** Hits generated overnight per day: a few (about 3%, at most 5), none for very small averages. */
export const overnightHits = (perDay: number) => (perDay < 2 ? 0 : Math.min(5, Math.max(1, Math.round(perDay * 0.03))))

/**
 * Synthetic pre-quit history at the user's old average: the 30 full days before the quit day, plus the quit day itself
 * up to the minute before quitting (where the last hit is placed). Each day's waking hours (wake-up time to bedtime)
 * get evenly spread random hits, and the night that follows gets a few. IDs are per day and index, so redoing the
 * backfill overwrites the same records.
 */
export function generateBackfill(quitAt: number, averagePuffsPerDay: number, now: number, random = Math.random, sleep: SleepWindow = { start: '01:00', end: '08:30' }): Hit[] {
  const hits: Hit[] = []
  const bed = minutesOf(sleep.start, 60)
  const wake = minutesOf(sleep.end, 510)
  const asleepMinutes = (wake - bed + 1440) % 1440
  const awakeMinutes = 1440 - asleepMinutes
  const night = asleepMinutes ? overnightHits(averagePuffsPerDay) : 0
  const day = Math.max(0, averagePuffsPerDay - night)

  const from = startOfDay(quitAt, -30)
  const until = quitAt - 60_000
  // Day 31 before only contributes its after-midnight hits (so the first calendar day is complete); the quit day
  // is generated in full and cut off at the minute before quitting.
  for (let d = 31; d >= 0; d--) {
    const date = new Date(startOfDay(quitAt, -d))
    const key = dateKey(date).replace(/-/g, '')
    let i = 0
    // Minutes from this day's midnight; values past 1440 land in the next day (Date normalises them).
    const push = (minute: number) => {
      const ts = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.floor(minute), Math.floor(random() * 60)).getTime()
      if (ts >= from && ts <= until) hits.push({ id: `bf-${key}-${i++}`, ts, backfill: true, updatedAt: now })
    }
    for (let k = 0; k < day; k++) push(wake + random() * awakeMinutes)
    for (let k = 0; k < night; k++) push(wake + awakeMinutes + random() * asleepMinutes)
  }
  // The last hit before quitting happens the minute before the journey starts.
  let last = -1
  hits.forEach((h, i) => { if (last < 0 || h.ts > hits[last].ts) last = i })
  if (last >= 0) hits[last] = { ...hits[last], ts: until }
  return hits
}
