import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError, type HousingRecord } from '../interfaces/types'
import { createRestHousingApi } from './index'

// REST HousingApi: সঠিক মেথড, URL ও body পাঠায়, Supabase অ্যাডাপ্টারের মতোই page/page_size সীমিত করে,
// আর সার্ভারের উত্তর অপরিবর্তিত ফেরত দেয় (docs/api/PROJECTS_API_CONTRACT.md §৪.৩–৪.৫)।

const BASE = 'http://api.test'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function stubFetch(handler: (url: URL, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(new URL(url), init)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (fetchMock: ReturnType<typeof stubFetch>, call = 0) => new URL(String(fetchMock.mock.calls[call]![0]))

/** fetch-এর একটি কল: মেথড, BASE ছাড়া পাথ, আর JSON body (থাকলে) */
function callOf(fetchMock: ReturnType<typeof stubFetch>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call]!
  const body = init?.body
  return {
    method: init?.method,
    path: String(url).replace(BASE, ''),
    body: typeof body === 'string' ? JSON.parse(body) : body,
  }
}

const record = (serial_no: number) => ({ id: `id-${serial_no}`, serial_no, union_name: '', extra: {} }) as unknown as HousingRecord
const EMPTY_PAGE = { data: [], meta: { page: 1, page_size: 50, total: 0, total_pages: 1 } }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRestHousingApi reads', () => {
  it('sends every list parameter, custom-field filters as f.<key>, and returns the page as given', async () => {
    const page = { data: [record(1)], meta: { page: 2, page_size: 10, total: 11, total_pages: 2 } }
    const fetchMock = stubFetch(() => json(200, page))
    const result = await createRestHousingApi(BASE).list({
      project_type: 'tin',
      serial_no: 5,
      year: 2024,
      division: 'রংপুর',
      district: 'কুড়িগ্রাম',
      upazila: 'উলিপুর',
      union_name: 'দলদলিয়া',
      fields: { trade: 'দর্জি', blank: ' ' },
      q: 'রহিমা',
      page: 2,
      page_size: 10,
      sort: 'extra.amount',
      order: 'desc',
    })
    expect(result).toEqual(page)
    const url = urlOf(fetchMock)
    expect(url.pathname).toBe('/api/v1/projects/tin/records')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      serial_no: '5',
      year: '2024',
      division: 'রংপুর',
      district: 'কুড়িগ্রাম',
      upazila: 'উলিপুর',
      union_name: 'দলদলিয়া',
      'f.trade': 'দর্জি',
      q: 'রহিমা',
      page: '2',
      page_size: '10',
      sort: 'extra.amount',
      order: 'desc',
    })
  })

  it('clamps page and page_size the way the Supabase adapter does, and leaves out empty values', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    const api = createRestHousingApi(BASE)
    await api.list({ project_type: 'tin', page: 0, page_size: 1000, q: '  ', division: '' })
    expect(Object.fromEntries(urlOf(fetchMock).searchParams)).toEqual({ page: '1', page_size: '100' })
    await api.list({ project_type: 'tin', page: 2.7, page_size: 0 })
    expect(Object.fromEntries(urlOf(fetchMock, 1).searchParams)).toEqual({ page: '2', page_size: '1' })
  })

  it('cuts a search to the 100 characters the server accepts', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    await createRestHousingApi(BASE).list({ project_type: 'tin', q: ` ${'ক'.repeat(150)} ` })
    expect(urlOf(fetchMock).searchParams.get('q')).toBe('ক'.repeat(100))
  })

  it('refuses a call with no project before sending anything, since the server has no all-projects route', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    const api = createRestHousingApi(BASE)
    await expect(api.list({})).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'project_type' } })
    await expect(api.stats()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(api.years()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gets one record by id, encoding the id, and by serial', async () => {
    const fetchMock = stubFetch(() => json(200, { data: record(3) }))
    const api = createRestHousingApi(BASE)
    expect(await api.getById('a/b')).toEqual(record(3))
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/records/a%2Fb')
    expect(await api.getBySerial('tin', 3)).toEqual(record(3))
    expect(urlOf(fetchMock, 1).pathname).toBe('/api/v1/projects/tin/records/serial/3')
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
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/projects/semi_pucca/records/serials')
    expect(urlOf(fetchMock).searchParams.get('nos')!.split(',')).toHaveLength(100)
    expect(found.map((r) => r.serial_no)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1))
  })

  it('reads stats (light on request), years and the next serial from the project routes', async () => {
    const stats = { total: 1, by_union: {} }
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith('/stats')) return json(200, { data: stats })
      if (url.pathname.endsWith('/years')) return json(200, { data: [2024] })
      return json(200, { data: { project_type: 'tin', next_serial: 9 } })
    })
    const api = createRestHousingApi(BASE)
    expect(await api.stats('tin')).toEqual(stats)
    expect(await api.stats('housing', { light: true })).toEqual(stats)
    expect(await api.years('tin')).toEqual([2024])
    expect(await api.nextSerial('tin')).toBe(9)
    expect(fetchMock.mock.calls.map((c) => String(c[0]).replace(BASE, ''))).toEqual([
      '/api/v1/projects/tin/stats',
      '/api/v1/projects/housing/stats?light=1',
      '/api/v1/projects/tin/years',
      '/api/v1/projects/tin/next-serial',
    ])
  })

  it('sends the list\'s filters to stats under the list\'s names, and returns the server\'s answer', async () => {
    const filtered = { total: 2, by_union: {}, filtered: true }
    const fetchMock = stubFetch(() => json(200, { data: filtered }))
    const api = createRestHousingApi(BASE)
    const filters = { year: 2024, division: 'রংপুর', district: '', union_name: 'ক', q: ' রহিমা ', fields: { trade: 'দর্জি', blank: ' ' } }
    expect(await api.stats('tin', { light: true, filters })).toEqual(filtered)
    await api.list({ project_type: 'tin', ...filters })
    const statsQuery = urlOf(fetchMock, 0).searchParams
    const listQuery = urlOf(fetchMock, 1).searchParams
    expect(Object.fromEntries(statsQuery)).toEqual({ light: '1', year: '2024', division: 'রংপুর', union_name: 'ক', q: 'রহিমা', 'f.trade': 'দর্জি' })
    for (const [name, value] of statsQuery) if (name !== 'light') expect(listQuery.get(name)).toBe(value)
  })

  it('sends no filter parameters for empty filters', async () => {
    const fetchMock = stubFetch(() => json(200, { data: { total: 1 } }))
    await createRestHousingApi(BASE).stats('tin', { filters: { q: '  ', fields: {} } })
    expect(String(fetchMock.mock.calls[0]![0]).replace(BASE, '')).toBe('/api/v1/projects/tin/stats')
  })

  it('builds filter options from the years and the stats keys, sorted in Bangla order', async () => {
    stubFetch((url) =>
      url.pathname.endsWith('/years')
        ? json(200, { data: [2025, 2024] })
        : json(200, {
            data: {
              by_division: { রংপুর: 1, খুলনা: 1 },
              by_district: { কুড়িগ্রাম: 2 },
              by_upazila: { উলিপুর: 2 },
              by_union: { 'কুড়িগ্রাম|উলিপুর|দলদলিয়া': 2 },
            },
          }),
    )
    expect(await createRestHousingApi(BASE).filterOptions('tin')).toEqual({
      years: [2025, 2024],
      divisions: ['খুলনা', 'রংপুর'],
      districts: ['কুড়িগ্রাম'],
      upazilas: ['উলিপুর'],
      unions: ['কুড়িগ্রাম|উলিপুর|দলদলিয়া'],
    })
  })
})

const input = {
  project_type: 'tin' as const,
  year: 2025,
  name: 'মমতাজ বেগম',
  father_or_husband_name: '',
  division: 'ময়মনসিংহ',
  district: 'শেরপুর',
  upazila: 'নালিতাবাড়ী',
  address: '',
  union_name: 'কলসপাড়',
  extra: { amount: 5000 },
}
const { project_type: _pt, ...body } = input

describe('createRestHousingApi writes', () => {
  it('creates, updates, changes the serial and deletes with the contract method, path and body', async () => {
    const fetchMock = stubFetch((_url, init) => (init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, { data: record(7) })))
    const api = createRestHousingApi(BASE)
    expect(await api.create(input)).toEqual(record(7))
    expect(await api.update('a b', { address: 'নতুন', extra: { amount: 1 } })).toEqual(record(7))
    expect(await api.changeSerial('a b', 40)).toEqual(record(7))
    expect(await api.delete('a b')).toBeUndefined()
    expect(fetchMock.mock.calls.map((_c, i) => callOf(fetchMock, i))).toEqual([
      { method: 'POST', path: '/api/v1/projects/tin/records', body },
      { method: 'PATCH', path: '/api/v1/records/a%20b', body: { address: 'নতুন', extra: { amount: 1 } } },
      { method: 'POST', path: '/api/v1/records/a%20b/serial', body: { serial_no: 40 } },
      { method: 'DELETE', path: '/api/v1/records/a%20b', body: undefined },
    ])
  })

  it('maps the error body to HousingApiError', async () => {
    stubFetch(() => json(409, { error: { code: 'CONFLICT', message: 'এই সিরিয়াল আগে থেকেই আছে' } }))
    const err = await createRestHousingApi(BASE).create(input).catch((e: unknown) => e)
    expect(HousingApiError.is(err) && err.code).toBe('CONFLICT')
  })

  it('sends a bulk import as one request however many rows, so the server keeps it all-or-nothing', async () => {
    const fetchMock = stubFetch(() => json(413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'x' } }))
    const rows = Array.from({ length: 501 }, () => body)
    const err = await createRestHousingApi(BASE).bulkInsert({ project_type: 'tin', mode: 'assign_serial', rows }).catch((e: unknown) => e)
    expect(HousingApiError.is(err) && err.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(callOf(fetchMock)).toMatchObject({ method: 'POST', path: '/api/v1/projects/tin/records/bulk', body: { mode: 'assign_serial' } })
    expect(callOf(fetchMock).body).not.toHaveProperty('project_type')
  })

  it('updates by serial with PUT, keeping union_name, extra and _clear, and returns the server result', async () => {
    const fetchMock = stubFetch(() => json(200, { data: { updated: 1, missing: [9] } }))
    const rows = [{ serial_no: 1, union_name: 'ক', extra: { amount: 2 }, _clear: ['address'] }, { serial_no: 9 }]
    const result = await createRestHousingApi(BASE).bulkUpdateBySerial({ project_type: 'tin', rows })
    expect(result).toEqual({ updated: 1, missing: [9] })
    expect(callOf(fetchMock)).toEqual({ method: 'PUT', path: '/api/v1/projects/tin/records/bulk', body: { rows } })
  })

  it('calls the photo slot routes, multipart for an upload', async () => {
    const fetchMock = stubFetch(() => json(200, { data: record(3) }))
    const api = createRestHousingApi(BASE)
    await api.uploadPhoto('r1', 'prev', { photo: new Blob(['p']), thumb: new Blob(['t']) })
    await api.deletePhoto('r1', 'current')
    const upload = callOf(fetchMock, 0)
    expect(upload).toMatchObject({ method: 'PUT', path: '/api/v1/records/r1/photos/prev' })
    expect([...(upload.body as FormData).keys()]).toEqual(['photo', 'thumb'])
    expect(callOf(fetchMock, 1)).toMatchObject({ method: 'DELETE', path: '/api/v1/records/r1/photos/current' })
  })

  it('reads and saves private values, singly and many at once', async () => {
    const fetchMock = stubFetch((url) => json(200, { data: url.pathname.endsWith('/records/private') ? { r1: { phone: '017' } } : { phone: '017' } }))
    const api = createRestHousingApi(BASE)
    expect(await api.getPrivate('r1')).toEqual({ phone: '017' })
    expect(await api.setPrivate('r1', { phone: '017' })).toEqual({ phone: '017' })
    expect(await api.getPrivateMany('tin', ['r1'])).toEqual({ r1: { phone: '017' } })
    expect(callOf(fetchMock)).toMatchObject({ method: 'GET', path: '/api/v1/records/r1/private' })
    expect(callOf(fetchMock, 1)).toEqual({ method: 'PUT', path: '/api/v1/records/r1/private', body: { data: { phone: '017' } } })
    expect(callOf(fetchMock, 2)).toEqual({ method: 'POST', path: '/api/v1/projects/tin/records/private', body: { ids: ['r1'] } })
  })
})

describe('createRestHousingApi activity', () => {
  it('lists with filters, clamps the page size and sends local dates as ISO with an offset', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    await createRestHousingApi(BASE).listActivity({
      action: 'update',
      project_type: 'demo',
      record_id: 'r1',
      actor_email: 'admin',
      from: '2026-10-05T00:00:00',
      to: '2026-10-05T23:59:59.999',
      page_size: 500,
    })
    const url = urlOf(fetchMock)
    expect(url.pathname).toBe('/api/v1/activity')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'update',
      project_type: 'demo',
      record_id: 'r1',
      actor_email: 'admin',
      from: new Date('2026-10-05T00:00:00').toISOString(),
      to: new Date('2026-10-05T23:59:59.999').toISOString(),
      page: '1',
      page_size: '100',
    })
  })

  it('leaves out a date that is not a real date instead of throwing', async () => {
    const fetchMock = stubFetch(() => json(200, EMPTY_PAGE))
    await createRestHousingApi(BASE).listActivity({ from: '2026-13-45T00:00:00', to: 'x' })
    expect([...urlOf(fetchMock).searchParams.keys()]).toEqual(['page', 'page_size'])
  })

  it('posts a client event', async () => {
    const fetchMock = stubFetch(() => json(201, { data: { id: 5 } }))
    await createRestHousingApi(BASE).logActivity('import_run', { rows: 3 }, 'tin')
    expect(callOf(fetchMock)).toEqual({ method: 'POST', path: '/api/v1/activity', body: { action: 'import_run', details: { rows: 3 }, project_type: 'tin' } })
  })

  it('sends nothing for login or logout, which the server logs itself', async () => {
    const fetchMock = stubFetch(() => json(201, { data: { id: 5 } }))
    await createRestHousingApi(BASE).logActivity('login')
    await createRestHousingApi(BASE).logActivity('logout')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails quietly when the event is refused', async () => {
    stubFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'লগইন করুন' } }))
    await expect(createRestHousingApi(BASE).logActivity('import_run')).resolves.toBeUndefined()
  })
})
