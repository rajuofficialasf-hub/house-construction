// A fetch that can only read, for running the contract suite against a deployed site (staging or
// production) without any chance of changing its data. Anything but GET, HEAD or OPTIONS throws
// before a request is made. The site's read limit is per IP, so a 429 waits as told and retries.

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The site's origin, if it is https, or plain http on this machine; throws otherwise. */
export function readonlyOrigin(value: string): string {
  if (!URL.canParse(value)) throw new Error(`not a URL: ${value}`)
  const url = new URL(value)
  const ok = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
  if (!ok) throw new Error(`a read-only run needs an https URL (or http on localhost), got ${url.origin}`)
  return url.origin
}

export function createReadonlyFetch(inner: typeof fetch = fetch, { maxWaitSeconds = 60 } = {}): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const method = request.method.toUpperCase()
    if (!READ_METHODS.has(method)) throw new Error(`READ-ONLY RUN: blocked ${method} ${request.url}`)
    for (let attempt = 0; ; attempt++) {
      const res = await inner(input, init)
      if (res.status !== 429 || attempt >= 5) return res
      await res.body?.cancel()
      const wait = Number(res.headers.get('retry-after') ?? '1')
      await new Promise((resolve) => setTimeout(resolve, Math.min(Number.isFinite(wait) ? wait : 1, maxWaitSeconds) * 1000))
    }
  }
}
