import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError, type HousingRecord } from '../interfaces/types'
import { createRestHousingApi, createRestProjectsApi } from './index'

// REST HousingApi: সঠিক মেথড, URL ও body পাঠায়, Supabase অ্যাডাপ্টারের মতোই page/page_size সীমিত করে,
// আর সার্ভারের উত্তর থেকে HousingApi-র আকার ফেরত দেয় (docs/api/API_CONTRACT.md)।

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
/** সার্ভারের রেকর্ডে union_name/extra নেই; অ্যাডাপ্টার খালি মান বসায় */
const adapted = (serial_no: number) => ({ ...record(serial_no), union_name: '', extra: {} })
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
    expect(result).toEqual({ ...page, data: [adapted(1)] })
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
    expect(await api.getById('a/b')).toEqual(adapted(3))
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/housing/a%2Fb')
    expect(await api.getBySerial('tin', 3)).toEqual(adapted(3))
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
    expect(await api.stats('tin')).toMatchObject({ total: 1, by_project: { tin: 1 }, by_union: {}, fields: {} })
    expect(await api.years()).toEqual([2024])
    expect(await api.filterOptions('semi_pucca')).toEqual({ ...options, unions: [] })
    expect(await api.nextSerial('tin')).toBe(9)
    expect(fetchMock.mock.calls.map((c) => String(c[0]).replace(BASE, ''))).toEqual([
      '/api/v1/housing/stats?project_type=tin',
      '/api/v1/housing/years',
      '/api/v1/housing/filter-options?project_type=semi_pucca',
      '/api/v1/housing/next-serial?project_type=tin',
    ])
  })
})

/** fetch-এর একটি কল: মেথড, BASE ছাড়া পাথ, আর JSON body (থাকলে) */
function callOf(fetchMock: ReturnType<typeof stubFetchInit>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call]!
  const body = init?.body
  return {
    method: init?.method,
    path: String(url).replace(BASE, ''),
    body: typeof body === 'string' ? JSON.parse(body) : body,
  }
}

function stubFetchInit(handler: (url: URL, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(new URL(url), init)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const input = {
  project_type: 'tin' as const,
  year: 2025,
  name: 'মমতাজ বেগম',
  father_or_husband_name: '',
  division: 'ময়মনসিংহ',
  district: 'শেরপুর',
  upazila: 'নালিতাবাড়ী',
  address: '',
}

describe('createRestHousingApi writes', () => {
  it('creates, updates, changes the serial and deletes with the contract method, path and body', async () => {
    const fetchMock = stubFetchInit((_url, init) => (init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, { data: record(7) })))
    const api = createRestHousingApi(BASE)
    expect(await api.create(input)).toEqual(adapted(7))
    expect(await api.update('a b', { address: 'নতুন' })).toEqual(adapted(7))
    expect(await api.changeSerial('a b', 40)).toEqual(adapted(7))
    expect(await api.delete('a b')).toBeUndefined()
    expect(fetchMock.mock.calls.map((_c, i) => callOf(fetchMock, i))).toEqual([
      { method: 'POST', path: '/api/v1/housing', body: input },
      { method: 'PUT', path: '/api/v1/housing/a%20b', body: { address: 'নতুন' } },
      { method: 'POST', path: '/api/v1/housing/a%20b/serial', body: { serial_no: 40 } },
      { method: 'DELETE', path: '/api/v1/housing/a%20b', body: undefined },
    ])
  })

  it('maps the error body to HousingApiError', async () => {
    stubFetchInit(() => json(409, { error: { code: 'CONFLICT', message: 'এই সিরিয়াল আগে থেকেই আছে' } }))
    const err = await createRestHousingApi(BASE).create(input).catch((e: unknown) => e)
    expect(HousingApiError.is(err) && err.code).toBe('CONFLICT')
  })

  it('sends a bulk import as one request however many rows, so the server keeps it all-or-nothing', async () => {
    const fetchMock = stubFetchInit(() => json(413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'x' } }))
    const { project_type: _pt, ...row } = input
    const rows = Array.from({ length: 501 }, () => row)
    const err = await createRestHousingApi(BASE).bulkInsert({ project_type: 'tin', mode: 'assign_serial', rows }).catch((e: unknown) => e)
    expect(HousingApiError.is(err) && err.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(callOf(fetchMock)).toMatchObject({ method: 'POST', path: '/api/v1/housing/bulk', body: { project_type: 'tin', mode: 'assign_serial' } })
  })

  it('updates by serial with PUT and returns the server result', async () => {
    const fetchMock = stubFetchInit(() => json(200, { data: { updated: 1, missing: [9] } }))
    const result = await createRestHousingApi(BASE).bulkUpdateBySerial({ project_type: 'tin', rows: [{ serial_no: 1, name: 'x' }, { serial_no: 9 }] })
    expect(result).toEqual({ updated: 1, missing: [9] })
    expect(callOf(fetchMock)).toEqual({ method: 'PUT', path: '/api/v1/housing/bulk', body: { project_type: 'tin', rows: [{ serial_no: 1, name: 'x' }, { serial_no: 9 }] } })
  })

  it('calls the photo endpoints, multipart for an upload', async () => {
    const fetchMock = stubFetchInit(() => json(200, { data: record(3) }))
    const api = createRestHousingApi(BASE)
    await api.uploadPhoto('r1', 'prev', { photo: new Blob(['p']), thumb: new Blob(['t']) })
    await api.deletePhoto('r1', 'current')
    const upload = callOf(fetchMock, 0)
    expect(upload).toMatchObject({ method: 'POST', path: '/api/v1/housing/r1/photo' })
    const form = upload.body as FormData
    expect([form.get('kind'), form.has('photo'), form.has('thumb')]).toEqual(['prev', true, true])
    expect(callOf(fetchMock, 1)).toMatchObject({ method: 'DELETE', path: '/api/v1/housing/r1/photo?kind=current' })
  })
})

describe('createRestHousingApi activity', () => {
  it('lists with filters, clamps the page size and sends local dates as ISO with an offset', async () => {
    const fetchMock = stubFetchInit(() => json(200, EMPTY_PAGE))
    await createRestHousingApi(BASE).listActivity({
      action: 'update',
      record_id: 'r1',
      actor_email: 'admin',
      from: '2026-10-05T00:00:00',
      to: '2026-10-05T23:59:59.999',
      page_size: 500,
    })
    const url = urlOf(fetchMock)
    expect(url.pathname).toBe('/api/v1/housing/activity')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'update',
      record_id: 'r1',
      actor_email: 'admin',
      from: new Date('2026-10-05T00:00:00').toISOString(),
      to: new Date('2026-10-05T23:59:59.999').toISOString(),
      page: '1',
      page_size: '100',
    })
  })

  it('leaves out a date that is not a real date instead of throwing', async () => {
    const fetchMock = stubFetchInit(() => json(200, EMPTY_PAGE))
    await createRestHousingApi(BASE).listActivity({ from: '2026-13-45T00:00:00', to: 'x' })
    expect([...urlOf(fetchMock).searchParams.keys()]).toEqual(['page', 'page_size'])
  })

  it('posts a client event', async () => {
    const fetchMock = stubFetchInit(() => json(201, { data: { id: 5 } }))
    await createRestHousingApi(BASE).logActivity('import_run', { rows: 3 }, 'tin')
    expect(callOf(fetchMock)).toEqual({ method: 'POST', path: '/api/v1/housing/activity', body: { action: 'import_run', details: { rows: 3 }, project_type: 'tin' } })
  })

  it('sends nothing for login or logout, which the server logs itself', async () => {
    const fetchMock = stubFetchInit(() => json(201, { data: { id: 5 } }))
    await createRestHousingApi(BASE).logActivity('login')
    await createRestHousingApi(BASE).logActivity('logout')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails quietly when the event is refused', async () => {
    stubFetchInit(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'লগইন করুন' } }))
    await expect(createRestHousingApi(BASE).logActivity('import_run')).resolves.toBeUndefined()
  })
})

describe('createRestHousingApi on the single-project server', () => {
  it('reads the housing group as all records, with no project filter', async () => {
    const fetchMock = stubFetch((url) => json(200, url.pathname.endsWith('/stats') ? { data: { total: 3 } } : EMPTY_PAGE))
    const api = createRestHousingApi(BASE)
    expect(await api.stats('housing')).toMatchObject({ total: 3, by_project: {} })
    await api.list({ project_type: 'housing' })
    expect(urlOf(fetchMock).searchParams.has('project_type')).toBe(false)
    expect(urlOf(fetchMock, 1).searchParams.has('project_type')).toBe(false)
  })

  it('leaves out union_name, extra and _clear, which the server does not accept', async () => {
    const fetchMock = stubFetchInit(() => json(200, { data: record(1) }))
    const api = createRestHousingApi(BASE)
    await api.create({ ...input, union_name: 'ক', extra: { cow: 2 } })
    await api.bulkUpdateBySerial({ project_type: 'tin', rows: [{ serial_no: 1, union_name: 'ক', _clear: ['address'] }] })
    expect(callOf(fetchMock).body).toEqual(input)
    expect(callOf(fetchMock, 1).body).toEqual({ project_type: 'tin', rows: [{ serial_no: 1 }] })
  })

  it('has no private values and refuses to set them', async () => {
    const api = createRestHousingApi(BASE)
    expect(await api.getPrivate('x')).toEqual({})
    expect(await api.getPrivateMany('tin', ['x'])).toEqual({})
    await expect(api.setPrivate('x', { phone: '1' })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
  })

  it('serves the three fallback housing projects and refuses project edits', async () => {
    stubFetch(() => json(200, { data: { total: 2, by_district: { শেরপুর: 2 } } }))
    const projects = createRestProjectsApi(BASE)
    expect(await projects.backendMode()).toBe('legacy')
    expect((await projects.list()).map((p) => p.key)).toEqual(['housing', 'semi_pucca', 'tin'])
    const overview = await projects.overview()
    expect(overview.global).toEqual({ projects: 2, total: 2, districts: 1 })
    await expect(projects.get('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(projects.create({ key: 'k', slug: 'k', name_bn: 'ক', name_en: 'k' })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
  })
})
