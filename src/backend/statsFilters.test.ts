import { describe, expect, it } from 'vitest'
import { createMockBackend } from './mock'
import { hasStatsFilters, statsFilterEntries } from './statsFilters'

// The filters the list page sends to stats(), and when they count as "none". The REST adapter sends
// exactly these entries, so "has filters" and "sends filter parameters" never disagree
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, P8b decisions).

describe('statsFilterEntries', () => {
  it('maps every filter to the list query names, dropping blanks', () => {
    expect(
      statsFilterEntries({
        year: 2024,
        division: 'রংপুর',
        district: ' কুড়িগ্রাম ',
        upazila: '',
        union_name: 'দলদলিয়া',
        q: '  রহিমা  ',
        fields: { trade: 'দর্জি', blank: '   ', amount: '1000' },
      }),
    ).toEqual([
      ['year', '2024'],
      ['division', 'রংপুর'],
      ['district', 'কুড়িগ্রাম'],
      ['union_name', 'দলদলিয়া'],
      ['q', 'রহিমা'],
      ['f.trade', 'দর্জি'],
      ['f.amount', '1000'],
    ])
  })

  it('cuts the search to the list limit', () => {
    expect(statsFilterEntries({ q: 'ক'.repeat(150) })).toEqual([['q', 'ক'.repeat(100)]])
  })
})

describe('hasStatsFilters', () => {
  it('treats missing, empty and whitespace-only values as no filters', () => {
    expect(hasStatsFilters(undefined)).toBe(false)
    expect(hasStatsFilters({})).toBe(false)
    expect(hasStatsFilters({ division: '', q: '   ', fields: {} })).toBe(false)
    expect(hasStatsFilters({ fields: { trade: ' ' } })).toBe(false)
  })

  it('sees any real value', () => {
    expect(hasStatsFilters({ year: 2024 })).toBe(true)
    expect(hasStatsFilters({ q: 'x' })).toBe(true)
    expect(hasStatsFilters({ fields: { trade: 'দর্জি' } })).toBe(true)
  })
})

describe('mock stats with filters', () => {
  it('says it did not filter, and returns the totals', async () => {
    const { housingApi } = createMockBackend()
    const totals = await housingApi.stats('semi_pucca')
    expect(totals).not.toHaveProperty('filtered')
    expect(await housingApi.stats('semi_pucca', { filters: { year: 2024 } })).toEqual({ ...totals, filtered: false })
    expect(await housingApi.stats('semi_pucca', { filters: { q: '  ' } })).toEqual(totals)
  })
})
