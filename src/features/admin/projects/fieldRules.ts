/**
 * কাস্টম ফিল্ডের নিয়ম (পরিকল্পনা §৫.৩, M-ধাপ ৮) — ফর্মে সাথে সাথে যাচাই; চূড়ান্ত যাচাই ডাটাবেসে
 * (10_projects.sql › project_fields CHECK, 10b › project_fields_guard)।
 */
import type { Project, ProjectField } from '@/backend'
import { resolveFields, type FieldDef } from '@/features/projects/fields'
import { t } from '@/i18n'
import { transliterate } from '@/lib/transliterate'

/** 10_projects.sql › project_fields_key_reserved এর হুবহু (আর prev_/current_ দিয়ে শুরু নিষেধ) */
export const RESERVED_FIELD_KEYS: readonly string[] = [
  'id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district',
  'upazila', 'union_name', 'address', 'extra', 'created_at', 'updated_at', 'photo_updated_at',
  'q', 'page', 'sort', 'f',
]
export const MAX_FIELDS = 40
/** টেবিলে সর্বোচ্চ ডাটা-কলাম (ডেস্কটপে অনুভূমিক স্ক্রল ছাড়া — পরিকল্পনা §৫.১৪) */
export const MAX_TABLE_COLUMNS = 9

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/

/** লেখা → key: ছোট হাতের অক্ষর, বাকি সব "_", সামনে অক্ষর, ≤ ৪০ */
function toKey(s: string): string {
  let k = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '')
  if (k && !/^[a-z]/.test(k)) k = `f_${k}`.slice(0, 40)
  return k
}

/**
 * নতুন ফিল্ডের key (পরিকল্পনা §৫.৩): ইংরেজি লেবেল থেকে; না থাকলে বাংলা লেবেলের লিপ্যন্তর; তাও না হলে field_<n>।
 * সংরক্ষিত বা ব্যবহৃত হলে শেষে _2, _3 …
 */
export function fieldKeyFrom(labelEn: string, labelBn: string, taken: readonly string[]): string {
  let k = toKey(labelEn) || toKey(transliterate(labelBn))
  if (!k || RESERVED_FIELD_KEYS.includes(k) || /^(prev|current)_/.test(k)) k = k ? `f_${k}`.slice(0, 40) : ''
  if (!k) {
    let n = taken.length + 1
    while (taken.includes(`field_${n}`)) n++
    return `field_${n}`
  }
  if (!taken.includes(k)) return k
  let n = 2
  while (taken.includes(`${k.slice(0, 37)}_${n}`)) n++
  return `${k.slice(0, 37)}_${n}`
}

export function fieldKeyError(key: string, taken: readonly string[]): string | null {
  if (!KEY_RE.test(key)) return t('key: ইংরেজি ছোট অক্ষর দিয়ে শুরু, তারপর অক্ষর/অঙ্ক/_ (সর্বোচ্চ ৪০)')
  if (RESERVED_FIELD_KEYS.includes(key) || /^(prev|current)_/.test(key)) return t('"{key}" সিস্টেমের নাম — অন্যটি দিন', { key })
  if (taken.includes(key)) return t('এই প্রকল্পে এই key এর ফিল্ড আগে থেকেই আছে')
  return null
}

/** লেবেলে ফোন/মোবাইল/NID/জাতীয় পরিচয় → "শুধু-এডমিন রাখুন" পরামর্শ */
export const SENSITIVE_LABEL = /ফোন|মোবাইল|nid|জাতীয়\s*পরিচয়|এনআইডি|phone|mobile|national\s*id/i

/**
 * টেবিলের ডাটা-কলাম (ক্রম, ছবি ও "বিস্তারিত" বাদ): সিস্টেম ফিল্ড — ঠিকানা "একসাথে" হলে বিভাগ/জেলা/উপজেলা/ইউনিয়ন মিলে
 * একটি কলাম — তারপর টেবিলে-চালু পাবলিক কাস্টম ফিল্ড। fields দিলে প্রকল্পের ফিল্ডের বদলে সেগুলো ধরা হয় (এডিটরের প্রিভিউ)।
 */
export function tableColumns(project: Project, fields: readonly ProjectField[] = project.fields): FieldDef[] {
  const all = resolveFields({ ...project, fields: [...fields] }, { includePrivate: false })
  const merged = project.display?.geo_columns === 'merged'
  const out: FieldDef[] = []
  let geoAdded = false
  for (const f of all) {
    if (!f.show_in_table) continue
    if (merged && f.geo) {
      if (!geoAdded) out.push({ ...f, key: 'geo', label_bn: 'ঠিকানা', label_en: 'Address' })
      geoAdded = true
      continue
    }
    out.push(f)
  }
  return out
}
