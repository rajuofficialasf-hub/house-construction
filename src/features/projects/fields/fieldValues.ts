/**
 * ফিল্ডের মানের নিয়ম (পর্ব ২, পরিকল্পনা §৫.৪) — React ছাড়া: parse/format/toCsv/toInput আর ত্রুটির বার্তা।
 * রেজিস্ট্রি (কম্পোনেন্টসহ): ./fieldTypes.ts · সার্ভারের প্রতিরূপ: supabase/sql/10b_project_guards.sql › housing_field_value()।
 * দুই জায়গার নিয়ম এক (M-ধাপ ৫খ-এ লোকাল Postgres এ ৩৩টি মানে মিলিয়ে দেখা: সীমা, NFC, ফাঁকা, বাংলা অঙ্ক, টাকা, দশমিক, তারিখ)।
 * পার্থক্য শুধু ইচ্ছাকৃত: ক্লায়েন্ট শীট/ফর্মের লেখা ("১০,০০০/-", "15/03/2025") পড়ে **সংখ্যা/ISO তারিখ বানিয়ে** পাঠায়;
 * সার্ভার শুধু সেই রূপ নেয়।
 * format বর্তমান ভাষায় (t()/সংখ্যার মতোই i18n মডিউলের ভাষা)। toCsv যন্ত্র-পাঠযোগ্য (ইংরেজি অঙ্ক, কমা নেই, তারিখ ISO)।
 */
import type { FieldType, FieldVisibility } from '@/backend'
import { t } from '@/i18n'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { MONEY_MAX, asciiDigits, formatTaka, parseBanglaNumber } from '@/lib/money'

/** সংরক্ষিত মান: লেখা (text/long_text/category/phone/date) বা সংখ্যা (number/money) */
export type FieldValue = string | number

/** একটি ফিল্ডের সংজ্ঞা — সিস্টেম ফিল্ড (systemFields.ts) ও কাস্টম ফিল্ড (project_fields) একই আকারে (resolveFields.ts) */
export interface FieldDef {
  key: string
  /** system = রেকর্ডের নিজস্ব কলাম; extra = কাস্টম পাবলিক (record.extra); private = গোপন (beneficiary_private) */
  source: 'system' | 'extra' | 'private'
  type: FieldType
  label_bn: string
  label_en: string
  help_bn: string
  help_en: string
  required: boolean
  visibility: FieldVisibility
  max_length: number | null
  min_value: number | null
  max_value: number | null
  /** number: শুধু পূর্ণসংখ্যা (যেমন সাল) */
  integer?: boolean
  /** number: কমা ছাড়া দেখানো (যেমন সাল ২০২৪, "২,০২৪" নয়) */
  plain?: boolean
  /** সিস্টেমের ভূগোল-ফিল্ড — ফর্মে ড্রপডাউন/কম্বোবক্স (M-ধাপ ১০), ইম্পোর্টে geoMatch */
  geo?: 'division' | 'district' | 'upazila' | 'union'
  show_in_table: boolean
  show_in_card: boolean
  show_in_detail: boolean
  filterable: boolean
  searchable: boolean
  fill_down: boolean
  import_aliases: string[]
  sort_order: number
  is_active: boolean
}

export type FieldErrorCode =
  | 'required'
  | 'too_long'
  | 'not_number'
  | 'not_integer'
  | 'money_fraction'
  | 'money_range'
  | 'decimals'
  | 'min'
  | 'max'
  | 'phone'
  | 'date'

export interface FieldError {
  code: FieldErrorCode
  /** বার্তার জন্য: সীমা ইত্যাদি */
  limit?: number
}

export type ParseResult = { ok: true; value: FieldValue | null } | { ok: false; error: FieldError }

/** একটি ধরনের মানের নিয়ম (কম্পোনেন্ট ছাড়া) */
export interface FieldValueSpec {
  label_bn: string
  label_en: string
  /** টেবিলে সাজানো: সংখ্যা/টাকা ডানে */
  align: 'left' | 'right'
  parse(raw: unknown, def: FieldDef): ParseResult
  format(value: FieldValue | null | undefined, def: FieldDef): string
  toCsv(value: FieldValue | null | undefined, def: FieldDef): string
  toInput(value: FieldValue | null | undefined, def: FieldDef): string
}

// ---------------------------------------------------------------- সহায়ক
const ok = (value: FieldValue | null): ParseResult => ({ ok: true, value })
const fail = (code: FieldErrorCode, limit?: number): ParseResult => ({ ok: false, error: { code, limit } })

function rawText(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  return String(raw).normalize('NFC').trim()
}

/** খালি হলে: আবশ্যক → ত্রুটি, নইলে null (মান নেই) */
const empty = (def: FieldDef): ParseResult => (def.required ? fail('required') : ok(null))

function textParser(defaultMax: number, normalize: (s: string) => string = (s) => s) {
  return (raw: unknown, def: FieldDef): ParseResult => {
    const s = normalize(rawText(raw))
    if (s === '') return empty(def)
    const lim = def.max_length ?? defaultMax
    if (s.length > lim) return fail('too_long', lim)
    return ok(s)
  }
}

const str = (v: FieldValue | null | undefined) => (v === null || v === undefined ? '' : String(v))

function numberParser(money: boolean) {
  return (raw: unknown, def: FieldDef): ParseResult => {
    const n = parseBanglaNumber(typeof raw === 'number' ? raw : rawText(raw))
    if (n === null) return empty(def)
    if (Number.isNaN(n)) return fail('not_number')
    if (money) {
      if (!Number.isInteger(n)) return fail('money_fraction')
      if (n < 0 || n > MONEY_MAX) return fail('money_range')
    } else if (def.integer && !Number.isInteger(n)) {
      return fail('not_integer')
    } else if (Math.round(n * 100) / 100 !== n) {
      return fail('decimals')
    }
    if (def.min_value !== null && n < def.min_value) return fail('min', def.min_value)
    if (def.max_value !== null && n > def.max_value) return fail('max', def.max_value)
    return ok(n)
  }
}

/** YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (বাংলা অঙ্কও) → ISO; অবৈধ তারিখ → null */
export function parseDate(s: string): string | null {
  const a = asciiDigits(s).trim()
  let y: number, m: number, d: number
  let mm = a.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (mm) [y, m, d] = [Number(mm[1]), Number(mm[2]), Number(mm[3])]
  else if ((mm = a.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, y] = [Number(mm[1]), Number(mm[2]), Number(mm[3])]
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const numberFormat = (v: FieldValue | null | undefined, def: FieldDef) => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return def.plain ? toBanglaNumber(n) : formatBanglaNumber(n)
}

/** CSV এ সংখ্যা: ইংরেজি অঙ্ক, কমা নেই */
const numberCsv = (v: FieldValue | null | undefined) => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v)
}

// ---------------------------------------------------------------- রেজিস্ট্রি
export const FIELD_VALUE_SPECS: Record<FieldType, FieldValueSpec> = {
  text: {
    label_bn: 'লেখা',
    label_en: 'Text',
    align: 'left',
    parse: textParser(500),
    format: (v) => str(v),
    toCsv: (v) => str(v),
    toInput: (v) => str(v),
  },
  long_text: {
    label_bn: 'বড় লেখা',
    label_en: 'Long text',
    align: 'left',
    parse: textParser(2000),
    format: (v) => str(v),
    toCsv: (v) => str(v),
    toInput: (v) => str(v),
  },
  number: {
    label_bn: 'সংখ্যা',
    label_en: 'Number',
    align: 'right',
    parse: numberParser(false),
    format: numberFormat,
    toCsv: numberCsv,
    toInput: numberCsv,
  },
  money: {
    label_bn: 'টাকা',
    label_en: 'Money',
    align: 'right',
    parse: numberParser(true),
    format: (v) => (v === null || v === undefined || v === '' ? '' : formatTaka(Number(v))),
    toCsv: numberCsv,
    toInput: numberCsv,
  },
  category: {
    label_bn: 'ক্যাটাগরি (শীটের লেখা থেকে)',
    label_en: 'Category (from the sheet)',
    align: 'left',
    // সার্ভারের মতো: NFC, দুই পাশের ফাঁকা বাদ, একাধিক ফাঁকা → একটি; ইংরেজি মোডেও যেমন লেখা তেমন দেখায়
    parse: textParser(100, (s) => s.replace(/\s+/g, ' ')),
    format: (v) => str(v),
    toCsv: (v) => str(v),
    toInput: (v) => str(v),
  },
  date: {
    label_bn: 'তারিখ',
    label_en: 'Date',
    align: 'left',
    parse: (raw, def) => {
      const s = rawText(raw)
      if (s === '') return empty(def)
      const iso = parseDate(s)
      return iso ? ok(iso) : fail('date')
    },
    format: (v) => {
      const iso = typeof v === 'string' ? parseDate(v) : null
      if (!iso) return str(v)
      const [y, m, d] = iso.split('-')
      return toBanglaNumber(`${d}/${m}/${y}`)
    },
    toCsv: (v) => (typeof v === 'string' ? (parseDate(v) ?? v) : str(v)),
    toInput: (v) => (typeof v === 'string' ? (parseDate(v) ?? '') : ''),
  },
  phone: {
    label_bn: 'মোবাইল নম্বর (সবসময় গোপন)',
    label_en: 'Mobile number (always private)',
    align: 'left',
    parse: (raw, def) => {
      const s = asciiDigits(rawText(raw))
      if (s === '') return empty(def)
      if (!/^[0-9+\- ]{6,20}$/.test(s)) return fail('phone')
      const lim = def.max_length ?? 500
      if (s.length > lim) return fail('too_long', lim)
      return ok(s)
    },
    format: (v) => str(v),
    toCsv: (v) => str(v),
    toInput: (v) => str(v),
  },
}

export function valueSpec(type: FieldType): FieldValueSpec {
  return FIELD_VALUE_SPECS[type] ?? FIELD_VALUE_SPECS.text
}

/** সংক্ষেপ: parseField(def, raw) = valueSpec(def.type).parse(raw, def) */
export function parseField(def: FieldDef, raw: unknown): ParseResult {
  return valueSpec(def.type).parse(raw, def)
}

export function formatField(def: FieldDef, value: FieldValue | null | undefined): string {
  return valueSpec(def.type).format(value, def)
}

export function fieldToCsv(def: FieldDef, value: FieldValue | null | undefined): string {
  return valueSpec(def.type).toCsv(value, def)
}

/** ত্রুটির বাংলা/ইংরেজি বার্তা (ফর্মের ঘরের নিচে, ইম্পোর্টের প্রিভিউতে) */
export function fieldErrorMessage(err: FieldError): string {
  const n = err.limit === undefined ? '' : toBanglaNumber(err.limit)
  switch (err.code) {
    case 'required':
      return t('আবশ্যক')
    case 'too_long':
      return t('লেখা বেশি লম্বা (সর্বোচ্চ {n} অক্ষর)', { n })
    case 'not_number':
      return t('শুধু সংখ্যা দিন (যেমন ১০০০০)')
    case 'not_integer':
      return t('পূর্ণসংখ্যা দিন')
    case 'money_fraction':
      return t('টাকা পূর্ণসংখ্যায় দিন (পয়সা নয়)')
    case 'money_range':
      return t('টাকার পরিমাণ ০ থেকে ১০০০ কোটির মধ্যে হতে হবে')
    case 'decimals':
      return t('সর্বোচ্চ ২ ঘর দশমিক')
    case 'min':
      return t('সর্বনিম্ন {n}', { n })
    case 'max':
      return t('সর্বোচ্চ {n}', { n })
    case 'phone':
      return t('সঠিক মোবাইল নম্বর দিন')
    case 'date':
      return t('সঠিক তারিখ দিন (যেমন ১৫/০৩/২০২৫)')
  }
}
