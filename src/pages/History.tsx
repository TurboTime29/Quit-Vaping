import { useEffect, useMemo, useRef, useState } from 'react'
import HitSheet from '../components/HitSheet'
import { Pencil, Plus } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import { dateKey, parseDateKey, startOfDay } from '../lib/analytics'
import { useHitData } from '../lib/hooks'
import type { Hit } from '../types'

const DAYS_PER_PAGE = 10

function dayLabel(key: string) {
  const now = Date.now()
  if (key === dateKey(now)) return 'Today'
  if (key === dateKey(startOfDay(now, -1))) return 'Yesterday'
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function HitRow({ hit, onEdit, quitAt }: { hit: Hit; onEdit: () => void; quitAt: number }) {
  const resisted = hit.kind === 'resisted'
  const preQuit = !hit.backfill && !resisted && hit.ts < quitAt
  const detail = [resisted ? 'Resisted' : null, hit.backfill ? 'Backfilled' : preQuit ? 'Before quitting' : null, hit.reason].filter(Boolean).join(' · ')
  return (
    <li>
      <button className="press mb-2 flex w-full items-center rounded-xl bg-card p-4 text-left" onClick={onEdit} aria-label={`Edit ${resisted ? 'win' : 'hit'} at ${new Date(hit.ts).toLocaleTimeString()}`}>
        <span className={`mr-3 size-2 shrink-0 rounded-full ${resisted ? 'bg-good' : hit.backfill || preQuit ? 'bg-muted' : 'bg-accent'}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{new Date(hit.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          {detail && <span className={`mt-1 block text-xs ${resisted ? 'text-good' : 'text-muted'}`}>{detail}</span>}
          {hit.note && <span className="mt-1 block text-sm break-words whitespace-pre-line text-muted">“{hit.note}”</span>}
        </span>
        <Pencil size={18} className="ml-3 shrink-0 text-muted" />
      </button>
    </li>
  )
}

export default function History() {
  const { visible, profile } = useHitData()
  const [editing, setEditing] = useState<Hit | null>(null)
  const [adding, setAdding] = useState(false)
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
      <PageHeader title="History" action={<button className="press -mr-2 flex size-10 items-center justify-center rounded-full" onClick={() => setAdding(true)} aria-label="Add an earlier hit"><Plus size={24} /></button>} />
      <main className="px-6 pb-8">
        {groups.length === 0 ? (
          <p className="py-24 text-center text-muted">No history yet. Start tracking your journey!</p>
        ) : (
          shown.map(([key, records]) => {
            const hits = records.filter((h) => h.kind !== 'resisted').length
            const wins = records.length - hits
            return (
              <section key={key} className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold">{dayLabel(key)}</h2>
                  <span className="text-sm font-semibold text-muted">
                    {hits} {hits === 1 ? 'hit' : 'hits'}{wins > 0 && <span className="text-good"> · {wins} resisted</span>}
                  </span>
                </div>
                <ul>
                  {records.map((h) => <HitRow key={h.id} hit={h} quitAt={profile!.journeyStart} onEdit={() => setEditing(h)} />)}
                </ul>
              </section>
            )
          })
        )}
        {more && <div ref={sentinel} className="py-6 text-center text-sm text-muted">Loading more…</div>}
      </main>
      {editing && <HitSheet key={editing.id} hit={editing} onClose={() => setEditing(null)} />}
      {adding && <HitSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
