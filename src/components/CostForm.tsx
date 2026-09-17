import { useState } from 'react'
import { useData } from '../store/data'
import { toast } from './Dialogs'

const field = 'mb-4 w-full rounded-xl border-2 border-line bg-bg p-4 text-lg font-semibold'
const label = 'mb-2 block text-sm font-semibold text-muted'

/** Price per pod and puffs per pod, used for every money figure in the app. */
export default function CostForm({ onDone }: { onDone: () => void }) {
  const cost = useData((s) => s.profile?.settings.cost ?? null)
  const updateSettings = useData((s) => s.updateSettings)
  const [price, setPrice] = useState(cost ? String(cost.pricePerPod) : '')
  const [puffs, setPuffs] = useState(cost ? String(cost.puffsPerPod) : '')

  const save = () => {
    const p = Number(price.replace(/[$,\s]/g, ''))
    const n = /^\d+$/.test(puffs.trim()) ? Number(puffs) : NaN
    if (!price.trim() || isNaN(p) || p < 0 || p > 1000) { toast('Enter a valid price'); return }
    if (!n || n > 100_000) { toast('Enter how many puffs a pod lasts'); return }
    updateSettings({ cost: { pricePerPod: Math.round(p * 100) / 100, puffsPerPod: n } })
    toast('Cost saved')
    onDone()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }}>
      <label className={label} htmlFor="c-price">Price of one pod or disposable ($)</label>
      <input id="c-price" className={field} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 20" />
      <label className={label} htmlFor="c-puffs">Puffs it lasts</label>
      <input id="c-puffs" className={field} value={puffs} onChange={(e) => setPuffs(e.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 5000" />
      <div className="flex gap-3">
        <button type="button" className="press flex-1 rounded-xl border-2 border-line p-4 font-semibold" onClick={onDone}>Cancel</button>
        <button className="press flex-1 rounded-xl bg-accent p-4 font-semibold text-white">Save</button>
      </div>
    </form>
  )
}
