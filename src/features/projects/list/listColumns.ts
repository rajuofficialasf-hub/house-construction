/**
 * পাবলিক তালিকার কলাম (M-ধাপ ১৩) — প্রকল্পের ফিল্ড-সংজ্ঞা থেকে: "টেবিলে" চালু পাবলিক ফিল্ড (সিস্টেম + কাস্টম, ক্রমে),
 * ঠিকানা "একসাথে" হলে বিভাগ-জেলা-উপজেলা(-ইউনিয়ন) এক কলামে, তারপর ছবির কলাম (ছবি মোড অনুযায়ী)।
 * ঘর নির্মাণে আগের হুবহু ১১টি কলাম: ক্রম · সাল · নাম · পিতা/স্বামী · বিভাগ · জেলা · উপজেলা · বিস্তারিত ঠিকানা ·
 * পূর্বের ছবি · বর্তমান ছবি · বিস্তারিত — ইউনিয়নের কলাম আসে শুধু ডাটায় ইউনিয়ন থাকলে (ঘর নির্মাণে এখনো নেই)।
 * সিস্টেম ফিল্ডের শিরোনাম: প্রকল্পে নিজস্ব লেবেল থাকলে সেটি, নইলে আগের অভিধানের লেখা (তাই ইংরেজিও আগের মতো)।
 */
import type { HousingRecord, PhotoKind, Project } from '@/backend'
import { gnUnion } from '@/features/geo/unions'
import { resolveFields, SYSTEM_FIELDS, type FieldDef } from '@/features/projects/fields'
import { gn, lt, pick, t } from '@/i18n'

export type ListColumn =
  | { kind: 'field'; def: FieldDef; header: string }
  | { kind: 'geo'; header: string }
  | { kind: 'photo'; photo: PhotoKind; header: string }

export function photoKinds(project: Project): PhotoKind[] {
  return project.photo_mode === 'before_after' ? ['prev', 'current'] : project.photo_mode === 'after_only' ? ['current'] : []
}

/** ছবির ঘরের নাম (কার্ড, লাইটবক্স): প্রকল্পের লেবেল, না থাকলে আগের নাম */
export function photoLabel(project: Project, kind: PhotoKind): string {
  const own = kind === 'prev' ? pick(project.prev_label_bn, project.prev_label_en) : pick(project.current_label_bn, project.current_label_en)
  return own.trim() || (kind === 'prev' ? t('পূর্বের ঘর') : t('বর্তমান ঘর'))
}

/** সিস্টেম/কাস্টম ফিল্ডের শিরোনাম */
export function fieldHeader(def: FieldDef, project: Project): string {
  if (def.source !== 'system') return lt(def, 'label')
  const own = project.core_fields?.[def.key as keyof Project['core_fields']]
  if (own?.label_bn?.trim()) return pick(own.label_bn, own.label_en)
  const base = SYSTEM_FIELDS.find((s) => s.key === def.key)
  return t(base?.label_bn ?? def.label_bn)
}

/** ঠিকানার অংশ: (ইউনিয়ন,) উপজেলা, জেলা, বিভাগ — দেখানো হয় <PlaceText> দিয়ে */
export function placeParts(r: HousingRecord, withUnion: boolean): string[] {
  return [withUnion && r.union_name ? gnUnion(r.district, r.upazila, r.union_name) : '', gn(r.upazila), gn(r.district), gn(r.division)].filter(Boolean)
}

export interface ListLayout {
  columns: ListColumn[]
  /** মোবাইল কার্ডে বাড়তি লাইন: "কার্ডে" চালু কাস্টম পাবলিক ফিল্ড */
  cardFields: FieldDef[]
  photoKinds: PhotoKind[]
  /** ঠিকানার লাইনে ইউনিয়ন দেখাবে কি না */
  showUnion: boolean
}

export function listLayout(project: Project, opts: { showUnion: boolean }): ListLayout {
  const defs = resolveFields(project, { includePrivate: false }).filter((d) => d.show_in_table && (d.key !== 'union_name' || opts.showUnion))
  const merged = project.display?.geo_columns === 'merged'
  const columns: ListColumn[] = []
  let geoAdded = false
  for (const def of defs) {
    if (merged && def.geo) {
      if (!geoAdded) columns.push({ kind: 'geo', header: t('ঠিকানা') })
      geoAdded = true
      continue
    }
    columns.push({ kind: 'field', def, header: fieldHeader(def, project) })
  }
  const kinds = photoKinds(project)
  // আগে-পরে: আগের মতো "পূর্বের ছবি"/"বর্তমান ছবি"; শুধু-পরে: প্রকল্পের লেবেল (যেমন "উপকরণসহ ছবি")
  for (const k of kinds) columns.push({ kind: 'photo', photo: k, header: kinds.length === 2 ? t(k === 'prev' ? 'পূর্বের ছবি' : 'বর্তমান ছবি') : photoLabel(project, k) })
  return {
    columns,
    cardFields: resolveFields(project, { includePrivate: false }).filter((d) => d.source === 'extra' && d.show_in_card),
    photoKinds: kinds,
    showUnion: opts.showUnion && project.geo_depth === 'union',
  }
}
