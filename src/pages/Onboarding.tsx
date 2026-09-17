import { useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import AccountPanel from '../components/AccountPanel'
import { ArrowLeft } from '../components/Icons'
import { dailyLimit, dateKey, formatMoney, startOfDay, taperToTarget } from '../lib/analytics'
import { syncEnabled } from '../lib/sync'
import { useData } from '../store/data'
import type { Approach } from '../types'

type Step = 'puffs' | 'plan' | 'when' | 'cost'
type When = 'now' | 'earlier' | 'later'

const pad = (n: number) => String(n).padStart(2, '0')
const timeOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const parseLocal = (date: string, time: string) => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{1,2}):(\d{2})$/.exec(time)
  return d && t ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])).getTime() : NaN
}
const longDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function Choice({ selected, onClick, title, children, emoji }: { selected: boolean; onClick: () => void; title: string; children: ReactNode; emoji: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`press w-full rounded-2xl border-2 p-5 text-left transition-colors ${selected ? 'border-accent bg-accent/10' : 'border-line bg-card'}`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">{emoji}</span>
        <div>
          <div className="text-lg font-bold">{title}</div>
          <div className="mt-0.5 text-sm leading-snug text-muted">{children}</div>
        </div>
      </div>
    </button>
  )
}

export default function Onboarding() {
  const hasProfile = useData((s) => !!s.profile)
  const startJourney = useData((s) => s.startJourney)
  const [step, setStep] = useState<Step>('puffs')
  const [puffs, setPuffs] = useState('')
  const [approach, setApproach] = useState<Approach | null>(null)
  const [when, setWhen] = useState<When>('now')
  const [date, setDate] = useState(dateKey(Date.now()))
  const [time, setTime] = useState(timeOf(Date.now()))
  const [target, setTarget] = useState(dateKey(startOfDay(Date.now(), 42)))
  const [price, setPrice] = useState('')
  const [podPuffs, setPodPuffs] = useState('')
  const [error, setError] = useState('')
  const [restore, setRestore] = useState(false)

  // Also covers signing in here: once the cloud profile arrives, go straight home.
  if (hasProfile) return <Navigate to="/" replace />

  const avg = Number(puffs)
  const steps: Step[] = ['puffs', 'plan', 'when', 'cost']
  const index = steps.indexOf(step)
  const now = Date.now()
  const go = (s: Step) => { setError(''); setStep(s) }

  const quitAt = approach === 'gradual' || when === 'now' ? now : parseLocal(date, time)
  const targetAt = parseLocal(target, '00:00')
  const taper = approach === 'gradual' && !isNaN(targetAt) ? taperToTarget(avg, now, targetAt) : null

  const next = () => {
    if (step === 'puffs') {
      if (!/^\d+$/.test(puffs.trim()) || avg <= 0 || avg > 5000) { setError('Please enter a valid number of puffs'); return }
      return go('plan')
    }
    if (step === 'plan') {
      if (!approach) { setError('Pick the plan that fits you'); return }
      return go('when')
    }
    if (step === 'when') {
      if (approach === 'cold-turkey' && when !== 'now') {
        if (isNaN(quitAt)) { setError('Pick a date and time'); return }
        if (when === 'earlier' && quitAt > now) { setError('That time hasn’t happened yet. Choose “Later” for a future quit date.'); return }
        if (when === 'earlier' && quitAt < now - 365 * 86_400_000) { setError('Pick a date within the last year'); return }
        if (when === 'later' && quitAt <= now) { setError('Pick a time in the future, or choose “Right now”'); return }
        if (when === 'later' && quitAt > now + 90 * 86_400_000) { setError('Pick a quit date within the next 90 days'); return }
      }
      if (approach === 'gradual') {
        if (isNaN(targetAt) || targetAt < startOfDay(now, 7)) { setError('Give yourself at least a week'); return }
        if (targetAt > startOfDay(now, 365)) { setError('Pick a date within a year'); return }
      }
      return go('cost')
    }
    // cost step: optional
    let cost = null
    if (price.trim() || podPuffs.trim()) {
      const p = Number(price.replace(/[$,\s]/g, ''))
      const n = Number(podPuffs)
      if (isNaN(p) || p < 0 || p > 1000 || !/^\d+$/.test(podPuffs.trim()) || n <= 0) { setError('Enter both the price and puffs per pod, or skip'); return }
      cost = { pricePerPod: Math.round(p * 100) / 100, puffsPerPod: n }
    }
    finish(cost)
  }

  const finish = (cost: { pricePerPod: number; puffsPerPod: number } | null) => {
    startJourney({
      averagePuffsPerDay: avg,
      approach: approach!,
      journeyStart: approach === 'cold-turkey' && when !== 'now' ? quitAt : Date.now(),
      taper,
      targetDate: approach === 'gradual' ? targetAt : null,
      cost,
    })
  }

  const field = 'w-full rounded-2xl border-2 border-line bg-card px-4 py-3.5 text-lg font-semibold'
  const perWeek = price && podPuffs && Number(podPuffs) > 0 ? (Number(price.replace(/[$,\s]/g, '')) / Number(podPuffs)) * avg * 7 : null

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="flex items-center justify-between pt-4">
        {index > 0
          ? <button className="press -ml-2 flex size-10 items-center justify-center rounded-full" onClick={() => go(steps[index - 1])} aria-label="Back"><ArrowLeft size={24} /></button>
          : <span className="size-10" />}
        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => <span key={s} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-accent' : i < index ? 'w-1.5 bg-accent' : 'w-1.5 bg-line'}`} />)}
        </div>
        <span className="size-10" />
      </div>

      <form className="flex flex-1 flex-col pt-8 pb-10" onSubmit={(e) => { e.preventDefault(); next() }}>
        {step === 'puffs' && (
          <>
            <h1 className="mb-3 text-4xl font-bold">Let’s Get Started</h1>
            <p className="mb-12 text-lg text-muted">Your journey to quit vaping starts now</p>
            <label htmlFor="puffs" className="mb-4 text-xl font-semibold">What’s your average puffs per day?</label>
            <input id="puffs" className="tabular rounded-2xl border-2 border-line bg-card p-5 text-[28px] font-semibold placeholder:text-[#666]"
              value={puffs} onChange={(e) => { setPuffs(e.target.value); setError('') }} placeholder="e.g. 300" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoFocus />
            <p className="mt-3 text-sm leading-5 text-[#666]">This helps us calculate how many puffs you’re avoiding</p>
          </>
        )}

        {step === 'plan' && (
          <>
            <h1 className="mb-3 text-3xl font-bold">How do you want to quit?</h1>
            <p className="mb-8 text-muted">You can change this later in Settings.</p>
            <div className="grid gap-3" role="radiogroup">
              <Choice emoji="🧊" title="Cold turkey" selected={approach === 'cold-turkey'} onClick={() => { setApproach('cold-turkey'); setError('') }}>
                Stop completely on your quit date. The app celebrates every hour vape-free.
              </Choice>
              <Choice emoji="📉" title="Gradually" selected={approach === 'gradual'} onClick={() => { setApproach('gradual'); setError('') }}>
                Cut down step by step with a daily limit that drops each week until you reach zero.
              </Choice>
            </div>
          </>
        )}

        {step === 'when' && approach === 'cold-turkey' && (
          <>
            <h1 className="mb-3 text-3xl font-bold">When is your quit date?</h1>
            <p className="mb-8 text-muted">The moment of your last hit.</p>
            <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-card p-1" role="radiogroup">
              {([['now', 'Right now'], ['earlier', 'Already quit'], ['later', 'Later']] as const).map(([w, label]) => (
                <button key={w} type="button" role="radio" aria-checked={when === w} className={`press rounded-lg py-2.5 text-[15px] font-semibold ${when === w ? 'bg-bg' : 'text-muted'}`}
                  onClick={() => {
                    setWhen(w); setError('')
                    if (w === 'later') { setDate(dateKey(startOfDay(now, 1))); setTime('09:00') }
                    if (w === 'earlier') { setDate(dateKey(startOfDay(now, -1))); setTime(timeOf(now)) }
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {when === 'now' ? (
              <p className="rounded-2xl bg-card p-5 leading-relaxed">Your vape-free clock starts the moment you tap <b>Start</b>. 💪</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="q-date">Date</label>
                    <input id="q-date" type="date" className={field} value={date}
                      min={when === 'later' ? dateKey(now) : dateKey(startOfDay(now, -365))} max={when === 'later' ? dateKey(startOfDay(now, 90)) : dateKey(now)}
                      onChange={(e) => { setDate(e.target.value); setError('') }} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="q-time">Time</label>
                    <input id="q-time" type="time" className={field} value={time} onChange={(e) => { setTime(e.target.value); setError('') }} />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {when === 'later'
                    ? 'Until then, keep logging hits as usual: they become the baseline your progress is measured against. The home screen counts down to your quit date.'
                    : 'Your progress, hits avoided and health milestones are counted from this moment.'}
                </p>
              </>
            )}
          </>
        )}

        {step === 'when' && approach === 'gradual' && (
          <>
            <h1 className="mb-3 text-3xl font-bold">When do you want to be vape-free?</h1>
            <p className="mb-8 text-muted">Your daily limit starts at your current average and drops each week to reach zero by then.</p>
            <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="g-target">Vape-free by</label>
            <input id="g-target" type="date" className={field} value={target} min={dateKey(startOfDay(now, 7))} max={dateKey(startOfDay(now, 365))} onChange={(e) => { setTarget(e.target.value); setError('') }} />
            <div className="mt-2 mb-4 flex flex-wrap gap-2">
              {[4, 6, 8, 12].map((w) => (
                <button key={w} type="button" className={`press rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold ${target === dateKey(startOfDay(now, w * 7)) ? 'border-fg' : 'border-line text-muted'}`} onClick={() => setTarget(dateKey(startOfDay(now, w * 7)))}>
                  {w} weeks
                </button>
              ))}
            </div>
            {taper && (
              <div className="grid gap-2 rounded-2xl bg-card p-5 text-[15px]">
                <div className="flex justify-between"><span className="text-muted">This week</span><b>{taper.startLimit} a day</b></div>
                <div className="flex justify-between"><span className="text-muted">Next week</span><b>{dailyLimit(taper, startOfDay(now, 7))} a day</b></div>
                <div className="flex justify-between"><span className="text-muted">Drops by</span><b>{taper.weeklyDrop} each week</b></div>
                <div className="flex justify-between"><span className="text-muted">Zero from</span><b>{longDate(startOfDay(now, Math.ceil(taper.startLimit / taper.weeklyDrop) * 7))}</b></div>
              </div>
            )}
          </>
        )}

        {step === 'cost' && (
          <>
            <h1 className="mb-3 text-3xl font-bold">What does it cost you?</h1>
            <p className="mb-8 text-muted">Optional. Watching the money you save add up is a great motivator.</p>
            <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="o-price">Price of one pod or disposable ($)</label>
            <input id="o-price" className={`${field} mb-4`} value={price} onChange={(e) => { setPrice(e.target.value); setError('') }} inputMode="decimal" placeholder="e.g. 20" />
            <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="o-puffs">Puffs it lasts</label>
            <input id="o-puffs" className={field} value={podPuffs} onChange={(e) => { setPodPuffs(e.target.value); setError('') }} inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 5000" />
            {perWeek !== null && !isNaN(perWeek) && <p className="mt-4 text-[15px]">That’s about <b className="text-good">{formatMoney(perWeek)}</b> a week at {avg} puffs a day.</p>}
          </>
        )}

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
        <div className="flex-1" />

        {step === 'puffs' && syncEnabled && (
          <div className="mb-6">
            {restore ? (
              <div className="rounded-2xl bg-card p-5">
                <h2 className="mb-3 font-bold">Restore your journey</h2>
                <AccountPanel />
              </div>
            ) : (
              <button type="button" className="press w-full p-2 text-[15px] font-semibold text-muted" onClick={() => setRestore(true)}>
                Already tracking? <span className="text-accent">Sign in</span>
              </button>
            )}
          </div>
        )}

        {step === 'cost' && <button type="button" className="press mb-3 p-2 text-[15px] font-semibold text-muted" onClick={() => finish(null)}>Skip for now</button>}
        <button className="press rounded-2xl bg-accent p-5 text-lg font-bold text-white">
          {step === 'cost' ? (approach === 'cold-turkey' && when === 'later' ? 'Set my quit date' : 'Start Journey') : 'Continue'}
        </button>
      </form>
    </div>
  )
}
