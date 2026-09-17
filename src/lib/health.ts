const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export interface HealthMilestone {
  after: number
  label: string
  detail: string
}

/**
 * Commonly cited recovery milestones after the last nicotine use. Timings vary from person to person;
 * this is general encouragement, not medical advice.
 */
export const HEALTH_MILESTONES: HealthMilestone[] = [
  { after: 20 * MIN, label: '20 minutes', detail: 'Heart rate and blood pressure start to come down from the nicotine spike.' },
  { after: 12 * HOUR, label: '12 hours', detail: 'Nicotine levels in your blood have dropped sharply.' },
  { after: 2 * DAY, label: '2 days', detail: 'Taste and smell often start to sharpen.' },
  { after: 3 * DAY, label: '3 days', detail: 'Nicotine is essentially out of your body. Cravings often peak around now, then ease.' },
  { after: 7 * DAY, label: '1 week', detail: 'The hardest part of withdrawal is usually behind you.' },
  { after: 14 * DAY, label: '2 weeks', detail: 'Circulation and breathing tend to improve; exercise can start to feel easier.' },
  { after: 30 * DAY, label: '1 month', detail: 'Irritability, poor sleep and trouble concentrating usually settle down.' },
  { after: 90 * DAY, label: '3 months', detail: 'Lung function keeps improving and cravings are far less frequent.' },
  { after: 180 * DAY, label: '6 months', detail: 'Less coughing and shortness of breath for many people.' },
  { after: 365 * DAY, label: '1 year', detail: 'A full year nicotine-free. Your body and your wallet have both noticed.' },
]

export function healthProgress(streakMs: number) {
  const reached = HEALTH_MILESTONES.filter((m) => streakMs >= m.after)
  const next = HEALTH_MILESTONES.find((m) => streakMs < m.after) ?? null
  const prevAt = reached.length ? reached[reached.length - 1].after : 0
  const progress = next ? (streakMs - prevAt) / (next.after - prevAt) : 1
  return { reached, next, last: reached[reached.length - 1] ?? null, progress: Math.min(1, Math.max(0, progress)) }
}
