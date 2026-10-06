/**
 * প্রকল্পভিত্তিক CSV এক্সপোর্ট (M-ধাপ ১০, পরিকল্পনা):
 *   - হেডার = ফিল্ডের **বাংলা** লেবেল (ইংরেজি মোডেও) — ফাইলটি আবার ইম্পোর্ট করা যায়
 *   - ক্যাটাগরি যেমন লেখা; টাকা/সংখ্যা সাধারণ ASCII সংখ্যা (কমা/৳ নেই); তারিখ ISO
 *   - গোপন কলাম শুধু চাইলে (ফাইলনামে -private); আর্কাইভ করা ফিল্ডের পুরনো মানও থাকে ("(আর্কাইভ)" হেডারে)
 *   - UTF-8 BOM, আর লেখার সেলে ফর্মুলা-সুরক্ষা (csvExport.ts › toCsv)
 */
import { MAX_PAGE_SIZE, type ExtraValues, type HousingApi, type HousingRecord, type PhotoKind, type Project } from '@/backend'
import { fieldToCsv, fieldValue, resolveFields, type FieldDef } from '@/features/projects/fields'
import { toCsv } from '@/features/housing/utils/csvExport'
import { photoKindsOf } from './recordColumns'

/** ছবির ঘরের বাংলা নাম: প্রকল্পের লেবেল, না থাকলে আগের নাম */
export function photoSlotLabelBn(project: Project, kind: PhotoKind): string {
  const own = (kind === 'prev' ? project.prev_label_bn : project.current_label_bn)?.trim()
  return own || (kind === 'prev' ? 'পূর্বের ঘরের ছবি' : 'বর্তমান ঘরের ছবি')
}

/** প্রকল্পে সক্রিয় গোপন ফিল্ড আছে কি না (এক্সপোর্টে জিজ্ঞাসা করতে) */
export function hasPrivateFields(project: Project): boolean {
  return project.fields.some((f) => f.visibility === 'admin' && f.is_active)
}

type Cell = string | number

function valueCell(def: FieldDef, r: HousingRecord, priv: ExtraValues | undefined): Cell {
  const v = fieldValue(def, r, priv)
  if (v === null || v === '') return ''
  if (def.type === 'number' || def.type === 'money') {
    const n = Number(v)
    return Number.isFinite(n) ? n : String(v)
  }
  return fieldToCsv(def, v)
}

export interface CsvPlan {
  headers: string[]
  row: (r: HousingRecord, priv?: ExtraValues) => Cell[]
}

export function csvPlan(project: Project, includePrivate: boolean): CsvPlan {
  const defs = resolveFields(project, { includePrivate, includeArchived: true })
  const kinds = photoKindsOf(project)
  const headers = [
    'সিরিয়াল',
    ...defs.map((d) => (d.is_active ? d.label_bn : `${d.label_bn} (আর্কাইভ)`)),
    ...kinds.map((k) => `${photoSlotLabelBn(project, k)} (লিঙ্ক)`),
    ...kinds.map((k) => `${photoSlotLabelBn(project, k)} (সিস্টেম URL)`),
    ...(kinds.length ? ['ছবি আপডেট'] : []),
    'রেকর্ড আইডি',
  ]
  const row = (r: HousingRecord, priv?: ExtraValues): Cell[] => [
    r.serial_no,
    ...defs.map((d) => valueCell(d, r, priv)),
    ...kinds.map((k) => r[`${k}_photo_source`] ?? ''),
    ...kinds.map((k) => r[`${k}_photo_url`] ?? ''),
    ...(kinds.length ? [r.photo_updated_at ?? ''] : []),
    r.id,
  ]
  return { headers, row }
}

/** ফাইলের নাম: housing-semi-pucca-2026-10-05.csv / demo-2026-10-05-private.csv */
export function csvFilename(project: Project, parentSlug: string | null, includePrivate: boolean, date = new Date()): string {
  const base = [parentSlug, project.slug].filter(Boolean).join('-')
  return `${base}-${date.toISOString().slice(0, 10)}${includePrivate ? '-private' : ''}.csv`
}

/** প্রকল্পের সব রেকর্ড (সব পাতা, সিরিয়াল ক্রমে) → CSV; গোপনসহ হলে প্রতি পাতায় এক কলে গোপন মান */
export async function exportRecordsCsv(
  api: HousingApi,
  project: Project,
  includePrivate: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<{ csv: string; rows: number }> {
  const plan = csvPlan(project, includePrivate)
  const rows: Cell[][] = []
  let page = 1
  let total = Infinity
  while (rows.length < total) {
    const p = await api.list({ project_type: project.key, page, page_size: MAX_PAGE_SIZE, sort: 'serial_no', order: 'asc' })
    total = p.meta.total
    const priv = includePrivate && p.data.length ? await api.getPrivateMany(project.key, p.data.map((r) => r.id)) : {}
    for (const r of p.data) rows.push(plan.row(r, priv[r.id]))
    onProgress(rows.length, total)
    if (p.data.length === 0) break
    page++
  }
  return { csv: toCsv(plan.headers, rows), rows: rows.length }
}
