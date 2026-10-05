import { useEffect } from 'react'
import { SITE_NAME } from '@/config/site'
import { t } from '@/i18n'

/**
 * ব্রাউজার ট্যাবের শিরোনাম: `পেইজ/প্রকল্পের নাম — সাইটের নাম` (পরিকল্পনা §৫.১৪); না দিলে শুধু সাইটের নাম।
 * প্রতিটি পেইজ (রাউটের শেষ ধাপ) নিজে ডাকে। ভাষা বদলালে অ্যাপ remount হয়, তাই নতুন ভাষায় আবার বসে।
 * (মডালের মতো child-রাউট শিরোনাম বদলায় না — তালিকার প্রকল্পের নামই থাকে।)
 */
export function useDocumentTitle(title?: string | null): void {
  useEffect(() => {
    const site = t(SITE_NAME)
    document.title = title ? `${title} — ${site}` : site
  }, [title])
}
