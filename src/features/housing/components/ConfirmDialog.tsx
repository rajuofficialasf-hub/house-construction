import { t } from '@/i18n'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** danger: লাল বাটন (ডিলেট) */
  tone?: 'danger' | 'primary'
  busy?: boolean
  /** confirm বাটন নিষ্ক্রিয় (যেমন ইনপুট অবৈধ) */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** নিশ্চিতকরণ ডায়ালগ: Esc/ব্যাকড্রপে বাতিল, ফোকাস বাতিল-বাটনে (ভুল ক্লিক এড়াতে), body স্ক্রল লক */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = t('নিশ্চিত'),
  cancelLabel = t('বাতিল'),
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        {children && <div className="mt-3 text-sm text-slate-700">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 hover:bg-brand-600'
            }`}
          >
            {busy ? t('অপেক্ষা করুন…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
