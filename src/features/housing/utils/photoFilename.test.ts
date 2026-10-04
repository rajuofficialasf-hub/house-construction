import { describe, expect, test } from 'vitest'
import { parsePhotoFilename } from './photoFilename'

describe('parsePhotoFilename', () => {
  test('parses project, serial and kind from the documented names', () => {
    expect(parsePhotoFilename('semi_0001_prev.jpg')).toEqual({ project_type: 'semi_pucca', serial_no: 1, kind: 'prev' })
    expect(parsePhotoFilename('tin_0012_current.png')).toEqual({ project_type: 'tin', serial_no: 12, kind: 'current' })
    expect(parsePhotoFilename('semi_pucca-7-before.webp')).toEqual({ project_type: 'semi_pucca', serial_no: 7, kind: 'prev' })
  })

  test('a name without a project gives a null project type', () => {
    expect(parsePhotoFilename('0001_current.jpg')).toEqual({ project_type: null, serial_no: 1, kind: 'current' })
  })

  test('is case-insensitive and ignores directories and trailing parts', () => {
    expect(parsePhotoFilename('C:\\photos\\TIN_0003_After_v2.JPEG')).toEqual({ project_type: 'tin', serial_no: 3, kind: 'current' })
    expect(parsePhotoFilename('folder/semi_5_old.jpg')?.kind).toBe('prev')
  })

  test('rejects an unknown project prefix, unknown kind, zero serial and bad extension', () => {
    expect(parsePhotoFilename('villa_0001_prev.jpg')).toBeNull()
    expect(parsePhotoFilename('tin_0001_side.jpg')).toBeNull()
    expect(parsePhotoFilename('tin_0000_prev.jpg')).toBeNull()
    expect(parsePhotoFilename('tin_0001_prev.gif')).toBeNull()
    expect(parsePhotoFilename('random.jpg')).toBeNull()
  })
})
