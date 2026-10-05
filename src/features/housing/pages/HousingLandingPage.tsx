import { lt, t } from '@/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { Project } from '../../../backend/interfaces/types'
import { FeaturedProjects } from '../components/FeaturedProjects'
import { HousingSubnav } from '../components/HousingSubnav'

/**
 * গ্রুপের ল্যান্ডিং (যেমন /housing) — উপরে পরিচিতি (রেজিস্ট্রির নাম ও বর্ণনা), নিচে হোমের মতোই ছবিসহ উপ-প্রকল্পের কার্ড
 * (পরিসংখ্যান + প্রথম উপকারভোগী + "আরো দেখুন")। কোনো লগইন লাগে না। নতুন গ্রুপ-ল্যান্ডিং ডিজাইন আসবে M-ধাপ ১৫-এ।
 */
export function HousingLandingPage({ group }: { group: Project }) {
  const title = lt(group, 'name')
  useDocumentTitle(title)
  return (
    <>
      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white">
        <div className="container-page py-14 sm:py-20">
          <HousingSubnav variant="dark" group={group.key} />
          <p className="mt-8 text-sm font-medium tracking-wider text-accent-400 uppercase">{t('আস-সুন্নাহ ফাউন্ডেশন')}</p>
          <h1 className="mt-2 text-3xl leading-tight font-bold sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base text-brand-50/90 sm:text-lg">{lt(group, 'description')}</p>
        </div>
      </section>

      <FeaturedProjects groupKey={group.key} />
    </>
  )
}
