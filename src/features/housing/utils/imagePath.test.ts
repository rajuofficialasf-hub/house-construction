import { describe, expect, test } from 'vitest'
import { extFromMime, padSerial, photoPath, photoSrc } from './imagePath'

describe('padSerial', () => {
  test('pads to four digits and lets larger serials grow', () => {
    expect(padSerial(1)).toBe('0001')
    expect(padSerial(12)).toBe('0012')
    expect(padSerial(9999)).toBe('9999')
    expect(padSerial(12345)).toBe('12345')
  })
})

describe('photoPath', () => {
  test('builds the serial-based storage path for full images and thumbnails', () => {
    expect(photoPath('semi_pucca', 1, 'prev')).toBe('housing/semi_pucca/0001/prev.webp')
    expect(photoPath('tin', 12, 'current', 'thumb')).toBe('housing/tin/0012/current_thumb.webp')
    expect(photoPath('tin', 12, 'prev', 'thumb')).toBe('housing/tin/0012/prev_thumb.webp')
  })
})

describe('extFromMime', () => {
  test('maps accepted mime types and rejects others', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/webp')).toBe('webp')
    expect(extFromMime('image/gif')).toBeNull()
    expect(extFromMime('')).toBeNull()
  })
})

describe('photoSrc', () => {
  test('returns null for a missing url', () => {
    expect(photoSrc(null, '2026-01-01T00:00:00Z')).toBeNull()
  })

  test('returns the url unchanged when there is no update timestamp', () => {
    expect(photoSrc('https://x/a.webp', null)).toBe('https://x/a.webp')
  })

  test('adds a cache-busting version parameter, joining with ? or &', () => {
    const t = '2026-01-01T00:00:00Z'
    const v = Date.parse(t)
    expect(photoSrc('https://x/a.webp', t)).toBe(`https://x/a.webp?v=${v}`)
    expect(photoSrc('https://x/a.webp?a=1', t)).toBe(`https://x/a.webp?a=1&v=${v}`)
  })

  test('a new timestamp changes the version', () => {
    expect(photoSrc('u', '2026-01-01T00:00:00Z')).not.toBe(photoSrc('u', '2026-01-02T00:00:00Z'))
  })
})
