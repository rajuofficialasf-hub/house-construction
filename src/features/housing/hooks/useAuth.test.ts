import { describe, expect, it } from 'vitest'
import { HousingApiError } from '@/backend/interfaces/types'
import { statusAfterError } from './useAuth'

describe('statusAfterError', () => {
  it('treats a missing backend config as logged out', () => {
    expect(statusAfterError(new HousingApiError('CONFIG_ERROR', 'VITE_API_BASE_URL সেট নেই'))).toBe('ready')
  })

  it('treats any other failure as unknown, never as logged out', () => {
    expect(statusAfterError(new HousingApiError('NETWORK_ERROR', 'x'))).toBe('error')
    expect(statusAfterError(new HousingApiError('INTERNAL_ERROR', 'x'))).toBe('error')
    expect(statusAfterError(new TypeError('boom'))).toBe('error')
  })
})
