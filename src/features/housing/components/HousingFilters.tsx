import { t, gn } from '@/i18n'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { toBanglaNumber } from '@/lib/banglaNumber'
import type { ProjectType } from '../../../backend/interfaces/types'
import { useHousingYears } from '../hooks/useHousingYears'
import { EMPTY_FILTERS, hasActiveFilters, MAX_SEARCH_LENGTH, type HousingFilters as Filters } from '../utils/filters'
import { getDistricts, getDivisions, getUpazilas } from '../utils/geo'

interface Props {
  projectType: ProjectType
  value: Filters
  /** যেকোনো ফিল্টার বদলালে (নামের সার্চ debounce এর পরে) */
  onChange: (next: Filters) => void
}

const SEARCH_DEBOUNCE_MS = 500

const selectClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

/**
 * ফিল্টার বার: সাল (HousingApi.years থেকে), বিভাগ → জেলা → উপজেলা (স্থির তালিকা, cascading), নাম খোঁজা (৫০০ms debounce),
 * "ফিল্টার মুছুন"। অবস্থা parent (URL) এ থাকে; এই কম্পোনেন্ট শুধু সার্চ বক্সের অস্থায়ী টেক্সট রাখে।
 */
export function HousingFilters({ projectType, value, onChange }: Props) {
  const years = useHousingYears(projectType)
  const id = useId()

  // ---- নামের সার্চ: লোকাল টেক্সট + debounce ----
  const [text, setText] = useState(value.q)
  const [syncedQ, setSyncedQ] = useState(value.q)
  if (value.q !== syncedQ) {
    // বাইরে থেকে q বদলালে (যেমন "ফিল্টার মুছুন", Back বাটন) ইনপুট সিঙ্ক — রেন্ডারের সময় state adjust
    setSyncedQ(value.q)
    setText(value.q)
  }
  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === value.q.trim()) return
    const t = setTimeout(() => onChange({ ...value, q: trimmed }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text, value, onChange])

  const divisions = getDivisions()
  const districts = getDistricts(value.division)
  const upazilas = getUpazilas(value.division, value.district)
  const active = hasActiveFilters(value)
  const activeCount = [value.year, value.division, value.district, value.upazila, value.q].filter(Boolean).length
  // মোবাইলে (sm এর নিচে) ফিল্টার ডিফল্টে ভাঁজ করা — তালিকা দ্রুত দেখা যায়; ফিল্টার সক্রিয় থাকলে খোলা
  const [mobileOpen, setMobileOpen] = useState(active)
  const panelId = `${id}-panel`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={panelId}
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex h-10 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-semibold text-slate-800"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-brand-700">
            <path d="M3 5h18l-7 8v5l-4 2v-7z" />
          </svg>
          {t('ফিল্টার')}
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">{t('{n} টি সক্রিয়', { n: formatBanglaNumber(activeCount) })}</span>
          )}
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto h-5 w-5 text-slate-400 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {active && (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-red-700">
            {t('মুছুন')}
          </button>
        )}
      </div>
      <div id={panelId} className={`${mobileOpen ? 'mt-3 grid' : 'hidden'} grid-cols-1 gap-3 sm:mt-0 sm:grid sm:grid-cols-2 lg:grid-cols-5`}>
        <Field id={`${id}-year`} label={t('সাল')}>
          <select
            id={`${id}-year`}
            className={selectClass}
            value={value.year ?? ''}
            disabled={years.status === 'loading'}
            onChange={(e) => onChange({ ...value, year: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{years.status === 'loading' ? t('লোড হচ্ছে…') : t('সব সাল')}</option>
            {years.years.map((y) => (
              <option key={y} value={y}>
                {toBanglaNumber(y)}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${id}-division`} label={t('বিভাগ')}>
          <select
            id={`${id}-division`}
            className={selectClass}
            value={value.division}
            onChange={(e) => onChange({ ...value, division: e.target.value, district: '', upazila: '' })}
          >
            <option value="">{t('সব বিভাগ')}</option>
            {divisions.map((d) => (
              <option key={d.name} value={d.name}>
                {gn(d.name)}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${id}-district`} label={t('জেলা')}>
          <select
            id={`${id}-district`}
            className={selectClass}
            value={value.district}
            disabled={!value.division}
            onChange={(e) => onChange({ ...value, district: e.target.value, upazila: '' })}
          >
            <option value="">{value.division ? t('সব জেলা') : t('আগে বিভাগ বাছুন')}</option>
            {districts.map((d) => (
              <option key={d.name} value={d.name}>
                {gn(d.name)}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${id}-upazila`} label={t('উপজেলা')}>
          <select
            id={`${id}-upazila`}
            className={selectClass}
            value={value.upazila}
            disabled={!value.district}
            onChange={(e) => onChange({ ...value, upazila: e.target.value })}
          >
            <option value="">{value.district ? t('সব উপজেলা') : t('আগে জেলা বাছুন')}</option>
            {upazilas.map((u) => (
              <option key={u.name} value={u.name}>
                {gn(u.name)}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${id}-q`} label={t('উপকারভোগীর নাম')}>
          <div className="relative">
            <input
              id={`${id}-q`}
              type="search"
              className={`${selectClass} pr-9`}
              placeholder={t('নাম লিখে খুঁজুন')}
              value={text}
              maxLength={MAX_SEARCH_LENGTH}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
        </Field>
      </div>

      <div className={`${mobileOpen ? 'flex' : 'hidden'} mt-3 items-center justify-between gap-3 sm:flex`}>
        <p className="text-xs text-slate-500">
          {years.status === 'error' ? t('সালের তালিকা লোড হয়নি।') : active ? t('ফিল্টার প্রয়োগ করা আছে।') : ' '}
        </p>
        <button
          type="button"
          disabled={!active}
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          {t('ফিল্টার মুছুন')}
        </button>
      </div>
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  )
}
