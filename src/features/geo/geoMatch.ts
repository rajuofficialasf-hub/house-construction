import { levenshtein, looseKey as baseLooseKey } from '@/lib/fuzzyMatch'
import type { GeoDistrict, GeoDivision, GeoUpazila } from './data/bdGeo'
import { BD_GEO } from './data/bdGeo'
import { findDistrict, findDivision, getDistricts, getUpazilas, nfc } from './geo'
import { unionsOf, type UnionData } from './unions'

/**
 * ইম্পোর্টে ভৌগোলিক নাম মেলানো: বাড়তি স্পেস/অদৃশ্য অক্ষর, বানানের সামান্য পার্থক্য (ণ/ন, ী/ি, শ/ষ/স, ড়/র …)
 * স্বয়ংক্রিয় ঠিক হয়; বেশি পার্থক্যে কাছাকাছি নামের পরামর্শ দেয়, ব্যবহারকারী বেছে নেন।
 */

export type GeoLevel = 'division' | 'district' | 'upazila'

export interface GeoMatch {
  /** স্থির তালিকার সঠিক নাম; না মিললে null */
  match: string | null
  /** true = হুবহু নয়, স্বয়ংক্রিয় সংশোধিত (loose-key মিল) */
  corrected: boolean
  /** না মিললে কাছাকাছি নামের পরামর্শ (সবচেয়ে কাছেরটি আগে) */
  suggestions: string[]
}

const STRIP_WORDS = /(বিভাগ|জেলা|উপজেলা|থানা|division|district|upazila|upazilla|thana|dist\.?)/gi

/** ঢিলা তুলনার key: বানান-ভিন্নতা মুছে ফেলা (সাধারণ নিয়ম lib/fuzzyMatch.ts এ; এখানে বাড়তি — "জেলা", "উপজেলা" … শব্দ বাদ) */
export function looseKey(raw: string): string {
  return baseLooseKey(raw, { stripWords: STRIP_WORDS })
}

/**
 * ইউনিয়নের ঢিলা key: শুধু "ইউনিয়ন", "ইউপি", "union", "UP" বাদ (পরিকল্পনা §৫.১২)।
 * "পৌরসভা" আর "ওয়ার্ড" বাদ যায় **না** — "মীরসরাই পৌরসভা" যেন ইউনিয়ন "মীরসরাই" এর সাথে না মেলে।
 */
const UNION_STRIP_WORDS = /(ইউনিয়ন|ইউপি|\bunion\b|\bup\b)/gi
export function unionLooseKey(raw: string): string {
  return baseLooseKey(raw, { stripWords: UNION_STRIP_WORDS })
}

interface Candidate {
  name: string
  en: string
}

/** ইংরেজি নামের তুলনা: বিভাগ/জেলা/উপজেলায় আগের মতোই (শুধু a-z); ইউনিয়নে "Union"/"UP" শব্দও বাদ */
const asciiKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const unionAsciiKey = (s: string) => unionLooseKey(s).replace(/[^a-z]/g, '')

function matchIn(raw: string, candidates: readonly Candidate[], mode: 'geo' | 'union' = 'geo'): GeoMatch {
  const keyOf = mode === 'union' ? unionLooseKey : looseKey
  const enOf = mode === 'union' ? unionAsciiKey : asciiKey
  /** পরামর্শের দূরত্বে প্রার্থীর ইংরেজি নাম — geo তে আগের হুবহু (ফাঁকাসহ ছোট হাতের) */
  const enCand = mode === 'union' ? unionAsciiKey : (s: string) => s.toLowerCase()
  const exact = nfc(raw)
  if (!exact) return { match: null, corrected: false, suggestions: [] }
  const byExact = candidates.find((c) => c.name === exact)
  if (byExact) return { match: byExact.name, corrected: false, suggestions: [] }
  const key = keyOf(raw)
  const enKey = enOf(exact)
  const byLoose = candidates.find((c) => keyOf(c.name) === key || (enKey && enOf(c.en) === enKey))
  if (byLoose) return { match: byLoose.name, corrected: true, suggestions: [] }
  const limit = Math.max(2, Math.floor(key.length / 3))
  const scored = candidates
    .map((c) => ({ name: c.name, d: Math.min(levenshtein(key, keyOf(c.name)), enKey ? levenshtein(enKey, enCand(c.en)) : 99) }))
    .filter((x) => x.d <= limit)
    .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name, 'bn'))
    .slice(0, 5)
  return { match: null, corrected: false, suggestions: scored.map((x) => x.name) }
}

export function matchDivision(raw: string): GeoMatch {
  return matchIn(raw, BD_GEO)
}

/** জেলা: বিভাগ জানা থাকলে তার ভেতরে, নইলে সারা দেশে (জেলার নাম অনন্য) */
export function matchDistrict(raw: string, division: string | null): GeoMatch {
  const scope: readonly GeoDistrict[] = division ? getDistricts(division) : BD_GEO.flatMap((d) => d.districts)
  return matchIn(raw, scope)
}

/** উপজেলা: জেলা জানা থাকলে তার ভেতরে; নইলে বিভাগের সব; নইলে সারা দেশে */
export function matchUpazila(raw: string, division: string | null, district: string | null): GeoMatch {
  let scope: readonly GeoUpazila[]
  if (district) scope = getUpazilas(division ?? divisionOf(district), district)
  else if (division) scope = getDistricts(division).flatMap((d) => d.upazilas)
  else scope = BD_GEO.flatMap((v) => v.districts.flatMap((d) => d.upazilas))
  // একই নামের উপজেলা একাধিক জেলায় থাকতে পারে — নাম অনুযায়ী unique
  const seen = new Set<string>()
  const unique = scope.filter((u) => (seen.has(u.name) ? false : (seen.add(u.name), true)))
  return matchIn(raw, unique)
}

export interface UnionMatch extends GeoMatch {
  /** এই উপজেলার ইউনিয়ন-তালিকা আছে কি না (৫টিতে নেই; তালিকা নামানো না থাকলেও false) */
  listed: boolean
}

/**
 * ইউনিয়ন: শুধু নির্বাচিত জেলা/উপজেলার তালিকায় (নাম দেশে একাধিকবার আছে)। না মিললেও লেখা গ্রহণযোগ্য —
 * ডাকার জায়গা হলুদ সতর্কতা দেখায়, আটকায় না।
 */
export function matchUnion(raw: string, unions: UnionData | null, district: string | null, upazila: string | null): UnionMatch {
  const list = unionsOf(unions, district, upazila)
  const m = matchIn(raw, list.map(([name, en]) => ({ name, en })), 'union')
  return { ...m, listed: list.length > 0 }
}

function divisionOf(district: string): string | null {
  const d = nfc(district)
  return BD_GEO.find((v) => v.districts.some((x) => x.name === d))?.name ?? null
}

export interface ResolvedGeo {
  division: string | null
  district: string | null
  upazila: string | null
  /** কোন স্তর স্বয়ংক্রিয় সংশোধিত হয়েছে */
  corrected: GeoLevel[]
  /** না মেলা স্তর ও পরামর্শ */
  unresolved: { level: GeoLevel; raw: string; suggestions: string[] }[]
  /**
   * ৪র্থ স্তর — শুধু opts.union দিলে। value: তালিকায় মিললে তালিকার নাম, নইলে লেখাটিই (NFC); খালি হলে null।
   * status: exact/corrected (তালিকায়), unlisted (তালিকা আছে কিন্তু নেই — সতর্কতা), no_list (উপজেলার তালিকা নেই
   * বা তালিকা নামানো হয়নি), empty। কখনো ত্রুটি নয় (নিজে লেখা চলে)।
   */
  union?: { value: string | null; status: 'empty' | 'exact' | 'corrected' | 'unlisted' | 'no_list'; suggestions: string[] }
}

/**
 * তিন স্তর (আর opts.union দিলে ইউনিয়ন — ৪র্থ স্তর) একসাথে সমাধান। জেলা মিললে কিন্তু বিভাগ না মিললে জেলা থেকে বিভাগ অনুমান হয়।
 * fixes: ব্যবহারকারীর ম্যানুয়াল ম্যাপিং (key = geoFixKey()) — আগে প্রয়োগ হয়।
 */
export function resolveGeo(
  rawDivision: string,
  rawDistrict: string,
  rawUpazila: string,
  fixes: Record<string, string> = {},
  opts: { union?: string; unions?: UnionData | null } = {},
): ResolvedGeo {
  const corrected: GeoLevel[] = []
  const unresolved: ResolvedGeo['unresolved'] = []

  const fixed = (level: GeoLevel, raw: string, parent: string) => fixes[geoFixKey(level, raw, parent)] ?? null

  // বিভাগ
  let division: string | null = fixed('division', rawDivision, '')
  if (!division) {
    const m = matchDivision(rawDivision)
    division = m.match
    if (m.corrected) corrected.push('division')
    if (!division && nfc(rawDivision)) unresolved.push({ level: 'division', raw: nfc(rawDivision), suggestions: m.suggestions })
  }

  // জেলা
  let district: string | null = fixed('district', rawDistrict, division ?? '')
  if (!district) {
    const m = matchDistrict(rawDistrict, division)
    district = m.match
    if (m.corrected) corrected.push('district')
    if (!district && nfc(rawDistrict)) unresolved.push({ level: 'district', raw: nfc(rawDistrict), suggestions: m.suggestions })
  }
  if (district && !division) {
    division = divisionOf(district)
    // বিভাগ ভুল ছিল কিন্তু জেলা থেকে বোঝা গেল → বিভাগের unresolved বাদ
    if (division) {
      const i = unresolved.findIndex((u) => u.level === 'division')
      if (i !== -1) unresolved.splice(i, 1)
      corrected.push('division')
    }
  }
  if (district && division && !findDistrict(division, district)) {
    // জেলা এই বিভাগে নেই (fix থেকে এসেছে?) — জেলা অনুযায়ী বিভাগ ঠিক করা
    const dv = divisionOf(district)
    if (dv) {
      division = dv
      corrected.push('division')
    }
  }

  // উপজেলা
  let upazila: string | null = fixed('upazila', rawUpazila, district ?? '')
  if (!upazila) {
    const m = matchUpazila(rawUpazila, division, district)
    upazila = m.match
    if (m.corrected) corrected.push('upazila')
    if (!upazila && nfc(rawUpazila)) unresolved.push({ level: 'upazila', raw: nfc(rawUpazila), suggestions: m.suggestions })
  }
  if (upazila && !district) {
    // উপজেলা থেকে জেলা/বিভাগ অনুমান (নাম অনন্য হলে)
    const hits = BD_GEO.flatMap((v) => v.districts.filter((d) => d.upazilas.some((u) => u.name === upazila)).map((d) => ({ v, d })))
    if (hits.length === 1) {
      district = hits[0].d.name
      division = hits[0].v.name
      corrected.push('district')
      for (const lvl of ['district', 'division'] as GeoLevel[]) {
        const i = unresolved.findIndex((u) => u.level === lvl)
        if (i !== -1) unresolved.splice(i, 1)
      }
    }
  }

  const result: ResolvedGeo = { division, district, upazila, corrected: [...new Set(corrected)], unresolved }
  if (opts.union !== undefined) {
    const raw = nfc(opts.union).replace(/s+/g, ' ')
    if (!raw) result.union = { value: null, status: 'empty', suggestions: [] }
    else {
      const m = matchUnion(raw, opts.unions ?? null, district, upazila)
      result.union = m.match
        ? { value: m.match, status: m.corrected ? 'corrected' : 'exact', suggestions: [] }
        : { value: raw, status: m.listed ? 'unlisted' : 'no_list', suggestions: m.suggestions }
    }
  }
  return result
}

export function geoFixKey(level: GeoLevel, raw: string, parent: string): string {
  return `${level}|${nfc(parent)}|${nfc(raw)}`
}

/** ম্যানুয়াল ঠিক করার ড্রপডাউনে দেখানোর সম্পূর্ণ তালিকা */
export function candidatesFor(level: GeoLevel, parentDivision: string | null, parentDistrict: string | null): string[] {
  if (level === 'division') return BD_GEO.map((d: GeoDivision) => d.name)
  if (level === 'district') return (parentDivision ? getDistricts(parentDivision) : BD_GEO.flatMap((d) => d.districts)).map((d) => d.name)
  const scope = parentDistrict
    ? getUpazilas(parentDivision ?? divisionOf(parentDistrict), parentDistrict)
    : parentDivision
      ? getDistricts(parentDivision).flatMap((d) => d.upazilas)
      : BD_GEO.flatMap((v) => v.districts.flatMap((d) => d.upazilas))
  return [...new Set(scope.map((u) => u.name))]
}

export { findDivision }
