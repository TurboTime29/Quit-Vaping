import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrickBreaker from '../components/BrickBreaker'
import { toast } from '../components/Dialogs'
import PageHeader from '../components/PageHeader'
import { useNow } from '../lib/hooks'
import { useData } from '../store/data'

const BREATH_PHASES = [
  { label: 'Breathe in', seconds: 4, scale: 1 },
  { label: 'Hold', seconds: 4, scale: 1 },
  { label: 'Breathe out', seconds: 4, scale: 0.55 },
  { label: 'Hold', seconds: 4, scale: 0.55 },
]
const CYCLE = BREATH_PHASES.reduce((s, p) => s + p.seconds, 0)

/** Box breathing: 4 seconds in, hold, out, hold. Timed from a start timestamp so it stays right after backgrounding. */
function Breathe() {
  const now = useNow(250)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0
  let t = elapsed % CYCLE
  let phase = BREATH_PHASES[0]
  for (const p of BREATH_PHASES) {
    if (t < p.seconds) { phase = p; break }
    t -= p.seconds
  }
  const cycles = Math.floor(elapsed / CYCLE)

  return (
    <div className="flex flex-col items-center">
      <div className="relative my-6 flex size-64 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-line" />
        <div
          className="absolute inset-0 rounded-full bg-[#45B7D1]/25"
          style={{ transform: `scale(${startedAt ? phase.scale : 0.55})`, transition: `transform ${startedAt ? phase.seconds : 0.3}s ease-in-out` }}
        />
        <div className="relative text-center">
          <div className="text-2xl font-bold">{startedAt ? phase.label : 'Ready'}</div>
          {startedAt && <div className="tabular mt-1 text-4xl font-bold">{Math.ceil(phase.seconds - t)}</div>}
        </div>
      </div>
      <p className="mb-5 h-5 text-sm text-muted">{startedAt ? `${cycles} ${cycles === 1 ? 'round' : 'rounds'} done · try for 4` : 'Slow breathing calms the urge in a minute or two.'}</p>
      <button className="press w-full rounded-2xl border-2 border-line p-4 font-semibold" onClick={() => setStartedAt(startedAt ? null : Date.now())}>
        {startedAt ? 'Stop' : 'Start breathing'}
      </button>
    </div>
  )
}

const SURF_PROMPTS = [
  'Notice where you feel the urge in your body. Just notice it.',
  'Cravings rise like a wave, peak, and then fall. You don’t have to act on it.',
  'Breathe slowly. Rate the urge from 1 to 10 in your head.',
  'Is it getting stronger, or already a little weaker?',
  'Drink some water, or stand up and move for a moment.',
  'Think of why you started this journey.',
  'Most cravings pass within a few minutes. You’re riding this one out.',
]

interface SurfTimer {
  minutes: number
  setMinutes: (m: number) => void
  endsAt: number | null
  setEndsAt: (t: number | null) => void
}

/** Urge surfing: a countdown that walks through the craving with rotating prompts. */
function Surf({ timer, onWin, onPlay }: { timer: SurfTimer; onWin: () => void; onPlay: () => void }) {
  const now = useNow(1000)
  const { minutes, setMinutes, endsAt, setEndsAt } = timer
  const total = minutes * 60_000
  const left = endsAt ? Math.max(0, endsAt - now) : total
  const done = endsAt !== null && left === 0
  const progress = 1 - left / total
  const prompt = SURF_PROMPTS[Math.floor((total - left) / 20_000) % SURF_PROMPTS.length]
  const r = 110
  const circumference = 2 * Math.PI * r

  useEffect(() => {
    if (done && 'vibrate' in navigator) navigator.vibrate?.(200)
  }, [done])

  return (
    <div className="flex flex-col items-center">
      <div className="relative my-6 size-64">
        <svg viewBox="0 0 250 250" className="size-full -rotate-90">
          <circle cx="125" cy="125" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle cx="125" cy="125" r={r} fill="none" stroke="#4ECDC4" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="tabular text-5xl font-bold">{Math.floor(left / 60_000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')}</div>
          <div className="mt-1 text-sm text-muted">{done ? 'You rode it out 🌊' : endsAt ? 'riding the wave' : 'minutes'}</div>
        </div>
      </div>

      {!endsAt && (
        <div className="mb-5 flex gap-2">
          {[2, 5, 10].map((m) => (
            <button key={m} className={`press rounded-full border-2 px-5 py-2 font-semibold ${m === minutes ? 'border-fg' : 'border-line text-muted'}`} onClick={() => setMinutes(m)}>{m} min</button>
          ))}
        </div>
      )}
      {endsAt && <p className="mb-5 min-h-12 text-center text-[15px] leading-relaxed">{done ? 'The urge has had time to pass. How do you feel?' : prompt}</p>}

      {done ? (
        <button className="press w-full rounded-2xl bg-good p-4 font-semibold text-white" onClick={onWin}>It passed: log a win</button>
      ) : (
        <button className="press w-full rounded-2xl border-2 border-line p-4 font-semibold" onClick={() => setEndsAt(endsAt ? null : Date.now() + total)}>
          {endsAt ? 'Stop' : 'Start countdown'}
        </button>
      )}
      {!done && <button className="press mt-3 p-2 text-[15px] font-semibold text-accent" onClick={onPlay}>🎮 Play a game while you wait</button>}
    </div>
  )
}

/** A game to keep hands and head busy, with the urge-surf countdown still running above it. */
function Play({ timer, onWin }: { timer: SurfTimer; onWin: () => void }) {
  const now = useNow(1000)
  const [startedAt] = useState(() => Date.now())
  const left = timer.endsAt ? Math.max(0, timer.endsAt - now) : null
  const fmt = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

  return (
    <div className="mt-4">
      <div className="mb-3 flex min-h-10 items-center justify-between gap-3 text-sm">
        {left === null ? (
          <>
            <span className="text-muted">Playing for <b className="tabular text-fg">{fmt(now - startedAt)}</b></span>
            <button className="press rounded-full border-2 border-line px-3 py-1.5 font-semibold" onClick={() => timer.setEndsAt(Date.now() + timer.minutes * 60_000)}>🌊 Start {timer.minutes} min timer</button>
          </>
        ) : left > 0 ? (
          <span className="text-muted">🌊 <b className="tabular text-fg">{fmt(left)}</b> left to ride out the craving</span>
        ) : (
          <>
            <span className="font-semibold text-good">🌊 You rode it out!</span>
            <button className="press rounded-full bg-good px-4 py-1.5 font-semibold text-white" onClick={onWin}>Log a win</button>
          </>
        )}
      </div>
      <BrickBreaker />
    </div>
  )
}

export default function Craving() {
  const navigate = useNavigate()
  const recordHit = useData((s) => s.recordHit)
  const deleteHit = useData((s) => s.deleteHit)
  const [tool, setTool] = useState<'surf' | 'play' | 'breathe'>('surf')
  const [minutes, setMinutes] = useState(5)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const timer: SurfTimer = { minutes, setMinutes, endsAt, setEndsAt }

  const win = () => {
    const id = recordHit({ kind: 'resisted' })
    toast('Win logged. Nice work 💪', { action: { label: 'Undo', run: () => deleteHit(id) } })
    navigate('/', { replace: true })
  }

  return (
    <div className="safe-top safe-bottom mx-auto min-h-dvh max-w-md">
      <PageHeader title="Ride it out" />
      <main className="px-6 pb-8">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-card p-1" role="tablist">
          {([['surf', 'Urge surf'], ['play', 'Play'], ['breathe', 'Breathe']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tool === id} className={`press rounded-lg py-2.5 font-semibold ${tool === id ? 'bg-bg' : 'text-muted'}`} onClick={() => setTool(id)}>{label}</button>
          ))}
        </div>

        {tool === 'surf' && <Surf timer={timer} onWin={win} onPlay={() => setTool('play')} />}
        {tool === 'play' && <Play timer={timer} onWin={win} />}
        {tool === 'breathe' && <Breathe />}

        <div className="mt-8 grid gap-3 border-t border-line pt-6">
          <button className="press w-full rounded-2xl border-2 border-good/40 p-4 font-semibold text-good" onClick={win}>Craving passed: log a win</button>
          <button className="press w-full p-2 text-[15px] font-semibold text-muted" onClick={() => navigate('/', { replace: true, state: { pick: 'hit' } })}>I vaped anyway</button>
        </div>
      </main>
    </div>
  )
}
