import { t } from '@/i18n'
import { SITE_NAME } from '@/config/site'
import { toBanglaNumber } from '@/lib/banglaNumber'

const CURRENT_YEAR = new Date().getFullYear()

export function SiteFooter() {
  const year = CURRENT_YEAR
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col items-center justify-between gap-2 py-6 text-sm text-slate-500 sm:flex-row">
        <p>© {toBanglaNumber(year)} {t(SITE_NAME)}</p>
        <p>{t('মানবতার সেবায় নিবেদিত')}</p>
      </div>
    </footer>
  )
}
