import { describe, expect, it } from 'vitest'
import { FALLBACK_PROJECTS, type Project, type ProjectField } from '@/backend'
import { BD_GEO } from '@/features/geo/data/bdGeo'
import { analyzeRows, CLEAR_TOKEN, fillDown, fillDownFields, type AnalyzeOptions, type Mapping } from './importAnalyze'
import { buildImportFields, type ImportFieldId } from './importFields'

// How the import wizard turns sheet rows into records: serials, required cells, geography, custom and
// private values, update mode with "(মুছুন)", category spelling fixes, and the duplicate checks.

const DV = BD_GEO[0]!
const DS = DV.districts[0]!
const UP = DS.upazilas[0]!

function field(over: Partial<ProjectField> & Pick<ProjectField, 'key' | 'label_bn' | 'type'>): ProjectField {
  return {
    id: `id-${over.key}`,
    project_key: 'demo',
    label_en: '',
    help_bn: '',
    help_en: '',
    options: [],
    required: false,
    visibility: 'public',
    show_in_table: false,
    show_in_card: false,
    show_in_detail: true,
    filterable: false,
    searchable: false,
    fill_down: false,
    max_length: null,
    min_value: null,
    max_value: null,
    import_aliases: [],
    sort_order: 10,
    is_active: true,
    created_at: '2026-10-06T00:00:00Z',
    updated_at: '2026-10-06T00:00:00Z',
    ...over,
  }
}

const demo: Project = {
  ...FALLBACK_PROJECTS.find((p) => p.key === 'semi_pucca')!,
  key: 'demo',
  photo_mode: 'after_only',
  geo_depth: 'upazila',
  fields: [
    field({ key: 'amount', label_bn: 'অনুদান', type: 'money', sort_order: 10 }),
    field({ key: 'trade', label_bn: 'পেশা', type: 'category', sort_order: 20 }),
    field({ key: 'phone', label_bn: 'ফোন', type: 'phone', visibility: 'admin', sort_order: 30 }),
  ],
}
const fields = buildImportFields(demo)

const COLUMNS: ImportFieldId[] = ['serial_no', 'year', 'name', 'division', 'district', 'upazila', 'x.amount', 'x.trade', 'x.phone', 'current_photo_source']
const mapping: Mapping = COLUMNS

/** One sheet row in COLUMNS order, with a valid place and year unless overridden. */
function row(over: Partial<Record<ImportFieldId, string>> = {}): string[] {
  const base: Partial<Record<ImportFieldId, string>> = { year: '২০২৫', name: 'রহিমা খাতুন', division: DV.name, district: DS.name, upazila: UP.name }
  return COLUMNS.map((c) => ({ ...base, ...over })[c] ?? '')
}

const insert: AnalyzeOptions = { mode: 'insert', geoFixes: {}, serialFromFile: false, startSerial: 41 }
const update: AnalyzeOptions = { ...insert, mode: 'update' }

describe('analyzeRows in insert mode', () => {
  it('turns a valid row into values, parsed custom values and separate private values', () => {
    const [r] = analyzeRows([row({ 'x.amount': '১,২০,০০০', 'x.trade': ' দর্জি ', 'x.phone': '০১৭০০০০০০০১' })], mapping, fields, insert).rows
    expect(r!.errors).toEqual([])
    expect(r!.rowNo).toBe(2)
    expect(r!.values).toMatchObject({ serial_no: 41, year: 2025, name: 'রহিমা খাতুন', division: DV.name, district: DS.name, upazila: UP.name })
    expect(r!.extra).toEqual({ amount: 120000, trade: 'দর্জি' })
    expect(r!.priv).toEqual({ phone: '01700000001' })
  })

  it('numbers rows from the start serial when the file\'s serials are not used', () => {
    const rows = analyzeRows([row({ serial_no: '7' }), row({ serial_no: '8', name: 'অন্য' })], mapping, fields, insert).rows
    expect(rows.map((r) => r.values.serial_no)).toEqual([41, 42])
  })

  it('takes the file\'s serials when asked, refusing a blank, an invalid and a repeated one', () => {
    const opts = { ...insert, serialFromFile: true }
    const rows = analyzeRows([row({ serial_no: '৫' }), row({ serial_no: '', name: 'খ' }), row({ serial_no: '0', name: 'গ' }), row({ serial_no: '5', name: 'ঘ' })], mapping, fields, opts).rows
    expect(rows[0]!.values.serial_no).toBe(5)
    expect(rows[1]!.errors).toContain('সিরিয়াল ফাঁকা')
    expect(rows[2]!.errors[0]).toMatch(/সিরিয়াল অবৈধ/)
    expect(rows[3]!.errors[0]).toMatch(/সিরিয়াল 5 ডুপ্লিকেট \(সারি 2 এও আছে\)/)
  })

  it('refuses a blank name, a year outside 2000-2100, an unknown place and a money value that isn\'t a number', () => {
    const a = analyzeRows([row({ name: '', year: '1999', upazila: 'কোথাও নেই', 'x.amount': 'অনেক' })], mapping, fields, insert)
    const errors = a.rows[0]!.errors.join(' | ')
    expect(errors).toMatch(/নাম ফাঁকা/)
    expect(errors).toMatch(/সাল অবৈধ/)
    expect(errors).toMatch(/উপজেলা মেলেনি/)
    expect(errors).toMatch(/«অনুদান»/)
    expect(a.rows[0]!.bad.has('x.amount')).toBe(true)
    expect(a).toMatchObject({ validCount: 0, errorCount: 1 })
    expect(a.unresolvedGeo).toEqual([expect.objectContaining({ level: 'upazila', raw: 'কোথাও নেই', count: 1, optional: false })])
  })

  it('applies a manual geography fix for a name that didn\'t match', () => {
    const [first] = analyzeRows([row({ upazila: 'কোথাও নেই' })], mapping, fields, insert).unresolvedGeo
    const fixed = analyzeRows([row({ upazila: 'কোথাও নেই' })], mapping, fields, { ...insert, geoFixes: { [first!.key]: UP.name } })
    expect(fixed.rows[0]!.errors).toEqual([])
    expect(fixed.rows[0]!.values.upazila).toBe(UP.name)
  })

  it('applies a category spelling fix before storing the value', () => {
    const opts = { ...insert, categoryFixes: { trade: { দর্জী: 'দর্জি' } } }
    expect(analyzeRows([row({ 'x.trade': 'দর্জী' })], mapping, fields, opts).rows[0]!.extra.trade).toBe('দর্জি')
  })

  it('keeps an http(s) photo link and warns about anything else', () => {
    const rows = analyzeRows([row({ current_photo_source: 'https://example.org/a.jpg' }), row({ current_photo_source: 'ftp://x', name: 'খ' })], mapping, fields, insert).rows
    expect(rows[0]!.values.current_photo_source).toBe('https://example.org/a.jpg')
    expect(rows[1]!.values.current_photo_source).toBeNull()
    expect(rows[1]!.warnings[0]).toMatch(/http\(s\) নয়/)
  })

  it('warns about a likely duplicate person in the same file without refusing it', () => {
    const a = analyzeRows([row(), row()], mapping, fields, insert)
    expect(a.rows[1]!.warnings[0]).toMatch(/সম্ভাব্য ডুপ্লিকেট ব্যক্তি \(সারি 2/)
    expect(a).toMatchObject({ validCount: 2, warningCount: 1 })
  })
})

describe('analyzeRows in update mode', () => {
  it('needs only the serial; blank cells stay unchanged and are not sent', () => {
    const [r] = analyzeRows([COLUMNS.map((c) => (c === 'serial_no' ? '3' : c === 'x.amount' ? '500' : ''))], mapping, fields, update).rows
    expect(r!.errors).toEqual([])
    expect(r!.values.serial_no).toBe(3)
    expect([...r!.present]).toEqual(['x.amount'])
    expect(r!.extra).toEqual({ amount: 500 })
  })

  it('"(মুছুন)" clears an optional cell and a custom value, but never a required one or a private value', () => {
    const cells = COLUMNS.map((c) => (c === 'serial_no' ? '3' : c === 'x.trade' || c === 'name' || c === 'x.phone' ? CLEAR_TOKEN : ''))
    const [r] = analyzeRows([cells], mapping, fields, update).rows
    expect(r!.clear).toEqual(['extra.trade'])
    expect(r!.errors.join(' ')).toMatch(/আবশ্যক — মোছা যায় না/)
    expect(r!.warnings.join(' ')).toMatch(/গোপন/)
  })

  it('refuses "(মুছুন)" for someone who may not clear values', () => {
    const cells = COLUMNS.map((c) => (c === 'serial_no' ? '3' : c === 'x.trade' ? CLEAR_TOKEN : ''))
    const [r] = analyzeRows([cells], mapping, fields, { ...update, canClear: false }).rows
    expect(r!.clear).toEqual([])
    expect(r!.errors[0]).toMatch(/মুছতে পারেন শুধু মূল এডমিন/)
    expect(r!.bad.has('x.trade')).toBe(true)
  })

  it('requires the serial column\'s value in every row', () => {
    const [r] = analyzeRows([COLUMNS.map(() => '')], mapping, fields, update).rows
    expect(r!.errors).toContain('সিরিয়াল ফাঁকা')
  })
})

describe('fillDown', () => {
  it('fills only the fill-down columns from the row above, never names', () => {
    const ids = fillDownFields(fields)
    expect(ids).toEqual(expect.arrayContaining(['year', 'division', 'district', 'upazila']))
    expect(ids).not.toContain('name')
    const sheet = [row({ name: 'ক' }), COLUMNS.map((c) => (c === 'name' ? '' : '')), COLUMNS.map((c) => (c === 'year' ? '২০২৪' : ''))]
    const { rows, filled } = fillDown(sheet, mapping, ids)
    const col = (id: ImportFieldId) => COLUMNS.indexOf(id)
    expect(rows[1]![col('district')]).toBe(DS.name)
    expect(rows[1]![col('name')]).toBe('')
    expect(rows[2]![col('year')]).toBe('২০২৪')
    expect(filled).toBe(7)
    expect(sheet[1]![col('district')]).toBe('')
  })

  it('changes nothing when no fill-down column is mapped', () => {
    const sheet = [['ক'], ['']]
    expect(fillDown(sheet, ['name'], ['year'])).toEqual({ rows: sheet, filled: 0 })
  })
})
