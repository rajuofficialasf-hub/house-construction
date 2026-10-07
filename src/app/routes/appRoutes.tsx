import { Route } from 'react-router'
import type { Project } from '@/backend'
import { childrenOf, topLevelProjects } from '@/features/projects/registry'
import { RequireAdmin } from '@/features/housing/components/RequireAdmin'
import { GroupLandingPage } from '@/features/projects/landing/GroupLandingPage'
import { ProjectListPage } from '@/features/projects/list/ProjectListPage'
import { HousingLoginPage } from '@/features/housing/pages/HousingLoginPage'
import {
  Lazy,
  LazyProjectDetailPage,
} from '@/features/housing/pages/lazyPages'
import { LazyAdminDashboardPage, LazyAdminUsersPage, LazyAdminProjectsPage, LazyActivityPage, LazyAdminRecordsPage, LazyImportPage, LazyPhotoBulkPage, LazyProjectSettingsPage, LazyProjectWizardPage, LazyRecordFormPage } from '@/features/admin/pages/lazyAdminPages'
import { RoleGate } from '@/features/admin/layout/RoleGate'

const SETTINGS_ROLES = ['main_admin', 'admin'] as const
import { ProjectFrame } from './ProjectFrame'
import { LegacyAdminRedirect } from './routeGuards'

/**
 * রাউট-টেবিলের অংশ (App.tsx এ <Routes> এর ভেতরে বসে; Route এলিমেন্ট সরাসরি Routes এর child হতে হয় বলে
 * এগুলো কম্পোনেন্ট নয়, এলিমেন্ট/এলিমেন্টের তালিকা)।
 */

/**
 * রেজিস্ট্রি থেকে পাবলিক রাউট (পরিকল্পনা §৪.১): গ্রুপ `/{slug}` = ল্যান্ডিং, তার উপ-প্রকল্প `/{group}/{slug}`;
 * একক প্রকল্প `/{slug}`। প্রতিটি তালিকার child `:serial` = বিস্তারিত মডাল (Outlet-মডাল প্যাটার্ন অপরিবর্তিত)।
 * পেইজগুলো এখনো ঘর নির্মাণের — জেনেরিক তালিকা/ল্যান্ডিং আসবে M-ধাপ ১৩/১৫-এ।
 */
export function projectRoutes(projects: Project[]) {
  return topLevelProjects(projects).map((p) =>
    p.is_group ? (
      <Route key={p.key} path={p.slug}>
        <Route
          index
          element={
            <ProjectFrame project={p}>
              <GroupLandingPage group={p} />
            </ProjectFrame>
          }
        />
        {childrenOf(p.key, projects)
          .filter((c) => !c.is_group)
          .map(leafRoute)}
      </Route>
    ) : (
      leafRoute(p)
    ),
  )
}

function leafRoute(p: Project) {
  return (
    <Route
      key={p.key}
      path={p.slug}
      element={
        <ProjectFrame project={p}>
          <ProjectListPage project={p} />
        </ProjectFrame>
      }
    >
      <Route
        path=":serial"
        element={
          <Lazy>
            <LazyProjectDetailPage />
          </Lazy>
        }
      />
    </Route>
  )
}

/**
 * এডমিন (পরিকল্পনা §৪.২): URL এ স্থায়ী key (`/admin/records/semi_pucca`), সব পেইজ lazy।
 * পুরনো `/housing/admin/*` লিংক নতুনে রিডাইরেক্ট (§৪.৩)।
 */
export const adminRoutes = [
  <Route key="admin-login" path="admin/login" element={<HousingLoginPage />} />,
  <Route key="admin" path="admin" element={<RequireAdmin />}>
    <Route index element={<Lazy><LazyAdminDashboardPage /></Lazy>} />
    {/* প্রকল্পের সেটিংস: মূল এডমিন ও সাধারণ এডমিন; প্রকল্পের ইউজার (editor) নয় */}
    <Route path="projects" element={<RoleGate allow={SETTINGS_ROLES}><Lazy><LazyAdminProjectsPage /></Lazy></RoleGate>} />
    <Route path="projects/new" element={<RoleGate allow={SETTINGS_ROLES}><Lazy><LazyProjectWizardPage /></Lazy></RoleGate>} />
    <Route path="projects/:key" element={<RoleGate allow={SETTINGS_ROLES}><Lazy><LazyProjectSettingsPage /></Lazy></RoleGate>} />
    <Route path="users" element={<RoleGate allow={['main_admin']}><Lazy><LazyAdminUsersPage /></Lazy></RoleGate>} />
    <Route path="records/:key" element={<Lazy><LazyAdminRecordsPage /></Lazy>} />
    <Route path="records/:key/new" element={<Lazy><LazyRecordFormPage mode="new" /></Lazy>} />
    <Route path="records/:key/:serial/edit" element={<Lazy><LazyRecordFormPage mode="edit" /></Lazy>} />
    <Route path="import" element={<Lazy><LazyImportPage /></Lazy>} />
    <Route path="photos" element={<Lazy><LazyPhotoBulkPage /></Lazy>} />
    <Route path="activity" element={<Lazy><LazyActivityPage /></Lazy>} />
  </Route>,
  <Route key="legacy-admin" path="housing/admin/*" element={<LegacyAdminRedirect />} />,
]
