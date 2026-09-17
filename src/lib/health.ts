const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export interface HealthMilestone {
  after: number
  label: string
  /** Short badge text. */
  short: string
  title: string
  detail: string
  source: { name: string; url: string }
}

const SOURCES = {
  truth: { name: 'Truth Initiative', url: 'https://truthinitiative.org/research-resources/quitting-smoking-vaping/breath-fresh-air-immediate-benefits-quitting-smoking-or' },
  cleveland: { name: 'Cleveland Clinic', url: 'https://my.clevelandclinic.org/health/diseases/21587-nicotine-withdrawal' },
  nci: { name: 'National Cancer Institute', url: 'https://www.cancer.gov/about-cancer/causes-prevention/risk/tobacco/withdrawal-fact-sheet' },
  mnt: { name: 'Medical News Today', url: 'https://www.medicalnewstoday.com/articles/322526' },
  bmj: { name: 'BMJ meta-analysis (Taylor et al., 2014)', url: 'https://pubmed.ncbi.nlm.nih.gov/24524926/' },
  clevelandBody: { name: 'Cleveland Clinic', url: 'https://health.clevelandclinic.org/happens-body-quit-smoking' },
}

/**
 * What typically happens after the last hit of nicotine. Nicotine clearance and withdrawal timings are well
 * established for any nicotine product; lung, heart and mood findings come mostly from research on people who
 * quit smoking, because long-term vaping research is still emerging. Everyone is different; not medical advice.
 */
export const HEALTH_MILESTONES: HealthMilestone[] = [
  { after: 20 * MIN, label: '20 minutes', short: '20m', title: 'Heart settles', detail: 'Your heart rate and blood pressure start coming down from the nicotine spike.', source: SOURCES.truth },
  { after: 2 * HOUR, label: '2 hours', short: '2h', title: 'Half the nicotine gone', detail: 'Nicotine’s half-life is about 2 hours, so half of what was in your blood has already cleared.', source: SOURCES.mnt },
  { after: DAY, label: '1 day', short: '1d', title: 'Body recalibrating', detail: 'Most nicotine is out of your bloodstream. Cravings and irritability now are a sign your brain is readjusting, not failing.', source: SOURCES.cleveland },
  { after: 3 * DAY, label: '3 days', short: '3d', title: 'Over the peak', detail: 'Nicotine itself has cleared, and withdrawal usually peaks on days 2 to 3. From here it gets a little easier every day.', source: SOURCES.cleveland },
  { after: 7 * DAY, label: '1 week', short: '1w', title: 'Hardest week done', detail: 'Withdrawal is worst in the first week. Cravings come in waves of 5 to 10 minutes and start to space out.', source: SOURCES.nci },
  { after: 14 * DAY, label: '2 weeks', short: '2w', title: 'Breathing easier', detail: 'Circulation and lung function begin to improve, and exercise can start to feel easier. Nicotine byproducts in your blood approach non-user levels.', source: SOURCES.truth },
  { after: 30 * DAY, label: '1 month', short: '1mo', title: 'Withdrawal fading', detail: 'Irritability, anxiety, low mood and poor sleep usually fade within 3 to 4 weeks. Cravings are fewer and milder.', source: SOURCES.cleveland },
  { after: 60 * DAY, label: '2 months', short: '2mo', title: 'Calmer mind', detail: 'People who quit nicotine report less anxiety, depression and stress than those who keep using, an improvement as large as antidepressants in studies of smokers.', source: SOURCES.bmj },
  { after: 90 * DAY, label: '3 months', short: '3mo', title: 'Lungs clearing', detail: 'Coughing, wheezing and shortness of breath tend to ease as your lungs get better at clearing mucus and fighting infections (1 to 9 months).', source: SOURCES.clevelandBody },
  { after: 180 * DAY, label: '6 months', short: '6mo', title: 'New normal', detail: 'Cravings are rare and short, and triggers like stress or boredom lose their pull. Breathing keeps improving.', source: SOURCES.nci },
  { after: 365 * DAY, label: '1 year', short: '1y', title: 'One year free', detail: 'For people who quit smoking, heart attack and heart disease risk is noticeably lower after a year. In a survey of people who quit vaping, 90% felt less stressed, anxious or depressed.', source: SOURCES.truth },
]

export function healthProgress(streakMs: number) {
  const reached = HEALTH_MILESTONES.filter((m) => streakMs >= m.after)
  const next = HEALTH_MILESTONES.find((m) => streakMs < m.after) ?? null
  const prevAt = reached.length ? reached[reached.length - 1].after : 0
  const progress = next ? (streakMs - prevAt) / (next.after - prevAt) : 1
  return { reached, next, last: reached[reached.length - 1] ?? null, progress: Math.min(1, Math.max(0, progress)) }
}
