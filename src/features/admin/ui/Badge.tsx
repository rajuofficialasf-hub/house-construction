import type { ReactNode } from 'react'

const TONES = {
  green: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-100 text-amber-900 ring-amber-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  blue: 'bg-sky-100 text-sky-800 ring-sky-200',
} as const

/** ছোট লেবেল-চিপ: প্রকাশিত/খসড়া, "ইংরেজি নেই" ইত্যাদি */
export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
}
