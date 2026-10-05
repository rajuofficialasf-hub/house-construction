import { t } from '@/i18n'
import { useRef } from 'react'
import type { ProjectKey } from '../../../backend/interfaces/types'
import { useGroupChildren } from '../utils/housingProjects'
import { FeaturedProjectCard } from './FeaturedProjectCard'

/**
 * হোম পেইজের "প্রকল্পসমূহ" সেকশন: প্রতিটি প্রকল্পের একটি কার্ড।
 * ডেস্কটপে পাশাপাশি; ছোট পর্দায় অনুভূমিক স্ক্রল-স্ন্যাপ ও দুই পাশে তীর বাটন (ক্যারোসেল-ধাঁচ)।
 */
/** groupKey: কোন গ্রুপের উপ-প্রকল্পের কার্ড (না দিলে ঘর নির্মাণ) */
export function FeaturedProjects({ groupKey }: { groupKey?: ProjectKey }) {
  const projects = useGroupChildren(groupKey)
  const scroller = useRef<HTMLDivElement>(null)
  const scrollBy = (dir: -1 | 1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  return (
    <section className="relative bg-[radial-gradient(ellipse_at_top,rgba(233,174,43,0.10),transparent_60%)] py-14 sm:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">{t('প্রকল্পসমূহ')}</h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            {t('ঘরহীন ও অসহায় পরিবারের জন্য নিরাপদ বাসস্থান। সেমিপাকা ও টিনের ঘর নির্মাণ প্রকল্পের উপকারভোগীদের তথ্য ও আগে-পরের ছবি সবার জন্য উন্মুক্ত।')}
          </p>
        </div>

        <div className="relative mt-10">
          <ArrowButton dir={-1} onClick={() => scrollBy(-1)} />
          <div
            ref={scroller}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] lg:grid lg:grid-cols-2 lg:gap-8 lg:overflow-visible [&::-webkit-scrollbar]:hidden"
          >
            {projects.map((p) => (
              <div key={p.key} className="w-[88%] shrink-0 snap-center sm:w-[80%] lg:w-auto">
                <FeaturedProjectCard project={p} />
              </div>
            ))}
          </div>
          <ArrowButton dir={1} onClick={() => scrollBy(1)} />
        </div>
      </div>
    </section>
  )
}

function ArrowButton({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === -1 ? t('আগের প্রকল্প') : t('পরের প্রকল্প')}
      className={`absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:text-brand-700 sm:flex lg:hidden ${
        dir === -1 ? '-left-2' : '-right-2'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        {dir === -1 ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
      </svg>
    </button>
  )
}
