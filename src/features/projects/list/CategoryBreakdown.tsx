import { lt, t } from '@/i18n'
import { useState } from 'react'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { formatTaka } from '@/lib/money'
import type { Project, ProjectStats } from '@/backend'

interface Props {
  project: Project
  stats: ProjectStats
  /** বর্তমান ক্যাটাগরি-ফিল্টার (এই ফিল্ডের) */
  active: string
  /** সারিতে ক্লিক: ফিল্টার বসানো/তোলা (একই মান আবার চাপলে তোলা) */
  onSelect: (value: string) => void
}

const SHOW = 6

/**
 * ক্যাটাগরি অনুযায়ী বিতরণ (M-ধাপ ১৩) — প্রকল্পের `display.breakdown_field` (পাবলিক ক্যাটাগরি ফিল্ড), `stats.fields.<key>.by_value`
 * থেকে: প্রতিটি সারিতে মান, CSS বার (লাইব্রেরি নয়), কতজন, আর টাকার ফিল্ডের যোগফল (৳)। সারিতে ক্লিক করলে তালিকা সেই
 * ক্যাটাগরিতে ফিল্টার হয় (?f_<key>=)। ৬টির বেশি হলে "আরো দেখুন"।
 */
export function CategoryBreakdown({ project, stats, active, onSelect }: Props) {
  const [all, setAll] = useState(false)
  const key = project.display?.breakdown_field
  const field = project.fields.find((f) => f.key === key && f.type === 'category' && f.visibility === 'public' && f.is_active)
  const fs = key ? stats.fields?.[key] : undefined
  if (!field || !fs || fs.type !== 'category' || !fs.by_value) return null
  const rows = Object.entries(fs.by_value)
    .map(([value, v]) => ({ value, n: v.n, sums: v.sums ?? {} }))
    .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, 'bn'))
  if (!rows.length) return null
  const money = project.fields.filter((f) => f.type === 'money' && f.visibility === 'public' && f.is_active)
  const max = Math.max(...rows.map((r) => r.n))
  const shown = all ? rows : rows.slice(0, SHOW)
  const label = lt(field, 'label')
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={t('{label} অনুযায়ী', { label })}>
      <h2 className="text-base font-semibold text-slate-800">{t('{label} অনুযায়ী', { label })}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{t('সারিতে চাপলে তালিকা সেই ক্যাটাগরিতে ফিল্টার হবে')}</p>
      <ul className="mt-3 space-y-1.5">
        {shown.map((r) => {
          const on = active === r.value
          return (
            <li key={r.value}>
              <button
                type="button"
                onClick={() => onSelect(on ? '' : r.value)}
                aria-pressed={on}
                className={`grid w-full grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition ${on ? 'bg-brand-50 ring-2 ring-brand-400' : 'hover:bg-slate-50'}`}
              >
                <span className="truncate font-medium text-slate-800" title={r.value}>
                  {r.value}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (r.n / max) * 100)}%` }} />
                </span>
                <span className="text-right whitespace-nowrap tabular-nums text-slate-700">
                  <span className="font-semibold text-slate-900">{formatBanglaNumber(r.n)}</span>
                  {money.map((m) => (r.sums[m.key] ? <span key={m.key} className="ml-2 text-slate-500">{formatTaka(r.sums[m.key])}</span> : null))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > SHOW && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-2 hover:underline" aria-expanded={all}>
          {all ? t('কম দেখান') : t('আরো দেখুন ({n})', { n: formatBanglaNumber(rows.length - SHOW) })}
        </button>
      )}
    </section>
  )
}
