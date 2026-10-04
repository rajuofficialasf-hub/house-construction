import { t } from '@/i18n'
import { NavLink } from 'react-router'
import { PROJECT_LIST, projectPath } from '../utils/projectType'

/** পাবলিক নেভিগেশন — এডমিন লিঙ্ক ইচ্ছাকৃতভাবে নেই (এডমিন সরাসরি /housing/admin এ যাবেন) */
const LINKS = [
  { to: '/housing', label: 'সব প্রকল্প', end: true },
  ...PROJECT_LIST.map((p) => ({ to: projectPath(p.type), label: p.title, end: false })),
]

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
  return (
    <nav aria-label={t('ঘর নির্মাণ প্রকল্প মেনু')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {LINKS.map((l) => (
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
          {t(l.label)}
        </NavLink>
      ))}
    </nav>
  )
}
