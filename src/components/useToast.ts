import { createContext, useContext } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastOptions {
  type?: ToastType
  /** ms; ডিফল্ট ৪০০০ (এরর ৬০০০); ০ = হাতে বন্ধ করা পর্যন্ত */
  duration?: number
}

export interface ToastApi {
  toast: (message: string, opts?: ToastOptions) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** বাংলা টোস্ট নোটিফিকেশন — <ToastProvider> (components/Toast.tsx) এর ভেতরে ব্যবহার */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() অবশ্যই <ToastProvider> এর ভেতরে ব্যবহার করতে হবে')
  return ctx
}
