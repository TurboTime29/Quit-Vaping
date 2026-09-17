import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from '../components/Dialogs'
import { Settings as SettingsIcon } from '../components/Icons'
import {
  TIMEFRAMES, compareWithYesterday, dateKey, formatClock, formatHour, formatStreak, lastNDays, longestStreak,
  parseDateKey, reasonStats, totalAvoided, type ReasonTimeframe,
} from '../lib/analytics'
import { useHitData, useNow } from '../lib/hooks'
import { useData } from '../store/data'
import { REASONS, REASON_COLORS, type DailyStats, type HitReason } from '../types'

/** Red when fewer avoided than taken, green when more. */
const avoidedColor = (avoided: number, taken: number) => (avoided < taken ? 'text-accent' : avoided === taken ? 'text-fg' : 'text-good')

function Timer({ since }: { since: number }) {
  const now = useNow(1000)
  const parts = formatClock(now - since)
  const units = ['DD', 'HH', 'MM', 'SS']
  return (
    <div className="mb-10 flex items-start justify-center" role="timer" aria-label="Time since last hit">
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
  )
}

function ReasonPicker({ onPick, onCancel }: { onPick: (r: HitReason) => void; onCancel: () => void }) {
  return (
    <div className="fade-in mb-8">
      <p className="mb-4 text-center text-sm font-semibold tracking-wide text-muted">Why did you vape?</p>
      <div className="grid gap-3">
        {REASONS.map((r) => (
          <button key={r} className="press rounded-2xl border-2 border-line bg-card p-4 font-semibold" onClick={() => onPick(r)}>{r}</button>
        ))}
        <button className="press p-2 text-[15px] font-semibold text-muted" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

type YesterdayMode = 'sameTime' | 'total' | 'avoidedToday'
const MODE_LABEL: Record<YesterdayMode, string> = { sameTime: 'SAME TIME YESTERDAY', total: 'TOTAL HITS YESTERDAY', avoidedToday: 'HITS AVOIDED TODAY' }
const NEXT_MODE: Record<YesterdayMode, YesterdayMode> = { sameTime: 'total', total: 'avoidedToday', avoidedToday: 'sameTime' }

function StatsRow() {
  const now = useNow(60_000)
  const { visible, stats, profile } = useHitData()
  const [mode, setMode] = useState<YesterdayMode>('sameTime')
  const cmp = useMemo(() => compareWithYesterday(visible, stats, profile, now), [visible, stats, profile, now])
  const today = stats.get(dateKey(now))?.count ?? 0
  const value = mode === 'sameTime' ? cmp.sameTimeYesterday : mode === 'total' ? cmp.totalYesterday : cmp.avoidedToday

  return (
    <div className="mb-6 flex gap-4">
      <button className="press flex-1 rounded-[20px] bg-card p-5 text-left" onClick={() => setMode(NEXT_MODE[mode])} aria-label={`${MODE_LABEL[mode]}: ${value}. Tap to switch.`}>
        <div className="mb-3 text-[10px] font-semibold tracking-wide text-muted">{MODE_LABEL[mode]}</div>
        <div className={`tabular mb-1 text-[42px] leading-none font-bold ${mode === 'avoidedToday' ? avoidedColor(cmp.avoidedToday, today) : ''}`}>{value}</div>
        <div className="flex items-center justify-between text-sm text-muted">
          HITS
          <span className="flex gap-1">{(Object.keys(MODE_LABEL) as YesterdayMode[]).map((m) => <span key={m} className={`size-1.5 rounded-full bg-muted ${m === mode ? '' : 'opacity-30'}`} />)}</span>
        </div>
      </button>
      <Link to="/history" className="press flex-1 rounded-[20px] bg-card p-5">
        <div className="mb-3 text-[10px] font-semibold tracking-wide text-muted">TODAY</div>
        <div className="tabular mb-1 text-[42px] leading-none font-bold">{today}</div>
        <div className="text-sm text-muted">HITS</div>
      </Link>
    </div>
  )
}

const CardTitle = ({ children }: { children: string }) => <h2 className="text-xs font-semibold tracking-widest text-muted">{children}</h2>

function ReasonsCard() {
  const now = useNow(60_000)
  const { visible } = useHitData()
  const [timeframe, setTimeframe] = useState<ReasonTimeframe>('All Time')
  const rows = useMemo(() => reasonStats(visible, timeframe, now).filter((r) => r.count > 0), [visible, timeframe, now])
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <CardTitle>REASONS</CardTitle>
        <button className="press -my-2 -mr-2 rounded-lg px-2 py-2 text-xs" onClick={() => setTimeframe(TIMEFRAMES[(TIMEFRAMES.indexOf(timeframe) + 1) % TIMEFRAMES.length])}>
          {timeframe} ▾
        </button>
      </div>
      <div className="grid gap-3">
        {rows.length === 0 && <p className="text-sm text-muted">No hits with a reason {timeframe === 'All Time' ? 'yet' : `for ${timeframe.toLowerCase()}`}.</p>}
        {rows.map((r) => (
          <div key={r.reason} className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">{r.reason}</span>
              <span className="flex items-baseline gap-1"><span className="text-[15px] font-bold">{r.percentage.toFixed(0)}%</span><span className="text-[11px] text-muted">({r.count})</span></span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${r.percentage}%`, backgroundColor: REASON_COLORS[r.reason] }} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function HourlyChart({ day, onBack }: { day: DailyStats; onBack: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const nowHour = new Date().getHours()
  const isToday = day.date === dateKey(new Date())
  const max = Math.max(...day.hourly, 1)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // Today: centre the current hour. Other days: start at the first hour with hits.
    const focus = isToday ? nowHour : Math.max(0, day.hourly.findIndex((c) => c > 0))
    el.scrollTo({ left: focus * 36 - el.clientWidth / 2 + 14, behavior: 'smooth' })
  }, [day.date])

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <button className="press -ml-1 rounded-lg px-1 py-1 font-semibold" onClick={onBack}>← Back</button>
        <span className="font-semibold">{parseDateKey(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      <div ref={scroller} className="hide-scrollbar overflow-x-auto" style={{ overscrollBehaviorX: 'contain' }}>
        <div className="flex">
          {day.hourly.map((count, hour) => {
            const current = isToday && hour === nowHour
            return (
              <div key={hour} className="mr-2 flex w-7 shrink-0 flex-col items-center">
                <div className="mb-1 flex h-[100px] w-full items-end">
                  <div className={`min-h-0.5 w-full rounded ${current ? 'bg-accent' : 'bg-muted'}`} style={{ height: `${(count / max) * 100}%` }} />
                </div>
                <span className={`text-[10px] ${current ? 'font-bold' : ''}`}>{count}</span>
                <span className={`text-[9px] ${current ? 'font-bold text-fg' : 'text-muted'}`}>{formatHour(hour)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function WeekCard() {
  const now = useNow(60_000)
  const { stats } = useHitData()
  const [selected, setSelected] = useState<string | null>(null)
  const days = useMemo(() => lastNDays(stats, now), [stats, now])
  const max = Math.max(...days.map((d) => d.count), 1)
  const todayKey = dateKey(now)

  return (
    <>
      <div className="mb-5"><CardTitle>{selected ? 'HOURLY BREAKDOWN' : 'LAST 7 DAYS'}</CardTitle></div>
      {selected ? (
        <HourlyChart day={stats.get(selected) ?? { date: selected, count: 0, hourly: new Array(24).fill(0) }} onBack={() => setSelected(null)} />
      ) : (
        <div className="flex justify-between gap-2">
          {days.map((d) => {
            const isToday = d.date === todayKey
            return (
              <button key={d.date} className="press flex flex-1 flex-col items-center" onClick={() => setSelected(d.date)} aria-label={`${d.date}: ${d.count} hits. Show hourly breakdown.`}>
                <div className="mb-2 flex h-[120px] w-full items-end">
                  <div className={`min-h-1 w-full rounded-lg ${isToday ? 'bg-accent' : 'bg-muted'}`} style={{ height: `${(d.count / max) * 100}%` }} />
                </div>
                <span className="tabular mb-1 text-sm font-semibold">{d.count}</span>
                <span className={`text-xs ${isToday ? 'font-bold' : 'text-muted'}`}>{isToday ? 'Today' : parseDateKey(d.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function TotalsCard() {
  const now = useNow(1000)
  const { profile, real, lastHit } = useHitData()
  const since = lastHit ?? profile?.journeyStart ?? now
  // Longest completed gap only changes with the data; the running streak is added every second.
  const completed = useMemo(() => longestStreak(profile, real, since), [profile, real, since])
  const avoided = totalAvoided(profile, real, now)
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="mb-5 flex gap-4">
        <Link to="/history" className="press flex flex-1 flex-col items-center">
          <span className="mb-3 text-[10px] font-semibold tracking-wide text-muted">TOTAL HITS TAKEN</span>
          <span className="tabular text-[42px] leading-none font-bold">{real.length}</span>
        </Link>
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-3 text-[10px] font-semibold tracking-wide text-muted">TOTAL HITS AVOIDED</span>
          <span className={`tabular text-[42px] leading-none font-bold ${avoidedColor(avoided, real.length)}`}>{avoided}</span>
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold tracking-wide text-muted">LONGEST STREAK</span>
        <span className="tabular mt-2 text-[44px] leading-tight font-bold">{formatStreak(Math.max(completed, now - since))}</span>
      </div>
    </div>
  )
}

const SLIDES = [ReasonsCard, WeekCard, TotalsCard]

function Carousel() {
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
        {SLIDES.map((Slide, i) => (
          <section key={i} className="min-h-[265px] w-full shrink-0 snap-center snap-always overflow-hidden rounded-[20px] bg-card p-5" aria-roledescription="slide">
            <Slide />
          </section>
        ))}
      </div>
      <div className="mt-2 mb-6 flex justify-center">
        {SLIDES.map((_, i) => (
          <button key={i} className="p-2" onClick={() => go(i)} aria-label={`Show card ${i + 1}`}>
            <span className={`block size-2 rounded-full ${index === i ? 'bg-fg' : 'bg-muted opacity-30'}`} />
          </button>
        ))}
      </div>
    </>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const recordHit = useData((s) => s.recordHit)
  const { profile, lastHit } = useHitData()
  const [picking, setPicking] = useState(false)

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
      <header className="flex items-start justify-between px-6 pt-4 pb-2">
        <div>
          <h1 className="text-[28px] leading-tight font-bold">Quit.</h1>
          <p className="mt-0.5 text-[13px] text-muted">Do The Thing</p>
        </div>
        <button className="press -mr-2 rounded-full p-2 text-muted" onClick={() => navigate('/settings')} aria-label="Settings">
          <SettingsIcon size={24} />
        </button>
      </header>

      <main className="px-6 pt-8 pb-4">
        <p className="mb-6 text-center text-sm font-semibold tracking-wider text-muted">TIME SINCE LAST HIT</p>
        <Timer since={lastHit ?? profile!.journeyStart} />

        {picking ? (
          <ReasonPicker
            onPick={(r) => { recordHit(r); setPicking(false); toast('Logged. Timer reset — you’ve got this.') }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <button className="press mb-8 w-full rounded-3xl bg-accent p-6 text-xl font-bold text-white" onClick={() => setPicking(true)}>I Vaped</button>
        )}

        <StatsRow />
        <Carousel />
      </main>
    </div>
  )
}
