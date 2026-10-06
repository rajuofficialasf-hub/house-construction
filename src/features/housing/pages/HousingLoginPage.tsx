import { t } from '@/i18n'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { getAuthProvider, getHousingApi } from '../../../backend/factory'
import { HousingApiError } from '../../../backend/interfaces/types'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useAuth } from '../hooks/useAuth'

const DEFAULT_AFTER_LOGIN = '/admin'

/**
 * /admin/login — ইমেইল + পাসওয়ার্ড (AuthProvider.login)। সাইন-আপ/পাসওয়ার্ড-রিসেট লিঙ্ক নেই:
 * নতুন এডমিন শুধু ব্যাকএন্ড থেকে যোগ হয়। আগে থেকে লগইন থাকলে সরাসরি এডমিনে পাঠায়।
 */
export function HousingLoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || DEFAULT_AFTER_LOGIN
  useDocumentTitle(t('এডমিন লগইন'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<HousingApiError | null>(null)

  if (auth.status === 'ready' && auth.user && auth.isAdmin) {
    return <Navigate to={from} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await getAuthProvider().login(email, password)
      void getHousingApi().logActivity('login')
      navigate(from, { replace: true })
    } catch (err) {
      setError(HousingApiError.from(err))
    } finally {
      setBusy(false)
    }
  }

  const message = error
    ? error.code === 'CONFIG_ERROR'
      ? t('ব্যাকএন্ড সংযোগ কনফিগার করা হয়নি (.env.local দেখুন)।')
      : error.code === 'NETWORK_ERROR'
        ? t('সার্ভারে সংযোগ করা যায়নি।')
        : error.message
    : null

  return (
    <section className="container-page py-10 sm:py-14">
      <div className="mx-auto mt-4 max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{t('এডমিন লগইন')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('শুধু অনুমোদিত এডমিনদের জন্য। পাবলিক তালিকা দেখতে লগইন লাগে না।')}</p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">
                {t('ইমেইল')}
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                placeholder="admin@example.org"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">
                {t('পাসওয়ার্ড')}
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>

            {message && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-700 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('লগইন হচ্ছে…') : t('লগইন')}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-400">
            {t('পাসওয়ার্ড ভুলে গেলে বা নতুন এডমিন প্রয়োজন হলে ব্যাকএন্ড অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।')}
          </p>
        </div>
      </div>
    </section>
  )
}
