/**
 * ঘর নির্মাণ পেইজগুলোর প্রকল্প-সহায়ক — প্রকল্প-রেজিস্ট্রি থেকে (M-ধাপ ৫ক-এ হাতে লেখা PROJECT_META/PROJECT_LIST এর জায়গায়)।
 * নাম/বর্ণনা দেখাতে lt(project, 'name') ব্যবহার করুন (t() নয়)।
 */
import type { Project, ProjectKey } from '@/backend'
import { findProject, housingProjects, useProjects } from '@/features/projects/registry'

export { projectPath } from '@/features/projects/registry'

/** এডমিনের রেকর্ড-পাতা: /housing/admin/{slug}[/{rest}] (M-ধাপ ৬-এ /admin এ সরবে) */
export function adminPath(key: ProjectKey, rest = ''): string {
  const slug = findProject(key)?.slug ?? key.replace(/_/g, '-')
  return `/housing/admin/${slug}${rest ? `/${rest}` : ''}`
}

/** ঘর নির্মাণের উপ-প্রকল্পগুলো (সেমিপাকা, টিন …) — sort_order ক্রমে */
export function useHousingProjects(): Project[] {
  return housingProjects(useProjects())
}

/** URL-এর slug থেকে ঘর নির্মাণের উপ-প্রকল্প; না মিললে undefined (তখন পেইজ 404 দেখায়) */
export function useHousingProjectBySlug(slug: string | undefined): Project | undefined {
  const list = useHousingProjects()
  return slug ? list.find((p) => p.slug === slug) : undefined
}
