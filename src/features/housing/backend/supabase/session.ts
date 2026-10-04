/**
 * এডমিন যাচাইয়ের সহায়ক (ক্লায়েন্ট-সাইড, শুধু ভালো এরর বার্তা ও UI এর জন্য)।
 * প্রকৃত নিরাপত্তা RLS এ (is_housing_admin()); এখানে ব্যর্থ হলেও ডাটাবেস লেখা আটকাবে।
 */
import { HousingApiError, type AdminRole } from '../interfaces/types'
import type { GetClient } from './client'
import { mapSupabaseError } from './errors'

/** userId → role (null = এডমিন নয়) */
const roleCache = new Map<string, AdminRole | null>()

export function clearAdminCache(): void {
  roleCache.clear()
}

export async function currentUserId(getClient: GetClient): Promise<string | null> {
  const { data, error } = await getClient().auth.getSession()
  if (error) throw mapSupabaseError(error)
  return data.session?.user.id ?? null
}

/** housing_admins থেকে বর্তমান ব্যবহারকারীর role (RPC housing_current_admin); নেই → null */
export async function adminRole(getClient: GetClient, userId: string): Promise<AdminRole | null> {
  const cached = roleCache.get(userId)
  if (cached !== undefined) return cached
  const { data, error } = await getClient().rpc('housing_current_admin')
  if (error) throw mapSupabaseError(error)
  const rows = (data ?? []) as { role: string }[]
  const role = rows.length > 0 && rows[0].role === 'admin' ? ('admin' as const) : null
  roleCache.set(userId, role)
  return role
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
