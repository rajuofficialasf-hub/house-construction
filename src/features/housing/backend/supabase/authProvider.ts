import type { User } from '@supabase/supabase-js'
import type { AuthProvider } from '../interfaces/authProvider'
import { HousingApiError, type AdminRole, type AuthUser } from '../interfaces/types'
import type { GetClient } from './client'
import { mapSupabaseError } from './errors'
import { adminRole, clearAdminCache } from './session'

function toAuthUser(user: User, role: AdminRole): AuthUser {
  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string }
  return {
    id: user.id,
    email: user.email ?? '',
    name: meta.name ?? meta.full_name ?? null,
    role,
  }
}

/**
 * Supabase Auth (ইমেইল + পাসওয়ার্ড)। সেশন localStorage এ থাকে (persistSession), স্বয়ংক্রিয় রিফ্রেশ।
 * "এডমিন" = housing_admins টেবিলে সারি আছে; না থাকলে লগইন সফল হলেও সাথে সাথে signOut + FORBIDDEN।
 * সাইন-আপ এই অ্যাপে নেই (Dashboard এও বন্ধ রাখতে হবে)।
 */
export function createSupabaseAuthProvider(getClient: GetClient): AuthProvider {
  /** সেশনের ইউজারকে AuthUser এ রূপান্তর; এডমিন না হলে null (+ ঐচ্ছিক signOut) */
  async function resolve(user: User, signOutIfNotAdmin: boolean): Promise<AuthUser | null> {
    const role = await adminRole(getClient, user.id)
    if (!role) {
      if (signOutIfNotAdmin) await getClient().auth.signOut()
      return null
    }
    return toAuthUser(user, role)
  }

  return {
    async login(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        throw new HousingApiError('UNAUTHENTICATED', 'ইমেইল বা পাসওয়ার্ড সঠিক নয়', {
          supabase_message: error.message,
        })
      }
      clearAdminCache()
      const user = await resolve(data.user, true)
      if (!user) throw new HousingApiError('FORBIDDEN', 'এই অ্যাকাউন্ট এডমিন তালিকায় নেই')
      return user
    },

    async logout() {
      const { error } = await getClient().auth.signOut()
      clearAdminCache()
      if (error) throw mapSupabaseError(error)
    },

    async currentUser() {
      const { data, error } = await getClient().auth.getSession()
      if (error) throw mapSupabaseError(error)
      if (!data.session) return null
      try {
        return await resolve(data.session.user, false)
      } catch {
        return null
      }
    },

    async isAdmin() {
      const { data } = await getClient().auth.getSession()
      const id = data.session?.user.id
      if (!id) return false
      try {
        return (await adminRole(getClient, id)) !== null
      } catch {
        return false
      }
    },

    onAuthChange(callback) {
      const { data } = getClient().auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') clearAdminCache()
        if (!session) {
          callback(null)
          return
        }
        // এডমিন যাচাই async — role পাওয়ার পর callback
        void resolve(session.user, false)
          .then(callback)
          .catch(() => callback(null))
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
