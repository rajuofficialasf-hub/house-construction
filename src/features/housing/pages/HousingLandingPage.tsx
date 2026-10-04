import { t } from '@/i18n'
import { FeaturedProjects } from '../components/FeaturedProjects'
import { HousingSubnav } from '../components/HousingSubnav'

/**
 * /housing — ল্যান্ডিং। উপরে পরিচিতি, নিচে হোমের মতোই ছবিসহ প্রকল্প কার্ড (পরিসংখ্যান + প্রথম উপকারভোগী + "আরো দেখুন")।
 * কোনো লগইন লাগে না।
 */
export function HousingLandingPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white">
        <div className="container-page py-14 sm:py-20">
          <HousingSubnav variant="dark" />
          <p className="mt-8 text-sm font-medium tracking-wider text-accent-400 uppercase">{t('আস-সুন্নাহ ফাউন্ডেশন')}</p>
          <h1 className="mt-2 text-3xl leading-tight font-bold sm:text-5xl">{t('ঘর নির্মাণ প্রকল্প')}</h1>
          <p className="mt-4 max-w-2xl text-base text-brand-50/90 sm:text-lg">
            {t('ঘরহীন ও অসহায় পরিবারের জন্য নিরাপদ বাসস্থান। প্রতিটি ঘরের আগের ও বর্তমান অবস্থার ছবিসহ উপকারভোগীদের পূর্ণ তালিকা এখানে দেখা যায়। প্রকল্পটি চলমান।')}
          </p>
        </div>
      </section>

      <FeaturedProjects />
    </>
  )
}
