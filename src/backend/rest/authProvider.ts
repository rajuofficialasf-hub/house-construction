/**
 * REST AuthProvider — docs/api/PROJECTS_API_CONTRACT.md §২ অনুযায়ী (POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/me)।
 * সেশন শুধু সার্ভারের HttpOnly কুকিতে; ব্রাউজার নিজে পাঠায় (credentials: 'include'), JS টোকেন দেখে না (RE-SEC-03)।
 * onAuthChange: এই অ্যাডাপ্টারের login/logout এ, আর অন্য ট্যাবের login/logout এ (BroadcastChannel) callback।
 */
import type { AuthProvider } from '../interfaces/authProvider'
import { HousingApiError, type AuthUser } from '../interfaces/types'
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
  // একসাথে আসা currentUser()/isAdmin() একটিই /me পাঠায়। login, logout বা অন্য ট্যাবের খবরে এটি বাদ যায়,
  // যাতে পরের প্রশ্ন নতুন অবস্থা জানে, আর আগের /me দেরিতে ফিরলে ক্যাশ না বদলায়।
  let pending: Promise<AuthUser | null> | null = null

  // প্রতিটি emit-এ বাড়ে; অন্য ট্যাবের খবরে শুরু হওয়া /me ফিরে আসার আগে এখানে login/logout হলে তার উত্তর বাতিল
  let epoch = 0

  const emit = (user: AuthUser | null) => {
    epoch++
    pending = null
    cached = user
    for (const l of listeners) l(user)
  }

  // কুকি সব ট্যাবে এক, তাই অন্য ট্যাবে login/logout হলে এখানে /me আবার জেনে নিই।
  let channel: BroadcastChannel | null | undefined
  const getChannel = () => {
    if (channel === undefined) {
      channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('housing-auth') : null
      // সার্ভারে পৌঁছানো না গেলে অবস্থা অজানাই থাকে; পরের currentUser() আবার জিজ্ঞেস করবে।
      channel?.addEventListener('message', () => {
        pending = null
        const started = epoch
        void fetchMe().then((user) => {
          if (epoch === started) emit(user)
        }, () => {})
      })
    }
    return channel
  }
  const announce = () => getChannel()?.postMessage('changed')

  /**
   * শুধু 401 মানে লগআউট (null, ক্যাশ হয়)। নেটওয়ার্ক বা 5xx এ লগইন অবস্থা অজানা: কিছু ক্যাশ না করে
   * এরর উপরে যায়, যাতে সার্ভার সাময়িক বন্ধ থাকলে এডমিনকে লগইন পেইজে পাঠানো না হয়।
   */
  function fetchMe(): Promise<AuthUser | null> {
    if (pending) return pending
    const request: Promise<AuthUser | null> = (async () => {
      const current = () => pending === request
      try {
        const res = await restRequest<MeResponse>(baseUrl, ENDPOINTS.auth.me())
        const user = withProjects(res.data)
        if (current()) cached = user
        return user
      } catch (err) {
        if (err instanceof HousingApiError && err.code === 'UNAUTHENTICATED') {
          if (current()) cached = null
          return null
        }
        if (current()) cached = undefined
        throw err
      } finally {
        if (current()) pending = null
      }
    })()
    pending = request
    return request
  }

  const resolveUser = async () => (cached !== undefined ? cached : fetchMe())

  return {
    async login(email, password) {
      const res = await restRequest<LoginResponse>(baseUrl, ENDPOINTS.auth.login(), {
        body: { email: email.trim(), password },
      })
      const user = withProjects(res.data.user)
      emit(user)
      announce()
      return user
    },

    async logout() {
      // সার্ভার সেশন শেষ না করা পর্যন্ত কুকি বৈধ থাকে, তাই অনুরোধ ব্যর্থ হলে "লগআউট" দেখানো যাবে না;
      // এরর উপরে যায়, যাতে UI আবার চেষ্টা করতে বলে।
      await restRequest<void>(baseUrl, ENDPOINTS.auth.logout(), { method: 'POST' })
      emit(null)
      announce()
    },

    currentUser: resolveUser,

    async isAdmin() {
      const u = await resolveUser()
      return u?.role === 'admin' || u?.role === 'main_admin' || u?.role === 'editor'
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

/** সার্ভার পুরনো চুক্তির হলে (all_projects/projects নেই) — আগের নিয়ম: সবাই সব প্রকল্পে (চুক্তি v১.৫) */
function withProjects(u: AuthUser): AuthUser {
  const raw = u as AuthUser & { all_projects?: boolean }
  return { ...u, allProjects: u.role === 'main_admin' || (raw.allProjects ?? raw.all_projects) !== false, projects: Array.isArray(u.projects) ? u.projects : [] }
}
