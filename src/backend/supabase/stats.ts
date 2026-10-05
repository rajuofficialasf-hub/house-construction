/**
 * পরিসংখ্যান: `project_stats` (SQL ১১), না থাকলে পুরনো `housing_stats` থেকে একই শেপে (পরিকল্পনা §৫.১৪)।
 * HousingApi.stats ও ProjectsApi.overview দুজনেই এটি ব্যবহার করে।
 */
import type { HousingStats, ProjectKey, ProjectStats } from '../interfaces/types'
import type { GetClient } from './client'
import { mapSupabaseError } from './errors'
import { withFallback } from './legacy'

/** গ্রুপ-key যেটি পুরনো ডাটাবেসে "সব রেকর্ড" (housing_stats(null)) বোঝায় */
export const LEGACY_GROUP_KEY = 'housing'

export function emptyProjectStats(): ProjectStats {
  return {
    total: 0,
    by_year: {},
    by_division: {},
    by_district: {},
    by_upazila: {},
    distinct: { divisions: 0, districts: 0, upazilas: 0, unions: 0 },
    by_location: {},
    by_project: {},
    by_union: {},
    fields: {},
  }
}

/** সার্ভারের উত্তরে কোনো কী না থাকলে খালি মান বসানো (পুরনো/নতুন দুই শেপেই নিরাপদ) */
export function normalizeStats(raw: unknown): ProjectStats {
  const r = (raw ?? {}) as Partial<ProjectStats>
  const empty = emptyProjectStats()
  return { ...empty, ...r, distinct: { ...empty.distinct, ...(r.distinct ?? {}) } }
}

/** পুরনো `housing_stats` এর উত্তর → নতুন শেপ (by_union {}, fields {}, distinct.unions 0) */
export function fromLegacyStats(raw: unknown, key: ProjectKey): ProjectStats {
  const s = normalizeStats(raw as Partial<HousingStats>)
  // একক প্রকল্পে নিজের মোট জানা; গ্রুপের ভাগ পুরনো ডাটাবেসে আলাদা কল ছাড়া জানা যায় না
  return { ...s, by_project: key === LEGACY_GROUP_KEY ? {} : { [key]: s.total }, by_union: {}, fields: {} }
}

export function fetchProjectStats(getClient: GetClient, key: ProjectKey, light = false): Promise<ProjectStats> {
  return withFallback(
    'project_stats',
    async () => {
      const { data, error } = await getClient().rpc('project_stats', { p_key: key, p_light: light })
      if (error) throw mapSupabaseError(error)
      return normalizeStats(data)
    },
    async () => {
      const { data, error } = await getClient().rpc('housing_stats', {
        p_project_type: key === LEGACY_GROUP_KEY ? null : key,
      })
      if (error) throw mapSupabaseError(error)
      return fromLegacyStats(data, key)
    },
  )
}
