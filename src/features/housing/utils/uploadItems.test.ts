import { describe, expect, test } from 'vitest'
import { createUploadItems, revokeUploadItems, STATUS_CLASS, STATUS_LABEL } from './uploadItems'

const file = (name: string, type: string) => new File(['x'], name, { type })

describe('createUploadItems', () => {
  test('keeps accepted image types and files with no type, drops others', () => {
    const items = createUploadItems([file('a.jpg', 'image/jpeg'), file('b.gif', 'image/gif'), file('c', ''), file('d.png', 'image/png')])
    expect(items.map((i) => i.file.name)).toEqual(['a.jpg', 'c', 'd.png'])
    revokeUploadItems(items)
  })

  test('each item starts pending with a unique id and a preview url', () => {
    const items = createUploadItems([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')])
    expect(items.every((i) => i.status === 'pending' && i.previewUrl.startsWith('blob:'))).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(2)
    revokeUploadItems(items)
  })

  test('every status has a label and a class', () => {
    for (const s of Object.keys(STATUS_LABEL)) expect(STATUS_CLASS[s as keyof typeof STATUS_CLASS]).toBeTruthy()
  })
})
