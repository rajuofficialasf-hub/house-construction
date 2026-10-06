import { t } from '@/i18n'
import { SITE_NAME } from '@/config/site'
import { toBanglaNumber } from '@/lib/banglaNumber'
import logoUrl from '@/assets/asf-logo.svg'

const CURRENT_YEAR = new Date().getFullYear()

/** ফুটার: মাঝে লোগো, নিচে প্রতিষ্ঠানের পরিচয়-বাক্য, তারপর কপিরাইট */
export function SiteFooter() {
  const year = CURRENT_YEAR
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col items-center gap-4 py-8 text-center">
        <img src={logoUrl} alt={t(SITE_NAME)} width={123} height={80} className="h-20 w-auto" />
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          {t('এই প্রতিষ্ঠান মানবতার শিক্ষক, মানুষের মুক্তি ও শান্তির দূত, মানবসেবার আদর্শ, মহানবী মুহাম্মদ সা.-এর পদাঙ্ক অনুসরণ করে আর্তমানবতার সেবায় একটি আদর্শ কল্যাণসমাজ বিনির্মাণে যথাশক্তি প্রচেষ্টা চালিয়ে যাচ্ছে।')}
        </p>
        <p className="text-xs text-slate-500">
          © {toBanglaNumber(year)} {t(SITE_NAME)}
        </p>
      </div>
    </footer>
  )
}
