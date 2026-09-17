import { useEffect, useMemo, useState, type ReactNode } from 'react'
import AccountPanel from '../components/AccountPanel'
import { confirmDialog, toast } from '../components/Dialogs'
import { ChevronDown, ChevronUp, Moon, Sun, X } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import { costPerPuff, countBetween, dailyLimit, dateKey, formatMoney, nextLimitDrop, startOfDay } from '../lib/analytics'
import { useHitData } from '../lib/hooks'
import { currentSubscription, disablePush, enablePush, isStandalone, pushAvailability, sendTestNotification } from '../lib/push'
import { deleteAccount, deleteCloudData, syncEnabled, useSession } from '../lib/sync'
import { exportBackup, useData, type Backup } from '../store/data'

function Card({ title, id, action, children }: { title: string; id?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mb-4 scroll-mt-4 rounded-[20px] bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const SectionLabel = ({ children }: { children: string }) => <h2 className="mt-8 mb-3 px-1 text-xs font-semibold tracking-widest text-muted">{children}</h2>

const EditButton = ({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) => (
  <button className="press -my-2 -mr-2 p-2 font-semibold text-accent" onClick={onClick}>{label}</button>
)

function SaveCancel({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-3">
      <button type="button" className="press flex-1 rounded-xl border-2 border-line p-4 font-semibold" onClick={onCancel}>Cancel</button>
      <button type="button" className="press flex-1 rounded-xl bg-accent p-4 font-semibold text-white" onClick={onSave}>Save</button>
    </div>
  )
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-good' : 'bg-chip'}`}>
      <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

const inputClass = 'mb-4 w-full rounded-xl border-2 border-line bg-bg p-4 text-lg font-semibold'
const labelClass = 'mb-2 block text-sm font-semibold text-muted'
const timeOf = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const wholeNumber = (v: string, max = 5000) => (/^\d+$/.test(v.trim()) && Number(v) <= max ? Number(v) : null)

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
          <label className={labelClass} htmlFor="j-date">Date</label>
          <input id="j-date" type="date" className={inputClass} value={date} max={dateKey(Date.now())} onChange={(e) => setDate(e.target.value)} />
          <label className={labelClass} htmlFor="j-time">Time</label>
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
    const puffs = wholeNumber(value)
    if (!puffs) { toast('Please enter a valid number of puffs'); return }
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
        <>
          <p className="text-muted">{profile.averagePuffsPerDay} puffs</p>
          <p className="mt-3 text-sm leading-[22px] text-muted">Used to calculate how many puffs you’re avoiding since you started your journey. Update it if your average has changed.</p>
        </>
      )}
    </Card>
  )
}

function GoalCard() {
  const profile = useData((s) => s.profile)!
  const updateSettings = useData((s) => s.updateSettings)
  const { real } = useHitData()
  const taper = profile.settings.taper
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState('')
  const [drop, setDrop] = useState('')
  const now = Date.now()

  const begin = () => {
    const recent = Math.round(countBetween(real, startOfDay(now, -6)) / 7)
    const base = taper?.startLimit ?? (recent || profile.averagePuffsPerDay)
    setStart(String(base))
    setDrop(String(taper?.weeklyDrop ?? Math.max(1, Math.round(base * 0.1))))
    setEditing(true)
  }
  const s = wholeNumber(start), d = wholeNumber(drop)
  const weeksToZero = s && d ? Math.ceil(s / d) : null

  const save = () => {
    if (!s || d === null) { toast('Enter whole numbers for both'); return }
    // Editing keeps the original start date only if the numbers did not change, so the schedule restarts from today otherwise.
    const startedAt = taper && taper.startLimit === s && taper.weeklyDrop === d ? taper.startedAt : Date.now()
    updateSettings({ taper: { startLimit: s, weeklyDrop: d, startedAt } })
    setEditing(false)
    toast('Goal saved')
  }

  const limit = dailyLimit(taper, now)
  const nextDrop = nextLimitDrop(taper, now)

  return (
    <Card title="Daily Limit Goal" id="goal" action={!editing && <EditButton onClick={begin} label={taper ? 'Edit' : 'Set up'} />}>
      {editing ? (
        <>
          <label className={labelClass} htmlFor="g-start">Start at (hits per day)</label>
          <input id="g-start" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" pattern="[0-9]*" />
          <label className={labelClass} htmlFor="g-drop">Lower it every week by</label>
          <input id="g-drop" className={inputClass} value={drop} onChange={(e) => setDrop(e.target.value)} inputMode="numeric" pattern="[0-9]*" />
          <p className="mb-4 text-sm text-muted">{weeksToZero ? `Reaches zero in about ${weeksToZero} ${weeksToZero === 1 ? 'week' : 'weeks'}.` : d === 0 ? 'A fixed limit that never drops.' : ' '}</p>
          <SaveCancel onSave={save} onCancel={() => setEditing(false)} />
        </>
      ) : taper ? (
        <>
          <p className="text-muted">Today’s limit: <b className="text-fg">{limit}</b> hits{nextDrop ? `, dropping to ${dailyLimit(taper, nextDrop)} on ${new Date(nextDrop).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}.</p>
          <p className="mt-1 text-sm text-muted">Started at {taper.startLimit} on {new Date(taper.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, −{taper.weeklyDrop} each week.</p>
          <button className="press mt-3 text-sm font-semibold text-muted" onClick={() => { updateSettings({ taper: null }); toast('Goal turned off') }}>Turn off goal</button>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-muted">Cut down step by step: a daily hit limit that drops every week, shown on the home screen.</p>
      )}
    </Card>
  )
}

function CostCard() {
  const profile = useData((s) => s.profile)!
  const updateSettings = useData((s) => s.updateSettings)
  const cost = profile.settings.cost
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState('')
  const [puffs, setPuffs] = useState('')

  const save = () => {
    const p = Number(price.replace(/[$,\s]/g, ''))
    const n = wholeNumber(puffs, 100_000)
    if (!price.trim() || isNaN(p) || p < 0 || p > 1000) { toast('Enter a valid price'); return }
    if (!n) { toast('Enter how many puffs a pod lasts'); return }
    updateSettings({ cost: { pricePerPod: Math.round(p * 100) / 100, puffsPerPod: n } })
    setEditing(false)
    toast('Cost saved')
  }

  const perPuff = costPerPuff(cost)
  return (
    <Card title="Cost" action={!editing && <EditButton label={cost ? 'Edit' : 'Set up'} onClick={() => { setPrice(cost ? String(cost.pricePerPod) : ''); setPuffs(cost ? String(cost.puffsPerPod) : ''); setEditing(true) }} />}>
      {editing ? (
        <>
          <label className={labelClass} htmlFor="c-price">Price of one pod or disposable ($)</label>
          <input id="c-price" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 20" />
          <label className={labelClass} htmlFor="c-puffs">Puffs it lasts</label>
          <input id="c-puffs" className={inputClass} value={puffs} onChange={(e) => setPuffs(e.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 5000" />
          <SaveCancel onSave={save} onCancel={() => setEditing(false)} />
        </>
      ) : perPuff !== null ? (
        <>
          <p className="text-muted">{formatMoney(cost!.pricePerPod)} for {cost!.puffsPerPod.toLocaleString()} puffs ({formatMoney(perPuff * 100)} per 100 puffs)</p>
          <p className="mt-1 text-sm text-muted">At your old average that was {formatMoney(perPuff * profile.averagePuffsPerDay * 7)} a week.</p>
          <button className="press mt-3 text-sm font-semibold text-muted" onClick={() => updateSettings({ cost: null })}>Remove</button>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-muted">Add what you pay to see money saved on the home screen and in Insights.</p>
      )}
    </Card>
  )
}

function ReasonsListCard() {
  const reasons = useData((s) => s.profile!.settings.reasons)
  const updateSettings = useData((s) => s.updateSettings)
  const [value, setValue] = useState('')

  const set = (next: string[]) => updateSettings({ reasons: next })
  const move = (i: number, by: number) => {
    const next = [...reasons]
    const [r] = next.splice(i, 1)
    next.splice(i + by, 0, r)
    set(next)
  }
  const add = () => {
    const name = value.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (name.length > 40) { toast('Keep it under 40 characters'); return }
    if (reasons.some((r) => r.toLowerCase() === name.toLowerCase())) { toast('That reason is already on the list'); return }
    set([...reasons, name])
    setValue('')
  }

  return (
    <Card title="Reasons">
      <ul className="mb-4 divide-y divide-line">
        {reasons.map((r, i) => (
          <li key={r} className="flex items-center gap-1 py-1.5">
            <span className="flex-1 font-semibold">{r}</span>
            <button className="press p-2 text-muted" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r} up`}><ChevronUp size={20} /></button>
            <button className="press p-2 text-muted" disabled={i === reasons.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r} down`}><ChevronDown size={20} /></button>
            <button className="press p-2 text-accent" disabled={reasons.length === 1} onClick={() => set(reasons.filter((x) => x !== r))} aria-label={`Remove ${r}`}><X size={20} /></button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
        <input className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-4 py-3" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add a reason, e.g. Social" maxLength={40} enterKeyHint="done" />
        <button className="press shrink-0 rounded-xl border-2 border-line px-4 font-semibold" disabled={!value.trim()}>Add</button>
      </form>
      <p className="mt-3 text-xs text-muted">Removing a reason keeps it on hits you already logged.</p>
    </Card>
  )
}

function RemindersCard() {
  const session = useSession()
  const reminders = useData((s) => s.profile!.settings.reminders)
  const updateSettings = useData((s) => s.updateSettings)
  const availability = useMemo(pushAvailability, [])
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void currentSubscription().then((s) => setSubscribed(!!s)).catch(() => setSubscribed(false)) }, [])

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok) } catch (e) { toast((e as Error).message, { duration: 6000 }) } finally { setBusy(false) }
  }
  const setReminders = (r: Partial<typeof reminders>) => updateSettings({ reminders: { ...reminders, ...r } })

  let body: ReactNode
  if (!session) body = <p className="text-sm leading-relaxed text-muted">Sign in above to get reminder notifications.</p>
  else if (availability === 'install-first') body = <p className="text-sm leading-relaxed text-muted">On iPhone, notifications only work in the Home Screen app (iOS 16.4 or later). In Safari tap <b className="text-fg">Share → Add to Home Screen</b>, open it from there and sign in.</p>
  else if (availability === 'unsupported') body = <p className="text-sm leading-relaxed text-muted">This browser can’t show notifications.</p>
  else body = (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div><div className="font-semibold">Notifications on this device</div><div className="text-xs text-muted">{subscribed ? 'On' : 'Off'}</div></div>
        <Switch label="Notifications on this device" checked={!!subscribed} disabled={busy || subscribed === null}
          onChange={(on) => void run(async () => { if (on) await enablePush(session.user.id); else await disablePush(); setSubscribed(on) }, on ? 'Notifications on' : 'Notifications off')} />
      </div>
      <div className={`grid gap-4 ${subscribed ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">Daily check-in</div>
            {reminders.daily
              ? <input type="time" className="mt-1 rounded-lg border border-line bg-bg px-2 py-1" value={reminders.daily} onChange={(e) => e.target.value && setReminders({ daily: e.target.value })} aria-label="Daily check-in time" />
              : <div className="text-xs text-muted">A nudge each day to log honestly</div>}
          </div>
          <Switch label="Daily check-in" checked={!!reminders.daily} onChange={(on) => setReminders({ daily: on ? '20:00' : null })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div><div className="font-semibold">Milestone alerts</div><div className="text-xs text-muted">1 day, 3 days, 1 week… without a hit</div></div>
          <Switch label="Milestone alerts" checked={reminders.milestones} onChange={(on) => setReminders({ milestones: on })} />
        </div>
        <button className="press justify-self-start text-sm font-semibold text-accent" disabled={busy} onClick={() => void run(sendTestNotification, 'Test sent')}>Send a test notification</button>
      </div>
      <p className="text-xs leading-relaxed text-muted">Reminders are checked every 15 minutes, so they can arrive a little after the time you pick. They follow your account, on every device where notifications are on.</p>
    </div>
  )

  return <Card title="Reminders">{body}</Card>
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

function DangerCard() {
  const session = useSession()
  const eraseLocal = useData((s) => s.eraseLocal)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true)
    try { await fn(); toast(done) } catch (e) { toast(`Failed: ${(e as Error).message}`, { duration: 6000 }) } finally { setBusy(false) }
  }

  const eraseDevice = async () => {
    if (!(await confirmDialog({ title: 'Erase this device?', message: session ? 'Removes your journey and history from this device and signs you out. Your cloud copy is kept, so you can sign in again to restore it.' : 'Permanently removes your journey and history from this device. Export a backup first if you might want it back.', confirmLabel: 'Erase', destructive: true }))) return
    await run(async () => { await disablePush().catch(() => {}); eraseLocal(); if (session) await import('../lib/sync').then((m) => m.signOut()) }, 'Data erased')
  }
  const eraseCloud = async () => {
    if (!(await confirmDialog({ title: 'Delete all Quit. data?', message: 'Permanently deletes your journey, history and reminders from the cloud and this device, then signs you out. Other signed-in devices keep their local copy until erased there. This can’t be undone.', confirmLabel: 'Delete data', destructive: true }))) return
    await run(async () => { await disablePush().catch(() => {}); await deleteCloudData() }, 'Your Quit. data was deleted')
  }
  const removeAccount = async () => {
    if (!(await confirmDialog({ title: 'Delete your account?', message: 'Permanently deletes your login and everything saved with it, including data from other apps that use the same sign-in (like FireRed Companion). This can’t be undone.', confirmLabel: 'Delete account', destructive: true }))) return
    await run(async () => { await disablePush().catch(() => {}); await deleteAccount() }, 'Account deleted')
  }

  const button = 'press w-full rounded-xl border-2 border-line p-3 text-left font-semibold text-red-500'
  return (
    <Card title="Erase & Delete">
      <div className="grid gap-3">
        <button className={button} disabled={busy} onClick={() => void eraseDevice()}>Erase data on this device</button>
        {syncEnabled && session && (
          <>
            <button className={button} disabled={busy} onClick={() => void eraseCloud()}>Delete my Quit. data everywhere</button>
            <button className={button} disabled={busy} onClick={() => void removeAccount()}>Delete my account</button>
          </>
        )}
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

        <SectionLabel>JOURNEY</SectionLabel>
        <JourneyStartCard />
        <AveragePuffsCard />
        <GoalCard />
        <CostCard />
        <ReasonsListCard />

        <SectionLabel>ACCOUNT</SectionLabel>
        <Card title="Account & Sync"><AccountPanel /></Card>
        {syncEnabled && <RemindersCard />}

        <SectionLabel>DATA</SectionLabel>
        <BackupCard />
        {!isStandalone() && (
          <Card title="Install on iPhone">
            <p className="text-sm leading-relaxed text-muted">In Safari, tap <b className="text-fg">Share</b> then <b className="text-fg">Add to Home Screen</b>. It opens full screen like a normal app, works offline, and can send reminders.</p>
          </Card>
        )}
        <button className="press mb-4 w-full rounded-2xl border border-line p-4 text-[15px] font-semibold" onClick={() => void backfill()}>
          <span className={profile.hasBackfilled ? 'text-muted' : ''}>{profile.hasBackfilled ? 'History Backfilled ✓' : 'Backfill History'}</span>
        </button>
        <DangerCard />

        <button
          className="press mx-auto block p-2 text-center text-xs text-muted"
          onClick={async () => { try { for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.update() } catch { /* offline */ } window.location.reload() }}
        >
          V2.1 · build {__BUILD_TIME__} · tap to check for updates
        </button>
      </main>
    </div>
  )
}
