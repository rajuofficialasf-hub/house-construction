import { describe, expect, it, vi } from 'vitest'
import { createReadonlyFetch, readonlyOrigin } from './readonlyFetch'

describe('createReadonlyFetch', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks %s before any request is sent', async (method) => {
    const inner = vi.fn<typeof fetch>()
    await expect(createReadonlyFetch(inner)('https://housing.example.org/api/v1/housing', { method })).rejects.toThrow(/READ-ONLY RUN/)
    await expect(createReadonlyFetch(inner)(new Request('https://housing.example.org/api/v1/auth/login', { method }))).rejects.toThrow(/READ-ONLY RUN/)
    expect(inner).not.toHaveBeenCalled()
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('passes %s through', async (method) => {
    const inner = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    expect((await createReadonlyFetch(inner)('https://housing.example.org/api/v1/housing', { method })).status).toBe(204)
    expect(inner).toHaveBeenCalledOnce()
  })

  it('waits out a 429 and asks again', async () => {
    const inner = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('ok'))
    expect(await (await createReadonlyFetch(inner)('https://housing.example.org/api/v1/housing')).text()).toBe('ok')
    expect(inner).toHaveBeenCalledTimes(2)
  })
})

describe('readonlyOrigin', () => {
  it('accepts https anywhere and http only on this machine', () => {
    expect(readonlyOrigin('https://housing.example.org/whatever')).toBe('https://housing.example.org')
    expect(readonlyOrigin('http://localhost:3001')).toBe('http://localhost:3001')
    expect(() => readonlyOrigin('http://housing.example.org')).toThrow(/https/)
    expect(() => readonlyOrigin('not a url')).toThrow()
  })
})
