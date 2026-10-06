import { gn, lt, t } from '@/i18n'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import type { Project, ProjectField } from '@/backend'
import { getDistricts, getDivisions, getUpazilas } from '@/features/geo/geo'
import { gnUnion, useUnionData } from '@/features/geo/unions'
import type { StatsState } from '@/features/housing/hooks/useHousingStats'
import { MAX_SEARCH_LENGTH } from '@/features/housing/utils/filters'
import { EMPTY_LIST_FILTERS, hasActiveListFilters, type ProjectListFilters as Filters } from './listFilters'

interface Props {
  project: Project
  /** পেইজের একটিই stats কল — সাল (by_year), ইউনিয়ন (by_union), ক্যাটাগরির মান (fields.<key>.by_value) এখান থেকে */
  stats: StatsState
  /** ফিল্টারে চালু পাবলিক ক্যাটাগরি ফিল্ড */
  categoryFields: ProjectField[]
  value: Filters
  /** যেকোনো ফিল্টার বদলালে (নামের সার্চ debounce এর পরে) */
  onChange: (next: Filters) => void
}

const SEARCH_DEBOUNCE_MS = 500

const selectClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

/**
 * পাবলিক তালিকার ফিল্টার বার (M-ধাপ ১৩; ঘর নির্মাণে আগের HousingFilters এর হুবহু চেহারা): সাল (stats.by_year থেকে —
 * আলাদা API কল নয়), বিভাগ → জেলা → উপজেলা (স্থির তালিকা) → ইউনিয়ন (ডাটায় থাকা মান, stats.by_union — থাকলে তবেই),
 * ক্যাটাগরি ড্রপডাউন (ডাটায় থাকা মান, by_value; URL এ f_<key>), নাম খোঁজা (৫০০ms debounce), "ফিল্টার মুছুন"।
 */
export function ProjectFilters({ project, stats, categoryFields, value, onChange }: Props) {
  const id = useId()
  const data = stats.status === 'ready' ? stats.data : null
  const years = useMemo(() => (data ? Object.keys(data.by_year).map(Number).filter(Number.isFinite).sort((a, b) => b - a) : []), [data])

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
    const timer = setTimeout(() => onChange({ ...value, q: trimmed }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

  // ইউনিয়ন: ডাটায় থাকা মান (জেলা|উপজেলা|ইউনিয়ন), বাছা উপজেলার
  const unions = useMemo(() => {
    if (!data || project.geo_depth !== 'union') return null
    const keys = Object.keys(data.by_union ?? {})
    if (!keys.length) return null // ডাটায় কোনো ইউনিয়নই নেই — ঘর নির্মাণ এখন এমন; ঘর দেখাই না
    return keys
      .map((k) => k.split('|'))
      .filter(([d, u, n]) => n && d === value.district && u === value.upazila)
      .map(([, , n]) => n)
      .sort((a, b) => a.localeCompare(b, 'bn'))
  }, [data, project.geo_depth, value.district, value.upazila])
  useUnionData(!!unions?.length)

  const categoryOptions = (f: ProjectField): { value: string; n: number }[] => {
    const fs = data?.fields?.[f.key]
    if (!fs || fs.type !== 'category' || !fs.by_value) return []
    return Object.entries(fs.by_value)
      .map(([v, x]) => ({ value: v, n: x.n }))
      .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, 'bn'))
  }

  const divisions = getDivisions()
  const districts = getDistricts(value.division)
  const upazilas = getUpazilas(value.division, value.district)
  const active = hasActiveListFilters(value)
  const activeCount = [value.year, value.division, value.district, value.upazila, value.union, value.q, ...Object.values(value.fields)].filter(Boolean).length
  // মোবাইলে (sm এর নিচে) ফিল্টার ডিফল্টে ভাঁজ করা — তালিকা দ্রুত দেখা যায়; ফিল্টার সক্রিয় থাকলে খোলা
  const [mobileOpen, setMobileOpen] = useState(active)
  const panelId = `${id}-panel`
  const setField = (k: string, v: string) => {
    const fields = { ...value.fields }
    if (v) fields[k] = v
    else delete fields[k]
    onChange({ ...value, fields })
  }

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
          <button type="button" onClick={() => onChange(EMPTY_LIST_FILTERS)} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-red-700">
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
            disabled={stats.status === 'loading'}
            onChange={(e) => onChange({ ...value, year: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{stats.status === 'loading' ? t('লোড হচ্ছে…') : t('সব সাল')}</option>
            {years.map((y) => (
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
            onChange={(e) => onChange({ ...value, division: e.target.value, district: '', upazila: '', union: '' })}
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
            onChange={(e) => onChange({ ...value, district: e.target.value, upazila: '', union: '' })}
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
            onChange={(e) => onChange({ ...value, upazila: e.target.value, union: '' })}
          >
            <option value="">{value.district ? t('সব উপজেলা') : t('আগে জেলা বাছুন')}</option>
            {upazilas.map((u) => (
              <option key={u.name} value={u.name}>
                {gn(u.name)}
              </option>
            ))}
          </select>
        </Field>

        {unions && (
          <Field id={`${id}-union`} label={t('ইউনিয়ন/পৌরসভা')}>
            <select id={`${id}-union`} className={selectClass} value={value.union} disabled={!value.upazila || !unions.length} onChange={(e) => onChange({ ...value, union: e.target.value })}>
              <option value="">{!value.upazila ? t('আগে উপজেলা বাছুন') : unions.length ? t('সব ইউনিয়ন') : t('এই উপজেলায় নেই')}</option>
              {unions.map((n) => (
                <option key={n} value={n}>
                  {gnUnion(value.district, value.upazila, n)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {categoryFields.map((f) => {
          const opts = categoryOptions(f)
          const cur = value.fields[f.key] ?? ''
          return (
            <Field key={f.key} id={`${id}-f-${f.key}`} label={lt(f, 'label')}>
              <select id={`${id}-f-${f.key}`} className={selectClass} value={cur} disabled={stats.status === 'loading'} onChange={(e) => setField(f.key, e.target.value)}>
                <option value="">{t('সব')}</option>
                {cur && !opts.some((o) => o.value === cur) && <option value={cur}>{cur}</option>}
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value} ({formatBanglaNumber(o.n)})
                  </option>
                ))}
              </select>
            </Field>
          )
        })}

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
          {stats.status === 'error' ? t('সালের তালিকা লোড হয়নি।') : active ? t('ফিল্টার প্রয়োগ করা আছে।') : ' '}
        </p>
        <button
          type="button"
          disabled={!active}
          onClick={() => onChange(EMPTY_LIST_FILTERS)}
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
