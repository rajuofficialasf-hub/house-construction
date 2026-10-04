import { Route, Routes } from 'react-router'
import { SiteLayout } from '@/app/layout/SiteLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/Toast'
import { LanguageProvider } from '@/i18n'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { housingRoutes } from '@/features/housing/routes'

/** সাইটের রুট টেবিল। ফিচারভিত্তিক রুট (যেমন housing) নিজ নিজ routes.tsx থেকে আসে। LanguageProvider ভাষা বদলালে সব remount করে। */
export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <ErrorBoundary>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            {housingRoutes}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </LanguageProvider>
  )
}
