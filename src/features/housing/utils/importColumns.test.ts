import { describe, expect, test } from 'vitest'
import { guessMapping, IMPORT_FIELDS, REQUIRED_FIELDS } from './importColumns'

describe('guessMapping', () => {
  test('maps Bangla headers to fields', () => {
    const headers = ['সিরিয়াল', 'সাল', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম', 'বিভাগ', 'জেলা', 'উপজেলা', 'ঠিকানা']
    expect(guessMapping(headers)).toEqual([
      'serial_no',
      'year',
      'name',
      'father_or_husband_name',
      'division',
      'district',
      'upazila',
      'address',
    ])
  })

  test('maps English headers to fields', () => {
    expect(guessMapping(['Serial', 'Year', 'Name', 'Father', 'Division', 'District', 'Upazila', 'Address'])).toEqual([
      'serial_no',
      'year',
      'name',
      'father_or_husband_name',
      'division',
      'district',
      'upazila',
      'address',
    ])
  })

  test('photo link headers do not get mistaken for the name field', () => {
    const m = guessMapping(['নাম', 'পূর্বের ঘরের ছবি (লিঙ্ক)', 'বর্তমান ঘরের ছবি (লিঙ্ক)'])
    expect(m).toEqual(['name', 'prev_photo_source', 'current_photo_source'])
  })

  test('each field is used at most once and unknown headers stay unmapped', () => {
    const m = guessMapping(['নাম', 'নাম', 'কিছু একটা'])
    expect(m.filter((f) => f === 'name')).toHaveLength(1)
    expect(m[2]).toBeNull()
  })

  test('required fields are all import fields', () => {
    for (const f of REQUIRED_FIELDS) expect(IMPORT_FIELDS).toContain(f)
  })
})
