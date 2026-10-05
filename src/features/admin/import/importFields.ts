/**
 * ইম্পোর্টের ফিল্ড ও কলাম মেলানো (M-ধাপ ১১; আগে features/housing/utils/importColumns.ts):
 *   buildImportFields(project) — সিরিয়াল, সিস্টেম ফিল্ড (প্রকল্পের লেবেল/চালু/আবশ্যক), ইউনিয়ন (ইউনিয়ন-স্তরের প্রকল্পে),
 *     ছবির মূল লিঙ্ক (ছবি মোড অনুযায়ী), কাস্টম ফিল্ড — পাবলিক ও গোপন (লেবেল, key আর ইম্পোর্টের বিকল্প শিরোনাম)
 *   guessMapping(headers, fields) — ক্রম: ① এক্সপোর্টের তথ্য-কলাম উপেক্ষা ② হুবহু শিরোনাম ③ লম্বা বিকল্প নাম আগে
 *     (শিরোনামে থাকলে) ④ বাকিগুলো সিস্টেম ফিল্ডের পুরনো regex এ (ঘর নির্মাণের শীট আগের মতোই মেলে)
 * এক্সপোর্ট করা CSV (recordsCsv.ts) আবার দিলে সব শিরোনাম নিজে মেলে।
 */
import type { CoreFieldKey, PhotoKind, Project } from '@/backend'
import { nfc } from '@/features/geo/geo'
import { resolveFields, SYSTEM_FIELDS, type FieldDef } from '@/features/projects/fields'
import { photoKindsOf } from '../records/recordColumns'
import { photoSlotLabelBn } from '../records/recordsCsv'

/** সিস্টেম কলাম, অথবা কাস্টম ফিল্ড `x.<key>` (পাবলিক বা গোপন) */
export type ImportFieldId = 'serial_no' | CoreFieldKey | 'prev_photo_source' | 'current_photo_source' | `x.${string}`

export interface ImportFieldDef {
  id: ImportFieldId
  /** সংজ্ঞা (সিরিয়াল ও ছবির লিঙ্কে null) */
  def: FieldDef | null
  /** দেখানোর লেবেল (বাংলা; UI তে t()/lt() দিয়ে) */
  label_bn: string
  label_en: string
  /** "নতুন যোগ" মোডে আবশ্যক */
  required: boolean
  /** গোপন (beneficiary_private) — আলাদা পাঠানো হয় */
  private: boolean
  /** হুবহু মিলবে এমন শিরোনাম (স্বাভাবিক করা) */
  exact: string[]
  /** শিরোনামে থাকলে মিলবে এমন বিকল্প নাম (স্বাভাবিক করা) */
  aliases: string[]
}

/** শিরোনাম তুলনার রূপ: NFC, ছোট হাতের, ফাঁকা এক, শেষে * বা : বাদ */
export function normHeader(s: string): string {
  return nfc(s).toLowerCase().replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim()
}

/** আগের (ঘর নির্মাণের) ইম্পোর্টের লেবেল — হুবহু-মিলে এগুলোও চেনা হয় */
const LEGACY_LABEL: Partial<Record<ImportFieldId, string[]>> = {
  serial_no: ['সিরিয়াল', 'serial', 'serial_no'],
  prev_photo_source: ['পূর্বের ঘরের ছবি (লিঙ্ক)'],
  current_photo_source: ['বর্তমান ঘরের ছবি (লিঙ্ক)'],
}

/** সিস্টেম ফিল্ডের পুরনো regex (ক্রম গুরুত্বপূর্ণ: আগে নির্দিষ্ট, পরে সাধারণ) */
const HINTS: [ImportFieldId, RegExp][] = [
  ['prev_photo_source', /(পূর্ব|আগ|before|prev|old).*(ছবি|photo|image|লিঙ্ক|link)|(ছবি|photo|image).*(পূর্ব|আগ|before|prev|old)/i],
  ['current_photo_source', /(বর্তমান|পর|after|current|new).*(ছবি|photo|image|লিঙ্ক|link)|(ছবি|photo|image).*(বর্তমান|পর|after|current|new)/i],
  ['father_or_husband_name', /পিতা|স্বামী|father|husband|guardian/i],
  ['serial_no', /সিরিয়াল|ক্রমিক|serial|^sl\.?\s*(no)?$|^sn$|^id$/i],
  ['year', /সাল|বছর|year/i],
  ['division', /বিভাগ|division/i],
  ['district', /জেলা|district|dist/i],
  ['union_name', /ইউনিয়ন|পৌরসভা|union|pourashava|paurashava|municipality/i],
  ['upazila', /উপজেলা|থানা|upazila|upazilla|thana/i],
  ['address', /ঠিকানা|গ্রাম|address|village/i],
  ['name', /উপকারভোগী|নাম|name|beneficiary/i],
]

/** এক্সপোর্টের তথ্য-কলাম — ইম্পোর্টে কখনো কোনো ফিল্ডে বসে না */
const IGNORE_HEADER = /\(সিস্টেম url\)$|^ছবি আপডেট$|^রেকর্ড আইডি$|\(আর্কাইভ\)$/

export function isIgnoredHeader(h: string): boolean {
  return IGNORE_HEADER.test(normHeader(h))
}

const uniq = (xs: string[]) => [...new Set(xs.map(normHeader).filter(Boolean))]

export function buildImportFields(project: Project): ImportFieldDef[] {
  const defs = resolveFields(project)
  const out: ImportFieldDef[] = [
    { id: 'serial_no', def: null, label_bn: 'সিরিয়াল', label_en: 'Serial', required: false, private: false, exact: uniq(LEGACY_LABEL.serial_no ?? []), aliases: [] },
  ]
  for (const d of defs) {
    if (d.source === 'system') {
      const base = SYSTEM_FIELDS.find((s) => s.key === d.key)
      out.push({
        id: d.key as CoreFieldKey,
        def: d,
        label_bn: d.label_bn,
        label_en: d.label_en,
        required: d.required,
        private: false,
        exact: uniq([d.label_bn, d.label_en, d.key, base?.label_bn ?? '', base?.label_en ?? '']),
        aliases: [],
      })
    } else {
      out.push({
        id: `x.${d.key}`,
        def: d,
        label_bn: d.label_bn,
        label_en: d.label_en,
        required: d.required,
        private: d.source === 'private',
        exact: uniq([d.label_bn, d.label_en, d.key]),
        aliases: uniq(d.import_aliases),
      })
    }
  }
  for (const kind of photoKindsOf(project) as PhotoKind[]) {
    const id = `${kind}_photo_source` as const
    const label = photoSlotLabelBn(project, kind)
    out.push({ id, def: null, label_bn: `${label} (লিঙ্ক)`, label_en: kind === 'prev' ? 'Before photo (link)' : 'Photo (link)', required: false, private: false, exact: uniq([`${label} (লিঙ্ক)`, ...(LEGACY_LABEL[id] ?? [])]), aliases: [] })
  }
  return out
}

/** ফাইলের শিরোনাম → ফিল্ড (প্রতিটি ফিল্ড একবারই) */
export function guessMapping(headers: string[], fields: readonly ImportFieldDef[]): (ImportFieldId | null)[] {
  const out: (ImportFieldId | null)[] = headers.map(() => null)
  const done = new Set<number>()
  const used = new Set<ImportFieldId>()
  const has = (id: ImportFieldId) => fields.some((f) => f.id === id)
  const put = (i: number, id: ImportFieldId) => {
    out[i] = id
    done.add(i)
    used.add(id)
  }
  const norm = headers.map(normHeader)
  // ① তথ্য-কলাম
  norm.forEach((h, i) => isIgnoredHeader(h) && done.add(i))
  // ② হুবহু
  for (const f of fields) {
    const i = norm.findIndex((h, j) => !done.has(j) && f.exact.includes(h))
    if (i !== -1 && !used.has(f.id)) put(i, f.id)
  }
  // ③ বিকল্প নাম — লম্বাগুলো আগে, শিরোনামে থাকলে
  const pairs = fields.flatMap((f) => f.aliases.map((a) => ({ f, a }))).sort((x, y) => y.a.length - x.a.length)
  for (const { f, a } of pairs) {
    if (used.has(f.id)) continue
    const i = norm.findIndex((h, j) => !done.has(j) && (h === a || h.includes(a)))
    if (i !== -1) put(i, f.id)
  }
  // ④ সিস্টেম ফিল্ডের regex (আগের ক্রমে)
  for (const [id, re] of HINTS) {
    if (used.has(id) || !has(id)) continue
    const i = headers.findIndex((h, j) => !done.has(j) && re.test(nfc(h)))
    if (i !== -1) put(i, id)
  }
  return out
}
