/**
 * তালিকার ফিল্টার → কুয়েরির নাম (REST তালিকা ও পরিসংখ্যান একই নাম পাঠায়), আর কখন ফিল্টার "নেই"।
 * ফাঁকা বা শুধু-স্পেস মান বাদ; খোঁজা তালিকার সীমায় কাটা। REST অ্যাডাপ্টার ঠিক এই entry-গুলোই পাঠায়, তাই
 * "ফিল্টার আছে" আর "ফিল্টার পাঠানো হলো" কখনো আলাদা হয় না
 * (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, P8b decisions)।
 */
import type { StatsFilters } from './interfaces/types'

export const MAX_SEARCH = 100

export function statsFilterEntries(filters: StatsFilters | undefined): [string, string][] {
  if (!filters) return []
  const entries: [string, string][] = []
  const text = (name: string, value: string | undefined, max?: number) => {
    const v = value?.trim().slice(0, max)
    if (v) entries.push([name, v])
  }
  if (filters.year !== undefined && filters.year !== null) entries.push(['year', String(filters.year)])
  text('division', filters.division)
  text('district', filters.district)
  text('upazila', filters.upazila)
  text('union_name', filters.union_name)
  text('q', filters.q, MAX_SEARCH)
  for (const [key, value] of Object.entries(filters.fields ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') entries.push([`f.${key}`, value])
  }
  return entries
}

export function hasStatsFilters(filters: StatsFilters | undefined): boolean {
  return statsFilterEntries(filters).length > 0
}
