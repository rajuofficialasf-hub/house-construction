import { BD_GEO } from '@/features/geo/data/bdGeo'
import { EN } from './en'

/**
 * হালকা i18n (লাইব্রেরি ছাড়া)।
 * - key = বাংলা লেখাই; `t('বাংলা লেখা')` ইংরেজি মোডে EN অভিধান থেকে অনুবাদ দেয়, না পেলে বাংলাই ফেরত।
 * - `{name}` প্লেসহোল্ডার: t('মোট {n} টি', { n: '১২' })
 * - ভাষা বদলালে LanguageProvider পুরো অ্যাপ remount করে (key={lang}), তাই t() সাধারণ ফাংশন — hook লাগে না।
 * - সংখ্যা: lib/banglaNumber.ts এই মডিউলের currentLang দেখে বাংলা/ইংরেজি অঙ্ক দেয়।
 * - ভৌগোলিক নাম: gn('কুড়িগ্রাম') → ইংরেজি মোডে "Kurigram" (data/bdGeo.ts এর en নাম)।
 * নাম/ঠিকানা (ডাটাবেসের বাংলা টেক্সট) অনুবাদ হয় না।
 */
export type Lang = 'bn' | 'en'

const STORAGE_KEY = 'asf_lang'
let currentLang: Lang = 'bn'
/** শুধু LanguageProvider থেকে কল হয় */
export function setCurrentLang(l: Lang) {
  currentLang = l
}
export const LANG_STORAGE_KEY = STORAGE_KEY

export function getLang(): Lang {
  return currentLang
}

/** অনুবাদ (রেন্ডার ও ইউটিলিটি দুই জায়গায় ব্যবহারযোগ্য) */
const warned = new Set<string>()
export function t(bn: string, vars?: Record<string, string | number>): string {
  let s = bn
  if (currentLang === 'en') {
    const en = EN[bn]
    if (en !== undefined) s = en
    else if (import.meta.env.DEV && !warned.has(bn)) {
      warned.add(bn)
      console.warn(`[i18n] EN অনুবাদ নেই: ${bn}`)
    }
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

// ---------------------------------------------------------------- ভৌগোলিক নাম
let geoMap: Map<string, string> | null = null
function buildGeoMap(): Map<string, string> {
  const m = new Map<string, string>()
  for (const dv of BD_GEO) {
    m.set(dv.name, dv.en)
    for (const ds of dv.districts) {
      m.set(ds.name, ds.en)
      for (const up of ds.upazilas) if (!m.has(up.name)) m.set(up.name, up.en)
    }
  }
  return m
}
/** বিভাগ/জেলা/উপজেলার নাম: ইংরেজি মোডে ইংরেজি (তালিকায় থাকলে), নইলে যেমন আছে */
export function gn(bnName: string | null | undefined): string {
  if (!bnName) return ''
  if (currentLang !== 'en') return bnName
  geoMap ??= buildGeoMap()
  return geoMap.get(bnName.normalize('NFC')) ?? bnName
}

// ---------------------------------------------------------------- ডাটাবেসের লেখা (পর্ব ২)
/**
 * ডাটাবেস থেকে আসা দুই-ভাষার লেখা (প্রকল্পের নাম/বর্ণনা, ফিল্ড ও স্ট্যাটের লেবেল, একক শব্দ) দেখানোর **একমাত্র** পথ।
 * ইংরেজি মোডে `en` খালি না থাকলে `en`, নইলে বাংলা। t() নয় — এগুলো অভিধানে থাকে না (i18n-check সতর্ক করে)।
 */
export function pick(bn: string | null | undefined, en: string | null | undefined): string {
  if (currentLang === 'en' && en && en.trim() !== '') return en
  return bn ?? ''
}

/** `<base>_bn` / `<base>_en` জোড়া আছে এমন অবজেক্টের জন্য pick(): lt(project, 'name') = pick(project.name_bn, project.name_en) */
export function lt<B extends string>(
  obj: Partial<Record<`${B}_bn` | `${B}_en`, string | null>> | null | undefined,
  base: B,
): string {
  if (!obj) return ''
  return pick(obj[`${base}_bn`], obj[`${base}_en`])
}
