/**
 * A fetch for running the REST adapter from Node against the real server: Node's fetch keeps no
 * cookies and sends no Origin, while the server's session is a cookie and every write needs an
 * allowed Origin (docs/api/API_CONTRACT.md §1, §2). The adapter's code stays as it runs in a browser.
 */
export interface CookieJarFetch {
  fetch: typeof fetch
  /** Forgets every cookie, as a fresh browser profile would. */
  clear(): void
}

export function cookieJarFetch(origin: string, base: typeof fetch = fetch): CookieJarFetch {
  const jar = new Map<string, string>()

  const wrapped: typeof fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('origin', origin)
    if (jar.size) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
    const res = await base(input, { ...init, headers })
    for (const setCookie of res.headers.getSetCookie()) {
      const [pair = '', ...attributes] = setCookie.split(';')
      const at = pair.indexOf('=')
      const name = pair.slice(0, at).trim()
      const value = pair.slice(at + 1).trim()
      const expired = attributes.some((attr) => {
        const [key = '', val = ''] = attr.split('=').map((part) => part.trim())
        return (key.toLowerCase() === 'max-age' && Number(val) <= 0) || (key.toLowerCase() === 'expires' && Date.parse(val) <= Date.now())
      })
      if (!value || expired) jar.delete(name)
      else jar.set(name, value)
    }
    return res
  }

  return { fetch: wrapped, clear: () => jar.clear() }
}
