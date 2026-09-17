import { useEffect, useMemo, useState } from 'react'
import { useData } from '../store/data'
import { dailyStats, lastHitTime, realHits, visibleHits } from './analytics'

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
    const visible = visibleHits(hits, profile)
    const real = realHits(visible)
    return { profile, visible, real, stats: dailyStats(visible), lastHit: lastHitTime(real) }
  }, [hits, profile])
}
