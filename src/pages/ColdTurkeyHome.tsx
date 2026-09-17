import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { confirmDialog, toast } from '../components/Dialogs'
import HitSheet, { useReasons } from '../components/HitSheet'
import { BarChart, Settings as SettingsIcon } from '../components/Icons'
import ReasonPicker, { type PickMode } from '../components/ReasonPicker'
import Sheet from '../components/Sheet'
import {
  countBetween, costPerPuff, formatDuration, formatMoney, longestStreak, reasonBreakdown, savings, startOfDay, totalAvoided,
} from '../lib/analytics'
import { HEALTH_MILESTONES, healthProgress } from '../lib/health'
import { useHitData, useNow } from '../lib/hooks'
import { useData } from '../store/data'

function Header() {
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

const Label = ({ children }: { children: ReactNode }) => <div className="text-[10px] font-semibold tracking-widest text-muted">{children}</div>

function splitDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 }
}

/** Big "vape-free for" clock. */
function VapeFreeHero({ since, quitAt, slips }: { since: number; quitAt: number; slips: number }) {
  const now = useNow(1000)
  const t = splitDuration(now - since)
  const unit = (v: number, u: string, big = false) => (
    <span className="flex items-baseline">
      <span className={`tabular font-bold ${big ? 'text-6xl' : 'text-4xl'}`}>{v}</span>
      <span className={`ml-0.5 font-semibold text-muted ${big ? 'text-2xl' : 'text-lg'}`}>{u}</span>
    </span>
  )
  return (
    <section className="relative mb-4 overflow-hidden rounded-[24px] bg-card p-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(76,175,80,0.22),transparent_70%)]" />
      <div className="relative">
        <Label>VAPE-FREE FOR</Label>
        <div className="mt-3 flex items-baseline justify-center gap-3" role="timer" aria-label="Time vape-free">
          {t.d > 0 && unit(t.d, 'd', true)}
          {unit(t.h, 'h', t.d === 0)}
          {unit(t.m, 'm')}
          <span className="tabular text-2xl font-semibold text-muted">{String(t.s).padStart(2, '0')}s</span>
        </div>
        <p className="mt-3 text-sm text-muted">
          {slips === 0
            ? <>Since you quit on {new Date(quitAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</>
            : <>Since your last slip · quit {new Date(quitAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {formatDuration(now - quitAt)} ago</>}
        </p>
      </div>
    </section>
  )
}

function Ring({ progress, size = 88, children }: { progress: number; size?: number; children: ReactNode }) {
  const r = 40
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#4CAF50" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

function NextMilestone({ since }: { since: number }) {
  const now = useNow(1000)
  const streak = now - since
  const { next, progress, last } = healthProgress(streak)
  if (!next) {
    return (
      <Link to="/insights#health" className="press mb-4 block rounded-[20px] bg-card p-5">
        <Label>ALL MILESTONES REACHED</Label>
        <p className="mt-2 text-lg font-bold">A full year and beyond. You did the thing. 🏆</p>
      </Link>
    )
  }
  return (
    <Link to="/insights#health" className="press mb-4 flex items-center gap-4 rounded-[20px] bg-card p-5">
      <Ring progress={progress}><span className="tabular text-lg font-bold">{Math.floor(progress * 100)}%</span></Ring>
      <div className="min-w-0">
        <Label>NEXT MILESTONE · {next.label.toUpperCase()}</Label>
        <div className="mt-1 text-lg leading-tight font-bold">{next.title}</div>
        <p className="mt-1 text-sm leading-snug text-muted">{next.detail}</p>
        <p className="mt-1.5 text-xs font-semibold text-good">{formatDuration(next.after - streak)} to go{last ? ` · ✓ ${last.title}` : ''}</p>
      </div>
    </Link>
  )
}

function Tile({ label, value, sub, tone, to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; to?: string }) {
  const body = (
    <>
      <Label>{label}</Label>
      <div className={`tabular mt-2 text-[32px] leading-none font-bold ${tone ?? ''}`}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </>
  )
  return to ? <Link to={to} className="press rounded-[20px] bg-card p-4">{body}</Link> : <div className="rounded-[20px] bg-card p-4">{body}</div>
}

function ProgressTiles() {
  const now = useNow(1000)
  const { profile, real, wins, baseline, lastHit } = useHitData()
  const cost = profile!.settings.cost
  const avoided = totalAvoided(profile, real, now, baseline.perDay)
  const money = useMemo(() => (cost ? savings(profile!, real, cost, baseline.perDay, Math.floor(now / 60_000) * 60_000) : null), [profile, real, cost, baseline.perDay, Math.floor(now / 60_000)])
  const journeyWins = countBetween(wins, profile!.journeyStart)
  const winsToday = countBetween(wins, Math.max(profile!.journeyStart, startOfDay(now)))
  const since = lastHit ?? profile!.journeyStart
  const best = useMemo(() => longestStreak(profile, real, since), [profile, real, since])
  const perPuff = costPerPuff(cost)

  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      <Tile label="HITS AVOIDED" value={avoided.toLocaleString()} tone="text-good" sub={`vs ${baseline.perDay.toFixed(baseline.perDay < 10 ? 1 : 0)} a day before`} />
      {money && perPuff !== null
        ? <Tile label="MONEY SAVED" value={formatMoney(money.total)} tone="text-good" sub={`${money.pods.toFixed(money.pods < 10 ? 1 : 0)} pods not bought`} to="/insights#savings" />
        : <Tile label="MONEY SAVED" value="$ —" sub={<span className="text-accent">Add pod cost →</span>} to="/insights#savings" />}
      <Tile label="CRAVINGS BEATEN" value={journeyWins} tone={journeyWins ? 'text-good' : ''} sub={winsToday ? `${winsToday} today 💪` : 'Log one with “I resisted”'} />
      {real.length === 0
        ? <Tile label="SLIPS" value="0" tone="text-good" sub="Not a single hit" />
        : <Tile label="LONGEST STREAK" value={formatDuration(Math.max(best, now - since))} sub={`${real.length} ${real.length === 1 ? 'slip' : 'slips'} since quitting`} />}
    </div>
  )
}

function MilestoneBadges({ since }: { since: number }) {
  const now = useNow(60_000)
  const streak = now - since
  const { reached, next } = healthProgress(streak)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Start scrolled so the next milestone is in view.
    const el = scroller.current?.querySelector('[data-next]') as HTMLElement | null
    if (el && scroller.current) scroller.current.scrollLeft = Math.max(0, el.offsetLeft - 80)
  }, [reached.length])

  return (
    <section className="mb-4 rounded-[20px] bg-card py-5">
      <div className="mb-3 flex items-center justify-between px-5">
        <Label>HEALTH MILESTONES · {reached.length}/{HEALTH_MILESTONES.length}</Label>
        <Link to="/insights#health" className="press -my-2 -mr-2 rounded-lg px-2 py-2 text-xs">Timeline →</Link>
      </div>
      <div ref={scroller} className="hide-scrollbar flex gap-3 overflow-x-auto px-5">
        {HEALTH_MILESTONES.map((m) => {
          const done = streak >= m.after
          const isNext = m === next
          return (
            <Link key={m.label} to="/insights#health" data-next={isNext || undefined}
              className={`press flex w-20 shrink-0 flex-col items-center rounded-2xl p-2 text-center ${isNext ? 'bg-bg' : ''}`}>
              <span className={`flex size-12 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-good text-white' : isNext ? 'border-2 border-good text-good' : 'border-2 border-line text-muted'}`}>
                {done ? '✓' : m.short}
              </span>
              <span className={`mt-1.5 text-[11px] leading-tight font-semibold ${done ? '' : 'text-muted'}`}>{m.title}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function CravingCard({ onResisted }: { onResisted: () => void }) {
  const navigate = useNavigate()
  return (
    <section className="mb-4 rounded-[20px] bg-card p-5">
      <div className="mb-1 font-bold">Craving hitting?</div>
      <p className="mb-4 text-sm text-muted">Cravings come in waves that usually pass in 5 to 10 minutes.</p>
      <div className="flex gap-3">
        <button className="press flex-1 rounded-2xl bg-[#1E7F9C] p-3.5 text-[15px] font-semibold text-white" onClick={() => navigate('/craving')}>🌊 Ride it out</button>
        <button className="press flex-1 rounded-2xl border-2 border-good/40 p-3.5 text-[15px] font-semibold text-good" onClick={onResisted}>💪 I resisted</button>
      </div>
    </section>
  )
}

export default function ColdTurkeyHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, real, lastHit, baseline } = useHitData()
  const [picking, setPicking] = useState<PickMode | null>(() => (location.state as { pick?: PickMode } | null)?.pick ?? null)
  const [earlier, setEarlier] = useState(false)
  const since = lastHit ?? profile!.journeyStart

  useEffect(() => { if (location.state) navigate('.', { replace: true, state: null }) }, [])

  const avoidedNow = totalAvoided(profile, real, Date.now(), baseline.perDay)

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
      <Header />
      <main className="px-6 pt-4 pb-6">
        <VapeFreeHero since={since} quitAt={profile!.journeyStart} slips={real.length} />
        <NextMilestone since={since} />
        <ProgressTiles />
        <MilestoneBadges since={since} />
        <CravingCard onResisted={() => setPicking('resisted')} />

        <Link to="/insights" className="press mb-6 flex items-center justify-between rounded-[20px] bg-card px-5 py-4 font-semibold">
          <span>📈 Savings, trends & insights</span><span className="text-muted">→</span>
        </Link>

        <div className="text-center">
          <button className="press p-2 text-sm font-semibold text-muted" onClick={() => setPicking('hit')}>Slipped up? Log it honestly</button>
          <Link to="/history" className="press block p-2 text-sm font-semibold text-muted">History</Link>
        </div>
      </main>

      {picking && (
        <Sheet title={picking === 'hit' ? 'Log a slip' : 'Log a craving you beat'} onClose={() => setPicking(null)}>
          {picking === 'hit' && <p className="mb-4 text-sm leading-relaxed text-muted">A slip isn’t a restart. Logging it keeps your data honest, and everything you’ve gained still counts.</p>}
          <ReasonPicker
            mode={picking}
            onDone={() => setPicking(null)}
            onEarlier={() => { setPicking(null); setEarlier(true) }}
            hitMessage={`Logged. Your ${avoidedNow.toLocaleString()} hits avoided still count. Keep going.`}
          />
        </Sheet>
      )}
      {earlier && <HitSheet initialKind="resisted" onClose={() => setEarlier(false)} />}
    </div>
  )
}

const PREP_KEY = 'quit-prep-checklist'

/** Before a future quit date: countdown, keep logging (it builds the baseline), and a short quit plan. */
export function PreQuitHome() {
  const now = useNow(1000)
  const navigate = useNavigate()
  const { profile, hits, baseline } = useHitData()
  const updateProfile = useData((s) => s.updateProfile)
  const order = useReasons()
  const [picking, setPicking] = useState(false)
  const [done, setDone] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(PREP_KEY) ?? '{}') } catch { return {} } })
  const quitAt = profile!.journeyStart
  const t = splitDuration(quitAt - now)
  const today = countBetween(hits, startOfDay(now))
  const top = reasonBreakdown(hits, startOfDay(now, -13), Infinity, order).sort((a, b) => b.count - a.count)[0]

  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] }
    setDone(next)
    try { localStorage.setItem(PREP_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }
  const prep = [
    { id: 'tell', text: 'Tell a friend or family member your quit date, and ask them to check in.' },
    { id: 'triggers', text: top ? `Plan for your biggest trigger so far: ${top.reason.toLowerCase()}. What will you do instead?` : 'Log your hits with a reason so you know your biggest triggers.' },
    { id: 'tools', text: 'Try “Ride it out” once now, so it’s familiar when a craving hits.' },
    { id: 'clear', text: 'Plan to get rid of vapes, pods and chargers right after your last hit.' },
    { id: 'support', text: 'Line up support: text DITCHVAPE to 88709 (free, from Truth Initiative), or ask a pharmacist about nicotine replacement.' },
  ]

  const quitNow = async () => {
    if (!(await confirmDialog({ title: 'Quit right now?', message: 'Your quit date moves to this moment and your vape-free clock starts.', confirmLabel: 'Quit now' }))) return
    updateProfile({ journeyStart: Date.now() })
    toast('Your vape-free clock has started 💪')
  }

  const box = (v: number, u: string) => (
    <div className="flex w-16 flex-col items-center">
      <span className="tabular text-4xl font-bold">{String(v).padStart(2, '0')}</span>
      <span className="text-xs text-muted">{u}</span>
    </div>
  )

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md">
      <Header />
      <main className="px-6 pt-4 pb-6">
        <section className="relative mb-4 overflow-hidden rounded-[24px] bg-card p-6 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,107,107,0.2),transparent_70%)]" />
          <div className="relative">
            <Label>QUIT DAY IN</Label>
            <div className="mt-3 flex justify-center" role="timer">{box(t.d, 'DAYS')}{box(t.h, 'HRS')}{box(t.m, 'MIN')}{box(t.s, 'SEC')}</div>
            <p className="mt-3 text-[15px] font-semibold">{new Date(quitAt).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
            <div className="mt-2 flex justify-center gap-4 text-sm font-semibold">
              <Link to="/settings" className="press text-muted">Change date</Link>
              <button className="press text-accent" onClick={() => void quitNow()}>Quit now instead</button>
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-[20px] bg-card p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="font-bold">Until then, log every hit</span>
            <span className="tabular text-sm text-muted"><b className="text-fg">{today}</b> today</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            It shows your triggers and sets the baseline your progress is measured against
            {baseline.source === 'history' ? <> (currently <b className="text-fg">{baseline.perDay.toFixed(0)} a day</b>).</> : '.'}
          </p>
          {picking
            ? <ReasonPicker mode="hit" onDone={() => setPicking(false)} onEarlier={() => setPicking(false)} hitMessage="Logged. Every hit you log sharpens your plan." />
            : <button className="press w-full rounded-2xl bg-accent p-4 text-lg font-bold text-white" onClick={() => setPicking(true)}>I Vaped</button>}
        </section>

        <section className="mb-4 rounded-[20px] bg-card p-5">
          <div className="mb-3 font-bold">Get ready</div>
          <ul className="grid gap-2">
            {prep.map((p) => (
              <li key={p.id}>
                <button className="press flex w-full items-start gap-3 rounded-xl p-2 text-left" onClick={() => toggle(p.id)} aria-pressed={!!done[p.id]}>
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${done[p.id] ? 'border-good bg-good text-white' : 'border-line'}`}>{done[p.id] ? '✓' : ''}</span>
                  <span className={`text-sm leading-snug ${done[p.id] ? 'text-muted line-through' : ''}`}>{p.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-4 rounded-[20px] bg-card p-5">
          <div className="mb-3 font-bold">What your first days look like</div>
          <ul className="grid gap-2 text-sm leading-snug">
            {HEALTH_MILESTONES.slice(0, 5).map((m) => (
              <li key={m.label} className="flex gap-3"><span className="w-16 shrink-0 font-semibold text-good">{m.label}</span><span className="text-muted">{m.detail}</span></li>
            ))}
          </ul>
        </section>

        <div className="flex gap-3">
          <button className="press flex-1 rounded-2xl border-2 border-line p-3.5 text-[15px] font-semibold" onClick={() => navigate('/craving')}>🌊 Ride it out</button>
          <Link to="/insights" className="press flex-1 rounded-2xl border-2 border-line p-3.5 text-center text-[15px] font-semibold">📈 Insights</Link>
        </div>
      </main>
    </div>
  )
}
