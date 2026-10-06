import { lt, t } from '@/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { getAuthProvider, getHousingApi, HousingApiError, type AuthUser } from '@/backend'
import { adminPath, useRecordProjects } from '@/features/housing/utils/housingProjects'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

/**
 * এডমিন প্যানেলের লেআউট (পরিকল্পনা M-ধাপ ৭): ডেস্কটপে (lg+) বাম সাইডবার, ফোনে উপরের বারের "মেনু" থেকে ড্রয়ার।
 * সব লিংক/বোতাম কমপক্ষে ৪৪px উঁচু (আঙুলে চাপার জন্য)। রেকর্ড-লিংক রেজিস্ট্রি থেকে (এখন ঘর নির্মাণের উপ-প্রকল্প;
 * জেনেরিক রেকর্ড-পাতা M-ধাপ ১০-এ)।
 */
export function AdminLayout({ user, children }: { user: AuthUser; children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // সব প্রকল্পের রেকর্ড (M-ধাপ ১০) — খসড়ায় চিহ্ন
  const records = useRecordProjects().map((p) => ({ to: adminPath(p.key), label: p.is_published ? lt(p, 'name') : t('{name} (খসড়া)', { name: lt(p, 'name') }) }))
  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: t('প্যানেল'),
      items: [
        { to: '/admin', label: t('ড্যাশবোর্ড'), end: true },
        { to: '/admin/projects', label: t('প্রকল্পসমূহ') },
      ],
    },
    { title: t('রেকর্ড'), items: records },
    {
      title: t('সরঞ্জাম'),
      items: [
        { to: '/admin/import', label: t('বাল্ক ইম্পোর্ট') },
        { to: '/admin/photos', label: t('ছবি বাল্ক আপডেট') },
        { to: '/admin/activity', label: t('একটিভিটি লগ') },
      ],
    },
  ]

  // পাতা বদলালে ড্রয়ার বন্ধ; Esc এ বন্ধ; খোলা অবস্থায় পেছনের পাতা স্ক্রল হয় না
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setDrawer(false)
  }
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [drawer])

  const logout = async () => {
    setBusy(true)
    setError(null)
    try {
      await getHousingApi().logActivity('logout')
      await getAuthProvider().logout()
      navigate('/', { replace: true })
    } catch (err) {
      setError(HousingApiError.from(err).message)
    } finally {
      setBusy(false)
    }
  }

  const nav = (
    <nav aria-label={t('এডমিন মেনু')} className="flex flex-col gap-5">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{g.title}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.end}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${isActive ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`
                    }
                  >
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </nav>
  )

  const account = (
    <div className="border-t border-slate-200 pt-4 text-sm">
      <p className="truncate px-3 text-slate-600" title={user.email}>
        {user.name ?? user.email}
      </p>
      <p className="px-3 text-xs text-slate-400">{user.role === 'main_admin' ? t('মূল এডমিন') : user.role === 'editor' ? t('প্রকল্পের ইউজার') : t('এডমিন')}</p>
      <div className="mt-2 flex flex-col gap-1">
        <Link to="/" className="flex min-h-11 items-center rounded-md px-3 text-slate-700 hover:bg-slate-100">
          {t('পাবলিক সাইট দেখুন')}
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={busy}
          className="flex min-h-11 items-center rounded-md px-3 text-left font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy ? t('লগআউট হচ্ছে…') : t('লগআউট')}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 px-3 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )

  return (
    <div className="bg-slate-50">
      {/* ফোন/ট্যাব: উপরের বার */}
      <div className="sticky top-16 z-30 flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 lg:hidden">
        <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">{t('এডমিন')}</span>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {t('এডমিন মেনু')}
        </button>
      </div>

      <div className="mx-auto flex max-w-[90rem]">
        {/* ডেস্কটপ সাইডবার */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-200 bg-white p-4 lg:flex">
          {nav}
          {account}
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {/* ফোনের ড্রয়ার */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('এডমিন মেনু')}>
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label={t('মেনু বন্ধ করুন')} onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between gap-6 overflow-y-auto bg-white p-4 shadow-xl">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">{t('এডমিন মেনু')}</span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  aria-label={t('মেনু বন্ধ করুন')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                    <path strokeLinecap="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {nav}
            </div>
            {account}
          </div>
        </div>
      )}
    </div>
  )
}
