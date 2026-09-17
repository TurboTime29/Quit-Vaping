export type HitReason = 'Stress' | 'Habit' | 'Focus' | 'Bored' | 'Other'
export const REASONS: HitReason[] = ['Stress', 'Habit', 'Focus', 'Bored', 'Other']

/** Fixed colour per reason, so a reason keeps its colour when the timeframe filter hides others. */
export const REASON_COLORS: Record<HitReason, string> = {
  Stress: '#FF6B6B',
  Habit: '#4ECDC4',
  Focus: '#45B7D1',
  Bored: '#FFA07A',
  Other: '#9B59B6',
}

export interface Hit {
  id: string
  /** When the hit happened (epoch ms). */
  ts: number
  reason?: HitReason
  /** Generated pre-quit history, used for charts only (never for streaks or "avoided"). */
  backfill?: boolean
  /** Tombstone kept until the deletion has reached the cloud. */
  deleted?: boolean
  /** Last local edit (epoch ms), used to resolve sync conflicts. */
  updatedAt: number
}

export interface Profile {
  averagePuffsPerDay: number
  /** Journey start (epoch ms). */
  journeyStart: number
  hasBackfilled: boolean
  updatedAt: number
}

export type ThemeMode = 'light' | 'dark'

export interface DailyStats {
  /** Local calendar day, YYYY-MM-DD. */
  date: string
  count: number
  hourly: number[]
}
