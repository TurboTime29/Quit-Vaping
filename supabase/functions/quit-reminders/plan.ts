// Pure scheduling logic for the reminders function (no Deno or npm imports, so it is unit-tested with the app).

const DAY = 24 * 60 * 60 * 1000

export const MILESTONES: { days: number; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
]

export interface ReminderState {
  /** Local date (YYYY-MM-DD) the daily check-in was last sent. */
  last_daily_date: string | null
  /** ISO time the current streak started (last hit or journey start); a change means a new streak. */
  anchor: string | null
  /** Highest milestone (in days) already accounted for in the current streak. */
  last_milestone_days: number
}

export interface Message {
  title: string
  body: string
  tag: string
}

export interface PlanInput {
  now: Date
  tz: string
  /** "HH:MM" local time, or null. */
  daily: string | null
  milestones: boolean
  /** Start of the current streak (epoch ms). */
  anchorMs: number
  state: ReminderState | null
}

export function localClock(now: Date, tz: string): { date: string; minutes: number } {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    )
  } catch {
    return localClock(now, 'UTC')
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24, min = m % 60
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return min ? `${h}h ${min}m` : `${h}h`
  return `${min}m`
}

/**
 * Decides which notifications are due for one user. The function runs every 15 minutes, so the daily check-in
 * fires on the first run inside a one-hour window after the chosen time, once per local day. Milestones are only
 * announced when crossed during the current streak; starting a new streak (or turning alerts on) never replays old ones.
 */
export function plan(input: PlanInput): { messages: Message[]; state: ReminderState } {
  const messages: Message[] = []
  const state: ReminderState = {
    last_daily_date: input.state?.last_daily_date ?? null,
    anchor: input.state?.anchor ?? null,
    last_milestone_days: input.state?.last_milestone_days ?? 0,
  }
  const streak = input.now.getTime() - input.anchorMs

  const match = input.daily ? /^(\d{1,2}):(\d{2})$/.exec(input.daily) : null
  if (match) {
    const target = Number(match[1]) * 60 + Number(match[2])
    const clock = localClock(input.now, input.tz)
    if (clock.minutes >= target && clock.minutes < target + 60 && state.last_daily_date !== clock.date) {
      messages.push({ title: 'Daily check-in', body: `${duration(streak)} since your last hit. Open Quit. to log today and keep it honest.`, tag: 'daily' })
      state.last_daily_date = clock.date
    }
  }

  const anchor = new Date(input.anchorMs).toISOString()
  const reached = MILESTONES.filter((m) => streak >= m.days * DAY).pop()
  const reachedDays = reached?.days ?? 0
  if (state.anchor !== anchor || !input.milestones) {
    state.anchor = anchor
    state.last_milestone_days = reachedDays
  } else if (reached && reachedDays > state.last_milestone_days) {
    messages.push({ title: `${reached.label} without vaping 🎉`, body: 'Huge. Keep going, and open Quit. to see how far you have come.', tag: 'milestone' })
    state.last_milestone_days = reachedDays
  }

  return { messages, state }
}
