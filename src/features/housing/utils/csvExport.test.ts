import { describe, expect, test } from 'vitest'
import { toCsv } from './csvExport'

const BOM = '﻿'

describe('toCsv', () => {
  test('starts with a BOM, uses CRLF and ends with a newline', () => {
    const out = toCsv(['a', 'b'], [['1', '2']])
    expect(out).toBe(`${BOM}a,b\r\n1,2\r\n`)
  })

  test('quotes cells containing commas, quotes or newlines and doubles inner quotes', () => {
    const out = toCsv(['h'], [['a,b'], ['say "hi"'], ['x\ny']])
    expect(out).toBe(`${BOM}h\r\n"a,b"\r\n"say ""hi"""\r\n"x\ny"\r\n`)
  })

  test('renders null and undefined as empty and keeps Bangla text', () => {
    const out = toCsv(['নাম', 'সাল'], [['রহিম', null], [undefined, 2025]])
    expect(out).toBe(`${BOM}নাম,সাল\r\nরহিম,\r\n,2025\r\n`)
  })

  test('header-only output has no data rows', () => {
    expect(toCsv(['a'], [])).toBe(`${BOM}a\r\n`)
  })
})
