import { describe, expect, test } from 'vitest'
import { districtColors, withAlpha } from './districtColors'

describe('districtColors', () => {
  test('aggregates by district and orders by total, largest first', () => {
    const { list, byDistrict } = districtColors({ 'ক|১': 2, 'ক|২': 3, 'খ|১': 10 })
    expect(list.map((d) => d.district)).toEqual(['খ', 'ক'])
    expect(list[1]).toMatchObject({ district: 'ক', total: 5, upazilas: 2 })
    expect(byDistrict.get('খ')?.color).not.toBe(byDistrict.get('ক')?.color)
  })

  test('skips zero counts and empty district keys', () => {
    expect(districtColors({ 'ক|১': 0, '|২': 5 }).list).toEqual([])
  })

  test('beyond the palette it generates distinct hsl colors', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 20; i++) counts[`জেলা${i}|উ`] = 100 - i
    const { list } = districtColors(counts)
    expect(list).toHaveLength(20)
    expect(list[0].color.startsWith('#')).toBe(true)
    expect(list[19].color.startsWith('hsl(')).toBe(true)
    expect(new Set(list.map((d) => d.color)).size).toBe(20)
  })
})

describe('withAlpha', () => {
  test('converts hex to rgba', () => {
    expect(withAlpha('#2563eb', 0.5)).toBe('rgba(37, 99, 235, 0.5)')
  })
  test('adds alpha to hsl and leaves unknown formats alone', () => {
    expect(withAlpha('hsl(10 65% 42%)', 0.3)).toBe('hsl(10 65% 42% / 0.3)')
    expect(withAlpha('red', 0.3)).toBe('red')
  })
})
