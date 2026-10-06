import { useEffect, useState } from 'react'
import { getAuthProvider } from '../../../backend/factory'
import { HousingApiError, type AuthUser } from '../../../backend/interfaces/types'

export interface AuthState {
  /** 'error': সার্ভারে পৌঁছানো যায়নি, তাই লগইন আছে কি না অজানা (লগআউট ধরা হয় না) */
  status: 'loading' | 'ready' | 'error'
  user: AuthUser | null
  isAdmin: boolean
}

const INITIAL: AuthState = { status: 'loading', user: null, isAdmin: false }

/** ব্যাকএন্ড কনফিগ না থাকা মানে লগইন নেই (ready); অন্য এরর মানে সার্ভারে পৌঁছানো যায়নি, অবস্থা অজানা (error) */
export function statusAfterError(err: unknown): AuthState['status'] {
  return err instanceof HousingApiError && err.code === 'CONFIG_ERROR' ? 'ready' : 'error'
}

/**
 * বর্তমান লগইন অবস্থা (AuthProvider.currentUser + isAdmin), সেশন বদলালে আপডেট।
 * শুধু UI দেখানো/লুকানোর জন্য; প্রকৃত অনুমতি ব্যাকএন্ডে যাচাই হয়।
 * ব্যাকএন্ড কনফিগ না থাকলে (CONFIG_ERROR) → ready, user null। অন্য এররে (নেটওয়ার্ক, 5xx) → error।
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(INITIAL)

  useEffect(() => {
    let alive = true
    let unsubscribe = () => {}
    const auth = getAuthProvider()

    const refresh = async () => {
      try {
        const user = await auth.currentUser()
        const isAdmin = user ? await auth.isAdmin() : false
        if (alive) setState({ status: 'ready', user, isAdmin })
      } catch (err) {
        if (alive) setState({ status: statusAfterError(err), user: null, isAdmin: false })
      }
    }

    void refresh()
    try {
      unsubscribe = auth.onAuthChange(() => void refresh())
    } catch {
      // ব্যাকএন্ড কনফিগ নেই — subscribe সম্ভব নয়
    }
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}
