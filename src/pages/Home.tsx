import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import HitSheet, { useReasons } from '../components/HitSheet'
import ReasonPicker, { type PickMode } from '../components/ReasonPicker'
import { CardTitle, Carousel, HomeHeader, Timer } from '../components/HomeParts'
import {
  TIMEFRAMES, compareWithYesterday, costPerPuff, countBetween, dailyLimit, dateKey, formatDuration, formatHour, formatMoney,
  formatStreak, lastNDays, longestStreak, parseDateKey, reasonStats, startOfDay, totalAvoided, type ReasonTimeframe,
} from '../lib/analytics'
import { healthProgress } from '../lib/health'
import { useHitData, useNow } from '../lib/hooks'
import { useData } from '../store/data'
import { approachOf, reasonColor, type DailyStats } from '../types'
import ColdTurkeyHome, { PreQuitHome } from './ColdTurkeyHome'

/** Red when fewer avoided than taken, green when more. */
const avoidedColor = (avoided: number, taken: number) => (avoided < taken ? 'text-accent' : avoided === taken ? 'text-fg' : 'text-good')

function LimitBar() {
  const now = useNow(60_000)
  const { profile, real } = useHitData()
  const limit = dailyLimit(profile?.settings.taper ?? null, now)
  if (limit === null) return null
  const today = countBetween(real, startOfDay(now))
  const over = today > limit
  const pct = limit === 0 ? (today ? 100 : 0) : Math.min(100, (today / limit) * 100)
  return (
    <Link to="/insights" className="press mb-4 block rounded-[20px] bg-card px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold tracking-wide text-muted">TODAY’S LIMIT</span>
        <span className="tabular text-sm"><b className={over ? 'text-accent' : ''}>{today}</b><span className="text-muted"> / {limit}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${over ? 'bg-accent' : pct >= 80 ? 'bg-[#FFA07A]' : 'bg-good'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">{over ? `${today - limit} over today’s limit. Tomorrow is a fresh start.` : `${limit - today} left today`}</p>
    </Link>
  )
}

type YesterdayMode = 'sameTime' | 'total' | 'avoidedToday'
const MODE_LABEL: Record<YesterdayMode, string> = { sameTime: 'SAME TIME YESTERDAY', total: 'TOTAL HITS YESTERDAY', avoidedToday: 'HITS AVOIDED TODAY' }
const NEXT_MODE: Record<YesterdayMode, YesterdayMode> = { sameTime: 'total', total: 'avoidedToday', avoidedToday: 'sameTime' }

function StatsRow() {
  const now = useNow(60_000)
  const { hits, stats, profile, wins, baseline } = useHitData()
  const [mode, setMode] = useState<YesterdayMode>('sameTime')
  const cmp = useMemo(() => compareWithYesterday(hits, stats, profile, now, baseline.perDay), [hits, stats, profile, now, baseline.perDay])
  const today = stats.get(dateKey(now))?.count ?? 0
  const winsToday = countBetween(wins, startOfDay(now))
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
        <div className="flex items-center justify-between text-sm text-muted">
          HITS
          {winsToday > 0 && <span className="font-semibold text-good">{winsToday} resisted</span>}
        </div>
      </Link>
    </div>
  )
}

function ReasonsCard() {
  const now = useNow(60_000)
  const { hits } = useHitData()
  const order = useReasons()
  const [timeframe, setTimeframe] = useState<ReasonTimeframe>('All Time')
  const rows = useMemo(() => reasonStats(hits, timeframe, now, order).slice(0, 5), [hits, timeframe, now, order])
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
              <div className="h-full rounded-full" style={{ width: `${r.percentage}%`, backgroundColor: reasonColor(r.reason) }} />
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
      <div className="mb-5 flex items-center justify-between">
        <CardTitle>{selected ? 'HOURLY BREAKDOWN' : 'LAST 7 DAYS'}</CardTitle>
        {!selected && <Link to="/insights" className="press -my-2 -mr-2 rounded-lg px-2 py-2 text-xs">More →</Link>}
      </div>
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
  const { profile, real, lastHit, baseline } = useHitData()
  const since = lastHit ?? profile?.journeyStart ?? now
  // Longest completed gap only changes with the data; the running streak is added every second.
  const completed = useMemo(() => longestStreak(profile, real, since), [profile, real, since])
  const avoided = totalAvoided(profile, real, now, baseline.perDay)
  const perPuff = costPerPuff(profile?.settings.cost ?? null)
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
        <span className="tabular mt-2 text-[40px] leading-tight font-bold">{formatStreak(Math.max(completed, now - since))}</span>
      </div>
      {perPuff !== null ? (
        <Link to="/insights#savings" className="press mt-3 flex items-baseline justify-center gap-2">
          <span className="text-[10px] font-semibold tracking-wide text-muted">MONEY SAVED</span>
          <span className="tabular text-xl font-bold text-good">{formatMoney(avoided * perPuff)}</span>
          <span className="text-xs text-muted">→</span>
        </Link>
      ) : (
        <Link to="/insights#savings" className="press mt-3 text-center text-xs text-muted">Add what a pod costs to see money saved →</Link>
      )}
    </div>
  )
}

function HealthCard() {
  const now = useNow(60_000)
  const { profile, lastHit } = useHitData()
  const streak = now - (lastHit ?? profile?.journeyStart ?? now)
  const { next, last, progress } = healthProgress(streak)
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center justify-between">
        <CardTitle>HEALTH</CardTitle>
        <Link to="/insights#health" className="press -my-2 -mr-2 rounded-lg px-2 py-2 text-xs">Timeline →</Link>
      </div>
      {next ? (
        <>
          <p className="text-xs font-semibold tracking-wide text-muted">NEXT: {next.label.toUpperCase()} · IN {formatDuration(next.after - streak).toUpperCase()}</p>
          <p className="mt-2 text-[15px] leading-snug font-semibold">{next.detail}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-good" style={{ width: `${progress * 100}%` }} /></div>
        </>
      ) : (
        <p className="text-[15px] font-semibold">Every milestone reached. Incredible.</p>
      )}
      <div className="flex-1" />
      {last && <p className="mt-4 text-sm leading-snug text-muted"><span className="text-good">✓ {last.label}:</span> {last.detail}</p>}
    </div>
  )
}

const SLIDES = [ReasonsCard, WeekCard, TotalsCard, HealthCard]


export function GradualHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, lastHit } = useHitData()
  const [picking, setPicking] = useState<PickMode | null>(() => (location.state as { pick?: PickMode } | null)?.pick ?? null)
  const [sheet, setSheet] = useState<PickMode | null>(null)

  // Arriving from the craving tools with a choice already made: clear it so a reload does not reopen the picker.
  useEffect(() => { if (location.state) navigate('.', { replace: true, state: null }) }, [])

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
      <HomeHeader />

      <main className="px-6 pt-8 pb-4">
        {!profile!.settings.approach && (
          <Link to="/settings#plan" className="press -mt-4 mb-6 block rounded-[20px] border-2 border-good/40 p-4">
            <div className="font-bold">New: choose your plan</div>
            <div className="mt-0.5 text-sm text-muted">Quitting cold turkey? Switch to a home screen focused on time vape-free, health milestones and money saved. →</div>
          </Link>
        )}
        <Timer label="TIME SINCE LAST HIT" since={lastHit ?? profile!.journeyStart} />

        {picking ? (
          <ReasonPicker mode={picking} onDone={() => setPicking(null)} onEarlier={() => { setPicking(null); setSheet('resisted') }} />
        ) : (
          <div className="mb-8">
            <button className="press mb-3 w-full rounded-3xl bg-accent p-6 text-xl font-bold text-white" onClick={() => setPicking('hit')}>I Vaped</button>
            <div className="flex gap-3">
              <button className="press flex-1 rounded-2xl border-2 border-line p-3.5 text-[15px] font-semibold" onClick={() => navigate('/craving')}>🌊 Ride it out</button>
              <button className="press flex-1 rounded-2xl border-2 border-good/40 p-3.5 text-[15px] font-semibold text-good" onClick={() => setPicking('resisted')}>💪 I resisted</button>
            </div>
            <button className="press mt-2 w-full p-2 text-sm font-semibold text-muted" onClick={() => setSheet('hit')}>Forgot to log one? Add an earlier hit</button>
          </div>
        )}

        <LimitBar />
        <StatsRow />
        <Carousel slides={SLIDES} />
      </main>
      {sheet && <HitSheet initialKind={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** Cold turkey gets a progress-first home (with a countdown before a future quit date); gradual keeps the logging home. */
export default function Home() {
  const profile = useData((s) => s.profile)
  const [, recheck] = useState(0)
  const quitAt = profile?.journeyStart ?? 0
  const upcoming = quitAt > Date.now()
  // Switch from the countdown to the vape-free home the moment the quit time arrives (timers cap at ~24.8 days).
  useEffect(() => {
    if (!upcoming) return
    const timer = setTimeout(() => recheck((n) => n + 1), Math.min(quitAt - Date.now() + 50, 2_000_000_000))
    return () => clearTimeout(timer)
  }, [quitAt, upcoming])
  if (approachOf(profile) === 'cold-turkey') return upcoming ? <PreQuitHome /> : <ColdTurkeyHome />
  return <GradualHome />
}
