/**
 * এডমিন রেকর্ড-তালিকার কলাম (M-ধাপ ১০) — প্রকল্পের ফিল্ড-সংজ্ঞা থেকে। ঘর নির্মাণে (কাস্টম ফিল্ড নেই) ঠিক আগের কলাম:
 * ক্রম · সিরিয়াল · সাল · নাম · পিতা/স্বামী · ঠিকানা (বিভাগ-জেলা-উপজেলা[-ইউনিয়ন] + বিস্তারিত) · ছবি · কাজ।
 * কাস্টম পাবলিক ফিল্ড "টেবিলে" চালু থাকলে ঠিকানার পরে; টাকার কলামে পাতার মোট। গোপন ফিল্ড তালিকায় কখনো নয়
 * (তালিকার উত্তরে গোপন মান আসেই না)। মোবাইল কার্ডে "কার্ডে" চালু কাস্টম ফিল্ড।
 */
import type { PhotoKind, Project } from '@/backend'
import { resolveFields, type FieldDef } from '@/features/projects/fields'
import { pick, t } from '@/i18n'

export type AdminColumn = { kind: 'field'; def: FieldDef } | { kind: 'address' } | { kind: 'photos' }

const IDENTITY = ['year', 'name', 'father_or_husband_name'] as const

export interface AdminLayout {
  columns: AdminColumn[]
  /** মোবাইল কার্ডে বাড়তি লাইন */
  cardFields: FieldDef[]
  /** পাতার মোট দেখানোর টাকার কলাম */
  moneyFields: FieldDef[]
  /** ছবির ঘর (ছবি মোড অনুযায়ী) */
  photoKinds: PhotoKind[]
}

export function photoKindsOf(project: Project): PhotoKind[] {
  return project.photo_mode === 'before_after' ? ['prev', 'current'] : project.photo_mode === 'after_only' ? ['current'] : []
}

export function adminLayout(project: Project): AdminLayout {
  const defs = resolveFields(project, { includePrivate: false })
  const columns: AdminColumn[] = []
  for (const key of IDENTITY) {
    const def = defs.find((d) => d.key === key)
    if (def) columns.push({ kind: 'field', def })
  }
  columns.push({ kind: 'address' })
  const custom = defs.filter((d) => d.source === 'extra')
  for (const def of custom.filter((d) => d.show_in_table)) columns.push({ kind: 'field', def })
  const photoKinds = photoKindsOf(project)
  if (photoKinds.length) columns.push({ kind: 'photos' })
  return {
    columns,
    cardFields: custom.filter((d) => d.show_in_card),
    moneyFields: custom.filter((d) => d.show_in_table && d.type === 'money'),
    photoKinds,
  }
}

/** ছবির ঘরের নাম (বর্তমান ভাষায়): প্রকল্পের লেবেল (pick), না থাকলে আগের নাম */
export function photoSlotLabel(project: Project, kind: PhotoKind): string {
  const own = kind === 'prev' ? pick(project.prev_label_bn, project.prev_label_en) : pick(project.current_label_bn, project.current_label_en)
  return own.trim() || (kind === 'prev' ? t('পূর্বের ঘরের ছবি') : t('বর্তমান ঘরের ছবি'))
}
