import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from '../components/Dialogs'
import HitSheet, { useReasons } from '../components/HitSheet'
import { BarChart, Settings as SettingsIcon } from '../components/Icons'
import {
  TIMEFRAMES, compareWithYesterday, costPerPuff, countBetween, dailyLimit, dateKey, formatClock, formatDuration, formatHour, formatMoney,
  formatStreak, lastNDays, longestStreak, parseDateKey, reasonStats, startOfDay, totalAvoided, type ReasonTimeframe,
} from '../lib/analytics'
import { healthProgress } from '../lib/health'
import { useHitData, useNow } from '../lib/hooks'
import { useData } from '../store/data'
import { reasonColor, type DailyStats } from '../types'

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

type PickMode = 'hit' | 'resisted'

function ReasonPicker({ mode, onDone, onEarlier }: { mode: PickMode; onDone: () => void; onEarlier: () => void }) {
  const recordHit = useData((s) => s.recordHit)
  const deleteHit = useData((s) => s.deleteHit)
  const reasons = useReasons()
  const [note, setNote] = useState<string | null>(null)
  const navigate = useNavigate()

  const log = (reason?: string) => {
    const id = recordHit({ reason, note: note ?? undefined, kind: mode === 'resisted' ? 'resisted' : undefined })
    onDone()
    toast(mode === 'resisted' ? 'Win logged. Nice work 💪' : 'Logged. Timer reset, you’ve got this.', { action: { label: 'Undo', run: () => deleteHit(id) } })
  }

  return (
    <div className="fade-in mb-8">
      <p className="mb-4 text-center text-sm font-semibold tracking-wide text-muted">{mode === 'hit' ? 'Why did you vape?' : 'What triggered the craving?'}</p>
      <div className={`grid gap-3 ${reasons.length > 5 ? 'grid-cols-2' : ''}`}>
        {reasons.map((r) => (
          <button key={r} className="press rounded-2xl border-2 border-line bg-card p-4 font-semibold" onClick={() => log(r)}>{r}</button>
        ))}
      </div>
      {mode === 'resisted' && <button className="press mt-3 w-full rounded-2xl border-2 border-line p-4 font-semibold text-muted" onClick={() => log()}>Skip, just log the win</button>}
      {note === null ? (
        <button className="press mt-3 w-full p-2 text-[15px] font-semibold text-muted" onClick={() => setNote('')}>+ Add a note</button>
      ) : (
        <textarea autoFocus rows={2} maxLength={500} className="mt-3 w-full resize-none rounded-2xl border-2 border-line bg-bg p-4" placeholder="Note (optional), then pick a reason above" value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      <div className="mt-1 flex justify-between text-[15px] font-semibold text-muted">
        <button className="press p-2" onClick={onDone}>Cancel</button>
        {mode === 'hit'
          ? <button className="press p-2" onClick={() => navigate('/craving')}>Not yet: ride it out</button>
          : <button className="press p-2" onClick={onEarlier}>Log for an earlier time</button>}
      </div>
    </div>
  )
}

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

const CardTitle = ({ children }: { children: string }) => <h2 className="text-xs font-semibold tracking-widest text-muted">{children}</h2>

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
  const location = useLocation()
  const { profile, lastHit } = useHitData()
  const [picking, setPicking] = useState<PickMode | null>(() => (location.state as { pick?: PickMode } | null)?.pick ?? null)
  const [sheet, setSheet] = useState<PickMode | null>(null)

  // Arriving from the craving tools with a choice already made: clear it so a reload does not reopen the picker.
  useEffect(() => { if (location.state) navigate('.', { replace: true, state: null }) }, [])

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
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

      <main className="px-6 pt-8 pb-4">
        <p className="mb-6 text-center text-sm font-semibold tracking-wider text-muted">TIME SINCE LAST HIT</p>
        <Timer since={lastHit ?? profile!.journeyStart} />

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
        <Carousel />
      </main>
      {sheet && <HitSheet initialKind={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}
