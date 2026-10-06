import { LanguageToggle, t } from '@/i18n'
import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { SITE_NAME, SITE_NAME_SHORT } from '@/config/site'
import { MobileProjectLinks, ProjectsMenu } from './ProjectsMenu'

/** স্থির মেনু; প্রকল্পগুলো "প্রকল্পসমূহ ▾" এ (রেজিস্ট্রি থেকে, ProjectsMenu.tsx) */
const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [{ to: '/', label: 'হোম', end: true }]

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-700 text-white'
      : 'text-brand-50/90 hover:bg-brand-700/60 hover:text-white',
  ].join(' ')
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 bg-brand-800 text-white shadow-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-base font-bold text-brand-950"
          >
            {SITE_NAME_SHORT}
          </span>
          <span className="text-lg font-semibold tracking-tight max-[359px]:sr-only">{t(SITE_NAME)}</span>
        </Link>

        <nav aria-label={t('প্রধান মেনু')} className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              {t(item.label)}
            </NavLink>
          ))}
          <ProjectsMenu />
          <LanguageToggle className="ml-2" />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
        <LanguageToggle />
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-brand-700"
          aria-label={open ? t('মেনু বন্ধ করুন') : t('মেনু খুলুন')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        </div>
      </div>

      {open && (
        <nav aria-label={t('মোবাইল মেনু')} className="border-t border-brand-700 md:hidden">
          <div className="container-page flex flex-col gap-1 py-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
                onClick={() => setOpen(false)}
              >
                {t(item.label)}
              </NavLink>
            ))}
            <MobileProjectLinks onNavigate={() => setOpen(false)} />
            <LanguageToggle className="mt-2 self-start" />
          </div>
        </nav>
      )}
    </header>
  )
}
