import { useEffect, type ReactNode } from 'react'
import { X } from './Icons'

/** Bottom sheet over the current page. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div className="fade-in fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="sheet-up safe-bottom max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card px-6 pt-5 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="press -mr-2 rounded-full p-2 text-muted" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
