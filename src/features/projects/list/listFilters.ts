/**
 * পাবলিক তালিকার ফিল্টার ⇄ URL (M-ধাপ ১৩): পুরনো প্যারামিটার অপরিবর্তিত (?year=&division=&district=&upazila=&q=),
 * নতুন: ?union= (উপজেলা বাছা থাকলে তবেই) আর কাস্টম ফিল্টার ?f_<key>= (যেমন ?f_category=গাভী)।
 * কাস্টম key শুধু প্রকল্পের "ফিল্টারে" চালু পাবলিক ফিল্ডের — অচেনা key নীরবে বাদ (API ও তাই করে — whitelist)।
 */
import { nfc } from '@/features/geo/geo'
import {
  applyFiltersToSearchParams,
  filtersEqual,
  filtersFromSearchParams,
  hasActiveFilters,
  MAX_SEARCH_LENGTH,
  type HousingFilters,
} from '@/features/housing/utils/filters'

export interface ProjectListFilters extends HousingFilters {
  /** ইউনিয়ন/পৌরসভা (হুবহু মিল) — উপজেলা না থাকলে '' */
  union: string
  /** কাস্টম ফিল্ড key → মান */
  fields: Record<string, string>
}

export const FIELD_PARAM = (key: string) => `f_${key}`

export function listFiltersFromSearchParams(sp: URLSearchParams, fieldKeys: readonly string[]): ProjectListFilters {
  const base = filtersFromSearchParams(sp)
  const union = base.upazila ? nfc(sp.get('union')).slice(0, MAX_SEARCH_LENGTH) : ''
  const fields: Record<string, string> = {}
  for (const k of fieldKeys) {
    const v = nfc(sp.get(FIELD_PARAM(k))).replace(/\s+/g, ' ').slice(0, MAX_SEARCH_LENGTH)
    if (v) fields[k] = v
  }
  return { ...base, union, fields }
}

export function applyListFilters(sp: URLSearchParams, f: ProjectListFilters, fieldKeys: readonly string[]): URLSearchParams {
  const out = applyFiltersToSearchParams(sp, f)
  if (f.union && f.upazila) out.set('union', f.union)
  else out.delete('union')
  for (const k of fieldKeys) {
    if (f.fields[k]) out.set(FIELD_PARAM(k), f.fields[k])
    else out.delete(FIELD_PARAM(k))
  }
  return out
}

export function hasActiveListFilters(f: ProjectListFilters): boolean {
  return hasActiveFilters(f) || !!f.union || Object.keys(f.fields).length > 0
}

export function listFiltersEqual(a: ProjectListFilters, b: ProjectListFilters): boolean {
  const ka = Object.keys(a.fields).sort()
  const kb = Object.keys(b.fields).sort()
  return filtersEqual(a, b) && a.union === b.union && ka.length === kb.length && ka.every((k, i) => k === kb[i] && a.fields[k] === b.fields[k])
}

export const EMPTY_LIST_FILTERS: ProjectListFilters = { year: null, division: '', district: '', upazila: '', q: '', union: '', fields: {} }
