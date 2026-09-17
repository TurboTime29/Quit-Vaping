import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { confirmDialog, toast } from '../components/Dialogs'
import HitSheet, { useReasons } from '../components/HitSheet'
import { CardTitle, Carousel, HomeHeader, StatCard, Timer } from '../components/HomeParts'
import ReasonPicker, { type PickMode } from '../components/ReasonPicker'
import {
  countBetween, costPerPuff, formatDuration, formatMoney, longestStreak, reasonBreakdown, savings, startOfDay, totalAvoided,
} from '../lib/analytics'
import { HEALTH_MILESTONES, healthProgress } from '../lib/health'
import { useHitData, useNow } from '../lib/hooks'
import { useData } from '../store/data'

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function NextMilestoneBar({ since }: { since: number }) {
  const now = useNow(1000)
  const streak = now - since
  const { next, progress } = healthProgress(streak)
  return (
    <Link to="/insights#health" className="press mb-4 block rounded-[20px] bg-card px-5 py-4">
      {next ? (
        <>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-semibold tracking-wide text-muted">NEXT MILESTONE · {next.label.toUpperCase()}</span>
            <span className="tabular shrink-0 text-xs text-muted">{formatDuration(next.after - streak)} to go</span>
          </div>
          <div className="font-bold">{next.title}</div>
          <p className="mt-0.5 mb-3 text-sm leading-snug text-muted">{next.detail}</p>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-good" style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="text-[10px] font-semibold tracking-wide text-muted">ALL MILESTONES REACHED</div>
          <div className="mt-1 font-bold">A full year and beyond. You did the thing. 🏆</div>
        </>
      )}
    </Link>
  )
}

function StatsRow() {
  const now = useNow(1000)
  const minute = Math.floor(now / 60_000)
  const { profile, real, baseline } = useHitData()
  const cost = profile!.settings.cost
  const avoided = totalAvoided(profile, real, now, baseline.perDay)
  const money = useMemo(() => (cost && costPerPuff(cost) !== null ? savings(profile!, real, cost, baseline.perDay, minute * 60_000) : null), [profile, real, cost, baseline.perDay, minute])

  return (
    <div className="mb-6 flex gap-4">
      <div className="flex-1 rounded-[20px] bg-card p-5">
        <StatCard label="HITS AVOIDED" value={avoided.toLocaleString()} tone="text-good" unit="HITS" extra={<span className="text-xs">vs {baseline.perDay.toFixed(0)}/day</span>} />
      </div>
      <Link to="/insights#savings" className="press flex-1 rounded-[20px] bg-card p-5">
        {money
          ? <StatCard label="MONEY SAVED" value={formatMoney(money.total)} tone="text-good" unit="SAVED" />
          : <StatCard label="MONEY SAVED" value="$—" unit="ADD COST →" />}
      </Link>
    </div>
  )
}

function MilestonesCard() {
  const now = useNow(60_000)
  const { profile, lastHit } = useHitData()
  const streak = now - (lastHit ?? profile!.journeyStart)
  const { reached, next } = healthProgress(streak)
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <CardTitle>{`MILESTONES · ${reached.length}/${HEALTH_MILESTONES.length}`}</CardTitle>
        <Link to="/insights#health" className="press -my-2 -mr-2 rounded-lg px-2 py-2 text-xs">Timeline →</Link>
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {HEALTH_MILESTONES.map((m) => {
          const done = streak >= m.after
          const isNext = m === next
          return (
            <Link key={m.label} to="/insights#health" className="press flex flex-col items-center text-center">
              <span className={`flex size-10 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-good text-white' : isNext ? 'border-2 border-good text-good' : 'border-2 border-line text-muted'}`}>
                {done ? '✓' : m.short}
              </span>
              <span className={`mt-1 text-[10px] leading-tight ${done ? '' : 'text-muted'}`}>{m.label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function WinsCard() {
  const now = useNow(1000)
  const { profile, real, wins, lastHit } = useHitData()
  const since = lastHit ?? profile!.journeyStart
  const best = useMemo(() => longestStreak(profile, real, since), [profile, real, since])
  const beaten = countBetween(wins, profile!.journeyStart)
  const beatenToday = countBetween(wins, Math.max(profile!.journeyStart, startOfDay(now)))
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="mb-5 flex gap-4">
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-3 text-[10px] font-semibold tracking-wide text-muted">CRAVINGS BEATEN</span>
          <span className={`tabular text-[42px] leading-none font-bold ${beaten ? 'text-good' : ''}`}>{beaten}</span>
          <span className="mt-1 text-xs text-muted">{beatenToday ? `${beatenToday} today` : ' '}</span>
        </div>
        <Link to="/history" className="press flex flex-1 flex-col items-center">
          <span className="mb-3 text-[10px] font-semibold tracking-wide text-muted">SLIPS</span>
          <span className="tabular text-[42px] leading-none font-bold">{real.length}</span>
          <span className="mt-1 text-xs text-muted">since {new Date(profile!.journeyStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </Link>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold tracking-wide text-muted">LONGEST STREAK</span>
        <span className="tabular mt-2 text-[40px] leading-tight font-bold">{formatDuration(Math.max(best, now - since))}</span>
      </div>
    </div>
  )
}

const SLIDES = [MilestonesCard, WinsCard]

/** Cold turkey home: same look as the gradual home, but built around time vape-free and what it has earned. */
export default function ColdTurkeyHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, real, lastHit, baseline } = useHitData()
  const [picking, setPicking] = useState<PickMode | null>(() => (location.state as { pick?: PickMode } | null)?.pick ?? null)
  const [sheet, setSheet] = useState<PickMode | null>(null)
  const since = lastHit ?? profile!.journeyStart

  useEffect(() => { if (location.state) navigate('.', { replace: true, state: null }) }, [])

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
      <HomeHeader />
      <main className="px-6 pt-8 pb-4">
        <Timer label="VAPE-FREE FOR" since={since} />
        <p className="-mt-7 mb-8 text-center text-sm text-muted">
          {real.length === 0 ? `Since you quit on ${shortDate(profile!.journeyStart)}` : `Since your last slip · quit ${shortDate(profile!.journeyStart)}`}
        </p>

        {picking ? (
          <div className="mb-8">
            {picking === 'hit' && <p className="mb-4 text-center text-sm text-muted">A slip isn’t a restart. Everything you’ve gained still counts.</p>}
            <ReasonPicker
              mode={picking}
              onDone={() => setPicking(null)}
              onEarlier={() => { setPicking(null); setSheet('resisted') }}
              hitMessage={`Logged. Your ${totalAvoided(profile, real, Date.now(), baseline.perDay).toLocaleString()} hits avoided still count.`}
            />
          </div>
        ) : (
          <div className="mb-8">
            <button className="press mb-3 w-full rounded-3xl bg-accent p-6 text-xl font-bold text-white" onClick={() => navigate('/craving')}>Craving? Ride it out</button>
            <div className="flex gap-3">
              <button className="press flex-1 rounded-2xl border-2 border-good/40 p-3.5 text-[15px] font-semibold text-good" onClick={() => setPicking('resisted')}>💪 I resisted</button>
              <button className="press flex-1 rounded-2xl border-2 border-line p-3.5 text-[15px] font-semibold" onClick={() => setPicking('hit')}>Log a slip</button>
            </div>
            <button className="press mt-2 w-full p-2 text-sm font-semibold text-muted" onClick={() => setSheet('hit')}>Forgot to log one? Add an earlier record</button>
          </div>
        )}

        <NextMilestoneBar since={since} />
        <StatsRow />
        <Carousel slides={SLIDES} />
      </main>
      {sheet && <HitSheet initialKind={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

const PREP_KEY = 'quit-prep-checklist'

function GetReadyCard() {
  const { hits } = useHitData()
  const order = useReasons()
  const [done, setDone] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(PREP_KEY) ?? '{}') } catch { return {} } })
  const now = Date.now()
  const top = reasonBreakdown(hits, startOfDay(now, -13), Infinity, order).sort((a, b) => b.count - a.count)[0]
  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] }
    setDone(next)
    try { localStorage.setItem(PREP_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }
  const prep = [
    { id: 'tell', text: 'Tell someone your quit date and ask them to check in.' },
    { id: 'triggers', text: top ? `Plan for your top trigger: ${top.reason.toLowerCase()}.` : 'Log hits with a reason to find your triggers.' },
    { id: 'tools', text: 'Try “Ride it out” once before quit day.' },
    { id: 'clear', text: 'Get rid of vapes, pods and chargers after your last hit.' },
    { id: 'support', text: 'Text DITCHVAPE to 88709 (free), or ask a pharmacist about nicotine replacement.' },
  ]
  return (
    <>
      <div className="mb-4"><CardTitle>GET READY</CardTitle></div>
      <ul className="grid gap-1">
        {prep.map((p) => (
          <li key={p.id}>
            <button className="press flex w-full items-start gap-3 rounded-lg py-1.5 text-left" onClick={() => toggle(p.id)} aria-pressed={!!done[p.id]}>
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${done[p.id] ? 'border-good bg-good text-white' : 'border-line'}`}>{done[p.id] ? '✓' : ''}</span>
              <span className={`text-sm leading-snug ${done[p.id] ? 'text-muted line-through' : ''}`}>{p.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function FirstDaysCard() {
  return (
    <>
      <div className="mb-4"><CardTitle>YOUR FIRST DAYS</CardTitle></div>
      <ul className="grid gap-2.5 text-sm leading-snug">
        {HEALTH_MILESTONES.slice(0, 5).map((m) => (
          <li key={m.label} className="flex gap-3"><span className="w-16 shrink-0 font-semibold">{m.label}</span><span className="text-muted">{m.title}</span></li>
        ))}
      </ul>
      <Link to="/insights#health" className="press mt-4 block text-xs text-muted">Full timeline →</Link>
    </>
  )
}

const PREP_SLIDES = [GetReadyCard, FirstDaysCard]

/** Before a future quit date: countdown, keep logging (it builds the baseline), and getting ready. */
export function PreQuitHome() {
  const now = useNow(60_000)
  const navigate = useNavigate()
  const { profile, hits, baseline } = useHitData()
  const updateProfile = useData((s) => s.updateProfile)
  const [picking, setPicking] = useState<PickMode | null>(null)
  const quitAt = profile!.journeyStart
  const today = countBetween(hits, startOfDay(now))

  const quitNow = async () => {
    if (!(await confirmDialog({ title: 'Quit right now?', message: 'Your quit date moves to this moment and your vape-free clock starts.', confirmLabel: 'Quit now' }))) return
    updateProfile({ journeyStart: Date.now() })
    toast('Your vape-free clock has started 💪')
  }

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
      <HomeHeader />
      <main className="px-6 pt-8 pb-4">
        <Timer label="QUIT DAY IN" until={quitAt} />
        <p className="-mt-7 mb-8 text-center text-sm text-muted">
          {new Date(quitAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          {' · '}<Link to="/settings#journey" className="press font-semibold">Change</Link>
          {' · '}<button className="press font-semibold text-accent" onClick={() => void quitNow()}>Quit now</button>
        </p>

        {picking ? (
          <div className="mb-8">
            <ReasonPicker mode={picking} onDone={() => setPicking(null)} onEarlier={() => setPicking(null)} hitMessage="Logged. Every hit you log sharpens your plan." />
          </div>
        ) : (
          <div className="mb-8">
            <button className="press mb-3 w-full rounded-3xl bg-accent p-6 text-xl font-bold text-white" onClick={() => setPicking('hit')}>I Vaped</button>
            <div className="flex gap-3">
              <button className="press flex-1 rounded-2xl border-2 border-line p-3.5 text-[15px] font-semibold" onClick={() => navigate('/craving')}>🌊 Ride it out</button>
              <button className="press flex-1 rounded-2xl border-2 border-good/40 p-3.5 text-[15px] font-semibold text-good" onClick={() => setPicking('resisted')}>💪 I resisted</button>
            </div>
            <p className="mt-3 text-center text-sm text-muted">Keep logging until quit day. It shows your triggers and sets your baseline.</p>
          </div>
        )}

        <div className="mb-6 flex gap-4">
          <Link to="/history" className="press flex-1 rounded-[20px] bg-card p-5"><StatCard label="TODAY" value={today} unit="HITS" /></Link>
          <div className="flex-1 rounded-[20px] bg-card p-5">
            <StatCard label="YOUR BASELINE" value={baseline.perDay.toFixed(0)} unit="PER DAY" extra={<span className="text-xs">{baseline.source === 'history' ? `${baseline.days}d logged` : 'estimate'}</span>} />
          </div>
        </div>
        <Carousel slides={PREP_SLIDES} />
      </main>
    </div>
  )
}
