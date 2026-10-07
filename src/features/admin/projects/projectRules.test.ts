import { describe, expect, it } from 'vitest'
import { HousingApiError } from '@/backend'
import { friendlyProjectError, isStaleEdit, keyError } from './projectRules'

// friendlyProjectError and isStaleEdit read the field and reason the server names (details.field,
// details.reason), so a duplicate key gets its own message and only a stale edit says "someone
// else changed this" (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P6 decisions").

const err = (code: ConstructorParameters<typeof HousingApiError>[0], message: string, details?: Record<string, unknown>) =>
  new HousingApiError(code, message, details)

describe('friendlyProjectError on the server\'s errors', () => {
  it('gives a duplicate URL or file prefix its own message', () => {
    expect(friendlyProjectError(err('CONFLICT', 'এই URL আগে থেকেই আছে', { field: 'slug' }))).toBe('এই URL আগে থেকেই আছে — অন্যটি দিন')
    expect(friendlyProjectError(err('CONFLICT', 'x', { field: 'file_prefix' }))).toBe('এই প্রিফিক্স অন্য প্রকল্পে আছে — অন্যটি দিন')
  })

  it('passes a duplicate key\'s server message through, which already tells a project from a field', () => {
    expect(friendlyProjectError(err('CONFLICT', 'এই প্রকল্পে একই key এর ফিল্ড আগে থেকেই আছে', { field: 'key' }))).toBe(
      'এই প্রকল্পে একই key এর ফিল্ড আগে থেকেই আছে',
    )
  })

  it('explains a slug, key or name that breaks the input rules, including on the create body\'s project.<field>', () => {
    expect(friendlyProjectError(err('VALIDATION_ERROR', 'ইনপুট সঠিক নয়', { field: 'project.slug', reason: 'invalid_format' }))).toMatch(/self-reliance/)
    expect(friendlyProjectError(err('VALIDATION_ERROR', 'ইনপুট সঠিক নয়', { field: 'key', reason: 'invalid_format' }))).toMatch(/^key:/)
    expect(friendlyProjectError(err('VALIDATION_ERROR', 'ইনপুট সঠিক নয়', { field: 'name_en', reason: 'too_small' }))).toMatch(/দুই নামই/)
  })

  it('shows the database\'s own message for a reserved key, which has a field but no reason', () => {
    expect(friendlyProjectError(err('VALIDATION_ERROR', 'এই নামটি সংরক্ষিত — অন্য key দিন', { field: 'key' }))).toBe('এই নামটি সংরক্ষিত — অন্য key দিন')
  })

  it('says a refusal is a missing permission', () => {
    expect(friendlyProjectError(err('FORBIDDEN', 'শুধু মূল এডমিন মুছতে পারেন'))).toBe('এই কাজের অনুমতি নেই')
  })

  it('passes any other message through', () => {
    expect(friendlyProjectError(err('VALIDATION_ERROR', 'রেকর্ডে মান আছে — মোছা যাবে না; আর্কাইভ করুন', { field: 'key' }))).toBe(
      'রেকর্ডে মান আছে — মোছা যাবে না; আর্কাইভ করুন',
    )
  })

  it('maps a conflict by its details.field only, never by the message text', () => {
    const msg = 'duplicate key value violates unique constraint "projects_slug_key"'
    expect(friendlyProjectError(err('CONFLICT', msg))).toBe(msg)
  })
})

describe('isStaleEdit', () => {
  it('is true only for a conflict that names no field', () => {
    expect(isStaleEdit(err('CONFLICT', 'অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন'))).toBe(true)
    expect(isStaleEdit(err('CONFLICT', 'এই URL আগে থেকেই আছে', { field: 'slug' }))).toBe(false)
    expect(isStaleEdit(err('VALIDATION_ERROR', 'x'))).toBe(false)
    expect(isStaleEdit(new Error('boom'))).toBe(false)
  })
})

describe('keyError', () => {
  it('refuses a key a project route already uses, and allows longer words', () => {
    expect(keyError('overview', [])).toBe('এই key সংরক্ষিত — URL অংশ একটু বদলান')
    expect(keyError('order', [])).toBe('এই key সংরক্ষিত — URL অংশ একটু বদলান')
    expect(keyError('overviews', [])).toBeNull()
    expect(keyError('orders', [])).toBeNull()
  })

  it('gives a reserved key refused by the server the same message', () => {
    expect(friendlyProjectError(err('VALIDATION_ERROR', 'এই key সংরক্ষিত — অন্যটি দিন', { field: 'project.key', reason: 'reserved' }))).toBe(
      'এই key সংরক্ষিত — URL অংশ একটু বদলান',
    )
  })
})
