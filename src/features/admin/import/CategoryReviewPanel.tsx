import { pick, t } from '@/i18n'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { nearDuplicates } from '@/lib/fuzzyMatch'
import { nfc } from '@/features/geo/geo'
import type { ImportFieldDef } from './importFields'

interface Props {
  /** ম্যাপ করা ক্যাটাগরি ফিল্ড */
  fields: ImportFieldDef[]
  /** ফিল্ড-id → শীটের প্রতিটি সারির লেখা */
  sheetValues: Record<string, string[]>
  /** ফিল্ডের key → ডাটাবেসে আগে থেকে থাকা মান (project_field_usage) */
  existing: Record<string, { value: string; n: number }[]> | null
  /** ফিল্ডের key → { শীটের মান → যে বানানে } */
  fixes: Record<string, Record<string, string>>
  onChange: (fieldKey: string, from: string, to: string | null) => void
}

const norm = (s: string) => nfc(s).replace(/\s+/g, ' ')

/**
 * ক্যাটাগরির মান যাচাই (M-ধাপ ১১, **ঐচ্ছিক — ইম্পোর্ট আটকায় না**): শীটের প্রতিটি মান কত সারিতে, কোনগুলো ডাটাবেসে
 * আগে থেকেই আছে, আর কাছাকাছি বানান ("গাভী"/"গাভি") পাশাপাশি — একটি বেছে "এক বানানে আনুন" দিলে ইম্পোর্টে শীটের
 * সেই মান বদলে যায় (ডাটাবেসের মান নয়)। নিচে "মোট ক্যাটাগরি (ইম্পোর্টের পর)"।
 */
export function CategoryReviewPanel({ fields, sheetValues, existing, fixes, onChange }: Props) {
  if (!fields.length) return null
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{t('ক্যাটাগরির মান (ঐচ্ছিক যাচাই — ইম্পোর্ট আটকায় না)')}</p>
      {fields.map((f) => {
        const key = f.id.slice(2)
        const counts = new Map<string, number>()
        for (const v of sheetValues[f.id] ?? []) {
          const s = norm(v)
          if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
        }
        const db = new Map((existing?.[key] ?? []).map((x) => [x.value, x.n]))
        const fx = fixes[key] ?? {}
        const sheet = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, 'bn'))
        const pairs = nearDuplicates([...sheet, ...db.keys()]).filter((p) => (counts.has(p.a) || counts.has(p.b)) && !fx[p.a] && !fx[p.b])
        const after = new Set([...db.keys(), ...sheet.map((s) => fx[s] ?? s)])
        return (
          <div key={f.id} className="mt-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {pick(f.label_bn, f.label_en)}{' '}
              <span className="font-normal text-slate-500">· {t('মোট ক্যাটাগরি (ইম্পোর্টের পর): {n}', { n: formatBanglaNumber(after.size) })}</span>
            </h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {sheet.map((s) => (
                <li key={s} className={`rounded-full border px-3 py-1 text-sm ${fx[s] ? 'border-slate-200 bg-slate-50 text-slate-400 line-through' : db.has(s) ? 'border-green-200 bg-green-50 text-green-900' : 'border-slate-200 bg-white text-slate-800'}`}>
                  {s} <span className="tabular-nums text-slate-500">· {formatBanglaNumber(counts.get(s) ?? 0)}</span>
                  {db.has(s) && !fx[s] && <span className="ml-1 text-xs text-green-700">✓ {t('ডাটাবেসে আছে')}</span>}
                  {!db.has(s) && !fx[s] && <span className="ml-1 text-xs text-sky-700">{t('নতুন')}</span>}
                </li>
              ))}
            </ul>
            {Object.entries(fx).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {Object.entries(fx).map(([from, to]) => (
                  <li key={from}>
                    «{from}» → «{to}»{' '}
                    <button type="button" onClick={() => onChange(key, from, null)} className="ml-1 text-red-700 underline-offset-2 hover:underline">
                      {t('বাতিল')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pairs.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">{t('কাছাকাছি বানান — একই জিনিস হলে কোনটি থাকবে বেছে দিন:')}</p>
                <ul className="mt-2 space-y-2">
                  {pairs.map((p) => {
                    const label = (v: string) => {
                      const parts = [t('শীটে {n}', { n: formatBanglaNumber(counts.get(v) ?? 0) })]
                      if (db.has(v)) parts.push(t('ডাটাবেসে {n}', { n: formatBanglaNumber(db.get(v) ?? 0) }))
                      return '«' + v + '» (' + parts.join(', ') + ')'
                    }
                    return (
                      <li key={`${p.a}|${p.b}`} className="flex flex-wrap items-center gap-2 text-sm text-amber-950">
                        <span>
                          {label(p.a)} · {label(p.b)}
                        </span>
                        {[p.a, p.b].map((keep) => {
                          const drop = keep === p.a ? p.b : p.a
                          // শুধু শীটের মান বদলানো যায় (ডাটাবেসের মান বদলাতে রেকর্ড-পাতার "এক বানানে আনুন")
                          if (!counts.has(drop)) return null
                          return (
                            <button key={keep} type="button" onClick={() => onChange(key, drop, keep)} className="inline-flex min-h-9 items-center rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                              {t('এক বানানে আনুন: «{v}»', { v: keep })}
                            </button>
                          )
                        })}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
