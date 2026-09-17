export const DEFAULT_REASONS = ['Stress', 'Habit', 'Focus', 'Bored', 'Other']

const DEFAULT_REASON_COLORS: Record<string, string> = {
  Stress: '#FF6B6B',
  Habit: '#4ECDC4',
  Focus: '#45B7D1',
  Bored: '#FFA07A',
  Other: '#9B59B6',
}
const EXTRA_COLORS = ['#F7B731', '#A3CB38', '#FD79A8', '#6C5CE7', '#00B894', '#E17055', '#74B9FF', '#FDCB6E']

/** Fixed colour per reason name, so a reason keeps its colour everywhere (custom reasons get one from their name). */
export function reasonColor(reason: string): string {
  if (DEFAULT_REASON_COLORS[reason]) return DEFAULT_REASON_COLORS[reason]
  let hash = 0
  for (const ch of reason) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return EXTRA_COLORS[Math.abs(hash) % EXTRA_COLORS.length]
}

export interface Hit {
  id: string
  /** When it happened (epoch ms). */
  ts: number
  reason?: string
  note?: string
  /** A craving the user resisted (a "win"). Absent for an actual hit. Wins never count towards hit stats. */
  kind?: 'resisted'
  /** Generated pre-quit history, used for charts only (never for streaks or "avoided"). */
  backfill?: boolean
  /** Tombstone kept until the deletion has reached the cloud. */
  deleted?: boolean
  /** Last local edit (epoch ms), used to resolve sync conflicts. */
  updatedAt: number
}

/** A daily hit limit that drops by `weeklyDrop` every 7 days from `startedAt`. */
export interface Taper {
  startLimit: number
  weeklyDrop: number
  startedAt: number
}

export interface Cost {
  /** Price of one pod / disposable. */
  pricePerPod: number
  puffsPerPod: number
}

export interface Reminders {
  /** Local time "HH:MM" for a daily check-in notification, or null for none. */
  daily: string | null
  /** Notify when the streak passes 1 day, 3 days, 1 week... */
  milestones: boolean
}

/** Usual sleep, "HH:MM" local times, used to shape backfilled history. */
export interface SleepWindow {
  start: string
  end: string
}

/** Cold turkey: stop completely at the quit date. Gradual: cut down with a daily limit towards a vape-free target. */
export type Approach = 'cold-turkey' | 'gradual'

export interface ProfileSettings {
  /** Undefined for journeys started before the plan choice existed (treated as gradual). */
  approach?: Approach
  /** Gradual plan: the date the user wants to be vape-free by (epoch ms). */
  targetDate?: number | null
  reasons: string[]
  sleep: SleepWindow
  taper: Taper | null
  cost: Cost | null
  reminders: Reminders
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  targetDate: null,
  reasons: DEFAULT_REASONS,
  sleep: { start: '01:00', end: '08:30' },
  taper: null,
  cost: null,
  reminders: { daily: null, milestones: false },
}

export function normalizeSettings(s: Partial<ProfileSettings> | null | undefined): ProfileSettings {
  return {
    ...(s?.approach === 'cold-turkey' || s?.approach === 'gradual' ? { approach: s.approach } : {}),
    targetDate: typeof s?.targetDate === 'number' ? s.targetDate : null,
    reasons: Array.isArray(s?.reasons) && s.reasons.length ? s.reasons : DEFAULT_REASONS,
    sleep: s?.sleep?.start && s.sleep.end ? s.sleep : DEFAULT_SETTINGS.sleep,
    taper: s?.taper ?? null,
    cost: s?.cost ?? null,
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(s?.reminders ?? {}) },
  }
}

export interface Profile {
  averagePuffsPerDay: number
  /** Journey start (epoch ms). */
  journeyStart: number
  hasBackfilled: boolean
  settings: ProfileSettings
  updatedAt: number
}

export const approachOf = (p: Profile | null): Approach => p?.settings.approach ?? 'gradual'

export type ThemeMode = 'light' | 'dark'

export interface DailyStats {
  /** Local calendar day, YYYY-MM-DD. */
  date: string
  count: number
  hourly: number[]
}
