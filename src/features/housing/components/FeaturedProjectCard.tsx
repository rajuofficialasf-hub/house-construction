import { t, gn } from '@/i18n'
import { Link } from 'react-router'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import type { HousingRecord } from '../../../backend/interfaces/types'
import { useCountUp } from '../hooks/useCountUp'
import { useFeaturedRecord } from '../hooks/useFeaturedRecord'
import { useHousingStats } from '../hooks/useHousingStats'
import { photoSrc } from '../utils/imagePath'
import { projectPath, type ProjectMeta } from '../utils/projectType'
import { ProjectIcon } from './ProjectIcons'
import { SafeImage } from './SafeImage'

interface Props {
  project: ProjectMeta
}

/**
 * হোম পেইজের "সফলতার গল্প"-স্টাইল কার্ড: বামে উপকারভোগীর ছবি (বর্তমান ঘর; না থাকলে পূর্বের; না থাকলে আইকন),
 * ডানে তিনটি পরিসংখ্যান টাইল (মোট ঘর, জেলা কভার, উপজেলা কভার — HousingApi.stats, count-up) + "আরো দেখুন" (→ তালিকা),
 * নিচে সোনালি বারে নাম, ঠিকানা, প্রকল্প/সাল ও সিরিয়াল।
 * ডাটা: প্রকল্পের প্রথম উপকারভোগী (সিরিয়াল ১)। ডাটা না থাকলে/এরর হলে শুধু প্রকল্পের বর্ণনা।
 */
export function FeaturedProjectCard({ project }: Props) {
  const state = useFeaturedRecord(project.type)
  const stats = useHousingStats(project.type)
  const record = state.status === 'ready' ? state.record : null
  const listPath = projectPath(project.type)
  const photo = record ? photoSrc(record.current_photo_url ?? record.prev_photo_url, record.photo_updated_at) : null

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200/70">
      <div className="flex flex-1 flex-col gap-5 p-5 sm:flex-row sm:p-6">
        {/* ছবি */}
        <div className="shrink-0">
          {state.status === 'loading' ? (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-200 sm:w-44" aria-busy="true" />
          ) : photo ? (
            <SafeImage
              src={photo}
              alt={`${record!.name} — ${t(project.title)}`}
              className="aspect-square w-full rounded-xl object-cover sm:w-44"
              placeholderClassName="aspect-square w-full rounded-xl sm:w-44"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:w-44" aria-hidden="true">
              <ProjectIcon type={project.type} className="h-20 w-20" />
            </div>
          )}
        </div>

        {/* লেখা */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-lg font-bold text-slate-900">{t(project.title)}</h3>
          <dl className="mt-3 grid flex-1 grid-cols-3 gap-2">
            <StatTile label={t('মোট ঘর নির্মাণ')} value={stats.status === 'ready' ? stats.data.total : null} loading={stats.status === 'loading'} accent />
            <StatTile label={t('মোট জেলা কভার')} value={stats.status === 'ready' ? stats.data.distinct.districts : null} loading={stats.status === 'loading'} />
            <StatTile label={t('মোট উপজেলা কভার')} value={stats.status === 'ready' ? stats.data.distinct.upazilas : null} loading={stats.status === 'loading'} />
          </dl>
          <div className="mt-4">
            <Link
              to={listPath}
              className="inline-flex items-center gap-2 rounded-md border-2 border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-600 hover:text-white"
              aria-label={`${t(project.title)} — ${t('আরো দেখুন')}`}
            >
              {t('আরো দেখুন')}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* নিচের সোনালি বার */}
      <FeaturedBar record={record} project={project} loading={state.status === 'loading'} />
    </article>
  )
}

/** কার্ডের ছোট পরিসংখ্যান টাইল: বড় বাংলা সংখ্যা (count-up) + লেবেল; লোডিংয়ে skeleton; ডাটা না এলে "—" */
function StatTile({ label, value, loading, accent = false }: { label: string; value: number | null; loading: boolean; accent?: boolean }) {
  const shown = useCountUp(value ?? 0)
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center rounded-xl px-2 py-3 text-center ${accent ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-900'}`}>
      {loading ? (
        <dd className={`h-7 w-10 animate-pulse rounded ${accent ? 'bg-white/30' : 'bg-brand-200'}`} aria-busy="true" />
      ) : (
        <dd className="text-2xl leading-none font-bold tabular-nums sm:text-3xl" aria-label={`${label}: ${value === null ? t('অজানা') : formatBanglaNumber(value)}`}>
          {value === null ? '—' : formatBanglaNumber(shown)}
        </dd>
      )}
      <dt className={`mt-1.5 text-[11px] leading-tight font-medium sm:text-xs ${accent ? 'text-white/85' : 'text-brand-800/80'}`}>{label}</dt>
    </div>
  )
}

function FeaturedBar({ record, project, loading }: { record: HousingRecord | null; project: ProjectMeta; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid animate-pulse gap-3 bg-accent-500/90 px-5 py-4 sm:grid-cols-3 sm:px-6" aria-hidden="true">
        <div className="h-6 rounded bg-accent-600/40" />
        <div className="h-6 rounded bg-accent-600/40" />
        <div className="h-6 rounded bg-accent-600/40" />
      </div>
    )
  }
  if (!record) {
    return (
      <div className="bg-accent-500 px-5 py-4 text-sm font-medium text-brand-950 sm:px-6">
        {t('{title} — উপকারভোগীদের তালিকা দেখতে "আরো দেখুন" চাপুন।', { title: t(project.title) })}
      </div>
    )
  }
  return (
    <dl className="grid gap-3 bg-accent-500 px-5 py-4 text-brand-950 sm:grid-cols-[1.2fr_1fr_1fr] sm:items-center sm:px-6">
      <div className="min-w-0">
        <dt className="sr-only">{t('উপকারভোগী')}</dt>
        <dd className="truncate text-lg font-bold" title={record.name}>
          {record.name}
        </dd>
      </div>
      <div className="min-w-0 text-sm leading-snug">
        <dt className="sr-only">{t('ঠিকানা')}</dt>
        <dd className="truncate font-medium">{record.father_or_husband_name ? t('পিতা/স্বামী: {name}', { name: record.father_or_husband_name }) : record.address || '—'}</dd>
        <dd className="truncate">
          {gn(record.upazila)}, {gn(record.district)}
        </dd>
      </div>
      <div className="min-w-0 text-sm leading-snug">
        <dt className="sr-only">{t('প্রকল্প ও সিরিয়াল')}</dt>
        <dd className="truncate font-medium">
          {t(project.title)} {toBanglaNumber(record.year)}
        </dd>
        <dd>
          {t('সিরিয়াল নম্বর:')} <span className="font-semibold">{toBanglaNumber(record.serial_no)}</span>
        </dd>
      </div>
    </dl>
  )
}
