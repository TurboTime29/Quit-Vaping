import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import AccountPanel from '../components/AccountPanel'
import { syncEnabled } from '../lib/sync'
import { useData } from '../store/data'

export default function Onboarding() {
  const hasProfile = useData((s) => !!s.profile)
  const startJourney = useData((s) => s.startJourney)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [restore, setRestore] = useState(false)

  // Also covers signing in here: once the cloud profile arrives, go straight home.
  if (hasProfile) return <Navigate to="/" replace />

  const submit = () => {
    const puffs = Number(value)
    if (!/^\d+$/.test(value.trim()) || puffs <= 0 || puffs > 5000) {
      setError('Please enter a valid number of puffs')
      return
    }
    startJourney(puffs)
  }

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <form className="flex flex-1 flex-col pt-16 pb-10" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <h1 className="mb-3 text-4xl font-bold">Let’s Get Started</h1>
        <p className="mb-14 text-lg text-muted">Your journey to quit vaping starts now</p>

        <label htmlFor="puffs" className="mb-4 text-xl font-semibold">What’s your average puffs per day?</label>
        <input
          id="puffs"
          className="tabular rounded-2xl border-2 border-line bg-card p-5 text-[28px] font-semibold placeholder:text-[#666]"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          placeholder="e.g. 300"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
        />
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        <p className="mt-3 text-sm leading-5 text-[#666]">This helps us calculate how many puffs you’re avoiding</p>

        <div className="flex-1" />

        {syncEnabled && (
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

        <button className="press rounded-2xl bg-accent p-5 text-lg font-bold text-white">Start Journey</button>
      </form>
    </div>
  )
}
