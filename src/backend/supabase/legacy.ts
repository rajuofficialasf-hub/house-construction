/**
 * পুরনো ডাটাবেসেও চলা (পর্ব ২, পরিকল্পনা §৫.১৪)।
 *
 * SQL ১০–১২ চালানো না থাকলে (বা ভবিষ্যতে কোনো নতুন টেবিল/ফাংশন না থাকলে) adapter প্রথমবার "না পাওয়া" দেখে
 * সেটি মনে রাখে, আর সেই সেশনে পুরনো পথে চলে — সাইট ভাঙে না।
 *   টেবিল নেই: PGRST205 / 42P01 · ফাংশন নেই: PGRST202 / 42883 · কলাম নেই: PGRST204 / 42703
 *
 * পরীক্ষা: dev-এ `VITE_SIMULATE_LEGACY_DB=1` দিলে adapter এমন আচরণ করে যেন নতুন জিনিসগুলো নেই
 * (`npm run smoke -- --legacy`)। প্রোডাকশন বিল্ডে এটি কখনো চালু হয় না।
 */
import { HousingApiError } from '../interfaces/types'

/** নতুন ডাটাবেসের যে অংশগুলো না-ও থাকতে পারে */
export type LegacyFeature =
  /** projects / project_fields টেবিল (SQL ১০) — না থাকলে রেকর্ডের union_name/extra কলাম, beneficiary_private-ও নেই */
  | 'projects'
  /** project_stats RPC (SQL ১১) */
  | 'project_stats'
  /** projects_overview RPC (SQL ১১) */
  | 'projects_overview'

const MISSING_CODES = new Set(['PGRST205', '42P01', 'PGRST202', '42883', 'PGRST204', '42703'])

const missing = new Set<LegacyFeature>()

/** dev-এ VITE_SIMULATE_LEGACY_DB=1 → সব নতুন জিনিস "নেই" (Node স্ক্রিপ্টে import.meta.env থাকে না) */
export function simulateLegacyDb(): boolean {
  const env = (import.meta as { env?: Record<string, unknown> }).env
  return !!env?.DEV && String(env.VITE_SIMULATE_LEGACY_DB ?? '').trim() === '1'
}

export function isKnownMissing(feature: LegacyFeature): boolean {
  return simulateLegacyDb() || missing.has(feature)
}

export function markMissing(feature: LegacyFeature): void {
  if (missing.has(feature)) return
  missing.add(feature)
  const env = (import.meta as { env?: Record<string, unknown> }).env
  if (env?.DEV) console.info(`[backend] "${feature}" ডাটাবেসে নেই — পুরনো পথে (ফলব্যাক) চলছে`)
}

/** শুধু পরীক্ষার জন্য: মনে রাখা অবস্থা মুছে ফেলা */
export function resetLegacyState(): void {
  missing.clear()
}

/** এররটি কি "টেবিল/ফাংশন/কলাম নেই"? (কাঁচা Supabase এরর বা mapSupabaseError এর HousingApiError) */
export function isMissingError(err: unknown): boolean {
  if (HousingApiError.is(err)) {
    const code = err.details?.supabase_code
    return typeof code === 'string' && MISSING_CODES.has(code)
  }
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && MISSING_CODES.has(code)
}

/**
 * নতুন পথ চেষ্টা; "নেই" এরর হলে মনে রেখে পুরনো পথ। অন্য এরর হুবহু ছুড়ে দেয়।
 * আগেই "নেই" জানা থাকলে (বা সিমুলেশনে) সরাসরি পুরনো পথ — বাড়তি নেটওয়ার্ক কল হয় না।
 */
export async function withFallback<T>(
  feature: LegacyFeature,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  if (isKnownMissing(feature)) return fallback()
  try {
    return await primary()
  } catch (err) {
    if (!isMissingError(err)) throw err
    markMissing(feature)
    return fallback()
  }
}

/** পুরনো ডাটাবেসে কোনো লেখা-কাজ সম্ভব নয় (যেমন প্রকল্প তৈরি) */
export function legacyWriteError(): HousingApiError {
  return new HousingApiError(
    'CONFIG_ERROR',
    'ডাটাবেস হালনাগাদ নয় — এই কাজের জন্য SQL ১০–১২ চালানো দরকার (docs/progress/HOUSING_PROGRESS.md, চেকলিস্ট সারি ২৫–৩০)',
  )
}
