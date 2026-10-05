import type { ReactNode } from 'react'
import { gn, t } from '@/i18n'
import { getDistricts, getDivisions, getUpazilas } from './geo'
import { UnionCombobox } from './UnionCombobox'

export interface GeoValue {
  division: string
  district: string
  upazila: string
  /** শুধু union=true হলে দেখানো হয় */
  union_name: string
}
export type GeoErrors = Partial<Record<keyof GeoValue, string | null | undefined>>

/** RecordForm এর inputClass এর হুবহু (একই চেহারা) */
const INPUT_CLASS =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400'

interface Props {
  value: GeoValue
  onChange: (next: GeoValue) => void
  errors?: GeoErrors
  disabled?: boolean
  /** ৪র্থ স্তর: ইউনিয়ন/পৌরসভা (প্রকল্পের geo_depth = 'union') */
  union?: boolean
  unionRequired?: boolean
  /** ইউনিয়নের লেবেল (প্রকল্পের core_fields থেকে; না দিলে "ইউনিয়ন/পৌরসভা") */
  unionLabel?: string
  /** id: `${idPrefix}-division` … (RecordForm: "f") */
  idPrefix?: string
}

/**
 * বিভাগ → জেলা → উপজেলা (→ ইউনিয়ন) — উপরের স্তর বদলালে নিচেরগুলো খালি হয়। গ্রিডের ভেতরে বসে
 * (প্রতিটি স্তর আলাদা ঘর), RecordForm এর ড্রপডাউনের হুবহু চেহারা ও id। বিভাগ/জেলা/উপজেলা bdGeo.ts থেকে;
 * ইউনিয়ন lazy (UnionCombobox)। মান সবসময় বাংলা (NFC); ইংরেজি মোডে ইংরেজি নাম দেখায়।
 */
export function GeoSelect({ value, onChange, errors = {}, disabled, union = false, unionRequired = false, unionLabel, idPrefix = 'f' }: Props) {
  const set = (k: keyof GeoValue, v: string) => {
    const next = { ...value, [k]: v }
    if (k === 'division') Object.assign(next, { district: '', upazila: '', union_name: '' })
    if (k === 'district') Object.assign(next, { upazila: '', union_name: '' })
    if (k === 'upazila') Object.assign(next, { union_name: '' })
    onChange(next)
  }
  const id = (k: string) => `${idPrefix}-${k}`
  const districts = getDistricts(value.division)
  const upazilas = getUpazilas(value.division, value.district)

  return (
    <>
      <GeoField id={id('division')} label={t('বিভাগ *')} error={errors.division}>
        <select id={id('division')} className={INPUT_CLASS} value={value.division} onChange={(e) => set('division', e.target.value)} disabled={disabled} aria-invalid={!!errors.division}>
          <option value="">{t('বাছুন')}</option>
          {getDivisions().map((d) => (
            <option key={d.name} value={d.name}>
              {gn(d.name)}
            </option>
          ))}
        </select>
      </GeoField>
      <GeoField id={id('district')} label={t('জেলা *')} error={errors.district}>
        <select id={id('district')} className={INPUT_CLASS} value={value.district} onChange={(e) => set('district', e.target.value)} disabled={disabled || !value.division} aria-invalid={!!errors.district}>
          <option value="">{value.division ? t('বাছুন') : t('আগে বিভাগ')}</option>
          {districts.map((d) => (
            <option key={d.name} value={d.name}>
              {gn(d.name)}
            </option>
          ))}
        </select>
      </GeoField>
      <GeoField id={id('upazila')} label={t('উপজেলা *')} error={errors.upazila}>
        <select id={id('upazila')} className={INPUT_CLASS} value={value.upazila} onChange={(e) => set('upazila', e.target.value)} disabled={disabled || !value.district} aria-invalid={!!errors.upazila}>
          <option value="">{value.district ? t('বাছুন') : t('আগে জেলা')}</option>
          {upazilas.map((u) => (
            <option key={u.name} value={u.name}>
              {gn(u.name)}
            </option>
          ))}
        </select>
      </GeoField>
      {union && (
        <GeoField id={id('union')} label={`${unionLabel ?? t('ইউনিয়ন/পৌরসভা')}${unionRequired ? ' *' : ''}`} error={errors.union_name}>
          <UnionCombobox
            id={id('union')}
            district={value.district}
            upazila={value.upazila}
            value={value.union_name}
            onChange={(v) => onChange({ ...value, union_name: v })}
            disabled={disabled}
            inputClass={INPUT_CLASS}
            invalid={!!errors.union_name}
          />
        </GeoField>
      )}
    </>
  )
}

/** RecordForm › Field এর হুবহু */
function GeoField({ id, label, error, children }: { id: string; label: string; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
