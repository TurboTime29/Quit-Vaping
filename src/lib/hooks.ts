import { useEffect, useMemo, useState } from 'react'
import { useData } from '../store/data'
import { dailyStats, lastHitTime, onlyHits, onlyWins, realHits, visibleHits } from './analytics'

/** Current time, refreshed every `ms` (aligned to the wall clock so seconds tick together). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(Date.now())
      timer = setTimeout(tick, ms - (Date.now() % ms))
    }
    timer = setTimeout(tick, ms - (Date.now() % ms))
    // Timers are paused while an iPhone app is in the background: catch up immediately on return.
    const onVisible = () => { if (document.visibilityState === 'visible') setNow(Date.now()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])
  return now
}

/** Derived data shared by the screens, recomputed only when hits or the profile change. */
export function useHitData() {
  const hits = useData((s) => s.hits)
  const profile = useData((s) => s.profile)
  return useMemo(() => {
    /** Every record shown in History: hits (including backfill) and resisted cravings. */
    const visible = visibleHits(hits, profile)
    /** Hits only (including backfill): charts and daily counts. */
    const hitList = onlyHits(visible)
    /** Hits the user logged: streaks, totals, avoided. */
    const real = realHits(hitList)
    const wins = onlyWins(visible)
    return { profile, visible, hits: hitList, real, wins, stats: dailyStats(hitList), lastHit: lastHitTime(real) }
  }, [hits, profile])
}
