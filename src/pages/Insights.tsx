import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import CostForm from '../components/CostForm'
import { useReasons } from '../components/HitSheet'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/Sheet'
import {
  costPerPuff, dailyLimit, formatDuration, formatHour, formatMoney, heatmap, hourProfile, lastNDays, nextLimitDrop, parseDateKey,
  reasonBreakdown, savings, startOfDay, topHours, weekSummary, weekdayAverages,
} from '../lib/analytics'
import { HEALTH_MILESTONES, healthProgress } from '../lib/health'
import { useHitData, useNow } from '../lib/hooks'
import { reasonColor } from '../types'

function Card({ title, id, action, children }: { title: string; id?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mb-4 scroll-mt-4 rounded-[20px] bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-widest text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) => (
  <div>
    <div className="text-[10px] font-semibold tracking-wide text-muted">{label}</div>
    <div className={`tabular mt-1 text-3xl font-bold ${tone ?? ''}`}>{value}</div>
    {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
  </div>
)

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="-my-2 flex rounded-lg bg-bg p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button key={String(v)} className={`press rounded-md px-2.5 py-1 font-semibold ${v === value ? 'bg-chip text-fg' : 'text-muted'}`} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

function WeekCard() {
  const now = useNow(60_000)
  const { hits, real, wins, profile, baseline } = useHitData()
  const w = useMemo(() => weekSummary(hits, real, wins, profile, now, baseline.perDay), [hits, real, wins, profile, now, baseline.perDay])
  const perPuff = costPerPuff(profile?.settings.cost ?? null)
  const change = w.changePct
  return (
    <Card title="LAST 7 DAYS VS THE 7 BEFORE">
      <div className="grid grid-cols-2 gap-5">
        <Stat
          label="HITS"
          value={w.thisWeek}
          sub={change === null ? `${w.lastWeek} the week before` : <span className={change <= 0 ? 'text-good' : 'text-accent'}>{change <= 0 ? '▼' : '▲'} {Math.abs(change).toFixed(0)}% vs {w.lastWeek}</span>}
        />
        <Stat label="PER DAY" value={(w.thisWeek / 7).toFixed(1)} sub={`was ${(w.lastWeek / 7).toFixed(1)}`} />
        <Stat label="CRAVINGS RESISTED" value={w.winsThisWeek} tone={w.winsThisWeek ? 'text-good' : ''} />
        {perPuff !== null
          ? <Stat label="SAVED THIS WEEK" value={formatMoney(w.avoidedThisWeek * perPuff)} tone="text-good" sub={`${w.avoidedThisWeek} hits avoided`} />
          : <Stat label="HITS AVOIDED" value={w.avoidedThisWeek} sub={<a href="#/insights#savings" className="underline">add cost for $ saved</a>} />}
      </div>
    </Card>
  )
}

/** Cumulative savings since the journey start as a filled line. */
function SavingsChart({ daily }: { daily: { date: string; saved: number }[] }) {
  const max = Math.max(...daily.map((d) => d.saved), 0.01)
  const points = [{ x: 0, y: 0 }, ...daily.map((d, i) => ({ x: (i + 1) / daily.length, y: d.saved / max }))]
  const line = points.map((p) => `${(p.x * 300).toFixed(1)},${(100 - p.y * 96).toFixed(1)}`).join(' L')
  return (
    <>
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Savings over time">
        <path d={`M${line} L300,100 L0,100 Z`} fill="rgba(76,175,80,0.18)" />
        <path d={`M${line}`} fill="none" stroke="#4CAF50" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>Quit {parseDateKey(daily[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>Today</span>
      </div>
    </>
  )
}

function SavingsCard() {
  const now = useNow(60_000)
  const { profile, real, baseline } = useHitData()
  const cost = profile?.settings.cost ?? null
  const [editing, setEditing] = useState(false)
  const s = useMemo(() => (profile && cost ? savings(profile, real, cost, baseline.perDay, now) : null), [profile, cost, real, baseline.perDay, now])

  const basis = baseline.source === 'history'
    ? <>Measured against your pre-quit average of <b className="text-fg">{baseline.perDay.toFixed(baseline.perDay < 10 ? 1 : 0)} hits a day</b> from {baseline.days} {baseline.days === 1 ? 'day' : 'days'} of history before you quit.</>
    : <>Measured against your Average Puffs setting of <b className="text-fg">{profile?.averagePuffsPerDay} a day</b>. Backfill or log hits from before you quit to measure it from real history.</>

  return (
    <Card title="SAVINGS" id="savings" action={cost && <button className="press -my-2 -mr-2 rounded-lg px-2 py-2 text-xs" onClick={() => setEditing(true)}>Edit cost</button>}>
      {!s ? (
        <>
          <p className="mb-4 text-sm leading-relaxed text-muted">See how much money quitting is saving you. Add what a pod or disposable costs and how many puffs it lasts.</p>
          <button className="press w-full rounded-xl bg-good p-3.5 font-semibold text-white" onClick={() => setEditing(true)}>Add cost</button>
        </>
      ) : (
        <>
          <div className="tabular text-5xl font-bold text-good">{formatMoney(s.total)}</div>
          <p className="mt-1 mb-5 text-sm text-muted">saved since {new Date(profile!.journeyStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          <div className="mb-5 grid grid-cols-2 gap-5">
            <Stat label="WOULD HAVE SPENT" value={formatMoney(s.wouldHaveSpent)} />
            <Stat label="ACTUALLY SPENT" value={formatMoney(s.spent)} sub={`${real.length} ${real.length === 1 ? 'hit' : 'hits'} since quitting`} />
            <Stat label="PODS NOT BOUGHT" value={s.pods.toFixed(s.pods < 10 ? 1 : 0)} />
            <Stat label="LATELY" value={formatMoney(s.perDayRecent)} sub="saved per day" tone="text-good" />
          </div>
          <SavingsChart daily={s.daily} />
          <p className="mt-4 rounded-xl bg-bg p-3 text-sm leading-relaxed">
            At this pace: <b className="text-good">{formatMoney(s.perDayRecent * 30)}</b> a month, <b className="text-good">{formatMoney(s.perDayRecent * 365)}</b> a year.
          </p>
        </>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">{basis} Resisted cravings are wins, not hits, so they never reduce your savings.</p>
      {editing && <Sheet title="Cost" onClose={() => setEditing(false)}><CostForm onDone={() => setEditing(false)} /></Sheet>}
    </Card>
  )
}

function LimitCard() {
  const now = useNow(60_000)
  const { profile, stats } = useHitData()
  const taper = profile?.settings.taper ?? null
  if (!taper) {
    return (
      <Card title="DAILY LIMIT GOAL">
        <p className="text-sm leading-relaxed text-muted">Cutting down gradually? Set a daily limit that drops every week. <Link to="/settings#goal" className="font-semibold text-accent">Set a goal →</Link></p>
      </Card>
    )
  }
  const days = lastNDays(stats, now, 14)
  const limit = dailyLimit(taper, now)!
  const nextDrop = nextLimitDrop(taper, now)
  const underDays = days.filter((d) => parseDateKey(d.date).getTime() >= startOfDay(taper.startedAt) && d.count <= (dailyLimit(taper, parseDateKey(d.date).getTime()) ?? 0)).length
  const trackedDays = days.filter((d) => parseDateKey(d.date).getTime() >= startOfDay(taper.startedAt)).length
  return (
    <Card title="DAILY LIMIT GOAL">
      <div className="mb-4 grid grid-cols-2 gap-5">
        <Stat label="TODAY’S LIMIT" value={limit} sub={nextDrop ? `drops to ${dailyLimit(taper, nextDrop)} on ${new Date(nextDrop).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'goal reached: zero'} />
        <Stat label="DAYS UNDER LIMIT" value={`${underDays}/${trackedDays}`} sub="last 14 days" />
      </div>
      <BarChart days={days.map((d) => { const t = parseDateKey(d.date).getTime(); return { date: d.date, count: d.count, limit: t >= startOfDay(taper.startedAt) ? dailyLimit(taper, t) : undefined } })} height={90} />
    </Card>
  )
}

/** Simple bar chart; bars over the day's limit are red, and the limit is drawn as a tick. */
function BarChart({ days, height }: { days: { date: string; count: number; limit?: number | null }[]; height: number }) {
  const [picked, setPicked] = useState<number | null>(null)
  const max = Math.max(...days.map((d) => Math.max(d.count, d.limit ?? 0)), 1)
  const p = picked !== null ? days[picked] : null
  return (
    <>
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setPicked(null)}>
        {days.map((d, i) => {
          const over = d.limit !== undefined && d.limit !== null && d.count > d.limit
          return (
            <button key={d.date} className="relative flex h-full min-w-0 flex-1 items-end" onClick={() => setPicked(i === picked ? null : i)} onMouseEnter={() => setPicked(i)} aria-label={`${d.date}: ${d.count} hits`}>
              <div className={`w-full rounded-t-sm ${over ? 'bg-accent' : i === picked ? 'bg-fg' : 'bg-muted'}`} style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 1 }} />
              {d.limit !== undefined && d.limit !== null && <div className="absolute inset-x-0 h-0.5 bg-good" style={{ bottom: `${(d.limit / max) * 100}%` }} />}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        {p ? (
          <span className="text-fg">{parseDateKey(p.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: <b>{p.count}</b> {p.count === 1 ? 'hit' : 'hits'}{p.limit != null ? ` (limit ${p.limit})` : ''}</span>
        ) : (
          <>
            <span>{parseDateKey(days[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>Today</span>
          </>
        )}
      </div>
    </>
  )
}

function TrendCard() {
  const now = useNow(60_000)
  const { stats, profile } = useHitData()
  const [range, setRange] = useState<30 | 90>(30)
  const taper = profile?.settings.taper ?? null
  const days = useMemo(
    () => lastNDays(stats, now, range).map((d) => {
      const t = parseDateKey(d.date).getTime()
      return { date: d.date, count: d.count, limit: taper && t >= startOfDay(taper.startedAt) ? dailyLimit(taper, t) : undefined }
    }),
    [stats, now, range, taper],
  )
  const total = days.reduce((s, d) => s + d.count, 0)
  return (
    <Card title="TREND" action={<Segmented<30 | 90> value={range} options={[[30, '30 days'], [90, '90 days']]} onChange={setRange} />}>
      <p className="mb-3 text-sm text-muted"><b className="text-fg">{total}</b> hits · <b className="text-fg">{(total / range).toFixed(1)}</b> a day on average</p>
      <BarChart days={days} height={120} />
    </Card>
  )
}

function HeatmapCard() {
  const now = useNow(60_000)
  const { stats } = useHitData()
  const columns = useMemo(() => heatmap(stats, now), [stats, now])
  const max = Math.max(...columns.flat().map((c) => c.count), 1)
  const [picked, setPicked] = useState<string | null>(null)
  const pickedCell = columns.flat().find((c) => c.date === picked)
  const shade = (count: number) => (count === 0 ? 0.08 : 0.25 + 0.75 * (count / max))

  return (
    <Card title="CALENDAR">
      <div className="flex gap-[3px]">
        <div className="mr-1 grid grid-rows-7 gap-[3px] text-[9px] leading-none text-muted">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="flex items-center">{i % 2 ? d : ''}</span>)}
        </div>
        {columns.map((col) => (
          <div key={col[0].date} className="grid flex-1 grid-rows-7 gap-[3px]">
            {col.map((c) => (
              <button
                key={c.date}
                disabled={c.future}
                className={`aspect-square w-full rounded-[3px] ${picked === c.date ? 'ring-2 ring-fg' : ''}`}
                style={{ backgroundColor: c.future ? 'transparent' : c.count ? `rgba(255,107,107,${shade(c.count)})` : 'var(--border)' }}
                onClick={() => setPicked(picked === c.date ? null : c.date)}
                aria-label={`${c.date}: ${c.count} hits`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span className={pickedCell ? 'text-fg' : ''}>
          {pickedCell ? `${parseDateKey(pickedCell.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${pickedCell.count} ${pickedCell.count === 1 ? 'hit' : 'hits'}` : 'Tap a day'}
        </span>
        <span className="flex items-center gap-1">Fewer {[0, 0.3, 0.6, 1].map((f) => <span key={f} className="size-2.5 rounded-[2px]" style={{ backgroundColor: f ? `rgba(255,107,107,${0.25 + 0.75 * f})` : 'var(--border)' }} />)} More</span>
      </div>
    </Card>
  )
}

function PatternsCard() {
  const now = useNow(60_000)
  const { real, profile } = useHitData()
  const order = useReasons()
  const hours = useMemo(() => hourProfile(real, now), [real, now])
  const peaks = topHours(hours)
  const weekdays = useMemo(() => weekdayAverages(real, now, profile?.journeyStart ?? now), [real, now, profile])
  const maxHour = Math.max(...hours, 1)
  const maxDay = Math.max(...weekdays, 0.01)
  const thisWeek = reasonBreakdown(real, startOfDay(now, -6), Infinity, order)
  const lastWeek = reasonBreakdown(real, startOfDay(now, -13), startOfDay(now, -6), order)
  const top = reasonBreakdown(real, startOfDay(now, -27), Infinity, order).sort((a, b) => b.count - a.count)[0]
  const reasonNames = [...new Set([...thisWeek, ...lastWeek].map((r) => r.reason))]

  if (!real.length) return <Card title="PATTERNS"><p className="text-sm text-muted">Patterns show up here once you have logged a few hits.</p></Card>

  return (
    <Card title="PATTERNS · LAST 4 WEEKS">
      <p className="mb-3 text-[15px] leading-snug">
        {peaks.length ? <>Most hits around <b>{peaks.map(formatHour).join(', ')}</b>.</> : null}
        {top && <> Top reason: <b style={{ color: reasonColor(top.reason) }}>{top.reason}</b> ({top.percentage.toFixed(0)}%).</>}
      </p>
      <div className="mb-1 flex h-16 items-end gap-[2px]">
        {hours.map((c, h) => <div key={h} className={`flex-1 rounded-t-sm ${peaks.includes(h) ? 'bg-accent' : 'bg-muted'}`} style={{ height: `${(c / maxHour) * 100}%`, minHeight: 1 }} title={`${formatHour(h)}: ${c}`} />)}
      </div>
      <div className="mb-5 flex justify-between text-[10px] text-muted"><span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span></div>

      <h3 className="mb-2 text-[10px] font-semibold tracking-wide text-muted">AVERAGE BY WEEKDAY</h3>
      <div className="mb-5 grid grid-cols-7 gap-1.5 text-center">
        {weekdays.map((v, i) => (
          <div key={i}>
            <div className="flex h-14 items-end"><div className={`w-full rounded-t ${v === maxDay && v > 0 ? 'bg-accent' : 'bg-muted'}`} style={{ height: `${(v / maxDay) * 100}%`, minHeight: 2 }} /></div>
            <div className="tabular mt-1 text-[11px] font-semibold">{v.toFixed(v < 10 ? 1 : 0)}</div>
            <div className="text-[10px] text-muted">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-[10px] font-semibold tracking-wide text-muted">REASONS: THIS WEEK VS LAST</h3>
      {reasonNames.length === 0 ? <p className="text-sm text-muted">No reasons logged in the last two weeks.</p> : (
        <ul className="grid gap-2">
          {reasonNames.map((name) => {
            const a = thisWeek.find((r) => r.reason === name)?.count ?? 0
            const b = lastWeek.find((r) => r.reason === name)?.count ?? 0
            return (
              <li key={name} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: reasonColor(name) }} />
                <span className="flex-1 font-semibold">{name}</span>
                <span className="tabular w-8 text-right font-bold">{a}</span>
                <span className={`tabular w-14 text-right text-xs ${a < b ? 'text-good' : a > b ? 'text-accent' : 'text-muted'}`}>{a === b ? '=' : a < b ? `▼ ${b - a}` : `▲ ${a - b}`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function HealthTimeline() {
  const now = useNow(60_000)
  const { profile, lastHit } = useHitData()
  const streak = now - (lastHit ?? profile?.journeyStart ?? now)
  const { next, progress } = healthProgress(streak)
  return (
    <Card title="HEALTH TIMELINE" id="health">
      <p className="mb-4 text-sm text-muted">Counting from your last hit: <b className="text-fg">{formatDuration(streak)}</b></p>
      <ol className="relative ml-2 border-l-2 border-line">
        {HEALTH_MILESTONES.map((m) => {
          const reached = streak >= m.after
          const isNext = m === next
          return (
            <li key={m.label} className="relative mb-5 pl-5 last:mb-0">
              <span className={`absolute top-1 -left-[9px] flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${reached ? 'bg-good text-white' : isNext ? 'border-2 border-good bg-card' : 'border-2 border-line bg-card'}`}>{reached ? '✓' : ''}</span>
              <div className={`text-sm font-bold ${reached ? 'text-good' : isNext ? '' : 'text-muted'}`}>{m.label}{isNext && <span className="ml-2 text-xs font-semibold text-muted">in {formatDuration(m.after - streak)}</span>}</div>
              <p className={`mt-0.5 text-sm leading-snug ${reached || isNext ? '' : 'text-muted'}`}>{m.detail}</p>
              {isNext && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-good" style={{ width: `${progress * 100}%` }} /></div>}
            </li>
          )
        })}
      </ol>
      <p className="mt-5 text-xs leading-relaxed text-muted">Typical timings people report after stopping nicotine. Everyone is different, and this isn’t medical advice.</p>
    </Card>
  )
}

export default function Insights() {
  return (
    <div className="safe-top safe-bottom mx-auto min-h-dvh max-w-md">
      <PageHeader title="Insights" />
      <main className="px-6 pb-8">
        <WeekCard />
        <SavingsCard />
        <LimitCard />
        <TrendCard />
        <HeatmapCard />
        <PatternsCard />
        <HealthTimeline />
      </main>
    </div>
  )
}
