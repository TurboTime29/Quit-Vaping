import { useState } from 'react'
import { dateKey } from '../lib/analytics'
import { useData } from '../store/data'
import { DEFAULT_REASONS, type Hit } from '../types'
import { confirmDialog, toast } from './Dialogs'
import Sheet from './Sheet'

const pad = (n: number) => String(n).padStart(2, '0')
const timeOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function useReasons(): string[] {
  return useData((s) => s.profile?.settings.reasons ?? DEFAULT_REASONS)
}

export function ReasonChips({ reasons, value, onChange }: { reasons: string[]; value?: string; onChange: (r: string | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {reasons.map((r) => (
        <button
          key={r}
          type="button"
          className={`press rounded-full border px-3.5 py-2 text-sm font-medium ${value === r ? 'border-fg bg-chip text-fg' : 'border-line text-muted'}`}
          onClick={() => onChange(value === r ? undefined : r)}
          aria-pressed={value === r}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/** Add a hit or resisted craving at any past time, or edit/delete an existing record. */
export default function HitSheet({ hit, initialKind, onClose }: { hit?: Hit; initialKind?: 'hit' | 'resisted'; onClose: () => void }) {
  const recordHit = useData((s) => s.recordHit)
  const updateHit = useData((s) => s.updateHit)
  const deleteHit = useData((s) => s.deleteHit)
  const reasons = useReasons()
  const start = hit?.ts ?? Date.now()
  const [kind, setKind] = useState<'hit' | 'resisted'>(hit?.kind ?? initialKind ?? 'hit')
  const [date, setDate] = useState(dateKey(start))
  const [time, setTime] = useState(timeOf(start))
  const [reason, setReason] = useState<string | undefined>(hit?.reason)
  const [note, setNote] = useState(hit?.note ?? '')
  // Keep a retired reason selectable on records that already use it.
  const chipReasons = reason && !reasons.includes(reason) ? [...reasons, reason] : reasons

  const save = () => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    const t = /^(\d{1,2}):(\d{2})$/.exec(time)
    if (!d || !t) { toast('Enter a valid date and time'); return }
    const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
    // Keep the original seconds when the minute did not change, so re-saving does not reorder records.
    if (hit && timeOf(hit.ts) === time && dateKey(hit.ts) === date) at.setTime(hit.ts)
    if (isNaN(at.getTime())) { toast('Enter a valid date and time'); return }
    if (at.getTime() > Date.now() + 60_000) { toast('That time is in the future'); return }
    const fields = { ts: at.getTime(), reason, note: note.trim() || undefined, kind: kind === 'resisted' ? ('resisted' as const) : undefined }
    if (hit) {
      updateHit(hit.id, fields)
      toast('Saved')
    } else {
      const id = recordHit(fields)
      toast(kind === 'resisted' ? 'Win logged' : 'Hit logged', { action: { label: 'Undo', run: () => deleteHit(id) } })
    }
    onClose()
  }

  const remove = async () => {
    if (!hit) return
    if (await confirmDialog({ title: 'Delete Record', message: 'Are you sure you want to delete this record?', confirmLabel: 'Delete', destructive: true })) {
      deleteHit(hit.id)
      onClose()
      toast('Record deleted')
    }
  }

  const label = 'mb-2 block text-sm font-semibold text-muted'
  const field = 'w-full rounded-xl border-2 border-line bg-bg px-4 py-3 font-semibold'

  return (
    <Sheet title={hit ? (hit.backfill ? 'Edit backfilled hit' : 'Edit record') : 'Log an earlier hit'} onClose={onClose}>
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1" role="radiogroup" aria-label="Type">
          {(['hit', 'resisted'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k}
              className={`press rounded-lg py-2.5 text-[15px] font-semibold ${kind === k ? (k === 'hit' ? 'bg-accent text-white' : 'bg-good text-white') : 'text-muted'}`}
              onClick={() => setKind(k)}>
              {k === 'hit' ? 'I vaped' : 'I resisted'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="hs-date">Date</label><input id="hs-date" type="date" className={field} value={date} max={dateKey(Date.now())} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className={label} htmlFor="hs-time">Time</label><input id="hs-time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>

        <div>
          <span className={label}>{kind === 'hit' ? 'Reason' : 'What triggered the craving?'}</span>
          <ReasonChips reasons={chipReasons} value={reason} onChange={setReason} />
        </div>

        <div>
          <label className={label} htmlFor="hs-note">Note <span className="font-normal">(optional)</span></label>
          <textarea id="hs-note" rows={2} maxLength={500} className={`${field} resize-none font-normal`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where were you, how did you feel?" />
        </div>

        <div className="flex gap-3">
          {hit && <button type="button" className="press rounded-xl border-2 border-line px-4 font-semibold text-accent" onClick={() => void remove()}>Delete</button>}
          <button className={`press flex-1 rounded-xl p-4 font-semibold text-white ${kind === 'hit' ? 'bg-accent' : 'bg-good'}`}>{hit ? 'Save' : kind === 'hit' ? 'Log hit' : 'Log win'}</button>
        </div>
      </form>
    </Sheet>
  )
}
