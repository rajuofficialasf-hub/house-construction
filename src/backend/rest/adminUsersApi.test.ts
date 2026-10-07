import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError, type AdminUserRow } from '../interfaces/types'
import { createRestAdminUsersApi } from './index'

// The REST AdminUsersApi against GET and PUT /api/v1/admin/users (docs/api/PROJECTS_API_CONTRACT.md §৪.৬).

const BASE = 'http://api.test'
const ROW: AdminUserRow = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ed@example.org',
  name: null,
  role: 'editor',
  all_projects: false,
  is_active: true,
  projects: ['tin'],
  created_at: '2026-10-07T08:00:00.000Z',
  last_seen_at: null,
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function stubFetch(handler: () => Response) {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(handler()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const input = { email: ' Ed@Example.org ', role: 'editor' as const, all_projects: false, projects: ['tin'], is_active: true }

describe('createRestAdminUsersApi', () => {
  it('lists with GET /api/v1/admin/users and the cookie', async () => {
    const fetchMock = stubFetch(() => json(200, { data: [ROW] }))
    expect(await createRestAdminUsersApi(BASE).list()).toEqual([ROW])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${BASE}/api/v1/admin/users`)
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('include')
  })

  it('saves with PUT and the normalised body, and returns the saved row', async () => {
    const fetchMock = stubFetch(() => json(200, { data: ROW }))
    expect(await createRestAdminUsersApi(BASE).save(input)).toEqual(ROW)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${BASE}/api/v1/admin/users`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ed@example.org', role: 'editor', all_projects: false, projects: ['tin'], is_active: true })
  })

  it('sends no projects for an admin or for "all projects"', async () => {
    const fetchMock = stubFetch(() => json(200, { data: ROW }))
    const api = createRestAdminUsersApi(BASE)
    await api.save({ ...input, role: 'admin', all_projects: true })
    await api.save({ ...input, all_projects: true })
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toMatchObject({ role: 'admin', all_projects: false, projects: [] })
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1].body))).toMatchObject({ role: 'editor', all_projects: true, projects: [] })
  })

  it.each([
    [403, 'FORBIDDEN', 'ব্যবহারকারী সামলাতে পারেন শুধু মূল এডমিন', undefined],
    [404, 'NOT_FOUND', 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে সার্ভারের এডমিন CLI দিয়ে অ্যাকাউন্ট খুলুন', { field: 'email' }],
    [400, 'VALIDATION_ERROR', 'অচেনা প্রকল্প: nope', { field: 'projects' }],
  ])('passes a %i on as %s with its message and field', async (status, code, message, details) => {
    stubFetch(() => json(status, { error: { code, message, ...(details && { details }) } }))
    const err = await createRestAdminUsersApi(BASE).save(input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HousingApiError)
    expect(err).toMatchObject({ code, message, ...(details && { details }) })
  })

  it('checks the email and the projects before sending', async () => {
    const fetchMock = stubFetch(() => json(200, { data: ROW }))
    const api = createRestAdminUsersApi(BASE)
    await expect(api.save({ ...input, email: 'not-an-email' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'email' } })
    await expect(api.save({ ...input, projects: [] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'projects' } })
    expect(fetchMock).not.toHaveBeenCalled()
    await api.save({ ...input, projects: [], is_active: false })
    await api.save({ ...input, role: 'admin', projects: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
