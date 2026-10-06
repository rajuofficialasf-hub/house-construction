import type { AdminUserInput, AdminUserRow, AdminUserSaveResult } from './types'

/**
 * ইউজার-ব্যবস্থাপনা (পর্ব চ, M-ধাপ ১৯; চুক্তি v১.৫ §৪.৭) — **শুধু মূল এডমিন**; নিষেধ ডাটাবেসে (SQL ১৪)।
 * অ্যাকাউন্ট (ইমেইল-পাসওয়ার্ড) এখানে তৈরি হয় না — আগে Supabase → Authentication → Add user (প্রশ্ন ২৩);
 * এখানে শুধু সেই অ্যাকাউন্টকে প্রকল্প বরাদ্দ, "সব প্রকল্প", চালু/বন্ধ।
 * SQL ১৪ চালানো না থাকলে দুটো মেথডই CONFIG_ERROR (বাংলা বার্তা: চেকলিস্ট সারি ৩৫)।
 */
export interface AdminUsersApi {
  /** সব এডমিন — মূল এডমিন আগে; প্রতিটিতে ভূমিকা, বরাদ্দ প্রকল্প, চালু/বন্ধ, শেষ লগইন */
  list(): Promise<AdminUserRow[]>
  /** যোগ বা বদল (ইমেইল দিয়ে); মূল এডমিনকে বদলানো যায় না; অচেনা ইমেইল → NOT_FOUND; লগে `admin_user_update` */
  save(input: AdminUserInput): Promise<AdminUserSaveResult>
}
