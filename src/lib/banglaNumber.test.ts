import { afterEach, describe, expect, test } from 'vitest'
import { setCurrentLang } from '@/i18n/core'
import { formatBanglaNumber, toBanglaNumber } from './banglaNumber'

afterEach(() => setCurrentLang('bn'))

describe('toBanglaNumber', () => {
  test('converts ASCII digits to Bangla digits in Bangla mode', () => {
    expect(toBanglaNumber(1234)).toBe('১২৩৪')
    expect(toBanglaNumber('০১ab9')).toBe('০১ab৯')
  })

  test('returns an empty string for null and undefined', () => {
    expect(toBanglaNumber(null)).toBe('')
    expect(toBanglaNumber(undefined)).toBe('')
  })

  test('converts Bangla digits to ASCII in English mode', () => {
    setCurrentLang('en')
    expect(toBanglaNumber('১২৩৪')).toBe('1234')
    expect(toBanglaNumber(56)).toBe('56')
  })
})

describe('formatBanglaNumber', () => {
  test('uses the Indian grouping with Bangla digits in Bangla mode', () => {
    expect(formatBanglaNumber(123456)).toBe('১,২৩,৪৫৬')
  })

  test('uses western grouping in English mode', () => {
    setCurrentLang('en')
    expect(formatBanglaNumber(123456)).toBe('123,456')
  })

  test('returns an empty string for null, undefined and NaN', () => {
    expect(formatBanglaNumber(null)).toBe('')
    expect(formatBanglaNumber(undefined)).toBe('')
    expect(formatBanglaNumber(Number.NaN)).toBe('')
  })

  test('formats zero', () => {
    expect(formatBanglaNumber(0)).toBe('০')
  })
})
