import { t } from '@/i18n'
import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { getAuthProvider, getHousingApi } from '../../../backend/factory'
import { HousingApiError, type AuthUser } from '../../../backend/interfaces/types'

const ADMIN_LINKS = [
  { to: '/housing/admin/semi-pucca', label: 'সেমিপাকা রেকর্ড', end: false },
  { to: '/housing/admin/tin', label: 'টিন রেকর্ড', end: false },
  { to: '/housing/admin/import', label: 'বাল্ক ইম্পোর্ট', end: false },
  { to: '/housing/admin/photos', label: 'ছবি বাল্ক আপডেট', end: false },
  { to: '/housing/admin/activity', label: 'একটিভিটি লগ', end: false },
]

/** এডমিন পেইজের উপরের বার: এডমিন মেনু, লগইন করা ইমেইল, লগআউট */
export function AdminShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logout = async () => {
    setBusy(true)
    setError(null)
    try {
      await getHousingApi().logActivity('logout')
      await getAuthProvider().logout()
      navigate('/housing', { replace: true })
    } catch (err) {
      setError(HousingApiError.from(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <nav aria-label={t('এডমিন মেনু')} className="flex flex-wrap items-center gap-1">
            <span className="mr-2 rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">{t('এডমিন')}</span>
            {ADMIN_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1 font-medium ${isActive ? 'bg-amber-200 text-amber-900' : 'text-amber-900/80 hover:bg-amber-100'}`
                }
              >
                {t(l.label)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="truncate text-amber-900/80" title={user.email}>
              {user.name ?? user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="rounded-md border border-amber-300 bg-white px-3 py-1 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {busy ? t('লগআউট হচ্ছে…') : t('লগআউট')}
            </button>
          </div>
          {error && (
            <p role="alert" className="w-full text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
      {children}
    </>
  )
}
