import { useEffect } from 'react'
import { create } from 'zustand'

interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  destructive?: boolean
  resolve: (ok: boolean) => void
}

interface DialogState {
  confirm: ConfirmRequest | null
  toast: { text: string; id: number; action?: ToastAction; duration: number } | null
}

interface ToastAction { label: string; run: () => void }

const useDialogs = create<DialogState>(() => ({ confirm: null, toast: null }))

/** In-app replacement for Alert.alert with Cancel / OK buttons (Alert.alert does nothing on the web). */
export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useDialogs.setState({ confirm: { ...opts, resolve } }))
}

export function toast(text: string, opts: { action?: ToastAction; duration?: number } = {}) {
  useDialogs.setState({ toast: { text, id: Date.now(), action: opts.action, duration: opts.duration ?? (opts.action ? 6000 : 2200) } })
}

export function DialogHost() {
  const { confirm, toast: t } = useDialogs()

  useEffect(() => {
    if (!t) return
    const timer = setTimeout(() => useDialogs.setState({ toast: null }), t.duration)
    return () => clearTimeout(timer)
  }, [t])

  const close = (ok: boolean) => {
    confirm?.resolve(ok)
    useDialogs.setState({ confirm: null })
  }

  return (
    <>
      {confirm && (
        <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => close(false)}>
          <div
            role="alertdialog"
            aria-labelledby="confirm-title"
            className="sheet-up safe-bottom w-full max-w-md rounded-t-3xl bg-card px-6 pt-6 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-bold">{confirm.title}</h2>
            {confirm.message && <p className="mt-2 text-[15px] leading-relaxed text-muted">{confirm.message}</p>}
            <div className="mt-6 mb-2 flex gap-3">
              <button className="press flex-1 rounded-2xl border-2 border-line p-4 font-semibold" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                autoFocus
                className={`press flex-1 rounded-2xl p-4 font-semibold text-white ${confirm.destructive ? 'bg-red-600' : 'bg-accent'}`}
                onClick={() => close(true)}
              >
                {confirm.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      {t && (
        <div key={t.id} className="fade-in pointer-events-none fixed inset-x-0 z-50 flex justify-center px-6" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <div role="status" className="pointer-events-auto flex items-center gap-4 rounded-full bg-fg py-3 pr-3 pl-5 text-sm font-semibold text-bg shadow-lg">
            <span className={t.action ? '' : 'pr-2'}>{t.text}</span>
            {t.action && (
              <button className="press rounded-full bg-accent px-4 py-1.5 text-white" onClick={() => { t.action!.run(); useDialogs.setState({ toast: null }) }}>
                {t.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
