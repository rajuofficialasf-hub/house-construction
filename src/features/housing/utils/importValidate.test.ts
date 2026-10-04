import { describe, expect, test } from 'vitest'
import { BD_GEO } from '../data/bdGeo'
import type { ImportField } from './importColumns'
import { analyzeRows, fillDown, type Mapping } from './importValidate'

const dv = BD_GEO[0]
const ds = dv.districts[0]
const up = ds.upazilas[0]

// column order used by the helper rows below
const MAPPING: Mapping = ['serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'address', 'prev_photo_source']
const OPTS = { geoFixes: {}, serialFromFile: false, startSerial: 1 }

const row = (over: Partial<Record<ImportField, string>> = {}): string[] => {
  const base: Record<string, string> = {
    serial_no: '',
    year: '2025',
    name: 'রহিম উদ্দিন',
    father_or_husband_name: 'করিম',
    division: dv.name,
    district: ds.name,
    upazila: up.name,
    address: 'গ্রাম',
    prev_photo_source: '',
    ...over,
  }
  return MAPPING.map((f) => base[f as string])
}

describe('fillDown', () => {
  test('fills blank year and geography from the row above, never name, address or serial', () => {
    const rows = [
      ['1', '2025', 'আ', dv.name, 'ঠিকানা1'],
      ['2', '', 'বি', '', ''],
    ]
    const mapping: Mapping = ['serial_no', 'year', 'name', 'division', 'address']
    const { rows: out, filled } = fillDown(rows, mapping)
    expect(out[1]).toEqual(['2', '2025', 'বি', dv.name, ''])
    expect(filled).toBe(2)
    expect(rows[1][1]).toBe('') // input untouched
  })

  test('does nothing when no fill-down column is mapped', () => {
    const rows = [['a'], ['']]
    expect(fillDown(rows, ['name'])).toEqual({ rows, filled: 0 })
  })
})

describe('analyzeRows', () => {
  test('a valid row has no errors and assigns serials from the start serial', () => {
    const a = analyzeRows([row(), row({ name: 'অন্য' })], MAPPING, { ...OPTS, startSerial: 10 })
    expect(a.errorCount).toBe(0)
    expect(a.validCount).toBe(2)
    expect(a.rows.map((r) => r.values.serial_no)).toEqual([10, 11])
    expect(a.rows[0].rowNo).toBe(2)
  })

  test('required fields missing produce errors', () => {
    const a = analyzeRows([row({ year: '', name: '' })], MAPPING, OPTS)
    expect(a.errorCount).toBe(1)
    expect(a.rows[0].errors.length).toBeGreaterThanOrEqual(2)
  })

  test('an out-of-range or non-numeric year is an error; Bangla digits are accepted', () => {
    expect(analyzeRows([row({ year: '1999' })], MAPPING, OPTS).errorCount).toBe(1)
    expect(analyzeRows([row({ year: 'abc' })], MAPPING, OPTS).errorCount).toBe(1)
    const ok = analyzeRows([row({ year: '২০২৫' })], MAPPING, OPTS)
    expect(ok.errorCount).toBe(0)
    expect(ok.rows[0].values.year).toBe(2025)
  })

  test('a name longer than 200 characters is an error', () => {
    expect(analyzeRows([row({ name: 'ক'.repeat(201) })], MAPPING, OPTS).errorCount).toBe(1)
  })

  test('an unknown upazila is reported and collected for manual fixing', () => {
    const a = analyzeRows([row({ upazila: 'zzzzzzzz' }), row({ upazila: 'zzzzzzzz', name: 'অন্য' })], MAPPING, OPTS)
    expect(a.errorCount).toBe(2)
    expect(a.unresolvedGeo).toHaveLength(1)
    expect(a.unresolvedGeo[0]).toMatchObject({ level: 'upazila', raw: 'zzzzzzzz', count: 2 })
  })

  test('Covers AE4: one invalid row in a file is counted as an error and the valid rows exclude it', () => {
    const a = analyzeRows([row(), row({ year: '' }), row({ name: 'তৃতীয়' })], MAPPING, OPTS)
    expect(a.errorCount).toBe(1)
    expect(a.validCount).toBe(2)
    expect(a.rows[1].errors.length).toBeGreaterThan(0)
  })

  test('a non-http photo link is dropped with a warning; an http link is kept', () => {
    const bad = analyzeRows([row({ prev_photo_source: 'ftp://x' })], MAPPING, OPTS)
    expect(bad.rows[0].values.prev_photo_source).toBeNull()
    expect(bad.rows[0].warnings.length).toBeGreaterThan(0)
    const good = analyzeRows([row({ prev_photo_source: 'https://x/y' })], MAPPING, OPTS)
    expect(good.rows[0].values.prev_photo_source).toBe('https://x/y')
  })

  test('serials taken from the file: blank, invalid and duplicate serials are errors', () => {
    const opts = { ...OPTS, serialFromFile: true }
    const a = analyzeRows(
      [row({ serial_no: '5' }), row({ serial_no: '5', name: 'অন্য' }), row({ serial_no: '' }), row({ serial_no: '0' })],
      MAPPING,
      opts,
    )
    expect(a.hasSerialColumn).toBe(true)
    expect(a.rows[0].errors).toEqual([])
    expect(a.rows[1].errors.length).toBeGreaterThan(0) // duplicate of row 2
    expect(a.rows[2].errors.length).toBeGreaterThan(0) // blank
    expect(a.rows[3].errors.length).toBeGreaterThan(0) // below 1
  })

  test('the same person twice in the same upazila gets a duplicate warning', () => {
    const a = analyzeRows([row(), row()], MAPPING, OPTS)
    expect(a.rows[0].warnings).toEqual([])
    expect(a.rows[1].warnings.length).toBeGreaterThan(0)
    expect(a.warningCount).toBe(1)
  })

  test('a near-miss geography name is auto-corrected with a warning, not an error', () => {
    const a = analyzeRows([row({ division: dv.en })], MAPPING, OPTS)
    expect(a.rows[0].errors).toEqual([])
    expect(a.rows[0].values.division).toBe(dv.name)
    expect(a.rows[0].warnings.length).toBeGreaterThan(0)
  })
})
