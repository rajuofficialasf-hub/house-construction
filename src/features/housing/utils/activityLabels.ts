import { toBanglaNumber } from '@/lib/banglaNumber'

/**
 * একটিভিটি লগের action → বাংলা লেবেল ও রং (একটিভিটি পেইজ ও এডমিন ড্যাশবোর্ড দুজনেই)। লেবেল t() দিয়ে দেখাতে হয়।
 * প্রকল্প-রেজিস্ট্রির কাজ: গোপন মান (শুধু ফিল্ডের নাম লগ হয়) আর প্রকল্প/ফিল্ডের সেটিং বদল।
 */
export const ACTION_LABEL: Record<string, string> = {
  create: 'রেকর্ড যোগ',
  update: 'রেকর্ড সম্পাদনা',
  delete: 'রেকর্ড মুছে ফেলা',
  photo_update: 'ছবি আপডেট',
  serial_change: 'সিরিয়াল বদল',
  login: 'লগইন',
  logout: 'লগআউট',
  import_run: 'বাল্ক ইম্পোর্ট',
  photo_bulk_run: 'ছবি বাল্ক আপডেট',
  records_export: 'রেকর্ড এক্সপোর্ট (CSV)',
  category_merge: 'ক্যাটাগরি এক বানানে',
  private_update: 'গোপন তথ্য বদল',
  project_create: 'প্রকল্প তৈরি',
  project_update: 'প্রকল্পের সেটিং বদল',
  project_publish: 'প্রকল্প প্রকাশ',
  project_unpublish: 'প্রকল্প অপ্রকাশ',
  project_delete: 'প্রকল্প মুছে ফেলা',
  field_create: 'ফিল্ড তৈরি',
  field_update: 'ফিল্ড বদল',
  field_archive: 'ফিল্ড আর্কাইভ',
  field_restore: 'ফিল্ড ফেরত',
  field_delete: 'ফিল্ড মুছে ফেলা',
  admin_user_update: 'ইউজার যোগ/বদল',
}

export const ACTION_CLASS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  photo_update: 'bg-purple-100 text-purple-800',
  serial_change: 'bg-amber-100 text-amber-900',
  login: 'bg-slate-100 text-slate-700',
  logout: 'bg-slate-100 text-slate-700',
  import_run: 'bg-teal-100 text-teal-800',
  photo_bulk_run: 'bg-purple-100 text-purple-800',
  records_export: 'bg-teal-100 text-teal-800',
  category_merge: 'bg-sky-100 text-sky-800',
  private_update: 'bg-slate-200 text-slate-800',
  project_create: 'bg-emerald-100 text-emerald-800',
  project_update: 'bg-sky-100 text-sky-800',
  project_publish: 'bg-emerald-100 text-emerald-800',
  project_unpublish: 'bg-amber-100 text-amber-900',
  project_delete: 'bg-red-100 text-red-800',
  field_create: 'bg-emerald-100 text-emerald-800',
  field_update: 'bg-sky-100 text-sky-800',
  field_archive: 'bg-amber-100 text-amber-900',
  field_restore: 'bg-emerald-100 text-emerald-800',
  field_delete: 'bg-red-100 text-red-800',
  admin_user_update: 'bg-indigo-100 text-indigo-800',
}

/** "০৫/১০/২০২৬ ১৪:৩০" (স্থানীয় সময়, ভাষার অঙ্কে) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return toBanglaNumber(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`)
}
