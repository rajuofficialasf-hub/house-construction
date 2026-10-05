import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError, type AuthUser } from '../interfaces/types'
import { createRestAuthProvider } from './authProvider'

// REST AuthProvider কুকি মোডে: টোকেন কোথাও রাখা হয় না, ব্রাউজারের HttpOnly কুকিই সেশন।
// node পরিবেশে localStorage নেই, তাই কোড storage ছুঁলে এই টেস্টগুলো ভেঙে যেত।

const BASE = 'http://api.test'
const USER: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.org', name: 'এডমিন', role: 'admin' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRestAuthProvider', () => {
  it('logs in through /api/v1 with the cookie and no Authorization header', async () => {
    const fetchMock = stubFetch(() => json(200, { data: { expires_at: '2026-10-12T08:00:00.000Z', user: USER } }))
    const user = await createRestAuthProvider(BASE).login(' admin@example.org ', 'pw')
    expect(user).toEqual(USER)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${BASE}/api/v1/auth/login`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers).not.toHaveProperty('authorization')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'admin@example.org', password: 'pw' })
  })

  it('passes on the server’s one login-failure message', async () => {
    stubFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়' } }))
    const err = await createRestAuthProvider(BASE).login('admin@example.org', 'bad').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HousingApiError)
    expect(err).toMatchObject({ code: 'UNAUTHENTICATED', message: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়' })
  })

  it('reports a rate-limited login as RATE_LIMITED, with or without an error body', async () => {
    stubFetch(() => json(429, { error: { code: 'RATE_LIMITED', message: 'অনেকবার চেষ্টা হয়েছে' } }))
    await expect(createRestAuthProvider(BASE).login('a@example.org', 'x')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    stubFetch(() => new Response('Too Many Requests', { status: 429 }))
    await expect(createRestAuthProvider(BASE).login('a@example.org', 'x')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('asks /api/v1/auth/me for the current admin, and treats 401 as logged out', async () => {
    const fetchMock = stubFetch(() => json(200, { data: USER }))
    expect(await createRestAuthProvider(BASE).currentUser()).toEqual(USER)
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/api/v1/auth/me`)
    stubFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'লগইন করুন' } }))
    expect(await createRestAuthProvider(BASE).currentUser()).toBeNull()
  })

  it('reports logged out after logout, even when the request fails', async () => {
    stubFetch(() => {
      throw new TypeError('offline')
    })
    const auth = createRestAuthProvider(BASE)
    const seen: (AuthUser | null)[] = []
    auth.onAuthChange((u) => seen.push(u))
    await expect(auth.logout()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(seen).toEqual([null])
    expect(await auth.isAdmin()).toBe(false)
  })

  it('tells other tabs about a login', async () => {
    stubFetch((url) =>
      url.endsWith('/login') ? json(200, { data: { expires_at: '2026-10-12T08:00:00.000Z', user: USER } }) : json(200, { data: USER }),
    )
    const otherTab = createRestAuthProvider(BASE)
    const seen = new Promise<AuthUser | null>((resolve) => otherTab.onAuthChange(resolve))
    await createRestAuthProvider(BASE).login('admin@example.org', 'pw')
    expect(await seen).toEqual(USER)
  })
})
