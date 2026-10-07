import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('adapter factory', () => {
  test('selects the mock backend in dev/test and serves seeded records through the real interface', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', 'mock')
    const f = await import('./factory')
    expect(f.getBackendKind()).toBe('mock')
    const page = await f.getHousingApi().list({ page_size: 5 })
    expect(page.meta.total).toBeGreaterThan(0)
    expect(await f.getAuthProvider().currentUser()).toBeNull()
  })

  test('the mock auth provider announces login through the lazy proxy', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', 'mock')
    const f = await import('./factory')
    const { MOCK_ADMIN } = await import('./mock/fixtures')
    const seen: (string | null)[] = []
    const off = f.getAuthProvider().onAuthChange((u) => seen.push(u?.email ?? null))
    await f.getAuthProvider().login(MOCK_ADMIN.email, MOCK_ADMIN.password)
    off()
    expect(seen).toEqual([MOCK_ADMIN.email])
  })

  test('outside dev, "mock" falls back to the default adapter instead of loading the mock', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', 'mock')
    vi.stubEnv('DEV', false)
    const f = await import('./factory')
    expect(f.getBackendKind()).toBe('rest')
  })

  test('with no backend set, the UI uses the REST backend', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', '')
    expect((await import('./factory')).getBackendKind()).toBe('rest')
  })

  test('an unknown backend name falls back to REST', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', 'firebase')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await import('./factory')).getBackendKind()).toBe('rest')
    warn.mockRestore()
  })

  test('on REST, a login drops the project lists already in flight', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', 'rest')
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    const pending: ((r: Response) => void)[] = []
    const fetchMock = vi.fn((url: string) =>
      url.endsWith('/auth/login')
        ? Promise.resolve(json({ data: { expires_at: '2026-10-12T08:00:00.000Z', user: { id: 'a', email: 'a@example.org', name: 'A', role: 'admin' } } }))
        : new Promise<Response>((resolve) => pending.push(resolve)),
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const f = await import('./factory')
      const lists = () => fetchMock.mock.calls.filter(([url]) => url.includes('/projects')).length
      const before = f.getProjectsApi().list({ includeDrafts: true })
      await f.getAuthProvider().login('a@example.org', 'pw')
      const after = f.getProjectsApi().list({ includeDrafts: true })
      await vi.waitFor(() => expect(lists()).toBe(2))
      pending.forEach((resolve) => resolve(json({ data: [] })))
      await Promise.all([before, after])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('supabase and rest remain selectable', async () => {
    vi.stubEnv('VITE_HOUSING_BACKEND', 'rest')
    expect((await import('./factory')).getBackendKind()).toBe('rest')
    vi.resetModules()
    vi.stubEnv('VITE_HOUSING_BACKEND', 'supabase')
    expect((await import('./factory')).getBackendKind()).toBe('supabase')
  })
})
