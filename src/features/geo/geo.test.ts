import { describe, expect, test } from 'vitest'
import { BD_GEO } from './data/bdGeo'
import {
  divisionOfDistrict,
  findDistrict,
  findDivision,
  getDistricts,
  getDivisions,
  getUpazilas,
  isValidGeo,
  nfc,
  normalizeGeo,
} from './geo'

const dv = BD_GEO[0]
const ds = dv.districts[0]
const up = ds.upazilas[0]

describe('nfc', () => {
  test('trims and handles null and undefined', () => {
    expect(nfc('  কুমিল্লা ')).toBe('কুমিল্লা')
    expect(nfc(null)).toBe('')
    expect(nfc(undefined)).toBe('')
  })

  test('composed and decomposed forms of ড়, ঢ় and য় normalize to the same string', () => {
    // [precomposed code point, base letter + nukta]
    const pairs = [
      ['\u09dc', '\u09a1\u09bc'],
      ['\u09dd', '\u09a2\u09bc'],
      ['\u09df', '\u09af\u09bc'],
    ]
    for (const [precomposed, decomposed] of pairs) {
      expect(precomposed).not.toBe(decomposed)
      expect(nfc(precomposed)).toBe(nfc(decomposed))
    }
    expect(nfc('বা\u09dcি')).toBe(nfc('বা\u09a1\u09bcি'))
  })
})

describe('geography lookups', () => {
  test('the dataset has divisions, districts and upazilas', () => {
    expect(getDivisions().length).toBeGreaterThan(0)
    expect(getDistricts(dv.name).length).toBe(dv.districts.length)
    expect(getUpazilas(dv.name, ds.name).length).toBe(ds.upazilas.length)
  })

  test('findDivision and findDistrict return null for unknown or empty names', () => {
    expect(findDivision('অজানা')).toBeNull()
    expect(findDivision('')).toBeNull()
    expect(findDistrict(dv.name, 'অজানা')).toBeNull()
    expect(getDistricts('অজানা')).toEqual([])
    expect(getUpazilas(dv.name, 'অজানা')).toEqual([])
  })

  test('divisionOfDistrict finds the owning division', () => {
    expect(divisionOfDistrict(ds.name)?.name).toBe(dv.name)
    expect(divisionOfDistrict('অজানা')).toBeNull()
  })
})

describe('normalizeGeo', () => {
  test('keeps a consistent selection', () => {
    expect(normalizeGeo({ division: dv.name, district: ds.name, upazila: up.name })).toEqual({
      division: dv.name,
      district: ds.name,
      upazila: up.name,
    })
  })

  test('an unknown division clears everything', () => {
    expect(normalizeGeo({ division: 'অজানা', district: ds.name, upazila: up.name })).toEqual({
      division: '',
      district: '',
      upazila: '',
    })
  })

  test('a district outside the division clears district and upazila', () => {
    const other = BD_GEO[1].districts[0]
    expect(normalizeGeo({ division: dv.name, district: other.name, upazila: other.upazilas[0].name })).toEqual({
      division: dv.name,
      district: '',
      upazila: '',
    })
  })

  test('an upazila outside the district is cleared', () => {
    const other = BD_GEO[1].districts[0].upazilas[0].name
    expect(normalizeGeo({ division: dv.name, district: ds.name, upazila: other }).upazila).toBe('')
  })
})

describe('isValidGeo', () => {
  test('accepts a real triple and rejects a mismatched or empty one', () => {
    expect(isValidGeo(dv.name, ds.name, up.name)).toBe(true)
    expect(isValidGeo(dv.name, ds.name, '')).toBe(false)
    expect(isValidGeo(dv.name, ds.name, 'অজানা')).toBe(false)
    expect(isValidGeo(BD_GEO[1].name, ds.name, up.name)).toBe(false)
  })
})
