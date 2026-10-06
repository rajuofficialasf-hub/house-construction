/**
 * ইম্পোর্টের সারি বিশ্লেষণ (M-ধাপ ১১; আগে features/housing/utils/importValidate.ts) — ফিল্ড-টাইপ রেজিস্ট্রি দিয়ে:
 *   সিস্টেম ফিল্ড আগের নিয়মে (ঘর নির্মাণের প্রিভিউ আগের মতো), ভূগোল resolveGeo (ইউনিয়নসহ — ৪র্থ স্তর),
 *   কাস্টম ফিল্ড parseField (টাকা "১,২০,০০০"/"১২০০০০/-" → 120000; না পারলে সারিতে লাল), ক্যাটাগরি যেমন লেখা
 *   (চাইলে CategoryReviewPanel এর এক-বানান), গোপন মান আলাদা।
 * "সিরিয়াল ধরে আপডেট" মোড: শুধু সিরিয়াল আবশ্যক; খালি ঘর = অপরিবর্তিত; "(মুছুন)" = মান মোছা (_clear);
 *   আবশ্যক ঘর মোছা যায় না; গোপন মান এভাবে মোছা যায় না (রেকর্ডের ফর্মে মুছুন)।
 */
import { t as tr } from '@/i18n'
import type { ExtraValues } from '@/backend'
import { nfc } from '@/features/geo/geo'
import { geoFixKey, resolveGeo, type ResolvedGeo } from '@/features/geo/geoMatch'
import type { UnionData } from '@/features/geo/unions'
import { fieldErrorMessage, parseField } from '@/features/projects/fields'
import type { ImportFieldDef, ImportFieldId } from './importFields'

export type Mapping = (ImportFieldId | null)[]
export type ImportMode = 'insert' | 'update'

/** শীটে এই লেখা থাকলে (আপডেট মোডে) মান মোছে */
export const CLEAR_TOKEN = '(মুছুন)'
const isClear = (s: string) => nfc(s).replace(/\s+/g, '') === CLEAR_TOKEN.replace(/\s+/g, '')

export interface ImportRowValues {
  serial_no: number | null
  year: number | null
  name: string
  father_or_husband_name: string
  division: string | null
  district: string | null
  upazila: string | null
  union_name: string
  address: string
  prev_photo_source: string | null
  current_photo_source: string | null
}

export interface ImportRow {
  /** ফাইলে সারি নম্বর (হেডার = ১, তাই প্রথম ডাটা সারি = ২) */
  rowNo: number
  /** ফিল্ড-id → ঘরের লেখা (ম্যাপ না হলে '') */
  raw: Record<string, string>
  values: ImportRowValues
  /** কাস্টম পাবলিক মান (পার্স করা) */
  extra: ExtraValues
  /** গোপন মান — আলাদা পাঠানো হয় */
  priv: ExtraValues
  /** আপডেট মোডে: কোন ঘর পাঠানো হবে (ম্যাপ করা ও খালি নয়) */
  present: Set<ImportFieldId>
  /** আপডেট মোডে "(মুছুন)": 'address', 'extra.item_name' … */
  clear: string[]
  /** যে ঘরের মান ভুল (প্রিভিউতে লাল) */
  bad: Set<ImportFieldId>
  geo: ResolvedGeo
  errors: string[]
  warnings: string[]
}

export type GeoFixLevel = 'division' | 'district' | 'upazila' | 'union'
export interface UnresolvedGeo {
  key: string
  level: GeoFixLevel
  raw: string
  parent: string
  suggestions: string[]
  count: number
  /** ইউনিয়ন: তালিকায় নেই — ঐচ্ছিক (সংরক্ষণ আটকায় না) */
  optional: boolean
}

export interface ImportAnalysis {
  rows: ImportRow[]
  hasSerialColumn: boolean
  validCount: number
  errorCount: number
  warningCount: number
  /** স্বতন্ত্র না-মেলা ভৌগোলিক নাম (ম্যানুয়াল ঠিক করার প্যানেল) — ইউনিয়নসহ ৪ স্তর */
  unresolvedGeo: UnresolvedGeo[]
}

const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim()

function toInt(s: string): number | null {
  const t = ascii(s).replace(/[,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) ? n : Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : NaN
}

/** উপরের সারির মান নেওয়া যায় এমন ফিল্ড: প্রকল্পের ফিল্ডে "ইম্পোর্টে ফিল-ডাউন" (সিস্টেমে সাল/বিভাগ/জেলা/উপজেলা) */
export function fillDownFields(fields: readonly ImportFieldDef[]): ImportFieldId[] {
  return fields.filter((f) => f.def?.fill_down).map((f) => f.id)
}

/**
 * খালি ঘরে উপরের সারির মান (fill-down) — শুধু ফিল-ডাউন ফিল্ডে ম্যাপ করা কলামে; নাম/ঠিকানা/লিঙ্ক/সিরিয়ালে কখনো নয়।
 * ফেরত: নতুন অ্যারে (মূল অপরিবর্তিত), সাথে কতটি ঘর ভরা হলো।
 */
export function fillDown(rows: string[][], mapping: Mapping, ids: readonly ImportFieldId[]): { rows: string[][]; filled: number } {
  const cols = ids.map((f) => mapping.indexOf(f)).filter((i) => i !== -1)
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

export interface AnalyzeOptions {
  mode: ImportMode
  geoFixes: Record<string, string>
  serialFromFile: boolean
  startSerial: number
  /** ইউনিয়নের তালিকা (lazy) — না থাকলে ইউনিয়ন যেমন লেখা তেমন */
  unions?: UnionData | null
  /** ক্যাটাগরির এক-বানান: ফিল্ডের key → { শীটের মান → যে বানানে } */
  categoryFixes?: Record<string, Record<string, string>>
}

const SYSTEM_TEXT: ImportFieldId[] = ['father_or_husband_name', 'address']

/** ফাইলের সারি → ফিল্ড, যাচাই, ভৌগোলিক মিল, ডুপ্লিকেট সতর্কতা */
export function analyzeRows(fileRows: string[][], mapping: Mapping, fields: readonly ImportFieldDef[], opts: AnalyzeOptions): ImportAnalysis {
  const update = opts.mode === 'update'
  const col = (id: ImportFieldId) => mapping.indexOf(id)
  const hasSerialColumn = col('serial_no') !== -1
  const byId = new Map(fields.map((f) => [f.id, f]))
  const custom = fields.filter((f) => f.id.startsWith('x.') && col(f.id) !== -1)
  const unionField = byId.get('union_name')
  const levelLabel = (l: GeoFixLevel) => tr(l === 'division' ? 'বিভাগ' : l === 'district' ? 'জেলা' : l === 'upazila' ? 'উপজেলা' : 'ইউনিয়ন')

  const rows: ImportRow[] = fileRows.map((cells, i) => {
    const raw: Record<string, string> = {}
    for (const f of fields) raw[f.id] = col(f.id) === -1 ? '' : (cells[col(f.id)] ?? '')
    const errors: string[] = []
    const warnings: string[] = []
    const bad = new Set<ImportFieldId>()
    const present = new Set<ImportFieldId>()
    const clear: string[] = []
    const mapped = (id: ImportFieldId) => col(id) !== -1
    const cleared = (id: ImportFieldId, clearKey: string) => {
      if (!update || !mapped(id) || !isClear(raw[id])) return false
      const f = byId.get(id)
      if (f?.required || (f?.def?.source === 'system' && ['year', 'name', 'division', 'district', 'upazila'].includes(id))) {
        errors.push(tr('«{label}» আবশ্যক — মোছা যায় না', { label: f?.label_bn ?? id }))
        bad.add(id)
      } else if (f?.private) {
        warnings.push(tr('«{label}» গোপন — "(মুছুন)" এখানে চলে না, রেকর্ডের ফর্মে মুছুন', { label: f.label_bn }))
      } else clear.push(clearKey)
      return true
    }
    /** আপডেট মোডে খালি = অপরিবর্তিত */
    const given = (id: ImportFieldId) => mapped(id) && nfc(raw[id]) !== ''

    // সিরিয়াল
    let serial: number | null = null
    if ((opts.serialFromFile || update) && hasSerialColumn) {
      const n = toInt(raw.serial_no)
      if (n === null) errors.push(tr('সিরিয়াল ফাঁকা'))
      else if (Number.isNaN(n) || n < 1) errors.push(tr('সিরিয়াল অবৈধ: "{v}"', { v: raw.serial_no }))
      else serial = n
    } else {
      serial = opts.startSerial + i
    }

    // সাল
    let year: number | null = null
    // আবশ্যক ঘরে "(মুছুন)" → ভুল (cleared() এর ভেতরে); তখন মানটি পাঠানো হয় না
    if (cleared('year', 'year')) {
      /* ভুল যোগ হয়েছে */
    } else if (!update || given('year')) {
      const y = toInt(raw.year)
      if (y === null) errors.push(tr('সাল ফাঁকা'))
      else if (Number.isNaN(y) || y < 2000 || y > 2100) errors.push(tr('সাল অবৈধ: "{v}"', { v: raw.year }))
      else year = y
      if (update) present.add('year')
    }

    // নাম
    const name = nfc(raw.name)
    if (cleared('name', 'name')) {
      /* ভুল যোগ হয়েছে */
    } else if (!update || given('name')) {
      if (!name) errors.push(tr('নাম ফাঁকা'))
      else if (name.length > 200) errors.push(tr('নাম ২০০ অক্ষরের বেশি'))
      if (update) present.add('name')
    }

    const father = nfc(raw.father_or_husband_name)
    const address = nfc(raw.address)
    for (const id of SYSTEM_TEXT) {
      if (cleared(id, id)) continue
      if (given(id)) present.add(id)
      const def = byId.get(id)?.def
      if (!update && def?.required && !nfc(raw[id])) errors.push(tr('«{label}» ফাঁকা', { label: def.label_bn }))
    }

    // ভৌগোলিক (৪ স্তর)
    const geoCleared = (['division', 'district', 'upazila'] as const).map((id) => cleared(id, id)).some(Boolean)
    const anyGeo = !geoCleared && (given('division') || given('district') || given('upazila'))
    const unionRaw = unionField && mapped('union_name') && !isClear(raw.union_name) ? raw.union_name : undefined
    const geo = resolveGeo(raw.division, raw.district, raw.upazila, opts.geoFixes, unionField ? { union: unionRaw ?? '', unions: opts.unions } : {})
    if (!update || anyGeo) {
      if (!nfc(raw.division) && !geo.division) errors.push(tr('বিভাগ ফাঁকা'))
      if (!nfc(raw.district) && !geo.district) errors.push(tr('জেলা ফাঁকা'))
      if (!nfc(raw.upazila) && !geo.upazila) errors.push(tr('উপজেলা ফাঁকা'))
      for (const u of geo.unresolved) errors.push(tr('{level} মেলেনি: "{raw}"', { level: levelLabel(u.level), raw: u.raw }))
      if (geo.corrected.length) warnings.push(tr('ভৌগোলিক নাম স্বয়ংক্রিয় সংশোধিত ({levels})', { levels: geo.corrected.map(levelLabel).join(', ') }))
      if (update) for (const id of ['division', 'district', 'upazila'] as const) present.add(id)
    }
    // ইউনিয়ন: তালিকায় নেই → সতর্কতা (আটকায় না); প্যানেলে বেছে দিলে সেই নাম
    let unionName = ''
    if (unionField) {
      if (!cleared('union_name', 'union_name')) {
        const fixKey = geoFixKey('union', nfc(raw.union_name), geo.upazila ?? '')
        const fixed = opts.geoFixes[fixKey]
        unionName = fixed ?? geo.union?.value ?? ''
        if (!fixed && geo.union?.status === 'unlisted') warnings.push(tr('ইউনিয়ন "{v}" তালিকায় নেই (রাখা যায়)', { v: geo.union.value ?? '' }))
        if (geo.union?.status === 'corrected') warnings.push(tr('ইউনিয়নের বানান তালিকা অনুযায়ী: "{v}"', { v: unionName }))
        if (unionName.length > 100) {
          errors.push(tr('ইউনিয়ন ১০০ অক্ষরের বেশি'))
          bad.add('union_name')
        }
        if (!update && unionField.required && !unionName) errors.push(tr('«{label}» ফাঁকা', { label: unionField.label_bn }))
        if (given('union_name')) present.add('union_name')
      }
    }

    // ছবির লিঙ্ক
    const link = (id: 'prev_photo_source' | 'current_photo_source') => {
      if (cleared(id, id)) return null
      const t = raw[id].trim()
      if (!t) return null
      if (!/^https?:\/\//i.test(t)) {
        warnings.push(tr('ছবির লিঙ্ক http(s) নয়: "{v}"', { v: t.slice(0, 40) }))
        return null
      }
      present.add(id)
      return t
    }

    // কাস্টম ফিল্ড (টাকা, ক্যাটাগরি …) — পাবলিক extra, গোপন priv
    const extra: ExtraValues = {}
    const priv: ExtraValues = {}
    for (const f of custom) {
      const key = f.id.slice(2)
      if (cleared(f.id, `extra.${key}`)) continue
      let text = raw[f.id]
      const fix = opts.categoryFixes?.[key]?.[nfc(text).replace(/\s+/g, ' ')]
      if (fix) text = fix
      if (update && nfc(text) === '') continue
      const r = parseField(update ? { ...f.def!, required: false } : f.def!, text)
      if (!r.ok) {
        errors.push(tr('«{label}»: {msg}', { label: f.label_bn, msg: fieldErrorMessage(r.error) }))
        bad.add(f.id)
        continue
      }
      if (r.value === null) continue
      ;(f.private ? priv : extra)[key] = r.value
      present.add(f.id)
    }

    return {
      rowNo: i + 2,
      raw,
      values: {
        serial_no: serial,
        year,
        name,
        father_or_husband_name: father,
        division: geo.division,
        district: geo.district,
        upazila: geo.upazila,
        union_name: unionName,
        address,
        prev_photo_source: byId.has('prev_photo_source') ? link('prev_photo_source') : null,
        current_photo_source: byId.has('current_photo_source') ? link('current_photo_source') : null,
      },
      extra,
      priv,
      present,
      clear,
      bad,
      geo,
      errors,
      warnings,
    }
  })

  // সিরিয়াল ডুপ্লিকেট (ফাইলের ভেতরে)
  if ((opts.serialFromFile || update) && hasSerialColumn) {
    const seen = new Map<number, number>()
    for (const r of rows) {
      const s = r.values.serial_no
      if (s === null) continue
      const first = seen.get(s)
      if (first !== undefined) r.errors.push(tr('সিরিয়াল {s} ডুপ্লিকেট (সারি {first} এও আছে)', { s, first }))
      else seen.set(s, r.rowNo)
    }
  }

  // ডুপ্লিকেট ব্যক্তি সতর্কতা: নাম + পিতা/স্বামী + সবচেয়ে নিচের ঠিকানা-স্তর (ইউনিয়ন থাকলে ইউনিয়ন, নইলে উপজেলা)
  const personKey = new Map<string, number>()
  for (const r of rows) {
    if (!r.values.name) continue
    const lowest = r.values.union_name ? `${r.values.upazila ?? ''}/${r.values.union_name}` : (r.values.upazila ?? nfc(r.raw.upazila))
    const k = [r.values.name, r.values.father_or_husband_name, lowest].map((x) => x.toLowerCase().replace(/\s+/g, '')).join('|')
    const first = personKey.get(k)
    if (first !== undefined) r.warnings.push(tr('সম্ভাব্য ডুপ্লিকেট ব্যক্তি (সারি {first} এর সাথে নাম/পিতা/ঠিকানা মিল)', { first }))
    else personKey.set(k, r.rowNo)
  }

  // না-মেলা ভৌগোলিক নাম একত্র (ইউনিয়ন: ঐচ্ছিক)
  const unresolvedMap = new Map<string, UnresolvedGeo>()
  const add = (level: GeoFixLevel, raw: string, parent: string, suggestions: string[], optional: boolean) => {
    const key = `${level}|${parent}|${raw}`
    const cur = unresolvedMap.get(key)
    if (cur) cur.count++
    else unresolvedMap.set(key, { key, level, raw, parent, suggestions, count: 1, optional })
  }
  for (const r of rows) {
    for (const u of r.geo.unresolved) {
      const parent = u.level === 'division' ? '' : u.level === 'district' ? (r.geo.division ?? '') : (r.geo.district ?? '')
      add(u.level, u.raw, parent, u.suggestions, false)
    }
    if (r.geo.union?.status === 'unlisted' && r.geo.upazila) add('union', nfc(r.raw.union_name), r.geo.upazila, r.geo.union.suggestions, true)
  }

  const errorCount = rows.filter((r) => r.errors.length).length
  return {
    rows,
    hasSerialColumn,
    validCount: rows.length - errorCount,
    errorCount,
    warningCount: rows.filter((r) => r.warnings.length).length,
    unresolvedGeo: [...unresolvedMap.values()].sort((a, b) => Number(a.optional) - Number(b.optional) || b.count - a.count),
  }
}
