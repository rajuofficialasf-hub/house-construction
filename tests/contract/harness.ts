import type { AuthProvider } from '../../src/backend/interfaces/authProvider'
import type { HousingApi } from '../../src/backend/interfaces/housingApi'
import type { ProjectsApi } from '../../src/backend/interfaces/projectsApi'

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
  /**
   * প্রকল্প-রেজিস্ট্রির API। থাকলে runProjectsApiContract চলে; মকে নেই, কারণ মক ইচ্ছা করেই পুরনো তিন-প্রকল্পের
   * দৃশ্যে থাকে (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "Deferred to Planning — settled")।
   */
  projects?: ProjectsApi
  /** এডমিন অ্যাকাউন্ট (লেখার স্যুটের জন্য); মোছার টেস্টের জন্য মূল এডমিন (main_admin) */
  admin?: Credentials
  /** সাধারণ এডমিন (role admin): সব লেখা পারেন, মোছা নয় (AE1, docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md) */
  plainAdmin?: Credentials
  /** আছে কিন্তু এডমিন তালিকায় নেই (AE2) */
  nonAdmin?: Credentials
  /** লগইনের মাধ্যমে নয়, সরাসরি এমন সেশন বসানো যাতে "লগইন করা কিন্তু এডমিন নয়" লেখা-অনুমতি পরীক্ষা করা যায় (মক-সেতু) */
  forceNonAdminSession?: () => void | Promise<void>
}

export interface ContractOptions {
  /** false হলে লেখা/এডমিন-নির্ভর টেস্ট চলে না */
  writes: boolean
  /** true হলে ব্যাকএন্ডে ডাটা থাকার কথা: খালি ডাটায় পড়ার টেস্ট চুপচাপ পাস না করে ব্যর্থ হয় (লাইভ প্রজেক্ট ফাঁকা হলে skip চলে) */
  seeded?: boolean
  /**
   * এই ব্যাকএন্ডে জানা ঘাটতি: নাম দেওয়া টেস্টগুলো test.fails হিসেবে চলে (ব্যর্থ হওয়াই প্রত্যাশিত; পাস করলে রান ব্যর্থ, তখন তালিকা থেকে সরান)।
   * তালিকার প্রতিটি নাম কোনো টেস্টের সাথে মিলতে হবে, নইলে রান ব্যর্থ।
   */
  knownGaps?: readonly string[]
  /**
   * false হলে ব্যাকএন্ডে "লগইন করা কিন্তু এডমিন নয়" অ্যাকাউন্টই নেই (নিজস্ব সার্ভার: শুধু এডমিনরা অ্যাকাউন্ট পায়,
   * API_CONTRACT §২), তাই সেই দুই টেস্ট skip হয়; harness এ nonAdmin/forceNonAdminSession লাগে না। ডিফল্ট true।
   */
  nonAdminAccounts?: boolean
  /**
   * ছবির URL এর ধরন। 'serial' (ডিফল্ট; মক ও Supabase): URL এ সিরিয়াল-ভিত্তিক পাথ, একই পাথে ওভাররাইট, সিরিয়াল বদলে
   * পাথ বদলায়। 'opaque' (নিজস্ব সার্ভার): URL এ সিরিয়াল নেই, প্রতিটি আপলোডে নতুন URL, সিরিয়াল বদলে URL অপরিবর্তিত
   * (API_CONTRACT §৩.২)।
   */
  photoPaths?: 'serial' | 'opaque'
  /**
   * false for a run against a deployed site's real data: the test that sends writes without a session
   * (expecting them to be refused) is skipped, so not even a refused write request goes out. Default true.
   */
  writeProbes?: boolean
}
