import { t } from '@/i18n'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { AdminShell } from './AdminShell'

export const LOGIN_PATH = '/admin/login'

/**
 * Protected layout route: /admin/* এর জন্য (লগইন পেইজ বাদে)।
 * লগইন যাচাই চলাকালে হালকা লোডিং; এডমিন না হলে লগইন পেইজে পাঠায় (ফেরার পাথ state.from এ)।
 * এটি শুধু UI-স্তরের গার্ড; প্রকৃত অনুমতি ব্যাকএন্ড (RLS / সার্ভার) যাচাই করে।
 */
export function RequireAdmin() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return (
      <div className="container-page py-20 text-center text-sm text-slate-500" aria-busy="true">
        {t('লগইন যাচাই হচ্ছে…')}
      </div>
    )
  }

  if (!auth.user || !auth.isAdmin) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname + location.search }} />
  }

  return (
    <AdminShell user={auth.user}>
      <Outlet />
    </AdminShell>
  )
}
