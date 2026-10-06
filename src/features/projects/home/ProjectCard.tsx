import { lt, pick, t } from '@/i18n'
import { Link } from 'react-router'
import type { ProjectOverviewItem, StatCardDef } from '@/backend'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { formatTaka } from '@/lib/money'
import { accentOf, ProjectIcon, useProject } from '@/features/projects/registry'
import { cardValue, homeCards, homeLabel } from '@/features/projects/stats/statCards'
import { useCountUp } from '@/features/housing/hooks/useCountUp'
import { photoSrc } from '@/features/housing/utils/imagePath'
import { projectPath } from '@/features/housing/utils/housingProjects'
import { SafeImage } from '@/features/housing/components/SafeImage'
import { coverSrc } from './cover'

interface Props {
  item: ProjectOverviewItem
  /** গ্রুপ হলে প্রকাশিত উপ-প্রকল্প (চিপ) */
  subProjects?: ProjectOverviewItem[]
}

/** স্ট্যাটের ঘরের কলাম (Tailwind পুরো ক্লাসের নাম দেখতে চায়) */
const STAT_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' }

/**
 * হোম পেইজের প্রকল্প-কার্ড (M-ধাপ ১৫) — সব তথ্য projects_overview() এর একটি সারি থেকে (আলাদা কল নয়):
 *   ছবি: কভার → সর্বশেষ রেকর্ডের থাম্ব → প্রকল্পের রঙে গ্রেডিয়েন্ট + বড় আইকন
 *   আইকন-ব্যাজ, নাম ও ছোট বর্ণনা (pick), `home: true` কার্ডের ২–৩টি সংখ্যা (টাকা ৳), গ্রুপে উপ-প্রকল্পের চিপ, "প্রকল্প দেখুন"
 */
export function ProjectCard({ item, subProjects = [] }: Props) {
  const accent = accentOf(item.accent)
  // কভারের ক্যাশ-ভাঙার জন্য updated_at রেজিস্ট্রি থেকে (ওভারভিউতে নেই)
  const registered = useProject(item.key)
  const name = lt(item, 'name')
  const summary = lt(item, 'summary')
  const cover = coverSrc(item.cover_path, registered?.updated_at)
  const thumb = item.featured ? photoSrc(item.featured.thumb_url, item.featured.photo_updated_at) : null
  const cards = homeCards(item)
  const href = projectPath(item.key)

  return (
    <article data-project-card={item.key} className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200/70 transition hover:shadow-lg">
      {/* ---------- ছবি ---------- */}
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
        {cover || thumb ? (
          <>
            <SafeImage
              src={cover ?? thumb}
              alt={cover ? name : t('{name} — {project}', { name: item.featured?.name ?? '', project: name })}
              className="h-full w-full object-cover"
              placeholderClassName="h-full w-full"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" aria-hidden="true" />
          </>
        ) : (
          <div data-cover-fallback="" className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-white/90 ${accent.gradient}`} aria-hidden="true">
            <ProjectIcon icon={item.icon} className="h-24 w-24 drop-shadow-sm" />
          </div>
        )}
      </div>

      {/* ---------- লেখা ---------- */}
      <div className="flex flex-1 flex-col px-5 pb-5">
        <span className={`relative -mt-7 flex h-14 w-14 items-center justify-center rounded-2xl shadow-md ring-4 ring-white ${accent.soft}`} aria-hidden="true">
          <ProjectIcon icon={item.icon} className="h-8 w-8" />
        </span>
        <h3 className="mt-3 text-xl leading-snug font-bold text-slate-900">{name}</h3>
        {summary && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600">{summary}</p>}

        {subProjects.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('উপ-প্রকল্প')}>
            {subProjects.map((c) => (
              <li key={c.key}>
                <Link to={projectPath(c.key)} className={`inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-medium transition hover:brightness-95 ${accent.soft}`}>
                  {lt(c, 'name')}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {cards.length > 0 && (
          <dl className={`mt-4 grid gap-2 ${STAT_COLS[cards.length] ?? 'grid-cols-3'}`}>
            {cards.map((c, i) => (
              <StatTile key={c.id} card={c} value={cardValue(c, item.stats)} strong={i === 0} accentSolid={accent.solid} accentSoft={accent.soft} />
            ))}
          </dl>
        )}

        <div className="mt-auto pt-5">
          <Link
            to={href}
            aria-label={pick(item.name_bn, item.name_en) + ' — ' + t('প্রকল্প দেখুন')}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border-2 px-4 py-2 text-sm font-semibold transition ${accent.outline}`}
          >
            {t('প্রকল্প দেখুন')}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  )
}

/** একটি সংখ্যা (count-up; টাকা ৳) — প্রথমটি গাঢ় রঙে */
function StatTile({ card, value, strong, accentSolid, accentSoft }: { card: StatCardDef; value: number | null; strong: boolean; accentSolid: string; accentSoft: string }) {
  const shown = useCountUp(value ?? 0)
  const label = homeLabel(card)
  const money = card.format === 'money'
  const fmt = (n: number) => (money ? formatTaka(n) : formatBanglaNumber(n))
  return (
    <div className={`flex min-w-0 flex-col justify-center rounded-xl px-2.5 py-2.5 text-center ${strong ? accentSolid : accentSoft}`}>
      <dd className={`${money ? 'text-base sm:text-lg' : 'text-2xl'} leading-tight font-bold tabular-nums`} aria-label={label + ': ' + (value === null ? '—' : fmt(value))}>
        {value === null ? '—' : fmt(Math.round(shown))}
      </dd>
      <dt className={`mt-1 text-[11px] leading-tight font-medium ${strong ? 'opacity-85' : 'opacity-80'}`}>{label}</dt>
    </div>
  )
}

/** লোডের সময় কার্ডের কাঠামো */
export function ProjectCardSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200/70" aria-hidden="true">
      <div className="aspect-[16/9] bg-slate-200" />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="-mt-7 h-14 w-14 rounded-2xl bg-slate-300 ring-4 ring-white" />
        <div className="mt-3 h-6 w-2/3 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-full rounded bg-slate-100" />
        <div className="mt-1 h-4 w-4/5 rounded bg-slate-100" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-14 rounded-xl bg-slate-200" />
          <div className="h-14 rounded-xl bg-slate-100" />
          <div className="h-14 rounded-xl bg-slate-100" />
        </div>
        <div className="mt-5 h-11 w-36 rounded-md bg-slate-200" />
      </div>
    </div>
  )
}
