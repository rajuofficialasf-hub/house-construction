import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError } from '../interfaces/types'
import { createRestProjectsApi } from './projectsApi'

// REST ProjectsApi: each method calls its /api/v1 route with the right method, headers and body, and
// hands back the server's data and errors unchanged (docs/api/PROJECTS_API_CONTRACT.md §4.1–4.2).

const BASE = 'http://api.test'
const PROJECT = { key: 'demo', fields: [] }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function stubFetch(response: () => Response) {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(response()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callOf(fetchMock: ReturnType<typeof stubFetch>, n = 0) {
  const [url, init] = fetchMock.mock.calls[n]!
  const u = new URL(url)
  return {
    method: init.method,
    path: u.pathname,
    query: Object.fromEntries(u.searchParams),
    headers: init.headers as Record<string, string>,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRestProjectsApi reads', () => {
  it('lists with fields, adding drafts only when asked', async () => {
    const fetchMock = stubFetch(() => json(200, { data: [PROJECT] }))
    const api = createRestProjectsApi(BASE)
    expect(await api.list()).toEqual([PROJECT])
    await api.list({ includeDrafts: true })
    expect(callOf(fetchMock)).toMatchObject({ method: 'GET', path: '/api/v1/projects', query: { include: 'fields' } })
    expect(callOf(fetchMock, 1).query).toEqual({ include: 'fields', drafts: '1' })
  })

  it('gets one project and the overview', async () => {
    const fetchMock = stubFetch(() => json(200, { data: PROJECT }))
    const api = createRestProjectsApi(BASE)
    await api.get('demo')
    await api.overview({ includeDrafts: true })
    await api.overview()
    expect(callOf(fetchMock).path).toBe('/api/v1/projects/demo')
    expect(callOf(fetchMock, 1)).toMatchObject({ path: '/api/v1/projects/overview', query: { drafts: '1' } })
    expect(callOf(fetchMock, 2).query).toEqual({})
  })

  it('is always a full backend', async () => {
    expect(await createRestProjectsApi(BASE).backendMode()).toBe('full')
  })

  it('passes a 404 on as NOT_FOUND', async () => {
    stubFetch(() => json(404, { error: { code: 'NOT_FOUND', message: 'প্রকল্প পাওয়া যায়নি' } }))
    await expect(createRestProjectsApi(BASE).get('nope')).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'প্রকল্প পাওয়া যায়নি' })
  })
})

describe('createRestProjectsApi project writes', () => {
  it('creates a project with its fields in one body', async () => {
    const fetchMock = stubFetch(() => json(201, { data: PROJECT }))
    const input = { key: 'demo', slug: 'demo', name_bn: 'ডেমো', name_en: 'Demo', file_prefix: 'demo' }
    const fields = [{ key: 'amount', label_bn: 'টাকা', type: 'money' as const }]
    expect(await createRestProjectsApi(BASE).create(input, fields)).toEqual(PROJECT)
    expect(callOf(fetchMock)).toMatchObject({ method: 'POST', path: '/api/v1/projects', body: { project: input, fields } })
  })

  it('sends If-Match on an update only when the caller read a version', async () => {
    const fetchMock = stubFetch(() => json(200, { data: PROJECT }))
    const api = createRestProjectsApi(BASE)
    await api.update('demo', { is_published: true }, { expectedUpdatedAt: '2026-10-06T10:00:00.123Z' })
    await api.update('demo', { name_bn: 'নতুন' })
    expect(callOf(fetchMock)).toMatchObject({ method: 'PATCH', path: '/api/v1/projects/demo', body: { is_published: true } })
    expect(callOf(fetchMock).headers['if-match']).toBe('2026-10-06T10:00:00.123Z')
    expect(callOf(fetchMock, 1).headers).not.toHaveProperty('if-match')
  })

  it('passes a duplicate-key 409 on as CONFLICT with the field', async () => {
    stubFetch(() => json(409, { error: { code: 'CONFLICT', message: 'এই URL অংশ আগেই আছে', details: { field: 'slug' } } }))
    const err = await createRestProjectsApi(BASE).update('demo', { slug: 'taken' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HousingApiError)
    expect(err).toMatchObject({ code: 'CONFLICT', details: { field: 'slug' } })
  })

  it('deletes and reorders, and passes a plain admin\'s 403 on as FORBIDDEN', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }))
    const api = createRestProjectsApi(BASE)
    await api.delete('demo')
    await api.reorder(['tin', 'semi_pucca'])
    expect(callOf(fetchMock)).toMatchObject({ method: 'DELETE', path: '/api/v1/projects/demo' })
    expect(callOf(fetchMock, 1)).toMatchObject({ method: 'PUT', path: '/api/v1/projects/order', body: { keys: ['tin', 'semi_pucca'] } })

    stubFetch(() => json(403, { error: { code: 'FORBIDDEN', message: 'শুধু মূল এডমিন মুছতে পারেন' } }))
    await expect(api.delete('demo')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('uploads a cover as one multipart photo part, and deletes it', async () => {
    const fetchMock = stubFetch(() => json(200, { data: PROJECT }))
    const api = createRestProjectsApi(BASE)
    await api.uploadCover('demo', new Blob(['x'], { type: 'image/webp' }))
    await api.deleteCover('demo')
    const upload = callOf(fetchMock)
    expect(upload).toMatchObject({ method: 'PUT', path: '/api/v1/projects/demo/cover' })
    expect(upload.body).toBeInstanceOf(FormData)
    expect([...(upload.body as FormData).keys()]).toEqual(['photo'])
    expect(callOf(fetchMock, 1)).toMatchObject({ method: 'DELETE', path: '/api/v1/projects/demo/cover' })
  })
})

describe('createRestProjectsApi field writes', () => {
  it('creates, updates, deletes and reorders fields', async () => {
    const fetchMock = stubFetch(() => json(200, { data: { id: 'f1' } }))
    const api = createRestProjectsApi(BASE)
    await api.createField('demo', { key: 'trade', label_bn: 'পেশা', type: 'category' })
    await api.updateField('f1', { is_active: false })
    await api.deleteField('f1')
    await api.reorderFields('demo', ['f2', 'f1'])
    expect(callOf(fetchMock)).toMatchObject({ method: 'POST', path: '/api/v1/projects/demo/fields', body: { key: 'trade' } })
    expect(callOf(fetchMock, 1)).toMatchObject({ method: 'PATCH', path: '/api/v1/fields/f1', body: { is_active: false } })
    expect(callOf(fetchMock, 2)).toMatchObject({ method: 'DELETE', path: '/api/v1/fields/f1' })
    expect(callOf(fetchMock, 3)).toMatchObject({ method: 'PUT', path: '/api/v1/projects/demo/fields/order', body: { ids: ['f2', 'f1'] } })
  })

  it('reads a field\'s usage and returns the renamed count', async () => {
    const usage = { count: 3, values: [{ value: 'দর্জি', n: 3 }] }
    let answer: unknown = { data: usage }
    const fetchMock = stubFetch(() => json(200, answer))
    const api = createRestProjectsApi(BASE)
    expect(await api.fieldUsage('demo', 'trade')).toEqual(usage)
    answer = { data: { updated: 2 } }
    expect(await api.renameFieldValue('demo', 'trade', 'দর্জী', 'দর্জি')).toBe(2)
    expect(callOf(fetchMock).path).toBe('/api/v1/projects/demo/fields/trade/usage')
    expect(callOf(fetchMock, 1)).toMatchObject({
      method: 'POST',
      path: '/api/v1/projects/demo/fields/trade/rename-value',
      body: { from: 'দর্জী', to: 'দর্জি' },
    })
  })
})
