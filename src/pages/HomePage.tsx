import { t } from '@/i18n'
import { SITE_NAME } from '@/config/site'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useCountUp } from '@/features/housing/hooks/useCountUp'
import { ProjectCardGrid } from '@/features/projects/home/ProjectCardGrid'
import { useProjectsOverview } from '@/features/projects/home/useProjectsOverview'

/**
 * হোম পেইজ (M-ধাপ ১৫) — সাধারণ হিরো (প্রশ্ন ১৫: শিরোনাম "আমাদের কার্যক্রমসমূহ" — আপনার দেওয়া, ২০২৬-১০-০৬; নিচের ছোট বাক্যের
 * ব্যবহারকারীর অনুমোদনসাপেক্ষ) সাথে মোট প্রকল্প, মোট উপকারভোগী, মোট জেলা (count-up); নিচে প্রকাশিত প্রকল্পের কার্ড।
 * সব ডাটা একটিই projects_overview() কল থেকে — নতুন প্রকল্প প্রকাশ করলে কোড ছাড়াই কার্ড চলে আসে।
 */
export function HomePage() {
  useDocumentTitle() // শুধু সাইটের নাম
  const overview = useProjectsOverview()
  const g = overview.status === 'ready' ? overview.data.global : null

  return (
    <>
      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white">
        <div className="container-page py-14 sm:py-20">
          <p className="mb-3 text-sm font-medium tracking-wider text-accent-400 uppercase">{t(SITE_NAME)}</p>
          <h1 className="max-w-3xl text-3xl leading-tight font-bold sm:text-5xl">{t('আমাদের কার্যক্রমসমূহ')}</h1>
          <p className="mt-4 max-w-2xl text-base text-brand-50/90 sm:text-lg">
            {t('অসহায় ও দুস্থ মানুষের পাশে আমাদের প্রকল্পগুলোর অগ্রগতি, উপকারভোগীদের তথ্য ও ছবি এখানে সবার জন্য উন্মুক্ত।')}
          </p>
          <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-2 sm:gap-4" aria-busy={overview.status === 'loading'}>
            <HeroStat label={t('মোট প্রকল্প')} value={g?.projects ?? null} loading={overview.status === 'loading'} />
            <HeroStat label={t('মোট উপকারভোগী')} value={g?.total ?? null} loading={overview.status === 'loading'} />
            <HeroStat label={t('মোট জেলা')} value={g?.districts ?? null} loading={overview.status === 'loading'} />
          </dl>
        </div>
      </section>

      <ProjectCardGrid state={overview} />
    </>
  )
}

/** হিরোর একটি সংখ্যা (count-up); লোডে স্কেলেটন, এরর হলে "—" */
function HeroStat({ label, value, loading }: { label: string; value: number | null; loading: boolean }) {
  const shown = useCountUp(value ?? 0)
  return (
    <div className="min-w-0 rounded-xl bg-white/10 px-3 py-3 ring-1 ring-white/15 backdrop-blur-sm sm:px-5 sm:py-4">
      {loading ? (
        <dd className="h-8 w-14 animate-pulse rounded bg-white/25 sm:h-10" />
      ) : (
        <dd className="text-2xl leading-none font-bold tabular-nums sm:text-4xl" aria-label={label + ': ' + (value === null ? '—' : formatBanglaNumber(value))}>
          {value === null ? '—' : formatBanglaNumber(shown)}
        </dd>
      )}
      <dt className="mt-1.5 text-xs font-medium text-brand-50/85 sm:text-sm">{label}</dt>
    </div>
  )
}
