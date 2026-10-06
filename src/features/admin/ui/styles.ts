/**
 * এডমিন প্যানেলের শেয়ার্ড স্টাইল (পর্ব ২, M-ধাপ ৭) — ফর্মের ইনপুট রেকর্ড-ফর্মের (RecordForm.tsx) হুবহু,
 * আর টাচ-টার্গেট কমপক্ষে ৪৪px (h-11) যেখানে আঙুলে চাপতে হয়।
 */
export { FIELD_INPUT_CLASS as inputClass } from '@/features/projects/fields'

export const selectClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500'

export const textareaClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500'

/** প্রধান বোতাম (সবুজ) */
export const primaryButton =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50'

/** সাধারণ বোতাম (সাদা) */
export const secondaryButton =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50'

/** ছোট বোতাম (তালিকার সারিতে; উচ্চতা ৪৪px রেখে) */
export const smallButton =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40'

/** সাদা কার্ড */
export const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6'
