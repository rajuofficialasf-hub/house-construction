import { describe, expect, it } from 'vitest'
import { FALLBACK_PROJECTS, type Project } from '@/backend'
import { buildImportFields, guessMapping, isIgnoredHeader, normHeader } from './importFields'
import { projectField } from './testFixtures'

// Which fields an import offers for a project and how a sheet's headers are matched to them.

const semiPucca = FALLBACK_PROJECTS.find((p) => p.key === 'semi_pucca')!

/** A union-level, after-only project with a money field, a category with an alias, a private phone and an archived field. */
const demo: Project = {
  ...semiPucca,
  key: 'demo',
  photo_mode: 'after_only',
  geo_depth: 'union',
  fields: [
    projectField({ key: 'amount', label_bn: 'অনুদান', label_en: 'Grant', type: 'money', required: true, sort_order: 10 }),
    projectField({ key: 'trade', label_bn: 'পেশা', label_en: 'Trade', type: 'category', import_aliases: ['কাজের ধরন'], sort_order: 20 }),
    projectField({ key: 'phone', label_bn: 'ফোন', label_en: 'Phone', type: 'phone', visibility: 'admin', sort_order: 30 }),
    projectField({ key: 'old_cost', label_bn: 'পুরনো খরচ', type: 'money', is_active: false, sort_order: 40 }),
  ],
}

const ids = (p: Project) => buildImportFields(p).map((f) => f.id)

describe('normHeader', () => {
  it('lower-cases, joins spaces and drops a trailing * or :', () => {
    expect(normHeader('  Beneficiary   NAME *')).toBe('beneficiary name')
    expect(normHeader('সাল:')).toBe('সাল')
  })

  it('NFC-normalizes, so two spellings of one Bangla letter match', () => {
    expect(normHeader('বাড়ি')).toBe(normHeader('বাড়ি'))
  })
})

describe('isIgnoredHeader', () => {
  it('ignores the export\'s information columns and archived-field columns', () => {
    expect(isIgnoredHeader('বর্তমান ঘরের ছবি (সিস্টেম URL)')).toBe(true)
    expect(isIgnoredHeader('ছবি আপডেট')).toBe(true)
    expect(isIgnoredHeader('রেকর্ড আইডি')).toBe(true)
    expect(isIgnoredHeader('পুরনো খরচ (আর্কাইভ)')).toBe(true)
    expect(isIgnoredHeader('নাম')).toBe(false)
  })
})

describe('buildImportFields', () => {
  it('offers the serial, the system fields, both photo links and no union for a before-and-after upazila-level project', () => {
    const list = ids({ ...semiPucca, photo_mode: 'before_after', geo_depth: 'upazila' })
    expect(list[0]).toBe('serial_no')
    expect(list).toEqual(expect.arrayContaining(['year', 'name', 'division', 'district', 'upazila', 'prev_photo_source', 'current_photo_source']))
    expect(list).not.toContain('union_name')
  })

  it('adds the union, one photo link, and active custom fields as x.<key>, marking the private one', () => {
    const list = buildImportFields(demo)
    const byId = new Map(list.map((f) => [f.id, f]))
    expect(byId.has('union_name')).toBe(true)
    expect(byId.has('prev_photo_source')).toBe(false)
    expect(byId.has('current_photo_source')).toBe(true)
    expect(byId.get('x.amount')).toMatchObject({ required: true, private: false, exact: ['অনুদান', 'grant', 'amount'] })
    expect(byId.get('x.trade')?.aliases).toEqual(['কাজের ধরন'])
    expect(byId.get('x.phone')?.private).toBe(true)
    expect(byId.has('x.old_cost')).toBe(false)
  })

  it('offers no photo link for a project without photos', () => {
    expect(ids({ ...demo, photo_mode: 'none' }).filter((id) => id.endsWith('_photo_source'))).toEqual([])
  })
})

describe('guessMapping', () => {
  const fields = buildImportFields(demo)

  it('matches exact labels and keys in any case, and leaves unknown headers unmapped', () => {
    expect(guessMapping(['সিরিয়াল', 'NAME', 'Grant', 'phone', 'কিছু একটা'], fields)).toEqual(['serial_no', 'name', 'x.amount', 'x.phone', null])
  })

  it('matches an import alias inside a longer header', () => {
    expect(guessMapping(['উপকারভোগীর কাজের ধরন (২০২৫)'], fields)).toEqual(['x.trade'])
  })

  it('falls back to the system fields\' old patterns for a housing sheet', () => {
    expect(guessMapping(['ক্রমিক নং', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম', 'থানা', 'পৌরসভা'], fields)).toEqual([
      'serial_no',
      'name',
      'father_or_husband_name',
      'upazila',
      'union_name',
    ])
  })

  it('maps each field once, so a second matching header stays unmapped', () => {
    expect(guessMapping(['নাম', 'নাম'], fields)).toEqual(['name', null])
  })

  it('never maps an export\'s information column, even when its words match a field', () => {
    expect(guessMapping(['বর্তমান ঘরের ছবি (সিস্টেম URL)', 'রেকর্ড আইডি'], fields)).toEqual([null, null])
  })
})
