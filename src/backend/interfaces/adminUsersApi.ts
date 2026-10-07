import type { AdminUserInput, AdminUserRow, AdminUserSaveResult } from './types'

/**
 * ইউজার-ব্যবস্থাপনা (docs/api/PROJECTS_API_CONTRACT.md §৪.৬) — **শুধু মূল এডমিন**।
 * লগইন (ইমেইল-পাসওয়ার্ড) এখানে তৈরি হয় না — আগে সার্ভারের এডমিন CLI দিয়ে (`npm --prefix server run admin -- create`);
 * এখানে সেই লগইনের ভূমিকা (এডমিন বা প্রকল্পের ইউজার), বরাদ্দ প্রকল্প, "সব প্রকল্প" আর চালু/বন্ধ।
 * মক বাড়ে না (docs/testing/README.md), তাই মকে এটি NOT_IMPLEMENTED দেয়।
 */
export interface AdminUsersApi {
  /** সব লগইন — মূল এডমিন আগে, তারপর তৈরির ক্রমে */
  list(): Promise<AdminUserRow[]>
  /** আগে থেকে থাকা লগইন বদল (ইমেইল দিয়ে); মূল এডমিনকে বদলানো যায় না (FORBIDDEN); অচেনা ইমেইল → NOT_FOUND; লগে `admin_user_update` */
  save(input: AdminUserInput): Promise<AdminUserSaveResult>
}
