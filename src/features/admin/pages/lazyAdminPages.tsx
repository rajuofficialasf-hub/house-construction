import { lazy } from 'react'

/** এডমিন প্যানেলের পাতা — সব lazy (পরিকল্পনা §৪.২); <Lazy> (features/housing/pages/lazyPages.tsx) দিয়ে মোড়ানো */
export const LazyAdminDashboardPage = lazy(() => import('./AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
export const LazyAdminProjectsPage = lazy(() => import('./AdminProjectsPage').then((m) => ({ default: m.AdminProjectsPage })))
export const LazyProjectWizardPage = lazy(() => import('./ProjectWizardPage').then((m) => ({ default: m.ProjectWizardPage })))
export const LazyProjectSettingsPage = lazy(() => import('./ProjectSettingsPage').then((m) => ({ default: m.ProjectSettingsPage })))
/** রেকর্ড (M-ধাপ ১০-এ features/housing থেকে সরানো — এখন যেকোনো প্রকল্পের, ফিল্ড-চালিত) */
export const LazyAdminRecordsPage = lazy(() => import('../records/AdminRecordsPage').then((m) => ({ default: m.AdminRecordsPage })))
export const LazyRecordFormPage = lazy(() => import('../records/RecordFormPage').then((m) => ({ default: m.RecordFormPage })))
/** বাল্ক ইম্পোর্ট (M-ধাপ ১১-এ features/housing থেকে সরানো — এখন যেকোনো প্রকল্পের, ফিল্ড-চালিত) */
export const LazyImportPage = lazy(() => import('../import/ImportPage').then((m) => ({ default: m.ImportPage })))
/** ছবি বাল্ক আপডেট ও একটিভিটি লগ (M-ধাপ ১২-এ features/housing থেকে সরানো — যেকোনো প্রকল্পের) */
export const LazyPhotoBulkPage = lazy(() => import('../photos/PhotoBulkPage').then((m) => ({ default: m.PhotoBulkPage })))
export const LazyActivityPage = lazy(() => import('../activity/ActivityPage').then((m) => ({ default: m.ActivityPage })))
