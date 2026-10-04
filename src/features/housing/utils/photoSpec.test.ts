import { describe, expect, test } from 'vitest'
import { isAcceptedMime, PHOTO_SPEC } from './photoSpec'

describe('photo spec', () => {
  test('output is WebP with the documented sizes', () => {
    expect(PHOTO_SPEC.mime).toBe('image/webp')
    expect(PHOTO_SPEC.ext).toBe('webp')
    expect(PHOTO_SPEC.maxWidth).toBe(1600)
    expect(PHOTO_SPEC.thumbWidth).toBe(400)
    expect(PHOTO_SPEC.maxInputBytes).toBe(25 * 1024 * 1024)
  })

  test('accepts jpeg, png and webp only', () => {
    expect(isAcceptedMime('image/jpeg')).toBe(true)
    expect(isAcceptedMime('image/png')).toBe(true)
    expect(isAcceptedMime('image/webp')).toBe(true)
    expect(isAcceptedMime('image/gif')).toBe(false)
    expect(isAcceptedMime('application/pdf')).toBe(false)
  })
})
