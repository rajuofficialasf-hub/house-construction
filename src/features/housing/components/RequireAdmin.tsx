import { t } from '@/i18n'
import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { AdminLayout } from '@/features/admin/layout/AdminLayout'
import { AdminUserContext } from '@/features/admin/adminUser'

export const LOGIN_PATH = '/admin/login'

/**
 * Protected layout route: /admin/* এর জন্য (লগইন পেইজ বাদে)।
 * লগইন যাচাই চলাকালে হালকা লোডিং; সার্ভারে পৌঁছানো না গেলে আবার চেষ্টার বোতাম;
 * এডমিন না হলে লগইন পেইজে পাঠায় (ফেরার পাথ state.from এ)।
 * এটি শুধু UI-স্তরের গার্ড; প্রকৃত অনুমতি সার্ভার যাচাই করে।
 */
export function RequireAdmin() {
  const auth = useAuth()
  const location = useLocation()
  // নিজের লগআউট চলাকালে সেশন শেষ হলে লগইন পেইজে নয় — AdminLayout হোমে নিয়ে যায়
  const [leaving, setLeaving] = useState(false)

  if (auth.status === 'loading') {
    return (
      <div className="container-page py-20 text-center text-sm text-slate-500" aria-busy="true">
        {t('লগইন যাচাই হচ্ছে…')}
      </div>
    )
  }

  // সার্ভারে পৌঁছানো না গেলে লগইন পেইজে পাঠানো ভুল হতো: সেশন হয়তো ঠিকই আছে।
  if (auth.status === 'error') {
    return (
      <div className="container-page py-20 text-center" role="alert">
        <p className="text-sm text-slate-600">{t('সার্ভারে সংযোগ করা যায়নি।')}</p>
        <button type="button" className="mt-4 inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={() => window.location.reload()}>
          {t('আবার চেষ্টা করুন')}
        </button>
      </div>
    )
  }

  if (!auth.user || !auth.isAdmin) {
    if (leaving) return null
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname + location.search }} />
  }

  return (
    <AdminUserContext.Provider value={auth.user}>
      <AdminLayout user={auth.user} onLeaving={setLeaving}>
        <Outlet />
      </AdminLayout>
    </AdminUserContext.Provider>
  )
}
