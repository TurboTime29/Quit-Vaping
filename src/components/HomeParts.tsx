import { useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatClock } from '../lib/analytics'
import { useNow } from '../lib/hooks'
import { BarChart, Settings as SettingsIcon } from './Icons'

// Building blocks shared by the gradual and cold turkey home screens, so both look the same.

export function HomeHeader() {
  const navigate = useNavigate()
  return (
    <header className="flex items-start justify-between px-6 pt-4 pb-2">
      <div>
        <h1 className="text-[28px] leading-tight font-bold">Quit.</h1>
        <p className="mt-0.5 text-[13px] text-muted">Do The Thing</p>
      </div>
      <div className="-mr-2 flex">
        <button className="press rounded-full p-2 text-muted" onClick={() => navigate('/insights')} aria-label="Insights"><BarChart size={24} /></button>
        <button className="press rounded-full p-2 text-muted" onClick={() => navigate('/settings')} aria-label="Settings"><SettingsIcon size={24} /></button>
      </div>
    </header>
  )
}

/** Big DD:HH:MM:SS clock counting up from `since`, or down to `until`. */
export function Timer({ since, until, label }: { since?: number; until?: number; label: string }) {
  const now = useNow(1000)
  const parts = formatClock(until !== undefined ? until - now : now - (since ?? now))
  const units = ['DD', 'HH', 'MM', 'SS']
  return (
    <>
      <p className="mb-6 text-center text-sm font-semibold tracking-wider text-muted">{label}</p>
      <div className="mb-10 flex items-start justify-center" role="timer" aria-label={label}>
        {parts.map((v, i) => (
          <div key={units[i]} className="flex items-start">
            {i > 0 && <span className="tabular text-[44px] leading-[56px] font-bold min-[400px]:text-5xl">:</span>}
            <div className="flex w-[66px] flex-col items-center min-[400px]:w-[70px]">
              <span className="tabular text-[44px] leading-[56px] font-bold min-[400px]:text-5xl">{v}</span>
              <span className="tabular mt-0.5 text-xs text-muted">{units[i]}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export const CardTitle = ({ children }: { children: string }) => <h2 className="text-xs font-semibold tracking-widest text-muted">{children}</h2>

/** Swipeable cards with dots underneath. */
export function Carousel({ slides }: { slides: ComponentType[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const go = (i: number) => {
    const el = ref.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }
  return (
    <>
      <div
        ref={ref}
        className="hide-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-[20px]"
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {slides.map((Slide, i) => (
          <section key={i} className="min-h-[265px] w-full shrink-0 snap-center snap-always overflow-hidden rounded-[20px] bg-card p-5" aria-roledescription="slide">
            <Slide />
          </section>
        ))}
      </div>
      <div className="mt-2 mb-6 flex justify-center">
        {slides.map((_, i) => (
          <button key={i} className="p-2" onClick={() => go(i)} aria-label={`Show card ${i + 1}`}>
            <span className={`block size-2 rounded-full ${index === i ? 'bg-fg' : 'bg-muted opacity-30'}`} />
          </button>
        ))}
      </div>
    </>
  )
}

/** Stat card in the two-up row under the main buttons. */
export function StatCard({ label, value, unit, tone, extra }: { label: string; value: ReactNode; unit: string; tone?: string; extra?: ReactNode }) {
  return (
    <>
      <div className="mb-3 text-[10px] font-semibold tracking-wide text-muted">{label}</div>
      <div className={`tabular mb-1 text-[42px] leading-none font-bold ${tone ?? ''}`}>{value}</div>
      <div className="flex items-center justify-between text-sm text-muted">{unit}{extra}</div>
    </>
  )
}
