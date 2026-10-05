/**
 * পরিসংখ্যান কার্ডের মান ও লেবেলের প্রস্তাব (পর্ব ২, M-ধাপ ৮) — প্যানেলের কার্ড-বিল্ডারের লাইভ প্রিভিউ, আর পরে
 * (M-ধাপ ১৩/১৫) পাবলিক পেইজ ও হোম কার্ড একই হিসাব ব্যবহার করবে।
 */
import type { GeoLevel, Project, ProjectField, ProjectStats, StatCardDef, StatCardKind } from '@/backend'
import { lt } from '@/i18n'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { formatTaka } from '@/lib/money'

/** কার্ডের সংখ্যা; ডাটা নেই বা ফিল্ড অচেনা হলে null */
export function cardValue(card: StatCardDef, stats: ProjectStats | null | undefined): number | null {
  if (!stats) return null
  switch (card.kind) {
    case 'count':
      return stats.total
    case 'geo': {
      const level = card.level ?? 'district'
      const k = (`${level}s`) as keyof ProjectStats['distinct']
      return stats.distinct?.[k] ?? null
    }
    case 'sum': {
      const f = card.field ? stats.fields?.[card.field] : undefined
      return f && f.type !== 'category' ? f.sum : f ? null : 0
    }
    case 'distinct': {
      const f = card.field ? stats.fields?.[card.field] : undefined
      return f && f.type === 'category' ? f.distinct : f ? null : 0
    }
  }
}

/** দেখানোর লেখা: টাকা হলে ৳ সহ, নইলে কমাসহ সংখ্যা; মান না থাকলে "—" */
export function formatCardValue(card: StatCardDef, value: number | null): string {
  if (value === null) return '—'
  return card.format === 'money' ? formatTaka(value) : formatBanglaNumber(value)
}

const GEO_LABELS: Record<GeoLevel, { label_bn: string; label_en: string; icon: string }> = {
  division: { label_bn: 'মোট বিভাগ', label_en: 'Divisions', icon: 'map' },
  district: { label_bn: 'জেলা কভার', label_en: 'Districts covered', icon: 'pin' },
  upazila: { label_bn: 'উপজেলা কভার', label_en: 'Upazilas covered', icon: 'grid' },
  union: { label_bn: 'ইউনিয়ন কভার', label_en: 'Unions covered', icon: 'pin' },
}

/** নতুন কার্ডের প্রস্তাবিত লেবেল, আইকন ও ফরম্যাট */
export function suggestCard(
  project: Project,
  kind: StatCardKind,
  opts: { level?: GeoLevel; field?: ProjectField } = {},
): Pick<StatCardDef, 'label_bn' | 'label_en' | 'icon' | 'format'> {
  if (kind === 'count') {
    return { label_bn: `মোট ${project.unit_bn || 'উপকারভোগী'}`, label_en: `Total ${project.unit_en || 'beneficiaries'}`, icon: 'users' }
  }
  if (kind === 'geo') return { ...GEO_LABELS[opts.level ?? 'district'] }
  const f = opts.field
  const bn = f?.label_bn ?? ''
  const en = f?.label_en || bn
  if (kind === 'sum') {
    return { label_bn: `মোট ${bn}`, label_en: `Total ${en.toLowerCase()}`, icon: f?.type === 'money' ? 'coins' : 'chart', ...(f?.type === 'money' ? { format: 'money' as const } : {}) }
  }
  return { label_bn: `মোট ${bn}`, label_en: `Number of ${en.toLowerCase()}`, icon: 'tags' }
}

/** কার্ডের নতুন id (একই প্রকল্পে অনন্য) */
export function newCardId(cards: readonly StatCardDef[], kind: StatCardKind, part?: string): string {
  const base = `${kind}${part ? `_${part}` : ''}`.replace(/[^a-z0-9_]/g, '_').slice(0, 30)
  const taken = new Set(cards.map((c) => c.id))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/** কার্ডের ধরন-সারাংশ (প্যানেলে দেখাতে) */
export function cardSummary(card: StatCardDef, project: Project): string {
  const field = project.fields.find((f) => f.key === card.field)
  const fl = field ? lt(field, 'label') : (card.field ?? '')
  return { count: '#', geo: card.level ?? '', sum: `Σ ${fl}`, distinct: `≠ ${fl}` }[card.kind]
}
