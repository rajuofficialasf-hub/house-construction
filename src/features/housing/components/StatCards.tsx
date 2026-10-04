import { t } from '@/i18n'
import type { ReactNode } from 'react'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import type { HousingStats, ProjectType } from '../backend/interfaces/types'
import { useCountUp } from '../hooks/useCountUp'
import { useHousingStats } from '../hooks/useHousingStats'
import { ErrorNotice } from './ErrorNotice'

interface Props {
  projectType?: ProjectType
}

/**
 * চারটি পরিসংখ্যান কার্ড: মোট উপকারভোগী, বিভাগ, জেলা, উপজেলা।
 * সংখ্যা HousingApi.stats() থেকে (ডাটাবেসে থাকা ঠিকানার distinct সংখ্যা); ফিল্টারে বদলায় না।
 */
export function StatCards({ projectType }: Props) {
  const state = useHousingStats(projectType)

  if (state.status === 'error') return <ErrorNotice title={t('পরিসংখ্যান লোড করা যায়নি')} error={state.error} />

  const items = buildItems(state.status === 'ready' ? state.data : null)
  return (
    <section aria-label={t('পরিসংখ্যান')} aria-busy={state.status === 'loading'}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((it) =>
          state.status === 'ready' ? (
            <StatCard key={it.key} label={t(it.label)} value={it.value} icon={it.icon} />
          ) : (
            <StatSkeleton key={it.key} label={t(it.label)} icon={it.icon} />
          ),
        )}
      </div>
    </section>
  )
}

interface Item {
  key: string
  label: string
  value: number
  icon: ReactNode
}

function buildItems(data: HousingStats | null): Item[] {
  return [
    { key: 'total', label: 'মোট উপকারভোগী', value: data?.total ?? 0, icon: <PeopleIcon /> },
    { key: 'divisions', label: 'মোট বিভাগ', value: data?.distinct.divisions ?? 0, icon: <MapIcon /> },
    { key: 'districts', label: 'মোট জেলা', value: data?.distinct.districts ?? 0, icon: <PinIcon /> },
    { key: 'upazilas', label: 'মোট উপজেলা', value: data?.distinct.upazilas ?? 0, icon: <GridIcon /> },
  ]
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  const shown = useCountUp(value)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 sm:h-12 sm:w-12">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-snug font-medium text-slate-500 sm:text-sm">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl" aria-label={`${label}: ${formatBanglaNumber(value)}`}>
          {formatBanglaNumber(shown)}
        </p>
      </div>
    </div>
  )
}

function StatSkeleton({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300 sm:h-12 sm:w-12">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug font-medium text-slate-400 sm:text-sm">{label}</p>
        <div className="mt-1.5 h-7 w-16 rounded bg-slate-200 sm:h-8 sm:w-20" />
      </div>
      <span className="sr-only">{t('লোড হচ্ছে')}</span>
    </div>
  )
}

const iconClass = 'h-5 w-5 sm:h-6 sm:w-6'
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: iconClass,
}

function PeopleIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.5A5 5 0 0 1 22 19" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
