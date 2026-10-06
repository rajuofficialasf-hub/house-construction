import { describe, expect, test } from 'vitest'
import { BD_GEO } from '@/features/geo/data/bdGeo'
import {
  applyFiltersToSearchParams,
  EMPTY_FILTERS,
  filtersEqual,
  filtersFromSearchParams,
  hasActiveFilters,
  MAX_SEARCH_LENGTH,
} from './filters'

const dv = BD_GEO[0]
const ds = dv.districts[0]

describe('filtersFromSearchParams', () => {
  test('an empty query gives empty filters', () => {
    expect(filtersFromSearchParams(new URLSearchParams())).toEqual(EMPTY_FILTERS)
  })

  test('reads a valid year and geography', () => {
    const f = filtersFromSearchParams(new URLSearchParams({ year: '2025', division: dv.name, district: ds.name }))
    expect(f).toMatchObject({ year: 2025, division: dv.name, district: ds.name })
  })

  test('drops an out-of-range or non-integer year', () => {
    expect(filtersFromSearchParams(new URLSearchParams({ year: '1999' })).year).toBeNull()
    expect(filtersFromSearchParams(new URLSearchParams({ year: '2101' })).year).toBeNull()
    expect(filtersFromSearchParams(new URLSearchParams({ year: '20.5' })).year).toBeNull()
    expect(filtersFromSearchParams(new URLSearchParams({ year: 'abc' })).year).toBeNull()
  })

  test('drops a district that does not belong to the division', () => {
    const other = BD_GEO[1].districts[0].name
    const f = filtersFromSearchParams(new URLSearchParams({ division: dv.name, district: other }))
    expect(f.district).toBe('')
  })

  test('caps the search text length', () => {
    const f = filtersFromSearchParams(new URLSearchParams({ q: 'ক'.repeat(300) }))
    expect(f.q.length).toBe(MAX_SEARCH_LENGTH)
  })
})

describe('applyFiltersToSearchParams', () => {
  test('writes set filters and removes empty ones, leaving other params alone', () => {
    const sp = new URLSearchParams({ page: '3', q: 'old', year: '2024' })
    const out = applyFiltersToSearchParams(sp, { ...EMPTY_FILTERS, year: 2025, q: ' নাম ' })
    expect(out.get('year')).toBe('2025')
    expect(out.get('q')).toBe('নাম')
    expect(out.get('page')).toBe('3')
    expect(out.has('district')).toBe(false)
  })

  test('does not mutate the input', () => {
    const sp = new URLSearchParams({ year: '2024' })
    applyFiltersToSearchParams(sp, EMPTY_FILTERS)
    expect(sp.get('year')).toBe('2024')
  })

  test('round-trips through the URL', () => {
    const f = { year: 2025, division: dv.name, district: ds.name, upazila: ds.upazilas[0].name, q: 'রহিম' }
    expect(filtersFromSearchParams(applyFiltersToSearchParams(new URLSearchParams(), f))).toEqual(f)
  })
})

describe('hasActiveFilters and filtersEqual', () => {
  test('empty filters are inactive; whitespace-only search is inactive', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: '   ' })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, year: 2025 })).toBe(true)
  })

  test('equality ignores surrounding whitespace in the search text', () => {
    expect(filtersEqual({ ...EMPTY_FILTERS, q: 'a' }, { ...EMPTY_FILTERS, q: ' a ' })).toBe(true)
    expect(filtersEqual({ ...EMPTY_FILTERS, year: 2024 }, { ...EMPTY_FILTERS, year: 2025 })).toBe(false)
  })
})
