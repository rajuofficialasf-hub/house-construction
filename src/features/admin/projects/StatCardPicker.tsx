import { lt, t } from '@/i18n'
import { useState } from 'react'
import type { GeoLevel, Project, StatCardDef, StatCardKind } from '@/backend'
import { newCardId, suggestCard } from '@/features/projects/stats/statCards'
import { secondaryButton, selectClass } from '../ui/styles'

const KINDS: { kind: StatCardKind; label: string; hint: string }[] = [
  { kind: 'count', label: 'গণনা', hint: 'মোট রেকর্ড (উপকারভোগী)' },
  { kind: 'geo', label: 'এলাকা কভার', hint: 'কতগুলো বিভাগ/জেলা/উপজেলা/ইউনিয়নে' },
  { kind: 'sum', label: 'যোগফল', hint: 'টাকা বা সংখ্যার ফিল্ডের মোট' },
  { kind: 'distinct', label: 'ক্যাটাগরি সংখ্যা', hint: 'ক্যাটাগরি ফিল্ডে কত ধরনের মান' },
]

/**
 * নতুন পরিসংখ্যান কার্ড বাছাই (পরিকল্পনা M-ধাপ ৮): চার ধরন — গণনা, এলাকা কভার (স্তর), যোগফল (টাকা/সংখ্যার ফিল্ড),
 * ক্যাটাগরি সংখ্যা (ক্যাটাগরি ফিল্ড); লেবেল ও আইকন নিজে প্রস্তাবিত (পরে বদলানো যায়)। গ্রুপে শুধু গণনা ও এলাকা।
 */
export function StatCardPicker({ project, cards, onAdd, disabled }: { project: Project; cards: StatCardDef[]; onAdd: (c: StatCardDef) => void; disabled: boolean }) {
  const [kind, setKind] = useState<StatCardKind>('count')
  const [level, setLevel] = useState<GeoLevel>('district')
  const fields = project.fields.filter((f) => f.is_active && f.visibility === 'public')
  const sumFields = fields.filter((f) => f.type === 'money' || f.type === 'number')
  const catFields = fields.filter((f) => f.type === 'category')
  const [fieldKey, setFieldKey] = useState('')
  const options = kind === 'sum' ? sumFields : kind === 'distinct' ? catFields : []
  const chosen = options.find((f) => f.key === fieldKey) ?? options[0]
  const levels: GeoLevel[] = project.geo_depth === 'union' ? ['division', 'district', 'upazila', 'union'] : ['division', 'district', 'upazila']
  const kinds = project.is_group ? KINDS.filter((k) => k.kind === 'count' || k.kind === 'geo') : KINDS
  const canAdd = !disabled && (kind === 'count' || kind === 'geo' || !!chosen)

  const add = () => {
    const s = suggestCard(project, kind, { level, field: chosen })
    const part = kind === 'geo' ? level : kind === 'count' ? '' : chosen?.key
    onAdd({ id: newCardId(cards, kind, part), kind, ...(kind === 'geo' ? { level } : {}), ...(kind === 'sum' || kind === 'distinct' ? { field: chosen!.key } : {}), ...s })
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-4">
      <p className="text-sm font-semibold text-slate-800">{t('নতুন কার্ড')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {kinds.map((k) => (
          <label key={k.kind} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${kind === k.kind ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
            <input type="radio" name="card-kind" className="mt-0.5 h-4 w-4 accent-brand-700" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
            <span>
              <span className="block font-medium text-slate-900">{t(k.label)}</span>
              <span className="block text-xs text-slate-500">{t(k.hint)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {kind === 'geo' && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">{t('স্তর')}</span>
            <select className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as GeoLevel)}>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {t({ division: 'বিভাগ', district: 'জেলা', upazila: 'উপজেলা', union: 'ইউনিয়ন' }[l])}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === 'sum' || kind === 'distinct') &&
          (options.length ? (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">{t('ফিল্ড')}</span>
              <select className={selectClass} value={chosen?.key ?? ''} onChange={(e) => setFieldKey(e.target.value)}>
                {options.map((f) => (
                  <option key={f.key} value={f.key}>
                    {lt(f, 'label')}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-amber-800">{kind === 'sum' ? t('আগে একটি টাকা বা সংখ্যার পাবলিক ফিল্ড যোগ করুন ("ফিল্ড" ট্যাব)।') : t('আগে একটি ক্যাটাগরি পাবলিক ফিল্ড যোগ করুন ("ফিল্ড" ট্যাব)।')}</p>
          ))}
        <button type="button" className={secondaryButton} disabled={!canAdd} onClick={add}>
          <span aria-hidden="true">+</span> {t('কার্ড যোগ করুন')}
        </button>
      </div>
    </div>
  )
}
