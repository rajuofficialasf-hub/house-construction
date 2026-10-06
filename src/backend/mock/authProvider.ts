import type { AuthProvider } from '../interfaces/authProvider'
import { HousingApiError, type AuthUser } from '../interfaces/types'
import { MOCK_ACCOUNTS } from './fixtures'
import type { MockStore } from './store'

/**
 * মক অথ: সাইন-আপ নেই; শুধু fixtures এর অ্যাকাউন্ট। এডমিন তালিকায় না থাকলে লগইন সফল হলেও সেশন তৈরি হয় না (FORBIDDEN)
 * — Supabase অ্যাডাপ্টারের মতো (supabase/authProvider.ts)।
 */
export function createMockAuthProvider(store: MockStore): AuthProvider {
  const adminUser = (): AuthUser | null => (store.session?.isAdmin ? store.session.user : null)
  return {
    async login(email, password) {
      const acct = MOCK_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase() && a.password === password)
      if (!acct) throw new HousingApiError('UNAUTHENTICATED', 'ইমেইল বা পাসওয়ার্ড সঠিক নয়')
      if (!acct.admin) throw new HousingApiError('FORBIDDEN', 'এই অ্যাকাউন্ট এডমিন তালিকায় নেই')
      const user: AuthUser = { id: acct.id, email: acct.email, name: acct.name, role: acct.role ?? 'admin' }
      store.setSession({ user, isAdmin: true })
      return user
    },
    async logout() {
      store.setSession(null)
    },
    async currentUser() {
      return adminUser()
    },
    async isAdmin() {
      return !!adminUser()
    },
    onAuthChange(cb) {
      return store.subscribe(cb)
    },
  }
}
