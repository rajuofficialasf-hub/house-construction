import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError, type HousingRecord } from '../interfaces/types'
import { createRestHousingApi } from './index'

// REST HousingApi-র পড়ার মেথড: সঠিক URL বানায়, Supabase অ্যাডাপ্টারের মতোই page/page_size সীমিত করে,
// আর সার্ভারের উত্তর থেকে HousingApi-র আকার ফেরত দেয়। লেখার মেথড C4 পর্যন্ত NOT_IMPLEMENTED।

const BASE = 'http://api.test'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function stubFetch(handler: (url: URL) => Response) {
  const fetchMock = vi.fn((url: string) => Promise.resolve(handler(new URL(url))))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (fetchMock: ReturnType<typeof stubFetch>, call = 0) => new URL(String(fetchMock.mock.calls[call]![0]))
const record = (serial_no: number) => ({ id: `id-${serial_no}`, serial_no }) as unknown as HousingRecord
const EMPTY_PAGE = { data: [], meta: { page: 1, page_size: 50, total: 0, total_pages: 1 } }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRestHousingApi reads', () => {
  it('sends every list parameter and returns the page', async () => {
    const page = { data: [record(1)], meta: { page: 2, page_size: 10, total: 11, total_pages: 2 } }
    const fetchMock = stubFetch(() => json(200, page))
    const result = await createRestHousingApi(BASE).list({
      project_type: 'tin',
      serial_no: 5,
      year: 2024,
      division: 'রংপুর',
      district: 'কুড়িগ্রাম',
      upazila: 'উলিপুর',
      q: 'রহিমা',
      page: 2,
      page_size: 10,
      sort: 'year',
      order: 'desc',
    })
    expect(result).toEqual(page)
    const url = urlOf(fetchMock)
    expect(url.pathname).toBe('/api/v1/housing')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      project_type: 'tin',
      serial_no: '5',
      year: '2024',
      division: 'রংপুর',
      district: 'কুড়িগ্রাম',
      upazila: 'উলিপুর',
      q: 'রহিমা',
      page: '2',
      page_size: '10',
      sort: 'year',
      order: 'desc',
    })
  })

  it('clamps page and page_size the way the Supabase adapter does, and leaves out empty values', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    const api = createRestHousingApi(BASE)
    await api.list({ page: 0, page_size: 1000, q: '  ', division: '' })
    expect(Object.fromEntries(urlOf(fetchMock).searchParams)).toEqual({ page: '1', page_size: '100' })
    await api.list({ page: 2.7, page_size: 0 })
    expect(Object.fromEntries(urlOf(fetchMock, 1).searchParams)).toEqual({ page: '2', page_size: '1' })
  })

  it('cuts a search to the 100 characters the server accepts', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    await createRestHousingApi(BASE).list({ q: ` ${'ক'.repeat(150)} ` })
    expect(urlOf(fetchMock).searchParams.get('q')).toBe('ক'.repeat(100))
  })

  it('gets one record by id, encoding the id, and by serial', async () => {
    const fetchMock = stubFetch(() => json(200, { data: record(3) }))
    const api = createRestHousingApi(BASE)
    expect(await api.getById('a/b')).toEqual(record(3))
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/housing/a%2Fb')
    expect(await api.getBySerial('tin', 3)).toEqual(record(3))
    expect(urlOf(fetchMock, 1).pathname).toBe('/api/v1/housing/tin/serial/3')
  })

  it('turns a 404 into NOT_FOUND', async () => {
    stubFetch(() => json(404, { error: { code: 'NOT_FOUND', message: 'রেকর্ড পাওয়া যায়নি' } }))
    const err = await createRestHousingApi(BASE).getById('x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HousingApiError)
    expect((err as HousingApiError).code).toBe('NOT_FOUND')
  })

  it('makes no request for an empty or all-invalid serial list', async () => {
    const fetchMock = stubFetch(() => json(200, { data: [] }))
    const api = createRestHousingApi(BASE)
    expect(await api.getBySerials('tin', [])).toEqual([])
    expect(await api.getBySerials('tin', [0, -1, 1.5, Number.NaN, 2147483648])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dedupes serials, asks 100 at a time, and merges the answers in serial order', async () => {
    const fetchMock = stubFetch((url) => json(200, { data: url.searchParams.get('nos')!.split(',').map((n) => record(Number(n))) }))
    const wanted = [...Array.from({ length: 150 }, (_, i) => 150 - i), 7, 7]
    const found = await createRestHousingApi(BASE).getBySerials('semi_pucca', wanted)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/housing/semi_pucca/serials')
    expect(urlOf(fetchMock).searchParams.get('nos')!.split(',')).toHaveLength(100)
    expect(found.map((r) => r.serial_no)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1))
  })

  it('reads stats, years, filter options and the next serial with the project filter', async () => {
    const stats = { total: 1 }
    const options = { years: [2024], divisions: ['রংপুর'], districts: ['কুড়িগ্রাম'], upazilas: ['উলিপুর'] }
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith('/stats')) return json(200, { data: stats })
      if (url.pathname.endsWith('/years')) return json(200, { data: [2024] })
      if (url.pathname.endsWith('/filter-options')) return json(200, { data: options })
      return json(200, { data: { project_type: 'tin', next_serial: 9 } })
    })
    const api = createRestHousingApi(BASE)
    expect(await api.stats('tin')).toEqual(stats)
    expect(await api.years()).toEqual([2024])
    expect(await api.filterOptions('semi_pucca')).toEqual(options)
    expect(await api.nextSerial('tin')).toBe(9)
    expect(fetchMock.mock.calls.map((c) => String(c[0]).replace(BASE, ''))).toEqual([
      '/api/v1/housing/stats?project_type=tin',
      '/api/v1/housing/years',
      '/api/v1/housing/filter-options?project_type=semi_pucca',
      '/api/v1/housing/next-serial?project_type=tin',
    ])
  })
})
