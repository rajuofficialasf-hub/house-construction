import { gn, pick, t } from '@/i18n'
import { useState } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import type { Project } from '../../../backend/interfaces/types'
import type { StatsState } from '../hooks/useHousingStats'
import type { HousingFilters } from '../utils/filters'
import { UpazilaMap, type MapSelection } from './UpazilaMap'

interface Props {
  project: Project
  /** পেইজের একটিই stats কল (M-ধাপ ১৩) — মানচিত্র আলাদা করে আনে না */
  stats: StatsState
  filters: HousingFilters
  onChange: (next: HousingFilters) => void
}

/**
 * তালিকা পেইজের মানচিত্র প্যানেল — ফিল্টারের উপরে। ডিফল্টে লুকানো: আই-ক্যাচিং ব্যানার-বাটন "মানচিত্রে দেখুন" (উপজেলা/ঘরের সংখ্যাসহ);
 * খুললে stats.by_location থেকে পতাকা-মানচিত্র। উপজেলায় ক্লিক → বিভাগ/জেলা/উপজেলা ফিল্টার (সাল/নাম অটুট); আবার ক্লিক → বাতিল।
 * ফিল্টার থেকে উপজেলা বাছলে মানচিত্র নিজে খুলে হাইলাইট করে না (ব্যবহারকারী চাইলে খুলবেন)।
 */
export function UpazilaMapPanel({ project, stats, filters, onChange }: Props) {
  // এককের শব্দ (unit_bn/unit_en); "ঘর" এর প্রকল্পে আগের বাক্যই ("কোথায় কোথায় ঘর হয়েছে")
  const unit = pick(project.unit_bn, project.unit_en) || t('ঘর')
  const housingWording = !project.unit_bn || project.unit_bn === 'ঘর'
  const [open, setOpen] = useState(false)
  const counts = stats.status === 'ready' ? stats.data.by_location : {}
  const upazilaCount = Object.keys(counts).length
  const total = stats.status === 'ready' ? stats.data.total : 0
  const selected = filters.district && filters.upazila ? { district: filters.district, upazila: filters.upazila } : null

  const select = (sel: MapSelection | null) => {
    if (!sel) onChange({ ...filters, division: '', district: '', upazila: '' })
    else onChange({ ...filters, division: sel.division, district: sel.district, upazila: sel.upazila })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-4 text-left text-white shadow-md transition hover:shadow-lg focus-visible:ring-4 focus-visible:ring-brand-300 focus-visible:outline-none sm:px-6"
      >
        {/* পটভূমির নরম বৃত্ত */}
        <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 transition-transform duration-500 motion-safe:group-hover:scale-125" />
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 motion-safe:group-hover:animate-pulse">
          <MapIcon className="h-7 w-7" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-base font-bold sm:text-lg">{housingWording ? t('মানচিত্রে দেখুন — কোথায় কোথায় ঘর হয়েছে') : t('মানচিত্রে দেখুন — {unit} কোথায় কোথায়', { unit })}</span>
          <span className="block text-sm text-brand-50/90">
            {stats.status === 'ready'
              ? t('{u} উপজেলায় {n} টি {unit} · উপজেলায় ক্লিক করলে তালিকা সেখানে ফিল্টার হবে', { u: formatBanglaNumber(upazilaCount), n: formatBanglaNumber(total), unit })
              : stats.status === 'error'
                ? t('মানচিত্র খুলতে ক্লিক করুন')
                : t('লোড হচ্ছে…')}
          </span>
        </span>
        <span className="relative hidden shrink-0 items-center gap-1.5 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-brand-950 shadow transition group-hover:bg-accent-400 sm:inline-flex">
          {t('মানচিত্র খুলুন')}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
        <span className="relative shrink-0 text-accent-400 sm:hidden" aria-hidden="true">
          ›
        </span>
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={t('মানচিত্র')}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
            <MapIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{housingWording ? t('কোথায় কোথায় ঘর হয়েছে') : t('{unit} কোথায় কোথায়', { unit })}</h3>
            <p className="text-xs text-slate-500">
              {stats.status === 'ready'
                ? t('{u} উপজেলায় পতাকা (রঙ = জেলা) · পতাকা/উপজেলায় ক্লিক করলে তালিকা সেখানে ফিল্টার হবে', { u: formatBanglaNumber(upazilaCount) })
                : stats.status === 'error'
                  ? t('পরিসংখ্যান লোড হয়নি')
                  : t('লোড হচ্ছে…')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected && (
            <button type="button" onClick={() => select(null)} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:border-red-300 hover:text-red-700">
              {gn(selected.upazila)} — {t('বাতিল')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700"
          >
            {t('মানচিত্র লুকান')}
          </button>
        </div>
      </div>
      <div className="border-t border-slate-100 p-3">
        {stats.status === 'loading' ? (
          <div className="aspect-[600/760] max-h-[70vh] w-full animate-pulse rounded-xl bg-slate-100" aria-busy="true" />
        ) : (
          <ErrorBoundary compact title={t('মানচিত্র দেখানো যায়নি')}>
            <UpazilaMap counts={counts} selected={selected} onSelect={select} unit={unit} housingWording={housingWording} />
          </ErrorBoundary>
        )}
      </div>
    </section>
  )
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
      <path d="M12 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="currentColor" stroke="none" />
    </svg>
  )
}
