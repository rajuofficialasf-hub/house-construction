/**
 * প্রকল্পের key / slug / ফাইল-প্রিফিক্সের নিয়ম (পরিকল্পনা §৪.৪, §৫.২) — ফর্মে সাথে সাথে যাচাই।
 * ডাটাবেসের নিয়মের হুবহু প্রতিরূপ (supabase/sql/10_projects.sql CHECK, 10b › projects_guard সংরক্ষিত শব্দ);
 * চূড়ান্ত যাচাই ডাটাবেসেই হয় — এখানে শুধু আগেভাগে জানানো।
 */
import type { Project } from '@/backend'
import { HousingApiError } from '@/backend'
import { t } from '@/i18n'
import { toBanglaNumber } from '@/lib/banglaNumber'

/** 10b › projects_guard এর তালিকার হুবহু */
export const RESERVED_SLUGS: readonly string[] = [
  'admin', 'api', 'auth', 'login', 'logout', 'assets', 'geo', 'static', 'src', 'public',
  'node-modules', 'favicon', 'icons', 'dev', 'projects', 'records', 'search', 'about',
  'contact', 'donate', 'news', 'en', 'bn', 'new', 'edit', 'import', 'photos', 'activity',
  'settings', 'users', 'preview', 'index',
]

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/
const PREFIX_RE = /^[a-z][a-z0-9]{0,15}$/

/** ইংরেজি নাম → slug: "Self-Reliance Project" → "self-reliance-project" (≤ ৬০) */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** slug → key: "self-reliance" → "self_reliance"; অঙ্ক দিয়ে শুরু হলে সামনে "p_" */
export function keyFromSlug(slug: string): string {
  let k = slug.replace(/-/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40)
  if (k && !/^[a-z]/.test(k)) k = `p_${k}`.slice(0, 40)
  return k
}

/** slug → ফাইল-প্রিফিক্সের প্রস্তাব: একাধিক শব্দ হলে আদ্যক্ষর ("self-reliance" → "sr"), নইলে প্রথম ৫ অক্ষর */
export function suggestPrefix(slug: string): string {
  const words = slug.split('-').filter((w) => /^[a-z]/.test(w))
  if (!words.length) return ''
  const p = words.length >= 2 ? words.map((w) => w[0]).join('') : words[0].replace(/[^a-z0-9]/g, '').slice(0, 5)
  return p.slice(0, 16)
}

/** slug যাচাই; selfKey = যে প্রকল্প এডিট হচ্ছে (তার নিজের slug ডুপ্লিকেট নয়) */
export function slugError(slug: string, projects: readonly Project[], selfKey?: string): string | null {
  if (!slug) return t('URL অংশ (slug) দিন')
  if (slug.length > 60) return t('সর্বোচ্চ ৬০ অক্ষর')
  if (!SLUG_RE.test(slug)) return t('শুধু ছোট ইংরেজি অক্ষর, অঙ্ক আর মাঝে হাইফেন (-), যেমন self-reliance')
  if (/^[0-9]+$/.test(slug)) return t('শুধু সংখ্যা দিয়ে URL হয় না (সিরিয়ালের সাথে গোলমাল হয়)')
  if (RESERVED_SLUGS.includes(slug)) return t('"{slug}" সংরক্ষিত শব্দ — অন্য নাম দিন', { slug })
  if (projects.some((p) => p.slug === slug && p.key !== selfKey)) return t('এই URL আগে থেকেই আছে — অন্যটি দিন')
  return null
}

export function keyError(key: string, projects: readonly Project[]): string | null {
  if (!KEY_RE.test(key)) return t('key: ইংরেজি ছোট অক্ষর দিয়ে শুরু, তারপর অক্ষর/অঙ্ক/_ (২–৪০ অক্ষর)')
  if (projects.some((p) => p.key === key)) return t('এই key আগে থেকেই আছে — URL অংশ একটু বদলান')
  return null
}

export function prefixError(prefix: string, projects: readonly Project[], selfKey?: string): string | null {
  if (!PREFIX_RE.test(prefix)) return t('ইংরেজি ছোট অক্ষর দিয়ে শুরু, তারপর অক্ষর/অঙ্ক (সর্বোচ্চ ১৬)')
  if (projects.some((p) => p.file_prefix === prefix && p.key !== selfKey)) return t('এই প্রিফিক্স অন্য প্রকল্পে আছে — অন্যটি দিন')
  return null
}

/** ছবির ফাইলনামের উদাহরণ (সিরিয়াল ১২): আগে-পরে → sr_0012_prev.jpg / sr_0012_current.jpg; শুধু-পরে → sr_0012.jpg */
export function photoNameExample(prefix: string, photoMode: Project['photo_mode']): string {
  const p = prefix || 'xx'
  if (photoMode === 'before_after') return `${p}_0012_prev.jpg · ${p}_0012_current.jpg`
  if (photoMode === 'after_only') return `${p}_0012.jpg`
  return '—'
}

/** The field a server error names, without the create body's `project.` prefix; undefined when none. */
function errorField(e: HousingApiError): string | undefined {
  const field = e.details?.field
  return typeof field === 'string' ? field.replace(/^project\./, '') : undefined
}

/**
 * অন্য কেউ এর মধ্যে প্রকল্প বদলেছেন (If-Match মেলেনি): CONFLICT কিন্তু কোনো ফিল্ড নেই। একই key/URL আগে থেকে
 * থাকলে সার্ভার CONFLICT এর সাথে details.field দেয় — সেটি "পুরনো পাতা" নয়, নিজের বার্তা পায়।
 */
export function isStaleEdit(err: unknown): boolean {
  const e = HousingApiError.from(err)
  return e.code === 'CONFLICT' && errorField(e) === undefined
}

/**
 * সার্ভারের ত্রুটি → বাংলা বার্তা। নিজস্ব সার্ভার কোন ঘর (details.field) জানায়, আর ইনপুটের নিয়ম ভাঙলে কারণও
 * (details.reason); গার্ড ও ডুপ্লিকেট-key এর বার্তা আগে থেকেই বাংলা। Supabase এর ইংরেজি Postgres বার্তা চেনা
 * constraint নাম দিয়ে অনুবাদ হয় — Supabase অ্যাডাপ্টার সরানোর সময় সেগুলোও যাবে।
 */
export function friendlyProjectError(err: unknown): string {
  const e = HousingApiError.from(err)
  const m = e.message
  const field = errorField(e)
  if (e.code === 'CONFLICT' && field === 'slug') return t('এই URL আগে থেকেই আছে — অন্যটি দিন')
  if (e.code === 'CONFLICT' && field === 'file_prefix') return t('এই প্রিফিক্স অন্য প্রকল্পে আছে — অন্যটি দিন')
  // ইনপুটের নিয়ম (zod) ভাঙলে reason থাকে; সংরক্ষিত key এর মতো ডাটাবেসের নিষেধে থাকে না, তখন সার্ভারের বার্তাই ঠিক
  if (e.code === 'VALIDATION_ERROR' && e.details?.reason !== undefined) {
    if (field === 'slug') return t('শুধু ছোট ইংরেজি অক্ষর, অঙ্ক আর মাঝে হাইফেন (-), যেমন self-reliance')
    if (field === 'key') return t('key: ইংরেজি ছোট অক্ষর দিয়ে শুরু, তারপর অক্ষর/অঙ্ক/_ (২–৪০ অক্ষর)')
    if (field === 'name_bn' || field === 'name_en') return t('বাংলা ও ইংরেজি দুই নামই দিন (১–১২০ অক্ষর)')
  }
  if (e.code === 'CONFLICT' && /projects_slug_key/.test(m)) return t('এই URL আগে থেকেই আছে — অন্যটি দিন')
  if (e.code === 'CONFLICT' && /projects_pkey/.test(m)) return t('এই key আগে থেকেই আছে — URL অংশ একটু বদলান')
  if (e.code === 'CONFLICT' && /projects_file_prefix_key/.test(m)) return t('এই প্রিফিক্স অন্য প্রকল্পে আছে — অন্যটি দিন')
  if (e.code === 'CONFLICT' && /project_fields_project_key_key/.test(m)) return t('এই প্রকল্পে একই key এর ফিল্ড আগে থেকেই আছে')
  if (/projects_slug_format/.test(m)) return t('শুধু ছোট ইংরেজি অক্ষর, অঙ্ক আর মাঝে হাইফেন (-), যেমন self-reliance')
  if (/projects_key_format/.test(m)) return t('key: ইংরেজি ছোট অক্ষর দিয়ে শুরু, তারপর অক্ষর/অঙ্ক/_ (২–৪০ অক্ষর)')
  if (/projects_names/.test(m)) return t('বাংলা ও ইংরেজি দুই নামই দিন (১–১২০ অক্ষর)')
  if (/projects_text_lengths/.test(m)) return t('কোনো লেখা নির্ধারিত সীমার চেয়ে বড়')
  if (e.code === 'FORBIDDEN') return t('এই কাজের অনুমতি নেই')
  return m
}

/** "১২টি রেকর্ড" ধরনের লেখা */
export const nRecords = (n: number) => t('{n}টি রেকর্ড', { n: toBanglaNumber(n) })
