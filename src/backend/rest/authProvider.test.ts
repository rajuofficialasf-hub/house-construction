import { afterEach, describe, expect, it, vi } from 'vitest'
import { HousingApiError, type AuthUser } from '../interfaces/types'
import { createRestAuthProvider } from './authProvider'

// REST AuthProvider কুকি মোডে: টোকেন কোথাও রাখা হয় না, ব্রাউজারের HttpOnly কুকিই সেশন।
// node পরিবেশে localStorage নেই, তাই কোড storage ছুঁলে এই টেস্টগুলো ভেঙে যেত।

const BASE = 'http://api.test'
const USER: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.org', name: 'এডমিন', role: 'admin', allProjects: true, projects: [] }

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

  it('keeps "unknown" instead of logging out when /me fails for another reason, and asks again next time', async () => {
    for (const failure of [() => json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }), () => { throw new TypeError('offline') }]) {
      let down = true
      const fetchMock = stubFetch(() => (down ? failure() : json(200, { data: USER })))
      const auth = createRestAuthProvider(BASE)
      await expect(auth.currentUser()).rejects.toBeInstanceOf(HousingApiError)
      await expect(auth.isAdmin()).rejects.toBeInstanceOf(HousingApiError)
      down = false
      expect(await auth.currentUser()).toEqual(USER)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    }
  })

  it('caches a 401 as logged out without asking again', async () => {
    const fetchMock = stubFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'লগইন করুন' } }))
    const auth = createRestAuthProvider(BASE)
    expect(await auth.currentUser()).toBeNull()
    expect(await auth.isAdmin()).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // Vitest fails the run on an unhandled rejection, so this also proves the failed /me is caught.
  it('ignores a message from another tab while the server is unreachable', async () => {
    let down = false
    let failedCalls = 0
    stubFetch((url) => {
      if (down) {
        failedCalls++
        throw new TypeError('offline')
      }
      return url.endsWith('/login') ? json(200, { data: { expires_at: '2026-10-12T08:00:00.000Z', user: USER } }) : json(200, { data: USER })
    })
    const otherTab = createRestAuthProvider(BASE)
    const seen: (AuthUser | null)[] = []
    otherTab.onAuthChange((u) => seen.push(u))
    expect(await otherTab.currentUser()).toEqual(USER)
    const thisTab = createRestAuthProvider(BASE)
    await thisTab.login('admin@example.org', 'pw')
    down = true
    // A second announcement from this tab reaches the other tab while the server is down.
    new BroadcastChannel('housing-auth').postMessage('changed')
    // Wait for the other tab's /me to fail, then one more turn for its handler to settle.
    await vi.waitFor(() => expect(failedCalls).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).not.toContain(null)
    down = false
    expect(await otherTab.currentUser()).toEqual(USER)
  })

  it('reports logged out once the server has ended the session', async () => {
    const fetchMock = stubFetch((url) => (url.endsWith('/logout') ? new Response(null, { status: 204 }) : json(200, { data: USER })))
    const auth = createRestAuthProvider(BASE)
    expect(await auth.isAdmin()).toBe(true)
    const seen: (AuthUser | null)[] = []
    auth.onAuthChange((u) => seen.push(u))
    await auth.logout()
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`${BASE}/api/v1/auth/logout`)
    expect(seen).toEqual([null])
    expect(await auth.isAdmin()).toBe(false)
  })

  it('stays logged in when the logout request fails, since the cookie still works', async () => {
    let offline = false
    stubFetch(() => {
      if (offline) throw new TypeError('offline')
      return json(200, { data: USER })
    })
    const auth = createRestAuthProvider(BASE)
    expect(await auth.currentUser()).toEqual(USER)
    const seen: (AuthUser | null)[] = []
    auth.onAuthChange((u) => seen.push(u))
    offline = true
    await expect(auth.logout()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(seen).toEqual([])
    expect(await auth.currentUser()).toEqual(USER)
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

  it('sends one /me for concurrent asks, and asks again after a logout', async () => {
    const fetchMock = stubFetch((url) => (url.endsWith('/logout') ? new Response(null, { status: 204 }) : json(200, { data: USER })))
    const auth = createRestAuthProvider(BASE)
    const [a, b, c] = await Promise.all([auth.currentUser(), auth.isAdmin(), auth.currentUser()])
    expect([a, b, c]).toEqual([USER, true, USER])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await auth.logout()
    expect(await auth.currentUser()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shares a failed /me with its concurrent askers, then asks again', async () => {
    let down = true
    const fetchMock = stubFetch(() => (down ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }) : json(200, { data: USER })))
    const auth = createRestAuthProvider(BASE)
    const results = await Promise.allSettled([auth.currentUser(), auth.currentUser()])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    down = false
    expect(await auth.currentUser()).toEqual(USER)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not let a /me that started before a login overwrite the logged-in user', async () => {
    let releaseMe!: (r: Response) => void
    const fetchMock = stubFetch((url) =>
      url.endsWith('/login')
        ? json(200, { data: { expires_at: '2026-10-12T08:00:00.000Z', user: USER } })
        : new Promise<Response>((resolve) => (releaseMe = resolve)),
    )
    const auth = createRestAuthProvider(BASE)
    const early = auth.currentUser()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await auth.login('admin@example.org', 'pw')
    releaseMe(json(401, { error: { code: 'UNAUTHENTICATED', message: 'লগইন করুন' } }))
    expect(await early).toBeNull()
    expect(await auth.currentUser()).toEqual(USER)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // Providers from earlier tests still listen on the shared channel and call the stubbed fetch, so
  // these tests use their own base URL and count only its /me calls.
  const meCallsTo = (fetchMock: ReturnType<typeof stubFetch>, base: string) =>
    fetchMock.mock.calls.filter(([url]) => url === `${base}/api/v1/auth/me`).length

  it('does not let a /me that started before a logout bring the user back', async () => {
    const OWN = 'http://logout.test'
    let releaseMe!: (r: Response) => void
    const fetchMock = stubFetch((url) => {
      if (!url.startsWith(OWN)) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })
      if (url.endsWith('/logout')) return new Response(null, { status: 204 })
      return meCallsTo(fetchMock, OWN) === 1 ? json(200, { data: USER }) : new Promise<Response>((resolve) => (releaseMe = resolve))
    })
    const auth = createRestAuthProvider(OWN)
    const seen: (AuthUser | null)[] = []
    auth.onAuthChange((u) => seen.push(u))
    expect(await auth.currentUser()).toEqual(USER)
    // A message from another tab starts a second /me, which is still open when this tab logs out.
    new BroadcastChannel('housing-auth').postMessage('changed')
    await vi.waitFor(() => expect(meCallsTo(fetchMock, OWN)).toBe(2))
    await auth.logout()
    releaseMe(json(200, { data: USER }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toEqual([null])
    expect(await auth.currentUser()).toBeNull()
  })

  it('starts a fresh /me for a message from another tab instead of joining one already open', async () => {
    const OWN = 'http://fresh.test'
    const releases: ((r: Response) => void)[] = []
    const fetchMock = stubFetch((url) =>
      url.startsWith(OWN) ? new Promise<Response>((resolve) => releases.push(resolve)) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    )
    const auth = createRestAuthProvider(OWN)
    const seen: (AuthUser | null)[] = []
    auth.onAuthChange((u) => seen.push(u))
    const early = auth.currentUser()
    await vi.waitFor(() => expect(meCallsTo(fetchMock, OWN)).toBe(1))
    // Another tab logged in after this tab's /me left, so that /me's answer is out of date.
    new BroadcastChannel('housing-auth').postMessage('changed')
    await vi.waitFor(() => expect(meCallsTo(fetchMock, OWN)).toBe(2))
    releases[1]!(json(200, { data: USER }))
    await vi.waitFor(() => expect(seen).toEqual([USER]))
    releases[0]!(json(401, { error: { code: 'UNAUTHENTICATED', message: 'লগইন করুন' } }))
    expect(await early).toBeNull()
    expect(await auth.currentUser()).toEqual(USER)
  })
})
