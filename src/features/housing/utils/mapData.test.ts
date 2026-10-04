import { describe, expect, test } from 'vitest'
import { locationKey } from './mapData'

describe('locationKey', () => {
  test('joins district and upazila so same-named upazilas in different districts stay apart', () => {
    expect(locationKey('ঢাকা', 'সদর')).toBe('ঢাকা|সদর')
    expect(locationKey('ঢাকা', 'সদর')).not.toBe(locationKey('কুমিল্লা', 'সদর'))
  })
})
