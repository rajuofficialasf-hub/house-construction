import { t } from '@/i18n'
import { Link } from 'react-router'
import { SITE_NAME } from '@/config/site'
import { FeaturedProjects } from '@/features/housing/components/FeaturedProjects'

export function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white">
        <div className="container-page py-16 sm:py-24">
          <p className="mb-3 text-sm font-medium tracking-wider text-accent-400 uppercase">{t('মানবসেবামূলক প্রকল্প')}</p>
          <h1 className="max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">{t(SITE_NAME)}</h1>
          <p className="mt-4 max-w-xl text-base text-brand-50/90 sm:text-lg">
            {t('অসহায় ও দুস্থ পরিবারের জন্য নিরাপদ বাসস্থান নিশ্চিত করতে আমাদের ঘর নির্মাণ প্রকল্পের অগ্রগতি ও উপকারভোগীদের তথ্য এখানে পাওয়া যাবে।')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/housing"
              className="inline-flex items-center rounded-md bg-accent-500 px-5 py-2.5 text-sm font-semibold text-brand-950 shadow hover:bg-accent-400"
            >
              {t('ঘর নির্মাণ প্রকল্প দেখুন')}
            </Link>
          </div>
        </div>
      </section>

      {/* প্রকল্পসমূহ — প্রতিটি প্রকল্পের প্রথম উপকারভোগীর তথ্য দিয়ে কার্ড */}
      <FeaturedProjects />
    </>
  )
}
