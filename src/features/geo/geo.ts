import { BD_GEO, type GeoDistrict, type GeoDivision, type GeoUpazila } from './data/bdGeo'

/**
 * বাংলা টেক্সট তুলনার আগে Unicode NFC নরমালাইজেশন।
 * ড়/ঢ়/য় দুইভাবে লেখা যায় (precomposed U+09DC… বা ড+়); NFC দুটোকেই এক রূপে আনে।
 * ডাটাবেসে লেখার আগেও (এডমিন ফর্ম, বাল্ক ইম্পোর্ট) এটি প্রয়োগ করতে হবে, নইলে ফিল্টারের exact-match মিলবে না।
 */
export function nfc(s: string | null | undefined): string {
  return (s ?? '').trim().normalize('NFC')
}

/** সব বিভাগ (বাংলা নাম অনুযায়ী সাজানো) */
export function getDivisions(): readonly GeoDivision[] {
  return BD_GEO
}

export function findDivision(division: string | null | undefined): GeoDivision | null {
  const d = nfc(division)
  if (!d) return null
  return BD_GEO.find((x) => x.name === d) ?? null
}

/** বিভাগের জেলাসমূহ; বিভাগ অচেনা হলে খালি */
export function getDistricts(division: string | null | undefined): readonly GeoDistrict[] {
  return findDivision(division)?.districts ?? []
}

export function findDistrict(
  division: string | null | undefined,
  district: string | null | undefined,
): GeoDistrict | null {
  const d = nfc(district)
  if (!d) return null
  return getDistricts(division).find((x) => x.name === d) ?? null
}

/** জেলার উপজেলাসমূহ; বিভাগ/জেলা অচেনা হলে খালি */
export function getUpazilas(
  division: string | null | undefined,
  district: string | null | undefined,
): readonly GeoUpazila[] {
  return findDistrict(division, district)?.upazilas ?? []
}

export interface GeoSelection {
  division: string
  district: string
  upazila: string
}

/**
 * নির্বাচন সঙ্গতিপূর্ণ ও NFC করে: অচেনা বিভাগ → সব খালি; বিভাগের বাইরের জেলা → জেলা ও উপজেলা খালি;
 * জেলার বাইরের উপজেলা → উপজেলা খালি। (URL থেকে আসা মান স্যানিটাইজ করতে)
 */
export function normalizeGeo(sel: Partial<GeoSelection>): GeoSelection {
  const division = findDivision(sel.division)?.name ?? ''
  const district = division ? (findDistrict(division, sel.district)?.name ?? '') : ''
  const u = nfc(sel.upazila)
  const upazila = district && getUpazilas(division, district).some((x) => x.name === u) ? u : ''
  return { division, district, upazila }
}

/** ভ্যালিডেশন (এডমিন ফর্ম / বাল্ক ইম্পোর্ট): তিনটিই স্থির তালিকায় মিলছে কি না (NFC-সচেতন) */
export function isValidGeo(division: string, district: string, upazila: string): boolean {
  const u = nfc(upazila)
  return !!u && getUpazilas(division, district).some((x) => x.name === u)
}

/** জেলার নাম থেকে বিভাগ খুঁজে বের করা (জেলার নাম দেশে অনন্য) */
export function divisionOfDistrict(district: string): GeoDivision | null {
  const d = nfc(district)
  return BD_GEO.find((v) => v.districts.some((x) => x.name === d)) ?? null
}
