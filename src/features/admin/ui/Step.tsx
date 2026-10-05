import { toBanglaNumber } from '@/lib/banglaNumber'
import type { ReactNode } from 'react'

/** উইজার্ডের একটি অংশ: নম্বর-বৃত্ত, শিরোনাম, ছোট বর্ণনা, তারপর ভেতরের ঘরগুলো */
export function Step({ n, title, hint, children }: { n: number; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
          {toBanglaNumber(n)}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}
