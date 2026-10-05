import { describe, expect, it, vi } from 'vitest'
import { cookieJarFetch } from './cookieJarFetch'

// The test fetch the REST contract runner uses: it must behave like a browser for cookies and Origin.

function server(setCookie: string[] = []) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const headers = new Headers()
    for (const c of setCookie) headers.append('set-cookie', c)
    return new Response(null, { status: 204, headers })
  })
}

const sentHeaders = (mock: ReturnType<typeof server>, call = 0) => new Headers(mock.mock.calls[call]![1]!.headers)

describe('cookieJarFetch', () => {
  it('adds the Origin to every request', async () => {
    const base = server()
    await cookieJarFetch('http://localhost:5173', base).fetch('http://api.test/x')
    expect(sentHeaders(base).get('origin')).toBe('http://localhost:5173')
  })

  it('stores a cookie the server sets and sends it back', async () => {
    const login = server(['housing_session=abc; Path=/; HttpOnly; SameSite=Lax'])
    const jar = cookieJarFetch('http://o', login)
    await jar.fetch('http://api.test/login')
    expect(sentHeaders(login).get('cookie')).toBeNull()
    await jar.fetch('http://api.test/me')
    expect(sentHeaders(login, 1).get('cookie')).toBe('housing_session=abc')
  })

  it('drops a cookie the server clears, and everything on clear()', async () => {
    const responses = [['housing_session=abc; Path=/'], ['housing_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'], [], ['a=1'], []]
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const headers = new Headers()
      for (const c of responses.shift() ?? []) headers.append('set-cookie', c)
      return new Response(null, { status: 204, headers })
    })
    const jar = cookieJarFetch('http://o', base)
    await jar.fetch('http://api.test/login')
    await jar.fetch('http://api.test/logout')
    await jar.fetch('http://api.test/me')
    expect(new Headers(base.mock.calls[2]![1]!.headers).get('cookie')).toBeNull()
    await jar.fetch('http://api.test/x')
    jar.clear()
    await jar.fetch('http://api.test/y')
    expect(new Headers(base.mock.calls[4]![1]!.headers).get('cookie')).toBeNull()
  })
})
