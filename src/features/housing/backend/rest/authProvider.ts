/**
 * REST AuthProvider — docs/api/API_CONTRACT.md §২ অনুযায়ী (POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me)।
 * JWT মোড: login উত্তরের access_token localStorage এ; প্রতিটি অনুরোধে Bearer।
 * কুকি মোড: access_token আসে না; ব্রাউজার HttpOnly কুকি পাঠায় (credentials: 'include')।
 * onAuthChange: এই অ্যাডাপ্টারের login/logout এ ও অন্য ট্যাবের storage ইভেন্টে callback।
 */
import type { AuthProvider } from '../interfaces/authProvider'
import type { AuthUser } from '../interfaces/types'
import { ENDPOINTS } from './endpoints'
import { restRequest, setToken, TOKEN_KEY } from './http'

interface LoginResponse {
  data: { access_token?: string; expires_at?: string; user: AuthUser }
}
interface MeResponse {
  data: AuthUser
}

export function createRestAuthProvider(baseUrl: string): AuthProvider {
  const listeners = new Set<(user: AuthUser | null) => void>()
  let cached: AuthUser | null | undefined // undefined = এখনো জানা নেই

  const emit = (user: AuthUser | null) => {
    cached = user
    for (const l of listeners) l(user)
  }

  async function fetchMe(): Promise<AuthUser | null> {
    try {
      const res = await restRequest<MeResponse>(baseUrl, ENDPOINTS.auth.me())
      cached = res.data
      return res.data
    } catch {
      cached = null
      return null
    }
  }

  return {
    async login(email, password) {
      const res = await restRequest<LoginResponse>(baseUrl, ENDPOINTS.auth.login(), {
        body: { email: email.trim(), password },
        auth: false,
      })
      if (res.data.access_token) setToken(res.data.access_token)
      emit(res.data.user)
      return res.data.user
    },

    async logout() {
      try {
        await restRequest<void>(baseUrl, ENDPOINTS.auth.logout(), { method: 'POST' })
      } finally {
        setToken(null)
        emit(null)
      }
    },

    async currentUser() {
      if (cached !== undefined) return cached
      return fetchMe()
    },

    async isAdmin() {
      const u = cached !== undefined ? cached : await fetchMe()
      return u?.role === 'admin'
    },

    onAuthChange(callback) {
      listeners.add(callback)
      const onStorage = (e: StorageEvent) => {
        if (e.key === TOKEN_KEY) void fetchMe().then(emit)
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(callback)
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
