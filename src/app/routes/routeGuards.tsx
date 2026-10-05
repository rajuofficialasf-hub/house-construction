import { t } from '@/i18n'
import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { findBySlug, getRegistry, housingProjects, leafProjects, refreshProjects, useProjects, useRegistry } from '@/features/projects/registry'
import { useAuth } from '@/features/housing/hooks/useAuth'
import { adminPath } from '@/features/housing/utils/housingProjects'
import { NotFoundPage } from '@/pages/NotFoundPage'

/**
 * `*` রাউট (পরিকল্পনা §৫.১৪): রেজিস্ট্রি নেটওয়ার্ক থেকে মিলিয়ে নেওয়া শেষ (বা ব্যর্থ) না হওয়া পর্যন্ত 404 নয় — শুধু
 * স্ন্যাপশট দেখে কখনো 404 দেখায় না। ফলে সদ্য প্রকাশিত প্রকল্পের ডিপ লিংকেও ক্ষণিকের 404 আসে না: তালিকা এলে রাউট তৈরি হয়।
 */
export function ConfigAwareNotFound() {
  const { synced } = useRegistry()
  if (!synced) {
    return (
      <div className="container-page py-20 text-center text-sm text-slate-500" aria-busy="true">
        {t('লোড হচ্ছে…')}
      </div>
    )
  }
  return <NotFoundPage />
}

const ADMIN_TOOLS = new Set(['login', 'import', 'photos', 'activity'])

/**
 * পুরনো এডমিন লিংক (পর্ব ১) → নতুন (পরিকল্পনা §৪.৩): /housing/admin/* → /admin/*, প্রকল্পের slug → key।
 *   /housing/admin → /admin · /housing/admin/login → /admin/login · /housing/admin/import|photos|activity → /admin/…
 *   /housing/admin/semi-pucca[/new | /:serial/edit] → /admin/records/semi_pucca[/…]
 * query (?…), hash ও লগইনের ফেরার-পাথ (state) সাথে যায়।
 */
export function LegacyAdminRedirect() {
  const params = useParams()
  const location = useLocation()
  const projects = useProjects()
  const parts = (params['*'] ?? '').split('/').filter(Boolean)
  let to = '/admin'
  if (parts.length && ADMIN_TOOLS.has(parts[0])) {
    to = `/admin/${parts[0]}`
  } else if (parts.length) {
    const key = findBySlug(parts[0], projects)?.key ?? parts[0].replace(/-/g, '_')
    to = adminPath(key, parts.slice(1).join('/'))
  }
  return <Navigate to={`${to}${location.search}${location.hash}`} replace state={location.state} />
}

/** /admin — ড্যাশবোর্ড আসবে M-ধাপ ৭-এ; ততদিন প্রথম প্রকল্পের রেকর্ড-তালিকায় (আগের /housing/admin এর মতো) */
export function AdminIndexRedirect() {
  const projects = useProjects()
  const first = housingProjects(projects)[0] ?? leafProjects(projects)[0]
  return <Navigate to={first ? adminPath(first.key) : '/admin/activity'} replace />
}

/**
 * এডমিন লগইন থাকলে রেজিস্ট্রি খসড়াসহ লোড করে (খসড়া প্রকল্পের রাউট + DraftBanner), লগআউটে আবার শুধু পাবলিক।
 * ভাষা টগলে remount হলেও অবস্থা একই থাকলে কোনো নতুন রিকোয়েস্ট যায় না।
 */
export function RegistryAuthSync() {
  const auth = useAuth()
  const admin = auth.status === 'ready' && !!auth.user && auth.isAdmin
  useEffect(() => {
    if (auth.status !== 'ready') return
    if (admin !== getRegistry().includeDrafts) void refreshProjects({ includeDrafts: admin })
  }, [auth.status, admin])
  return null
}
