import { lt, t } from '@/i18n'
import { NavLink } from 'react-router'
import { projectPath, useHousingProjects } from '../utils/housingProjects'

interface Props {
  /** dark: গাঢ় (সবুজ) ব্যাকগ্রাউন্ডের উপর */
  variant?: 'light' | 'dark'
}

const STYLES = {
  light: {
    active: 'border-brand-700 bg-brand-700 text-white',
    idle: 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-700',
  },
  dark: {
    active: 'border-white bg-white text-brand-800',
    idle: 'border-white/40 bg-white/10 text-white hover:bg-white/20',
  },
}

/** হাউজিং সেকশনের ভেতরের নেভিগেশন (ল্যান্ডিং, দুই প্রকল্প) */
export function HousingSubnav({ variant = 'light' }: Props) {
  const s = STYLES[variant]
  // পাবলিক নেভিগেশন — এডমিন লিঙ্ক ইচ্ছাকৃতভাবে নেই (এডমিন সরাসরি /housing/admin এ যাবেন); প্রকল্প রেজিস্ট্রি থেকে
  const links = [
    { to: '/housing', label: t('সব প্রকল্প'), end: true },
    ...useHousingProjects().map((p) => ({ to: projectPath(p), label: lt(p, 'name'), end: false })),
  ]
  return (
    <nav aria-label={t('ঘর নির্মাণ প্রকল্প মেনু')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            [
              'shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              isActive ? s.active : s.idle,
            ].join(' ')
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}
