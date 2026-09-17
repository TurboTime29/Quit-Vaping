import { useEffect, useMemo, useRef, useState } from 'react'
import { confirmDialog, toast } from '../components/Dialogs'
import { Check, Pencil, Trash, X } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import { dateKey, parseDateKey, startOfDay } from '../lib/analytics'
import { useHitData } from '../lib/hooks'
import { useData } from '../store/data'
import { REASONS, type Hit, type HitReason } from '../types'

const DAYS_PER_PAGE = 10

function dayLabel(key: string) {
  const now = Date.now()
  if (key === dateKey(now)) return 'Today'
  if (key === dateKey(startOfDay(now, -1))) return 'Yesterday'
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const toTimeInput = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function HitRow({ hit, editing, onEdit, onDone }: { hit: Hit; editing: boolean; onEdit: () => void; onDone: () => void }) {
  const updateHit = useData((s) => s.updateHit)
  const deleteHit = useData((s) => s.deleteHit)
  const [time, setTime] = useState(() => toTimeInput(hit.ts))
  const [reason, setReason] = useState<HitReason | undefined>(hit.reason)

  useEffect(() => {
    if (editing) { setTime(toTimeInput(hit.ts)); setReason(hit.reason) }
  }, [editing, hit.ts, hit.reason])

  const save = () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time)
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) { toast('Enter a valid time'); return }
    const d = new Date(hit.ts)
    d.setHours(Number(m[1]), Number(m[2]), d.getMinutes() === Number(m[2]) && d.getHours() === Number(m[1]) ? d.getSeconds() : 0, 0)
    if (d.getTime() > Date.now()) { toast('That time is in the future'); return }
    updateHit(hit.id, { ts: d.getTime(), reason })
    onDone()
  }

  const remove = async () => {
    if (await confirmDialog({ title: 'Delete Record', message: 'Are you sure you want to delete this record?', confirmLabel: 'Delete', destructive: true })) {
      deleteHit(hit.id)
      toast('Record deleted')
    }
  }

  return (
    <li className="mb-2 flex items-center rounded-xl bg-card p-4">
      <span className={`mr-3 size-2 shrink-0 rounded-full ${hit.backfill ? 'bg-muted' : 'bg-accent'}`} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="grid gap-2">
            <input type="time" className="w-36 rounded-lg border border-line bg-bg px-3 py-2 font-semibold" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button key={r} className={`press rounded-full border border-line px-3 py-1.5 text-xs font-medium ${reason === r ? 'bg-chip text-fg' : 'text-muted'}`} onClick={() => setReason(reason === r ? undefined : r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="font-semibold">{new Date(hit.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
            {(hit.reason || hit.backfill) && <div className="mt-1 text-xs text-muted">{hit.reason ?? 'Backfilled'}</div>}
          </>
        )}
      </div>
      <div className="ml-3 flex gap-1">
        {editing ? (
          <>
            <button className="press p-2 text-good" onClick={save} aria-label="Save"><Check size={22} /></button>
            <button className="press p-2 text-muted" onClick={onDone} aria-label="Cancel"><X size={22} /></button>
          </>
        ) : (
          <>
            <button className="press p-2 text-muted" onClick={onEdit} aria-label="Edit"><Pencil size={18} /></button>
            <button className="press p-2 text-accent" onClick={() => void remove()} aria-label="Delete"><Trash size={18} /></button>
          </>
        )}
      </div>
    </li>
  )
}

export default function History() {
  const { visible } = useHitData()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pages, setPages] = useState(1)
  const sentinel = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => {
    const byDay = new Map<string, Hit[]>()
    for (const h of [...visible].sort((a, b) => b.ts - a.ts)) {
      const key = dateKey(h.ts)
      const list = byDay.get(key)
      if (list) list.push(h)
      else byDay.set(key, [h])
    }
    return [...byDay.entries()]
  }, [visible])

  const shown = groups.slice(0, pages * DAYS_PER_PAGE)
  const more = shown.length < groups.length

  // Backfill can add thousands of rows, so render days in pages as the list is scrolled.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) setPages((p) => p + 1) }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, shown.length])

  return (
    <div className="safe-top safe-bottom mx-auto min-h-dvh max-w-md">
      <PageHeader title="History" />
      <main className="px-6 pb-8">
        {groups.length === 0 ? (
          <p className="py-24 text-center text-muted">No history yet. Start tracking your journey!</p>
        ) : (
          shown.map(([key, hits]) => (
            <section key={key} className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">{dayLabel(key)}</h2>
                <span className="text-sm font-semibold text-muted">{hits.length} {hits.length === 1 ? 'hit' : 'hits'}</span>
              </div>
              <ul>
                {hits.map((h) => (
                  <HitRow key={h.id} hit={h} editing={editingId === h.id} onEdit={() => setEditingId(h.id)} onDone={() => setEditingId(null)} />
                ))}
              </ul>
            </section>
          ))
        )}
        {more && <div ref={sentinel} className="py-6 text-center text-sm text-muted">Loading more…</div>}
      </main>
    </div>
  )
}
