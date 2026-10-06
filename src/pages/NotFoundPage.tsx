import { t } from '@/i18n'
import { Link } from 'react-router'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle(t('পেইজটি পাওয়া যায়নি'))
  return (
    <section className="container-page flex flex-col items-center py-24 text-center">
      <p className="text-6xl font-bold text-brand-700">{toBanglaNumber(404)}</p>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">{t('পেইজটি পাওয়া যায়নি')}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        {t('আপনি যে ঠিকানায় যেতে চেয়েছেন তা এই সাইটে নেই। ঠিকানাটি আবার দেখুন অথবা হোম পেইজে ফিরে যান।')}
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
      >
        {t('হোম পেইজে যান')}
      </Link>
    </section>
  )
}
