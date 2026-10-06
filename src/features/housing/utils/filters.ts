import { nfc, normalizeGeo } from '@/features/geo/geo'

/** তালিকা পেইজের ফিল্টার (URL query params এর সাথে ১:১) */
export interface HousingFilters {
  year: number | null
  division: string
  district: string
  upazila: string
  q: string
}

export const EMPTY_FILTERS: HousingFilters = { year: null, division: '', district: '', upazila: '', q: '' }

export const MAX_SEARCH_LENGTH = 100

/** URL → ফিল্টার (অবৈধ/অসঙ্গত মান বাদ) */
export function filtersFromSearchParams(sp: URLSearchParams): HousingFilters {
  const yearRaw = Number(sp.get('year'))
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : null
  const geo = normalizeGeo({
    division: sp.get('division') ?? '',
    district: sp.get('district') ?? '',
    upazila: sp.get('upazila') ?? '',
  })
  const q = nfc(sp.get('q')).slice(0, MAX_SEARCH_LENGTH)
  return { year, ...geo, q }
}

/** ফিল্টার → URL (খালি মান লেখা হয় না; `page` আলাদাভাবে হ্যান্ডেল হয়) */
export function applyFiltersToSearchParams(sp: URLSearchParams, f: HousingFilters): URLSearchParams {
  const out = new URLSearchParams(sp)
  const set = (k: string, v: string) => (v ? out.set(k, v) : out.delete(k))
  set('year', f.year ? String(f.year) : '')
  set('division', f.division)
  set('district', f.district)
  set('upazila', f.upazila)
  set('q', f.q.trim())
  return out
}

export function hasActiveFilters(f: HousingFilters): boolean {
  return f.year !== null || !!f.division || !!f.district || !!f.upazila || !!f.q.trim()
}

export function filtersEqual(a: HousingFilters, b: HousingFilters): boolean {
  return (
    a.year === b.year &&
    a.division === b.division &&
    a.district === b.district &&
    a.upazila === b.upazila &&
    a.q.trim() === b.q.trim()
  )
}
