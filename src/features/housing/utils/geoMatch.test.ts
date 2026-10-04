import { describe, expect, test } from 'vitest'
import { BD_GEO } from '../data/bdGeo'
import { candidatesFor, geoFixKey, looseKey, matchDistrict, matchDivision, matchUpazila, resolveGeo } from './geoMatch'

const dv = BD_GEO[0]
const ds = dv.districts[0]
const up = ds.upazilas[0]

describe('looseKey', () => {
  test('ignores spacing, punctuation and trailing unit words', () => {
    expect(looseKey(` ${ds.name} জেলা `)).toBe(looseKey(ds.name))
    expect(looseKey('ক-খ')).toBe(looseKey('কখ'))
  })

  test('folds common spelling variants', () => {
    expect(looseKey('ণ')).toBe(looseKey('ন'))
    expect(looseKey('শ')).toBe(looseKey('স'))
    expect(looseKey('ী')).toBe(looseKey('ি'))
  })
})

describe('matchDivision, matchDistrict, matchUpazila', () => {
  test('an exact name matches without correction', () => {
    expect(matchDivision(dv.name)).toEqual({ match: dv.name, corrected: false, suggestions: [] })
    expect(matchDistrict(ds.name, dv.name)).toMatchObject({ match: ds.name, corrected: false })
    expect(matchUpazila(up.name, dv.name, ds.name)).toMatchObject({ match: up.name, corrected: false })
  })

  test('an English name or trailing unit word is auto-corrected', () => {
    expect(matchDivision(dv.en)).toMatchObject({ match: dv.name, corrected: true })
    expect(matchDistrict(`${ds.name} জেলা`, dv.name)).toMatchObject({ match: ds.name, corrected: true })
  })

  test('an empty value gives no match and no suggestions', () => {
    expect(matchDivision('  ')).toEqual({ match: null, corrected: false, suggestions: [] })
  })

  test('an unknown value gives no match', () => {
    expect(matchDivision('zzzzzzzzzz').match).toBeNull()
  })

  test('a near-miss spelling gets suggestions, closest first, at most five', () => {
    const r = matchDistrict(`${ds.name}ক`, dv.name)
    if (r.match === null) {
      expect(r.suggestions.length).toBeLessThanOrEqual(5)
      expect(r.suggestions[0]).toBe(ds.name)
    } else {
      expect(r.match).toBe(ds.name)
    }
  })
})

describe('resolveGeo', () => {
  test('resolves an exact triple with nothing unresolved', () => {
    expect(resolveGeo(dv.name, ds.name, up.name)).toEqual({
      division: dv.name,
      district: ds.name,
      upazila: up.name,
      corrected: [],
      unresolved: [],
    })
  })

  test('infers the division from the district when the division is wrong', () => {
    const r = resolveGeo('zzzz', ds.name, up.name)
    expect(r.division).toBe(dv.name)
    expect(r.unresolved.find((u) => u.level === 'division')).toBeUndefined()
    expect(r.corrected).toContain('division')
  })

  test('an unknown upazila is reported as unresolved', () => {
    const r = resolveGeo(dv.name, ds.name, 'zzzzzzzz')
    expect(r.upazila).toBeNull()
    expect(r.unresolved).toEqual([{ level: 'upazila', raw: 'zzzzzzzz', suggestions: expect.any(Array) }])
  })

  test('a manual fix is applied before automatic matching', () => {
    const fixes = { [geoFixKey('upazila', 'zzzzzzzz', ds.name)]: up.name }
    expect(resolveGeo(dv.name, ds.name, 'zzzzzzzz', fixes).upazila).toBe(up.name)
  })

  test('empty values are not reported as unresolved', () => {
    expect(resolveGeo('', '', '').unresolved).toEqual([])
  })
})

describe('candidatesFor', () => {
  test('lists all divisions, the districts of a division, and unique upazila names', () => {
    expect(candidatesFor('division', null, null)).toHaveLength(BD_GEO.length)
    expect(candidatesFor('district', dv.name, null)).toHaveLength(dv.districts.length)
    const ups = candidatesFor('upazila', dv.name, ds.name)
    expect(ups).toHaveLength(new Set(ds.upazilas.map((u) => u.name)).size)
  })
})

describe('geoFixKey', () => {
  test('is level, parent and raw value joined, NFC-normalized', () => {
    expect(geoFixKey('district', ' x ', ' p ')).toBe('district|p|x')
  })
})
