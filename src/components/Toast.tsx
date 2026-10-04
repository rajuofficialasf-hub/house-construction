import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastApi, type ToastOptions, type ToastType } from './useToast'

interface Toast {
  id: number
  message: string
  type: ToastType
}

const STYLE: Record<ToastType, string> = {
  success: 'border-green-300 bg-green-50 text-green-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-slate-300 bg-white text-slate-800',
}

const ICON: Record<ToastType, string> = { success: '✓', error: '✕', info: 'ℹ' }

/**
 * সাইট-ব্যাপী টোস্ট নোটিফিকেশন (বাংলা বার্তা)। App.tsx এ প্রোভাইডার; useToast() (./useToast.ts) দিয়ে ব্যবহার।
 * নিচে-ডানে স্ট্যাক (সর্বোচ্চ ৫), নিজে মুছে যায়, ক্লিকে বন্ধ, aria-live তে পঠিত।
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  // আনমাউন্টে অপেক্ষমাণ টাইমার বাতিল
  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) clearTimeout(t)
      map.clear()
    }
  }, [])

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = ++seq.current
      const type = opts.type ?? 'info'
      setToasts((t) => [...t.slice(-4), { id, message, type }])
      const duration = opts.duration ?? (type === 'error' ? 6000 : 4000)
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, { type: 'success' }),
      error: (m) => toast(m, { type: 'error' }),
      info: (m) => toast(m, { type: 'info' }),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm shadow-lg ${STYLE[t.type]}`}
          >
            <span aria-hidden="true" className="font-bold">
              {ICON[t.type]}
            </span>
            <span className="flex-1">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
