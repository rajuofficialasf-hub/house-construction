import { lazy } from 'react'

/** এডমিন প্যানেলের পাতা — সব lazy (পরিকল্পনা §৪.২); <Lazy> (features/housing/pages/lazyPages.tsx) দিয়ে মোড়ানো */
export const LazyAdminDashboardPage = lazy(() => import('./AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
export const LazyAdminProjectsPage = lazy(() => import('./AdminProjectsPage').then((m) => ({ default: m.AdminProjectsPage })))
export const LazyProjectWizardPage = lazy(() => import('./ProjectWizardPage').then((m) => ({ default: m.ProjectWizardPage })))
export const LazyProjectSettingsPage = lazy(() => import('./ProjectSettingsPage').then((m) => ({ default: m.ProjectSettingsPage })))
