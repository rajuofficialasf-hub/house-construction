/**
 * মক ব্যাকএন্ডের ProjectsApi: প্রকল্প-রেজিস্ট্রি ছাড়া ফলব্যাকের ৩টি স্থির প্রকল্প (ঘর নির্মাণ গ্রুপ, সেমিপাকা, টিন)
 * দেখায়; প্রকল্প/ফিল্ড বদল NOT_IMPLEMENTED। মক ইচ্ছা করেই বহু-প্রকল্পে বাড়ে না —
 * প্রকল্পের নিয়ম শুধু সার্ভারে থাকে (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md,
 * "Deferred to Planning — settled")।
 */
import { FALLBACK_PROJECTS } from '../fallbackProjects'
import type { ProjectsApi } from '../interfaces/projectsApi'
import {
  HousingApiError,
  type HousingStats,
  type Project,
  type ProjectKey,
  type ProjectOverviewItem,
  type ProjectStats,
} from '../interfaces/types'

/** গ্রুপ-key, যেটি মকে "সব রেকর্ড" (project_type ছাড়া) বোঝায় */
export const GROUP_KEY = 'housing'

/** গ্রুপ-key হলে project_type ফিল্টার নেই (দুই প্রকল্প মিলিয়ে) */
export const recordProjectType = (key?: ProjectKey) => (key === GROUP_KEY ? undefined : key)

/** মকের `HousingStats` → প্রকল্পের শেপ (by_union {}, fields {}, distinct.unions 0) */
export function toProjectStats(raw: Partial<HousingStats> | null | undefined, key: ProjectKey): ProjectStats {
  const r = raw ?? {}
  return {
    total: r.total ?? 0,
    by_year: r.by_year ?? {},
    by_division: r.by_division ?? {},
    by_district: r.by_district ?? {},
    by_upazila: r.by_upazila ?? {},
    by_location: r.by_location ?? {},
    distinct: { divisions: 0, districts: 0, upazilas: 0, ...(r.distinct ?? {}), unions: 0 },
    // একক প্রকল্পে নিজের মোট জানা; গ্রুপের ভাগ আলাদা কল ছাড়া জানা যায় না
    by_project: key === GROUP_KEY ? {} : { [key]: r.total ?? 0 },
    by_union: {},
    fields: {},
  }
}

export function notInMock(): never {
  throw new HousingApiError('NOT_IMPLEMENTED', 'মক ব্যাকএন্ডে প্রকল্প/ফিল্ড বদল নেই')
}

function isPublic(p: Project): boolean {
  if (!p.is_published) return false
  return !p.parent_key || (FALLBACK_PROJECTS.find((x) => x.key === p.parent_key)?.is_published ?? false)
}

export function createMockProjectsApi(stats: (key: ProjectKey) => Promise<ProjectStats>): ProjectsApi {
  const all = (includeDrafts?: boolean) =>
    FALLBACK_PROJECTS.filter((p) => includeDrafts || isPublic(p)).map((p) => structuredClone(p))

  return {
    backendMode: async () => 'legacy',
    list: async (opts = {}) => all(opts.includeDrafts),
    async get(key) {
      const found = all(true).find((p) => p.key === key)
      if (!found) throw new HousingApiError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি')
      return found
    },
    async overview(opts = {}) {
      const shown = all(opts.includeDrafts)
      const counts = await Promise.all(shown.map((p) => stats(p.key)))
      const items: ProjectOverviewItem[] = shown.map((p, i) => ({
        key: p.key,
        parent_key: p.parent_key,
        is_group: p.is_group,
        slug: p.slug,
        name_bn: p.name_bn,
        name_en: p.name_en,
        summary_bn: p.summary_bn,
        summary_en: p.summary_en,
        unit_bn: p.unit_bn,
        unit_en: p.unit_en,
        photo_mode: p.photo_mode,
        icon: p.icon,
        accent: p.accent,
        cover_path: p.cover_path,
        sort_order: p.sort_order,
        is_published: p.is_published,
        show_on_home: p.show_on_home,
        stat_cards: p.stat_cards,
        stats: counts[i],
        featured: null,
        without_photo: null,
      }))
      // শীর্ষ-স্তরের মোট — উপ-প্রকল্প দুবার গোনা হয় না; জেলা = নামের মিলিত সেট
      const top = items.filter((x) => !x.parent_key)
      return {
        projects: items,
        global: {
          projects: items.filter((x) => !x.is_group).length,
          total: top.reduce((s, x) => s + x.stats.total, 0),
          districts: new Set(top.flatMap((x) => Object.keys(x.stats.by_district))).size,
        },
      }
    },
    create: async () => notInMock(),
    update: async () => notInMock(),
    uploadCover: async () => notInMock(),
    deleteCover: async () => notInMock(),
    delete: async () => notInMock(),
    reorder: async () => notInMock(),
    createField: async () => notInMock(),
    updateField: async () => notInMock(),
    deleteField: async () => notInMock(),
    reorderFields: async () => notInMock(),
    fieldUsage: async () => ({ count: 0, values: [] }),
    renameFieldValue: async () => notInMock(),
  }
}
