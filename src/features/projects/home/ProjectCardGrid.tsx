import { t } from '@/i18n'
import type { ProjectOverview } from '@/backend'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import type { OverviewState } from './useProjectsOverview'
import { ProjectCard, ProjectCardSkeleton } from './ProjectCard'

/**
 * হোমের প্রকল্প-গ্রিড (M-ধাপ ১৫): ফোনে ১ কলাম, md-এ ২, xl-এ ৩।
 * কার্ড = শীর্ষ-স্তরের (গ্রুপ বা একক) প্রকাশিত প্রকল্প যার `show_on_home` চালু; গ্রুপের প্রকাশিত উপ-প্রকল্প চিপে।
 * খসড়া কখনো আসে না (ওভারভিউ খসড়া ছাড়া আনা হয়; এখানেও is_published যাচাই)।
 */
export function ProjectCardGrid({ state }: { state: OverviewState }) {
  return (
    <section className="relative bg-[radial-gradient(ellipse_at_top,rgba(233,174,43,0.10),transparent_60%)] py-14 sm:py-20" aria-labelledby="home-projects">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="home-projects" className="text-3xl font-bold text-slate-900 sm:text-4xl">
            {t('প্রকল্পসমূহ')}
          </h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">{t('প্রতিটি প্রকল্পের উপকারভোগীদের তথ্য ও ছবি সবার জন্য উন্মুক্ত।')}</p>
        </div>

        {state.status === 'error' && (
          <div className="mx-auto mt-10 max-w-xl">
            <ErrorNotice title={t('প্রকল্পের তালিকা লোড করা যায়নি')} error={state.error} />
          </div>
        )}
        {state.status === 'loading' && (
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={t('লোড হচ্ছে')}>
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
          </div>
        )}
        {state.status === 'ready' && <Grid data={state.data} />}
      </div>
    </section>
  )
}

function Grid({ data }: { data: ProjectOverview }) {
  const shown = data.projects.filter((p) => p.is_published)
  const top = shown.filter((p) => !p.parent_key && p.show_on_home)
  if (!top.length) return <p className="mt-10 text-center text-slate-500">{t('এখনো কোনো প্রকল্প প্রকাশিত হয়নি।')}</p>
  return (
    <ul className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {top.map((p) => (
        <li key={p.key} className="min-w-0">
          <ProjectCard item={p} subProjects={p.is_group ? shown.filter((c) => c.parent_key === p.key) : []} />
        </li>
      ))}
    </ul>
  )
}
