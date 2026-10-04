import { useEffect, useState } from 'react'
import { getAuthProvider } from '../backend/factory'
import type { AuthUser } from '../backend/interfaces/types'

export interface AuthState {
  status: 'loading' | 'ready'
  user: AuthUser | null
  isAdmin: boolean
}

const INITIAL: AuthState = { status: 'loading', user: null, isAdmin: false }

/**
 * বর্তমান লগইন অবস্থা (AuthProvider.currentUser + isAdmin), সেশন বদলালে আপডেট।
 * শুধু UI দেখানো/লুকানোর জন্য; প্রকৃত অনুমতি ব্যাকএন্ডে যাচাই হয়।
 * ব্যাকএন্ড কনফিগ না থাকলে (CONFIG_ERROR) → ready, user null।
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
      } catch {
        if (alive) setState({ status: 'ready', user: null, isAdmin: false })
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
