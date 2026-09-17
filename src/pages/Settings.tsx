import { useState, type ReactNode } from 'react'
import AccountPanel from '../components/AccountPanel'
import { confirmDialog, toast } from '../components/Dialogs'
import { Moon, Sun } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import { dateKey } from '../lib/analytics'
import { exportBackup, useData, type Backup } from '../store/data'

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-[20px] bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const EditButton = ({ onClick }: { onClick: () => void }) => (
  <button className="press -my-2 -mr-2 p-2 font-semibold text-accent" onClick={onClick}>Edit</button>
)

function SaveCancel({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-3">
      <button className="press flex-1 rounded-xl border-2 border-line p-4 font-semibold" onClick={onCancel}>Cancel</button>
      <button className="press flex-1 rounded-xl bg-accent p-4 font-semibold text-white" onClick={onSave}>Save</button>
    </div>
  )
}

const inputClass = 'mb-4 w-full rounded-xl border-2 border-line bg-bg p-4 text-lg font-semibold'
const timeOf = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

function JourneyStartCard() {
  const profile = useData((s) => s.profile)!
  const updateProfile = useData((s) => s.updateProfile)
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  const start = () => { setDate(dateKey(profile.journeyStart)); setTime(timeOf(profile.journeyStart)); setEditing(true) }
  const save = () => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    const t = /^(\d{2}):(\d{2})$/.exec(time)
    if (!d) { toast('Please enter a valid date'); return }
    if (!t) { toast('Please enter a valid time'); return }
    const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
    if (isNaN(at.getTime())) { toast('Invalid date or time'); return }
    if (at.getTime() > Date.now()) { toast('Journey start date cannot be in the future'); return }
    updateProfile({ journeyStart: at.getTime() })
    setEditing(false)
    toast('Journey start date updated')
  }

  return (
    <Card title="Journey Start" action={!editing && <EditButton onClick={start} />}>
      {editing ? (
        <>
          <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="j-date">Date</label>
          <input id="j-date" type="date" className={inputClass} value={date} max={dateKey(Date.now())} onChange={(e) => setDate(e.target.value)} />
          <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="j-time">Time</label>
          <input id="j-time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
          <p className="mb-4 text-xs leading-relaxed text-muted">Hits logged before the new start are hidden, not deleted. Move the date back to see them again.</p>
          <SaveCancel onSave={save} onCancel={() => setEditing(false)} />
        </>
      ) : (
        <p className="leading-6 text-muted">
          {new Date(profile.journeyStart).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </Card>
  )
}

function AveragePuffsCard() {
  const profile = useData((s) => s.profile)!
  const updateProfile = useData((s) => s.updateProfile)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const save = () => {
    const puffs = Number(value)
    if (!/^\d+$/.test(value.trim()) || puffs <= 0 || puffs > 5000) { toast('Please enter a valid number of puffs'); return }
    updateProfile({ averagePuffsPerDay: puffs })
    setEditing(false)
    toast('Settings updated')
  }

  return (
    <Card title="Average Puffs Per Day" action={!editing && <EditButton onClick={() => { setValue(String(profile.averagePuffsPerDay)); setEditing(true) }} />}>
      {editing ? (
        <>
          <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 300" aria-label="Average puffs per day" autoFocus />
          <SaveCancel onSave={save} onCancel={() => setEditing(false)} />
        </>
      ) : (
        <p className="text-muted">{profile.averagePuffsPerDay} puffs</p>
      )}
    </Card>
  )
}

function BackupCard() {
  const importBackup = useData((s) => s.importBackup)

  const doExport = async () => {
    const s = useData.getState()
    const name = `quit-backup-${dateKey(Date.now())}.json`
    const file = new File([JSON.stringify(exportBackup(s))], name, { type: 'application/json' })
    // On iPhone the share sheet ("Save to Files") is the reliable way to get a file out of a home-screen app.
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }

  const doImport = async (f: File) => {
    try {
      const b = JSON.parse(await f.text()) as Backup
      if (b.app !== 'quit-vaping' || b.version !== 1 || !Array.isArray(b.hits)) throw new Error('This is not a Quit. backup file')
      const ok = await confirmDialog({ title: 'Import backup?', message: `Adds ${b.hits.length} records from ${new Date(b.exportedAt).toLocaleDateString()} and replaces your journey settings. Records already here are kept.`, confirmLabel: 'Import' })
      if (!ok) return
      importBackup(b)
      toast('Backup imported')
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`)
    }
  }

  return (
    <Card title="Backup">
      <div className="flex gap-3">
        <button className="press flex-1 rounded-xl border-2 border-line p-3 font-semibold" onClick={() => void doExport()}>Export</button>
        <label className="press flex-1 cursor-pointer rounded-xl border-2 border-line p-3 text-center font-semibold">
          Import
          <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f) }} />
        </label>
      </div>
    </Card>
  )
}

export default function Settings() {
  const theme = useData((s) => s.theme)
  const toggleTheme = useData((s) => s.toggleTheme)
  const profile = useData((s) => s.profile)!
  const backfillHistory = useData((s) => s.backfillHistory)
  const isDark = theme === 'dark'
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

  const backfill = async () => {
    const ok = profile.hasBackfilled
      ? await confirmDialog({ title: 'Already Backfilled', message: 'You’ve already backfilled your history. Would you like to redo it? This will replace the existing backfill data.', confirmLabel: 'Redo', destructive: true })
      : await confirmDialog({ title: 'Backfill History', message: `This will generate 30 days of vaping history before your quit date based on your average of ${profile.averagePuffsPerDay} hits/day. This won’t affect your streak or stats.`, confirmLabel: 'Backfill' })
    if (!ok) return
    backfillHistory()
    toast('History backfilled')
  }

  return (
    <div className="safe-top safe-bottom mx-auto min-h-dvh max-w-md">
      <PageHeader title="Settings" />
      <main className="px-6 pb-8">
        <Card title="Theme">
          <button className="press flex w-full items-center gap-3 rounded-xl border-2 border-line bg-bg p-4 font-semibold" onClick={toggleTheme}>
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </Card>

        <JourneyStartCard />
        <AveragePuffsCard />

        <section className="mt-4 mb-4 rounded-[20px] bg-card p-6">
          <h2 className="mb-3 font-bold">About This Setting</h2>
          <p className="text-sm leading-[22px] text-muted">This number is used to calculate how many puffs you’re avoiding since you started your journey. Update it if your average has changed.</p>
        </section>

        <Card title="Account & Sync"><AccountPanel /></Card>
        <BackupCard />

        {!standalone && (
          <Card title="Install on iPhone">
            <p className="text-sm leading-relaxed text-muted">In Safari, tap <b className="text-fg">Share</b> then <b className="text-fg">Add to Home Screen</b>. It opens full screen like a normal app and works offline.</p>
          </Card>
        )}

        <button className="press mt-2 mb-3 w-full rounded-2xl border border-line p-4 text-[15px] font-semibold" onClick={() => void backfill()}>
          <span className={profile.hasBackfilled ? 'text-muted' : ''}>{profile.hasBackfilled ? 'History Backfilled ✓' : 'Backfill History'}</span>
        </button>

        <button
          className="press mx-auto block p-2 text-center text-xs text-muted"
          onClick={async () => { try { for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.update() } catch { /* offline */ } window.location.reload() }}
        >
          V2.0 · build {__BUILD_TIME__} · tap to check for updates
        </button>
      </main>
    </div>
  )
}
