import type { AdminUsersApi } from '../interfaces/adminUsersApi'
import { HousingApiError, type AdminRole, type AdminUserRow } from '../interfaces/types'
import type { GetClient } from './client'
import { mapSupabaseError } from './errors'
import { isMissingError, simulateLegacyDb } from './legacy'
import { assertMainAdmin } from './session'

/** SQL ১৪ চালানো হয়নি (ফাংশন নেই) → স্পষ্ট বাংলা নির্দেশনা */
function notInstalled(): HousingApiError {
  return new HousingApiError('CONFIG_ERROR', 'ইউজার-ব্যবস্থাপনার জন্য আগে ডাটাবেসে SQL ১৪ চালাতে হবে (চেকলিস্ট সারি ৩৫: 14_project_users.sql)')
}

/**
 * ইউজার-ব্যবস্থাপনা — RPC housing_admin_users / housing_admin_user_save (SQL ১৪; দুটোই DEFINER, ভেতরে মূল-এডমিন যাচাই)।
 */
export function createSupabaseAdminUsersApi(getClient: GetClient): AdminUsersApi {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    if (simulateLegacyDb()) throw notInstalled()
    await assertMainAdmin(getClient)
    const { data, error } = await getClient().rpc(fn, args)
    if (error) {
      if (isMissingError(error)) throw notInstalled()
      throw mapSupabaseError(error)
    }
    return data as T
  }

  return {
    async list() {
      const rows = await call<(Omit<AdminUserRow, 'role'> & { role: string })[]>('housing_admin_users')
      return (rows ?? []).map((r) => ({
        ...r,
        role: (r.role === 'main_admin' ? 'main_admin' : 'editor') as AdminRole,
        projects: Array.isArray(r.projects) ? r.projects : [],
      }))
    },

    async save(input) {
      const email = input.email.trim()
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HousingApiError('VALIDATION_ERROR', 'সঠিক ইমেইল দিন', { field: 'email' })
      if (!input.all_projects && input.is_active && input.projects.length === 0) {
        throw new HousingApiError('VALIDATION_ERROR', 'অন্তত একটি প্রকল্প বাছুন, অথবা "সব প্রকল্প" দিন', { field: 'projects' })
      }
      const r = await call<{ user_id: string; email: string; created: boolean }>('housing_admin_user_save', {
        p_email: email,
        p_all_projects: input.all_projects,
        p_projects: input.all_projects ? [] : input.projects,
        p_active: input.is_active,
      })
      return { user_id: r.user_id, email: r.email, created: !!r.created }
    },
  }
}
