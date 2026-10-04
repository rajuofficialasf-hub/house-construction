import type { AuthProvider } from '../../src/features/housing/backend/interfaces/authProvider'
import type { HousingApi } from '../../src/features/housing/backend/interfaces/housingApi'

export interface Credentials {
  email: string
  password: string
}

/**
 * এক ব্যাকএন্ড অ্যাডাপ্টারকে চুক্তি-স্যুটে বসানোর খোল।
 * মক: পূর্ণ স্যুট। লাইভ Supabase: শুধু readOnly (লেখার কোনো মেথড কখনো ডাকা হয় না — সিরিয়াল কাউন্টার কমে না)।
 * ভবিষ্যতে REST অ্যাডাপ্টার + Express: পূর্ণ স্যুট, শুধু এই harness বদলায়।
 */
export interface ContractHarness {
  api: HousingApi
  auth: AuthProvider
  /** এডমিন অ্যাকাউন্ট (লেখার স্যুটের জন্য) */
  admin?: Credentials
  /** আছে কিন্তু এডমিন তালিকায় নেই (AE2) */
  nonAdmin?: Credentials
  /** লগইনের মাধ্যমে নয়, সরাসরি এমন সেশন বসানো যাতে "লগইন করা কিন্তু এডমিন নয়" লেখা-অনুমতি পরীক্ষা করা যায় (মক-সেতু) */
  forceNonAdminSession?: () => void
}

export interface ContractOptions {
  /** false হলে লেখা/এডমিন-নির্ভর টেস্ট চলে না */
  writes: boolean
  /** true হলে ব্যাকএন্ডে ডাটা থাকার কথা: খালি ডাটায় পড়ার টেস্ট চুপচাপ পাস না করে ব্যর্থ হয় (লাইভ প্রজেক্ট ফাঁকা হলে skip চলে) */
  seeded?: boolean
}
