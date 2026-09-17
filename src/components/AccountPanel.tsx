import { useState } from 'react'
import { toast } from './Dialogs'
import { passkeySupported, registerPasskey, sendSignInEmail, signInWithPasskey, signOut, syncEnabled, syncNow, useSession, useSyncStatus, verifySignIn } from '../lib/sync'

const PENDING_KEY = 'quit-pending-email'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode */ } }

const STATUS_LABEL = { disabled: 'Off', 'signed-out': 'Signed out', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline, will retry', error: 'Sync error' } as const

export default function AccountPanel() {
  const session = useSession()
  const sync = useSyncStatus()
  const [email, setEmail] = useState(() => read(PENDING_KEY) ?? '')
  const [sent, setSent] = useState(() => !!read(PENDING_KEY))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>, onError: (m: string) => string = (m) => m) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (e) { setError(onError((e as Error).message)) } finally { setBusy(false) }
  }

  if (!syncEnabled) {
    return <p className="text-[15px] leading-relaxed text-muted">Cloud sync is not set up for this build. Your data is saved on this device only.</p>
  }

  if (session) {
    return (
      <div className="space-y-3">
        <p className="text-[15px] text-muted">Signed in as <span className="text-fg">{session.user.email}</span></p>
        <div className="flex items-center gap-2 text-sm">
          <span className={`inline-block size-2 rounded-full ${sync.status === 'synced' ? 'bg-good' : sync.status === 'error' ? 'bg-red-500' : 'bg-muted'}`} />
          <span>{STATUS_LABEL[sync.status]}</span>
          {sync.lastSyncedAt && sync.status === 'synced' && <span className="text-muted">· {new Date(sync.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          <button className="press ml-auto font-semibold text-accent" onClick={() => void syncNow()}>Sync now</button>
        </div>
        {sync.status === 'error' && <p className="text-sm break-words text-red-500">{sync.msg}</p>}
        <div className="flex gap-3">
          {passkeySupported && (
            <button className="press flex-1 rounded-xl border-2 border-line p-3 text-[15px] font-semibold" disabled={busy}
              onClick={() => void run(async () => { await registerPasskey(); toast('Passkey added') }, (m) => `Could not add passkey: ${m}`)}>
              Add passkey
            </button>
          )}
          <button className="press flex-1 rounded-xl border-2 border-line p-3 text-[15px] font-semibold" onClick={() => void signOut()}>Sign out</button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-xs leading-relaxed text-muted">A passkey lets you sign in next time with Face ID, no email needed. Signing out keeps your data on this device.</p>
      </div>
    )
  }

  if (sent) {
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await verifySignIn(email, code); write(PENDING_KEY, null); setSent(false); setCode(''); toast('Signed in') }, (m) => `Not accepted: ${m}. Links work once and expire, so send a new one if needed.`) }}>
        <p className="text-[15px]">Email sent to <b>{email}</b>.</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
          <li>Open the email. <b className="text-fg">Press and hold "Log In"</b>, then tap <b className="text-fg">Copy Link</b>. Tapping it would open Safari instead of this app.</li>
          <li>Come back here and paste it below. A 6-digit code works too.</li>
        </ol>
        <input className="w-full rounded-xl border-2 border-line bg-bg p-4 font-mono" value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="Paste link or code" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button className="press w-full rounded-xl bg-accent p-4 font-semibold text-white" disabled={busy || code.trim().length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-between text-sm font-semibold text-accent">
          <button type="button" className="press" disabled={busy} onClick={() => void run(async () => { await sendSignInEmail(email); toast('Email re-sent') })}>Resend email</button>
          <button type="button" className="press" onClick={() => { setSent(false); setCode(''); write(PENDING_KEY, null) }}>Use a different email</button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      {passkeySupported && (
        <>
          <button className="press w-full rounded-xl bg-accent p-4 font-semibold text-white" disabled={busy}
            onClick={() => void run(async () => { await signInWithPasskey(); toast('Signed in') }, (m) => `Passkey sign-in failed: ${m}. First time? Use your email below, then add a passkey.`)}>
            Sign in with passkey
          </button>
          <p className="text-center text-xs text-muted">or get a sign-in link by email</p>
        </>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await sendSignInEmail(email); write(PENDING_KEY, email); setSent(true) }) }}>
        <input type="email" required className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-4 py-3" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoCapitalize="none" />
        <button className="press shrink-0 rounded-xl border-2 border-line px-4 font-semibold" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs leading-relaxed text-muted">Sign in to back up your history and use it on more than one device.</p>
    </div>
  )
}
