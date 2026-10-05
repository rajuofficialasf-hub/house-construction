import { t } from '@/i18n'
import { HousingApiError } from '../../../backend/interfaces/types'

export interface ParsedSheet {
  sheetName: string
  headers: string[]
  /** প্রতিটি সারি = হেডারের সমান দৈর্ঘ্যের স্ট্রিং অ্যারে; সম্পূর্ণ খালি সারি বাদ */
  rows: string[][]
}

const MAX_ROWS = 20000

/**
 * .xlsx / .xls / .csv → হেডার + সারি (SheetJS, lazy import — ~৪০০ KB শুধু ইম্পোর্ট পেইজে লোড হয়)।
 * CSV: UTF-8 (BOM থাকলে বাদ) হিসেবে টেক্সট পড়ে পার্স, তাই বাংলা ঠিক থাকে।
 * প্রথম শীট; প্রথম অ-খালি সারি = হেডার। সব সেল স্ট্রিং (তারিখ/সংখ্যা ফরম্যাট যেমন দেখা যায়)।
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const XLSX = await import('xlsx')
  const isCsv = /\.(csv|txt|tsv)$/i.test(file.name) || file.type === 'text/csv'
  let wb: import('xlsx').WorkBook
  try {
    if (isCsv) {
      const text = (await file.text()).replace(/^﻿/, '')
      wb = XLSX.read(text, { type: 'string', raw: true })
    } else {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false, cellDates: false })
    }
  } catch (err) {
    throw new HousingApiError('VALIDATION_ERROR', t('ফাইল পড়া যায়নি: {error}', { error: err instanceof Error ? err.message : String(err) }))
  }
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new HousingApiError('VALIDATION_ERROR', t('ফাইলে কোনো শীট নেই'))
  const ws = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
  const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/ /g, ' ').trim()
  const table = grid.map((r) => (Array.isArray(r) ? r.map(asText) : []))
  const headerIdx = table.findIndex((r) => r.some((c) => c !== ''))
  if (headerIdx === -1) throw new HousingApiError('VALIDATION_ERROR', t('শীট খালি'))
  const headers = table[headerIdx].map((h, i) => h || t('কলাম {n}', { n: i + 1 }))
  const rows = table
    .slice(headerIdx + 1)
    .map((r) => headers.map((_, i) => r[i] ?? ''))
    .filter((r) => r.some((c) => c !== ''))
  if (rows.length > MAX_ROWS) throw new HousingApiError('VALIDATION_ERROR', t('সর্বোচ্চ {max} সারি সমর্থিত (পেয়েছি {n})', { max: MAX_ROWS, n: rows.length }))
  return { sheetName, headers, rows }
}
