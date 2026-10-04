import { t } from '@/i18n'
import { lazy, Suspense, type ReactNode } from 'react'

/**
 * ভিউ মোড ও এডমিন পেইজগুলো lazy — পাবলিক তালিকা পেইজের প্রথম লোড ছোট থাকে;
 * এডমিন কোড (ফর্ম, ইম্পোর্ট, ছবি বাল্ক, তুলনা) শুধু দরকার হলে নামে। routes.tsx এ <Lazy> দিয়ে মোড়ানো।
 */
export const LazyHousingDetailPage = lazy(() => import('./HousingDetailPage').then((m) => ({ default: m.HousingDetailPage })))
export const LazyHousingAdminRecordsPage = lazy(() => import('./HousingAdminRecordsPage').then((m) => ({ default: m.HousingAdminRecordsPage })))
export const LazyHousingRecordFormPage = lazy(() => import('./HousingRecordFormPage').then((m) => ({ default: m.HousingRecordFormPage })))
export const LazyHousingPhotoBulkPage = lazy(() => import('./HousingPhotoBulkPage').then((m) => ({ default: m.HousingPhotoBulkPage })))
export const LazyHousingImportPage = lazy(() => import('./HousingImportPage').then((m) => ({ default: m.HousingImportPage })))
export const LazyHousingActivityPage = lazy(() => import('./HousingActivityPage').then((m) => ({ default: m.HousingActivityPage })))
/** মানচিত্র (d3-geo + topojson ~৪০ KB gzip) শুধু তালিকা পেইজে দরকার হলে নামে */
export const LazyUpazilaMapPanel = lazy(() => import('../components/UpazilaMapPanel').then((m) => ({ default: m.UpazilaMapPanel })))

export function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-16 text-center text-sm text-slate-500" aria-busy="true">
          {t('লোড হচ্ছে…')}
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
