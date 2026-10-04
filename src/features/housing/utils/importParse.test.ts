import { describe, expect, test } from 'vitest'
import { HousingApiError } from '../backend/interfaces/types'
import { parseSpreadsheet } from './importParse'

const csv = (text: string, name = 'rows.csv') => new File([text], name, { type: 'text/csv' })

describe('parseSpreadsheet (csv)', () => {
  test('reads headers and rows, keeping Bangla text and dropping a BOM', async () => {
    const r = await parseSpreadsheet(csv('﻿নাম,সাল\nরহিম,2025\nকরিম,2024\n'))
    expect(r.headers).toEqual(['নাম', 'সাল'])
    expect(r.rows).toEqual([
      ['রহিম', '2025'],
      ['করিম', '2024'],
    ])
  })

  test('skips fully empty rows and uses the first non-empty row as the header', async () => {
    const r = await parseSpreadsheet(csv(',\nনাম,সাল\n,\nরহিম,2025\n'))
    expect(r.headers).toEqual(['নাম', 'সাল'])
    expect(r.rows).toEqual([['রহিম', '2025']])
  })

  test('pads short rows and names blank header cells', async () => {
    const r = await parseSpreadsheet(csv('নাম,,সাল\nরহিম\n'))
    expect(r.headers).toHaveLength(3)
    expect(r.headers[1]).not.toBe('')
    expect(r.rows[0]).toEqual(['রহিম', '', ''])
  })

  test('quoted cells with commas stay in one cell', async () => {
    const r = await parseSpreadsheet(csv('নাম,ঠিকানা\nরহিম,"গ্রাম, ডাকঘর"\n'))
    expect(r.rows[0]).toEqual(['রহিম', 'গ্রাম, ডাকঘর'])
  })

  test('an empty file is a validation error', async () => {
    await expect(parseSpreadsheet(csv(''))).rejects.toBeInstanceOf(HousingApiError)
  })
})
