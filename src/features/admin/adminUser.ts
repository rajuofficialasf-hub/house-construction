import { createContext, useContext } from 'react'
import type { AuthUser, ProjectKey } from '@/backend'

/**
 * এডমিন প্যানেলের বর্তমান ইউজার (পর্ব চ, M-ধাপ ১৯) — RequireAdmin দেয়; প্যানেলের বাইরে null।
 * শুধু দেখানো/লুকানোর জন্য — প্রকৃত নিষেধ ডাটাবেসে (SQL ১৪: RLS, গার্ড-ট্রিগার, Storage পলিসি)।
 */
export const AdminUserContext = createContext<AuthUser | null>(null)

export function useAdminUser(): AuthUser | null {
  return useContext(AdminUserContext)
}

/** মূল (সুপার) এডমিন: মোছা, থাকা ছবি বদল, মান ফাঁকা করা, সিরিয়াল বদল, প্রকল্পের সেটিংস, ইউজার */
export function isMainAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'main_admin'
}

/** এই প্রকল্পে যোগ/এডিট পারেন? (মূল এডমিন, "সব প্রকল্প", বা বরাদ্দ — গ্রুপ-বরাদ্দে উপ-প্রকল্পসহ) */
export function canEditProject(user: AuthUser | null | undefined, key: ProjectKey | null | undefined): boolean {
  if (!user || !key) return false
  return user.role === 'main_admin' || user.allProjects || user.projects.includes(key)
}
