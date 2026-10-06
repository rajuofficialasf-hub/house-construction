/**
 * এডমিন যাচাইয়ের সহায়ক (ক্লায়েন্ট-সাইড, শুধু ভালো এরর বার্তা ও UI এর জন্য)।
 * প্রকৃত নিরাপত্তা RLS এ (is_housing_admin(), housing_my_project_keys()); এখানে ব্যর্থ হলেও ডাটাবেস লেখা আটকাবে।
 */
import { HousingApiError, type AdminRole, type ProjectKey } from '../interfaces/types'
import type { GetClient } from './client'
import { mapSupabaseError } from './errors'

/** বর্তমান ইউজারের এডমিন-তথ্য (housing_current_admin) */
export interface AdminInfo {
  role: AdminRole
  /** মূল এডমিন বা "সব প্রকল্প" — SQL ১৪-এর আগে (কলাম নেই) সবাই true */
  allProjects: boolean
  /** যেসব প্রকল্পে লিখতে পারেন (গ্রুপ-বরাদ্দে উপ-প্রকল্পসহ); allProjects হলে এটি দেখা হয় না */
  projects: ProjectKey[]
}

/** userId → তথ্য (null = এডমিন নয়) */
const infoCache = new Map<string, AdminInfo | null>()

export function clearAdminCache(): void {
  infoCache.clear()
}

export async function currentUserId(getClient: GetClient): Promise<string | null> {
  const { data, error } = await getClient().auth.getSession()
  if (error) throw mapSupabaseError(error)
  return data.session?.user.id ?? null
}

/** housing_admins থেকে বর্তমান ব্যবহারকারীর ভূমিকা ও প্রকল্প (RPC housing_current_admin); নেই/নিষ্ক্রিয় → null */
export async function adminInfo(getClient: GetClient, userId: string): Promise<AdminInfo | null> {
  const cached = infoCache.get(userId)
  if (cached !== undefined) return cached
  const { data, error } = await getClient().rpc('housing_current_admin')
  if (error) throw mapSupabaseError(error)
  const row = ((data ?? []) as { role: string; all_projects?: boolean | null; projects?: string[] | null }[])[0]
  const raw = row?.role
  // সব ভূমিকাই প্যানেলে ঢোকে: main_admin = মূল এডমিন, editor = প্রকল্পের ইউজার (SQL ১৪), admin = ১৪-এর আগের সাধারণ এডমিন।
  // নিষ্ক্রিয় ইউজারের সারি RPC ফেরত দেয় না → null। কে কী পারেন তা ডাটাবেস ঠিক করে।
  const role: AdminRole | null = raw === 'main_admin' || raw === 'editor' || raw === 'admin' ? raw : null
  const info: AdminInfo | null = role
    ? {
        role,
        // SQL ১৪-এর আগে all_projects নেই → সবাই সব প্রকল্পে (আগের নিয়ম)
        allProjects: role === 'main_admin' || row?.all_projects !== false,
        projects: Array.isArray(row?.projects) ? row.projects : [],
      }
    : null
  infoCache.set(userId, info)
  return info
}

/** শুধু ভূমিকা (পুরনো ডাকার জায়গাগুলোর জন্য) */
export async function adminRole(getClient: GetClient, userId: string): Promise<AdminRole | null> {
  return (await adminInfo(getClient, userId))?.role ?? null
}

export async function isAdminUser(getClient: GetClient, userId: string): Promise<boolean> {
  return (await adminRole(getClient, userId)) !== null
}

/** লেখার আগে ডাকা হয়: লগইন নেই → UNAUTHENTICATED, এডমিন নয় → FORBIDDEN */
export async function assertAdmin(getClient: GetClient): Promise<string> {
  const userId = await currentUserId(getClient)
  if (!userId) throw new HousingApiError('UNAUTHENTICATED', 'এই কাজের জন্য লগইন করতে হবে')
  if (!(await isAdminUser(getClient, userId))) {
    throw new HousingApiError('FORBIDDEN', 'আপনার এডমিন অনুমতি নেই')
  }
  return userId
}

/** শুধু মূল এডমিনের কাজের আগে (ইউজার-ব্যবস্থাপনা ইত্যাদি) — প্রকৃত নিষেধ ডাটাবেসে */
export async function assertMainAdmin(getClient: GetClient): Promise<string> {
  const userId = await assertAdmin(getClient)
  if ((await adminRole(getClient, userId)) !== 'main_admin') throw new HousingApiError('FORBIDDEN', 'শুধু মূল এডমিন এই কাজ করতে পারেন')
  return userId
}
