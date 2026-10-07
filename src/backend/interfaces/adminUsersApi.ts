import type { AdminUserInput, AdminUserRow, AdminUserSaveResult } from './types'

/**
 * ইউজার-ব্যবস্থাপনা (M-ধাপ ১৯; docs/api/PROJECTS_API_CONTRACT.md §৪.৬) — **শুধু মূল এডমিন**।
 * অ্যাকাউন্ট (ইমেইল-পাসওয়ার্ড) এখানে তৈরি হয় না — আগে সার্ভারের এডমিন CLI দিয়ে (`npm --prefix server run admin -- create`);
 * এখানে শুধু সেই অ্যাকাউন্টকে প্রকল্প বরাদ্দ, "সব প্রকল্প", চালু/বন্ধ।
 * সার্ভার এখনো এই API দেয় না, তাই REST ও মক দুটোই NOT_IMPLEMENTED দেয়।
 */
export interface AdminUsersApi {
  /** সব এডমিন — মূল এডমিন আগে; প্রতিটিতে ভূমিকা, বরাদ্দ প্রকল্প, চালু/বন্ধ, শেষ লগইন */
  list(): Promise<AdminUserRow[]>
  /** যোগ বা বদল (ইমেইল দিয়ে); মূল এডমিনকে বদলানো যায় না; অচেনা ইমেইল → NOT_FOUND; লগে `admin_user_update` */
  save(input: AdminUserInput): Promise<AdminUserSaveResult>
}
