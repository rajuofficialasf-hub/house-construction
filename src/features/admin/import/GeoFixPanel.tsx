import { gn, t } from '@/i18n'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { candidatesFor, geoFixKey } from '@/features/geo/geoMatch'
import { gnUnion, unionsOf, type UnionData } from '@/features/geo/unions'
import type { ImportRow, UnresolvedGeo } from './importAnalyze'

const LEVEL = { division: 'বিভাগ', district: 'জেলা', upazila: 'উপজেলা', union: 'ইউনিয়ন' } as const

/**
 * না-মেলা ভৌগোলিক নামের প্যানেল (৪ স্তর): পরামর্শ + সম্পূর্ণ তালিকা থেকে বাছাই; একবার ঠিক করলে একই মানের সব সারিতে।
 * বিভাগ/জেলা/উপজেলা না মিললে সারি বাদ যায় (লাল); ইউনিয়ন তালিকায় না থাকলে ঐচ্ছিক (হলুদ) — লেখাটিই রাখা যায়।
 */
export function GeoFixPanel({ items, rows, fixes, unions, onFix }: { items: UnresolvedGeo[]; rows: ImportRow[]; fixes: Record<string, string>; unions: UnionData | null; onFix: (key: string, value: string) => void }) {
  const required = items.filter((x) => !x.optional)
  const optional = items.filter((x) => x.optional)
  const item = (it: UnresolvedGeo) => {
    // এই মানের প্রথম সারি থেকে parent প্রসঙ্গ
    const sample = rows.find((r) => (it.level === 'union' ? r.geo.upazila === it.parent && r.geo.union?.status === 'unlisted' : r.geo.unresolved.some((u) => u.level === it.level && u.raw === it.raw)))
    const division = sample?.geo.division ?? null
    const district = sample?.geo.district ?? null
    const options = it.level === 'union' ? unionsOf(unions, district, it.parent).map((x) => x[0]) : candidatesFor(it.level, division, district)
    const key = geoFixKey(it.level, it.raw, it.parent)
    const show = (s: string) => (it.level === 'union' ? gnUnion(district, it.parent, s) : gn(s))
    return (
      <li key={it.key} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-2 text-sm">
        <span className={`rounded px-1.5 text-xs ${it.optional ? 'bg-yellow-100 text-yellow-900' : 'bg-amber-100 text-amber-900'}`}>{t(LEVEL[it.level])}</span>
        <span className="font-medium text-slate-800">"{it.raw}"</span>
        <span className="text-xs text-slate-500">
          ({t('{n} সারি', { n: formatBanglaNumber(it.count) })}
          {it.parent ? `, ${gn(it.parent)}` : ''})
        </span>
        <span className="text-slate-400">→</span>
        <select className="h-9 min-w-[12rem] rounded-md border border-slate-300 bg-white px-2 text-sm" value={fixes[key] ?? ''} onChange={(e) => onFix(key, e.target.value)} aria-label={t('"{raw}" এর সঠিক {level}', { raw: it.raw, level: t(LEVEL[it.level]) })}>
          <option value="">{it.optional ? t('— যেমন লেখা তেমন রাখুন —') : t('— বেছে নিন —')}</option>
          {it.suggestions.length > 0 && (
            <optgroup label={t('পরামর্শ')}>
              {it.suggestions.map((s) => (
                <option key={`s-${s}`} value={s}>
                  {show(s)}
                </option>
              ))}
            </optgroup>
          )}
          {options.length > 0 && (
            <optgroup label={t('সম্পূর্ণ তালিকা')}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {show(o)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </li>
    )
  }
  return (
    <>
      {required.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{t('ভৌগোলিক নাম মেলেনি — সঠিক নাম বেছে দিন ({n} টি স্বতন্ত্র মান)', { n: formatBanglaNumber(required.length) })}</p>
          <ul className="mt-3 space-y-2">{required.map(item)}</ul>
        </div>
      )}
      {optional.length > 0 && (
        <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-semibold text-yellow-900">{t('ইউনিয়ন তালিকায় নেই ({n} টি) — ঐচ্ছিক: ঠিক থাকলে রেখে দিন, নইলে তালিকা থেকে বাছুন', { n: formatBanglaNumber(optional.length) })}</p>
          <ul className="mt-3 space-y-2">{optional.map(item)}</ul>
        </div>
      )}
    </>
  )
}
