import { Navigate, Route } from 'react-router'
import { HousingLandingPage } from './pages/HousingLandingPage'
import { HousingListPage } from './pages/HousingListPage'
import { HousingLoginPage } from './pages/HousingLoginPage'
import {
  Lazy,
  LazyHousingActivityPage,
  LazyHousingAdminRecordsPage,
  LazyHousingDetailPage,
  LazyHousingImportPage,
  LazyHousingPhotoBulkPage,
  LazyHousingRecordFormPage,
} from './pages/lazyPages'
import { RequireAdmin } from './components/RequireAdmin'
import { PROJECT_META } from './utils/projectType'

/**
 * /housing/* রুটসমূহ। App.tsx এ <Routes> এর ভেতরে {housingRoutes} হিসেবে বসে।
 * (Route এলিমেন্ট সরাসরি Routes এর child হতে হয়, তাই এটি কম্পোনেন্ট নয়, এলিমেন্ট।)
 * পাবলিক: /housing, /housing/<slug>, /housing/<slug>/:serial, /housing/admin/login
 * সুরক্ষিত (RequireAdmin): /housing/admin → /housing/admin/semi-pucca (ট্যাব), /housing/admin/:slug,
 *   /housing/admin/:slug/new, /housing/admin/:slug/:serial/edit, /housing/admin/import, /housing/admin/photos
 * ভিউ মোড ও এডমিন পেইজ lazy (pages/lazyPages.tsx)।
 */
export const housingRoutes = (
  <Route path="housing">
    <Route index element={<HousingLandingPage />} />
    {/* ভিউ মোড /:serial তালিকার child — মডাল তালিকার উপরে খোলে, ফিল্টার/পেইজ URL এ থাকে */}
    <Route path={PROJECT_META.semi_pucca.slug} element={<HousingListPage projectType="semi_pucca" />}>
      <Route path=":serial" element={<Lazy><LazyHousingDetailPage /></Lazy>} />
    </Route>
    <Route path={PROJECT_META.tin.slug} element={<HousingListPage projectType="tin" />}>
      <Route path=":serial" element={<Lazy><LazyHousingDetailPage /></Lazy>} />
    </Route>
    <Route path="admin/login" element={<HousingLoginPage />} />
    <Route path="admin" element={<RequireAdmin />}>
      <Route index element={<Navigate to={PROJECT_META.semi_pucca.slug} replace />} />
      <Route path="photos" element={<Lazy><LazyHousingPhotoBulkPage /></Lazy>} />
      <Route path="import" element={<Lazy><LazyHousingImportPage /></Lazy>} />
      <Route path="activity" element={<Lazy><LazyHousingActivityPage /></Lazy>} />
      <Route path=":slug" element={<Lazy><LazyHousingAdminRecordsPage /></Lazy>} />
      <Route path=":slug/new" element={<Lazy><LazyHousingRecordFormPage mode="new" /></Lazy>} />
      <Route path=":slug/:serial/edit" element={<Lazy><LazyHousingRecordFormPage mode="edit" /></Lazy>} />
    </Route>
  </Route>
)
