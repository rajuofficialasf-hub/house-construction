import { t } from '@/i18n'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { AdminRole } from '@/backend'
import { useAdminUser } from '../adminUser'

/**
 * ভূমিকা অনুযায়ী পাতা (পর্ব চ, M-ধাপ ১৯): প্রকল্পের সেটিংস ও ইউজার-ব্যবস্থাপনা প্রকল্পের ইউজার (editor) দেখেন না —
 * বদলে স্পষ্ট বার্তা। শুধু দেখানো/লুকানো; নিষেধ ডাটাবেসে (SQL ১৪)।
 */
export function RoleGate({ allow, children }: { allow: readonly AdminRole[]; children: ReactNode }) {
  const me = useAdminUser()
  if (me && allow.includes(me.role)) return children
  return (
    <section className="px-4 py-8 sm:px-6">
      <div role="alert" className="max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
        <h1 className="text-lg font-semibold">{t('এই অংশ শুধু মূল এডমিনের')}</h1>
        <p className="mt-1 text-sm">
          {t('প্রকল্পের সেটিংস (ফিল্ড, কার্ড, প্রকাশ) আর ইউজার-ব্যবস্থাপনা মূল এডমিন করেন। আপনি নিজের প্রকল্পের রেকর্ড, ইম্পোর্ট ও ছবি নিয়ে কাজ করতে পারেন।')}
        </p>
        <Link to="/admin" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
          {t('ড্যাশবোর্ডে ফিরুন')}
        </Link>
      </div>
    </section>
  )
}
