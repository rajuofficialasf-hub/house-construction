import type { AuthUser } from './types'

/**
 * এডমিন অথেন্টিকেশনের ইন্টারফেস।
 * নিরাপত্তা এর উপর নির্ভর করে না; isAdmin() শুধু UI দেখানো/লুকানোর জন্য।
 * প্রকৃত অনুমতি যাচাই ব্যাকএন্ডে (Supabase RLS / নিজস্ব সার্ভার) হয়।
 */
export interface AuthProvider {
  login(email: string, password: string): Promise<AuthUser>
  logout(): Promise<void>
  /** লগইন না থাকলে null */
  currentUser(): Promise<AuthUser | null>
  isAdmin(): Promise<boolean>
  /**
   * লগইন অবস্থা বদলালে (লগইন/লগআউট/সেশন মেয়াদ শেষ) callback ডাকা হবে।
   * ফেরত দেয় unsubscribe ফাংশন।
   */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void
}
