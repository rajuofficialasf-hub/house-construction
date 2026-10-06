/**
 * বিস্তারিত মডালের বিন্যাস (M-ধাপ ১৪) — প্রকল্পের কনফিগ থেকে:
 *   ছবির অংশ ছবি মোড অনুযায়ী (আগে-পরে → তুলনা, শুধু-পরে → একক ছবি, ছবি নেই → কিছু নয়)
 *   হাইলাইট কার্ড: show_in_detail চালু পাবলিক কাস্টম টাকা ও ক্যাটাগরি ফিল্ড (ক্রমানুসারে)
 *   বাকি show_in_detail ফিল্ড resolveFields এর ক্রমে; লম্বা লেখা (ঠিকানা ইত্যাদি) শেষে পূর্ণ-চওড়া।
 * ঘর নির্মাণে (কাস্টম ফিল্ড নেই, ইউনিয়ন খালি) আগের আটটি ঘর হুবহু: সিরিয়াল, সাল, নাম, পিতা/স্বামী, বিভাগ, জেলা, উপজেলা, ঠিকানা।
 */
import { gn, pick, t } from '@/i18n'
import type { HousingRecord, PhotoKind, Project } from '@/backend'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { fieldValue, formatField, resolveFields, type FieldDef } from '@/features/projects/fields'
import { gnUnion } from '@/features/geo/unions'
import { photoKinds } from '@/features/projects/list/listColumns'

export interface DetailLayout {
  photoKinds: PhotoKind[]
  /** উপরের হাইলাইট কার্ডে (টাকা, ক্যাটাগরি) */
  highlight: FieldDef[]
  /** বাকি ঘরগুলো (সিস্টেম + কাস্টম), লম্বা লেখা শেষে */
  fields: FieldDef[]
}

const isHighlight = (d: FieldDef) => d.source === 'extra' && (d.type === 'money' || d.type === 'category')

export function detailLayout(project: Project): DetailLayout {
  const defs = resolveFields(project, { includePrivate: false }).filter((d) => d.show_in_detail)
  const rest = defs.filter((d) => !isHighlight(d))
  return {
    photoKinds: photoKinds(project),
    highlight: defs.filter(isHighlight),
    fields: [...rest.filter((d) => d.type !== 'long_text'), ...rest.filter((d) => d.type === 'long_text')],
  }
}

/** এই রেকর্ডে দেখানোর ঘর — ইউনিয়ন শুধু মান থাকলে (ঘর নির্মাণে এখনো নেই) */
export function fieldsFor(layout: DetailLayout, record: HousingRecord): FieldDef[] {
  return layout.fields.filter((d) => d.key !== 'union_name' || !!record.union_name?.trim())
}

/**
 * ঘরের লেখা (title ও সিস্টেম ফিল্ডের মান) — সিস্টেম ফিল্ড আগের মডালের হুবহু: সাল toBanglaNumber, বিভাগ/জেলা/উপজেলা gn(),
 * ইউনিয়ন gnUnion, বাকি যেমন আছে (খালি হলে "—"); কাস্টম ফিল্ড রেজিস্ট্রির format (টাকা ৳; ক্যাটাগরি শীটে যেমন লেখা)।
 */
export function fieldText(def: FieldDef, record: HousingRecord): string {
  if (def.source === 'system') {
    if (def.key === 'year') return toBanglaNumber(record.year)
    if (def.key === 'division' || def.key === 'district' || def.key === 'upazila') return gn(record[def.key])
    if (def.key === 'union_name') return gnUnion(record.district, record.upazila, record.union_name) || '—'
    if (def.key === 'name') return record.name
    const v = fieldValue(def, record)
    return v === null || v === '' ? '—' : String(v)
  }
  const s = formatField(def, fieldValue(def, record))
  return s === '' ? '—' : s
}

/**
 * আগে-পরে তুলনার ব্যাজের লেখা: প্রকল্প নিজের লেবেল দিলে সেটা ("মেরামতের আগে"); ঘর নির্মাণের ডিফল্ট লেবেল
 * ("পূর্বের ঘর"/"বর্তমান ঘর") বা খালি হলে undefined — তখন PhotoCompare আগের ছোট ব্যাজ ("পূর্বের"/"বর্তমান") দেখায়।
 */
export function compareLabels(project: Project): { before: string; after: string } | undefined {
  const prev = project.prev_label_bn?.trim() ?? ''
  const cur = project.current_label_bn?.trim() ?? ''
  if ((!prev || prev === 'পূর্বের ঘর') && (!cur || cur === 'বর্তমান ঘর')) return undefined
  return {
    before: (prev ? pick(prev, project.prev_label_en) : '') || t('পূর্বের'),
    after: (cur ? pick(cur, project.current_label_en) : '') || t('বর্তমান'),
  }
}
