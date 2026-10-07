import { lt, t } from '@/i18n'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { formatTaka } from '@/lib/money'
import type { Project, StatCardDef } from '@/backend'
import { StatIcon } from '@/features/projects/registry'
import { cardValue } from '@/features/projects/stats/statCards'
import { useCountUp } from '@/features/housing/hooks/useCountUp'
import type { StatsState } from '@/features/housing/hooks/useHousingStats'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'

interface Props {
  project: Project
  /** মোট stats, অথবা ফিল্টার থাকলে ফিল্টার অনুযায়ী stats (ProjectListPage ঠিক করে) */
  stats: StatsState
  /** true = সংখ্যাগুলো বাছাই করা ফিল্টার অনুযায়ী — কার্ডের ওপরে ছোট করে জানানো হয় */
  filtered?: boolean
}

const ICON_CLASS = 'h-5 w-5 sm:h-6 sm:w-6'

/**
 * প্রকল্পের পরিসংখ্যান কার্ড (M-ধাপ ১৩): যত কার্ড প্রকল্পের কনফিগে (`stat_cards`), তত — লেবেল pick() দিয়ে, আইকন
 * statIcons থেকে, টাকা formatTaka (৳), সংখ্যা count-up; লোডের সময় স্কেলেটন। ফিল্টার দিলে ফিল্টার অনুযায়ী (docs/api/PROJECTS_API_CONTRACT.md §৪.৩)।
 * ঘর নির্মাণে আগের হুবহু চারটি কার্ড (মোট উপকারভোগী, বিভাগ, জেলা, উপজেলা)।
 */
export function ProjectStatCards({ project, stats, filtered = false }: Props) {
  if (stats.status === 'error') return <ErrorNotice title={t('পরিসংখ্যান লোড করা যায়নি')} error={stats.error} />
  const cards = project.stat_cards ?? []
  if (!cards.length) return null
  return (
    <section aria-label={t('পরিসংখ্যান')} aria-busy={stats.status === 'loading'}>
      {filtered && (
        <p className="mb-2 text-sm font-medium text-brand-700" role="status">
          {t('পরিসংখ্যান: বাছাই করা ফিল্টার অনুযায়ী')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) =>
          stats.status === 'ready' ? (
            <StatCard key={c.id} card={c} label={lt(c, 'label')} value={cardValue(c, stats.data) ?? 0} />
          ) : (
            <StatSkeleton key={c.id} card={c} label={lt(c, 'label')} />
          ),
        )}
      </div>
    </section>
  )
}

function StatCard({ card, label, value }: { card: StatCardDef; label: string; value: number }) {
  const shown = useCountUp(value)
  const money = card.format === 'money'
  const fmt = (n: number) => (money ? formatTaka(n) : formatBanglaNumber(n))
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 sm:h-12 sm:w-12">
        <StatIcon icon={card.icon} className={ICON_CLASS} />
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-snug font-medium text-slate-500 sm:text-sm">{label}</p>
        <p className={`${money ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'} font-bold tabular-nums text-slate-900`} aria-label={`${label}: ${fmt(value)}`}>
          {fmt(Math.round(shown))}
        </p>
      </div>
    </div>
  )
}

function StatSkeleton({ card, label }: { card: StatCardDef; label: string }) {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300 sm:h-12 sm:w-12">
        <StatIcon icon={card.icon} className={ICON_CLASS} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug font-medium text-slate-400 sm:text-sm">{label}</p>
        <div className="mt-1.5 h-7 w-16 rounded bg-slate-200 sm:h-8 sm:w-20" />
      </div>
      <span className="sr-only">{t('লোড হচ্ছে')}</span>
    </div>
  )
}
