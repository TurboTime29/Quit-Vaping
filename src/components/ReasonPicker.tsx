import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store/data'
import { toast } from './Dialogs'
import { useReasons } from './HitSheet'

export type PickMode = 'hit' | 'resisted'

/** Inline "why?" picker after tapping I Vaped / I resisted: tap a reason to log, with undo. */
export default function ReasonPicker({ mode, onDone, onEarlier, hitMessage }: { mode: PickMode; onDone: () => void; onEarlier: () => void; hitMessage?: string }) {
  const recordHit = useData((s) => s.recordHit)
  const deleteHit = useData((s) => s.deleteHit)
  const reasons = useReasons()
  const [note, setNote] = useState<string | null>(null)
  const navigate = useNavigate()

  const log = (reason?: string) => {
    const id = recordHit({ reason, note: note ?? undefined, kind: mode === 'resisted' ? 'resisted' : undefined })
    onDone()
    toast(mode === 'resisted' ? 'Win logged. Nice work 💪' : hitMessage ?? 'Logged. Timer reset, you’ve got this.', { action: { label: 'Undo', run: () => deleteHit(id) } })
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
