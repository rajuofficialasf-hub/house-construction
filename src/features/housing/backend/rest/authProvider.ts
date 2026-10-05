/**
 * REST AuthProvider — docs/api/API_CONTRACT.md §২ অনুযায়ী (POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/me)।
 * সেশন শুধু সার্ভারের HttpOnly কুকিতে; ব্রাউজার নিজে পাঠায় (credentials: 'include'), JS টোকেন দেখে না (RE-SEC-03)।
 * onAuthChange: এই অ্যাডাপ্টারের login/logout এ, আর অন্য ট্যাবের login/logout এ (BroadcastChannel) callback।
 */
import type { AuthProvider } from '../interfaces/authProvider'
import type { AuthUser } from '../interfaces/types'
import { ENDPOINTS } from './endpoints'
import { restRequest } from './http'

interface LoginResponse {
  data: { expires_at: string; user: AuthUser }
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

  // কুকি সব ট্যাবে এক, তাই অন্য ট্যাবে login/logout হলে এখানে /me আবার জেনে নিই।
  let channel: BroadcastChannel | null | undefined
  const getChannel = () => {
    if (channel === undefined) {
      channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('housing-auth') : null
      channel?.addEventListener('message', () => void fetchMe().then(emit))
    }
    return channel
  }
  const announce = () => getChannel()?.postMessage('changed')

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
      })
      emit(res.data.user)
      announce()
      return res.data.user
    },

    async logout() {
      try {
        await restRequest<void>(baseUrl, ENDPOINTS.auth.logout(), { method: 'POST' })
      } finally {
        emit(null)
        announce()
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
      getChannel()
      return () => {
        listeners.delete(callback)
      }
    },
  }
}
