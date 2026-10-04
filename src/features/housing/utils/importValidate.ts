import { t as tr } from '@/i18n'
import type { ImportField } from './importColumns'
import { nfc } from './geo'
import { resolveGeo, type ResolvedGeo } from './geoMatch'

export type Mapping = (ImportField | null)[]

export interface ImportRowValues {
  serial_no: number | null
  year: number | null
  name: string
  father_or_husband_name: string
  division: string | null
  district: string | null
  upazila: string | null
  address: string
  prev_photo_source: string | null
  current_photo_source: string | null
}

export interface ImportRow {
  /** ফাইলে সারি নম্বর (হেডার = ১, তাই প্রথম ডাটা সারি = ২ … আনুমানিক) */
  rowNo: number
  raw: Record<ImportField, string>
  values: ImportRowValues
  geo: ResolvedGeo
  errors: string[]
  warnings: string[]
}

export interface ImportAnalysis {
  rows: ImportRow[]
  hasSerialColumn: boolean
  validCount: number
  errorCount: number
  warningCount: number
  /** স্বতন্ত্র না-মেলা ভৌগোলিক নাম (ম্যানুয়াল ঠিক করার প্যানেল) */
  unresolvedGeo: { key: string; level: 'division' | 'district' | 'upazila'; raw: string; parent: string; suggestions: string[]; count: number }[]
}

const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim()

function toInt(s: string): number | null {
  const t = ascii(s).replace(/[,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) ? n : Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : NaN
}

/** যে ফিল্ডগুলোতে "উপরের সারির মান" নেওয়া নিরাপদ (শীটে সাধারণত একবার লিখে নিচে খালি রাখা হয়) */
export const FILL_DOWN_FIELDS: ImportField[] = ['year', 'division', 'district', 'upazila']

/**
 * খালি ঘরে উপরের সারির মান বসানো (fill-down) — শুধু FILL_DOWN_FIELDS এ ম্যাপ করা কলামে।
 * নাম/ঠিকানা/লিঙ্ক/সিরিয়ালে কখনো নয়। ফেরত: নতুন অ্যারে (মূল অপরিবর্তিত), সাথে কতটি ঘর ভরা হলো।
 */
export function fillDown(rows: string[][], mapping: Mapping): { rows: string[][]; filled: number } {
  const cols = FILL_DOWN_FIELDS.map((f) => mapping.indexOf(f)).filter((i) => i !== -1)
  if (!cols.length) return { rows, filled: 0 }
  const last: Record<number, string> = {}
  let filled = 0
  const out = rows.map((r) => {
    const copy = [...r]
    for (const c of cols) {
      const v = (copy[c] ?? '').trim()
      if (v) last[c] = v
      else if (last[c]) {
        copy[c] = last[c]
        filled++
      }
    }
    return copy
  })
  return { rows: out, filled }
}

/** ফাইলের সারি → সিস্টেম ফিল্ড, ভ্যালিডেশন, ভৌগোলিক মিল, ডুপ্লিকেট সতর্কতা */
export function analyzeRows(
  fileRows: string[][],
  mapping: Mapping,
  opts: { geoFixes: Record<string, string>; serialFromFile: boolean; startSerial: number },
): ImportAnalysis {
  const col = (field: ImportField) => mapping.indexOf(field)
  const hasSerialColumn = col('serial_no') !== -1

  const rows: ImportRow[] = fileRows.map((cells, i) => {
    const get = (field: ImportField) => {
      const c = col(field)
      return c === -1 ? '' : (cells[c] ?? '')
    }
    const raw = Object.fromEntries((['serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'address', 'prev_photo_source', 'current_photo_source'] as ImportField[]).map((f) => [f, get(f)])) as Record<ImportField, string>
    const errors: string[] = []
    const warnings: string[] = []

    // সিরিয়াল
    let serial: number | null = null
    if (opts.serialFromFile && hasSerialColumn) {
      const n = toInt(raw.serial_no)
      if (n === null) errors.push(tr('সিরিয়াল ফাঁকা'))
      else if (Number.isNaN(n) || n < 1) errors.push(tr('সিরিয়াল অবৈধ: "{v}"', { v: raw.serial_no }))
      else serial = n
    } else {
      serial = opts.startSerial + i
    }

    // সাল
    const year = toInt(raw.year)
    if (year === null) errors.push(tr('সাল ফাঁকা'))
    else if (Number.isNaN(year) || year < 2000 || year > 2100) errors.push(tr('সাল অবৈধ: "{v}"', { v: raw.year }))

    // নাম
    const name = nfc(raw.name)
    if (!name) errors.push(tr('নাম ফাঁকা'))
    else if (name.length > 200) errors.push(tr('নাম ২০০ অক্ষরের বেশি'))

    const father = nfc(raw.father_or_husband_name)
    const address = nfc(raw.address)

    // ভৌগোলিক
    const geo = resolveGeo(raw.division, raw.district, raw.upazila, opts.geoFixes)
    if (!nfc(raw.division) && !geo.division) errors.push(tr('বিভাগ ফাঁকা'))
    if (!nfc(raw.district) && !geo.district) errors.push(tr('জেলা ফাঁকা'))
    if (!nfc(raw.upazila) && !geo.upazila) errors.push(tr('উপজেলা ফাঁকা'))
    const levelLabel = (l: 'division' | 'district' | 'upazila') => tr(l === 'division' ? 'বিভাগ' : l === 'district' ? 'জেলা' : 'উপজেলা')
    for (const u of geo.unresolved) {
      errors.push(tr('{level} মেলেনি: "{raw}"', { level: levelLabel(u.level), raw: u.raw }))
    }
    if (geo.corrected.length) warnings.push(tr('ভৌগোলিক নাম স্বয়ংক্রিয় সংশোধিত ({levels})', { levels: geo.corrected.map(levelLabel).join(', ') }))

    // লিঙ্ক
    const link = (s: string) => {
      const t = s.trim()
      if (!t) return null
      if (!/^https?:\/\//i.test(t)) {
        warnings.push(tr('ছবির লিঙ্ক http(s) নয়: "{v}"', { v: t.slice(0, 40) }))
        return null
      }
      return t
    }

    return {
      rowNo: i + 2,
      raw,
      values: {
        serial_no: serial,
        year: year !== null && !Number.isNaN(year) ? year : null,
        name,
        father_or_husband_name: father,
        division: geo.division,
        district: geo.district,
        upazila: geo.upazila,
        address,
        prev_photo_source: link(raw.prev_photo_source),
        current_photo_source: link(raw.current_photo_source),
      },
      geo,
      errors,
      warnings,
    }
  })

  // সিরিয়াল ডুপ্লিকেট (ফাইলের ভেতরে)
  if (opts.serialFromFile && hasSerialColumn) {
    const seen = new Map<number, number>()
    for (const r of rows) {
      const s = r.values.serial_no
      if (s === null) continue
      const first = seen.get(s)
      if (first !== undefined) r.errors.push(tr('সিরিয়াল {s} ডুপ্লিকেট (সারি {first} এও আছে)', { s, first }))
      else seen.set(s, r.rowNo)
    }
  }

  // ডুপ্লিকেট ব্যক্তি সতর্কতা: নাম + পিতা/স্বামী + উপজেলা
  const personKey = new Map<string, number>()
  for (const r of rows) {
    if (!r.values.name) continue
    const k = [r.values.name, r.values.father_or_husband_name, r.values.upazila ?? nfc(r.raw.upazila)].map((x) => x.toLowerCase().replace(/\s+/g, '')).join('|')
    const first = personKey.get(k)
    if (first !== undefined) r.warnings.push(tr('সম্ভাব্য ডুপ্লিকেট ব্যক্তি (সারি {first} এর সাথে নাম/পিতা/উপজেলা মিল)', { first }))
    else personKey.set(k, r.rowNo)
  }

  // না-মেলা ভৌগোলিক নাম একত্র
  const unresolvedMap = new Map<string, ImportAnalysis['unresolvedGeo'][number]>()
  for (const r of rows) {
    for (const u of r.geo.unresolved) {
      const parent = u.level === 'division' ? '' : u.level === 'district' ? (r.geo.division ?? '') : (r.geo.district ?? '')
      const key = `${u.level}|${parent}|${u.raw}`
      const cur = unresolvedMap.get(key)
      if (cur) cur.count++
      else unresolvedMap.set(key, { key, level: u.level, raw: u.raw, parent, suggestions: u.suggestions, count: 1 })
    }
  }

  const errorCount = rows.filter((r) => r.errors.length).length
  return {
    rows,
    hasSerialColumn,
    validCount: rows.length - errorCount,
    errorCount,
    warningCount: rows.filter((r) => r.warnings.length).length,
    unresolvedGeo: [...unresolvedMap.values()].sort((a, b) => b.count - a.count),
  }
}
