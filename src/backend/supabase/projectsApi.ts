import { FALLBACK_PROJECTS } from '../fallbackProjects'
import type { ProjectsApi } from '../interfaces/projectsApi'
import {
  HousingApiError,
  type BackendMode,
  type FieldUsage,
  type Project,
  type ProjectField,
  type ProjectKey,
  type ProjectOverview,
  type ProjectOverviewItem,
  type ProjectStats,
} from '../interfaces/types'
import { PHOTO_SPEC } from '../../features/housing/utils/photoSpec'
import { STORAGE_BUCKET, type GetClient } from './client'
import { mapSupabaseError } from './errors'
import { isKnownMissing, isMissingError, legacyWriteError, withFallback } from './legacy'
import { adminRole, assertAdmin } from './session'
import { fetchProjectStats, normalizeStats } from './stats'

export const PROJECTS_TABLE = 'projects'
export const FIELDS_TABLE = 'project_fields'

/** কভার ছবি: একটি নির্দিষ্ট পাথ (ডাটাবেসের projects_cover_path চেকের সমান), WebP, ≤ ৫ MB (চুক্তি §৪.১.৮) */
export const COVER_MAX_BYTES = 5 * 1024 * 1024
export const coverPath = (key: ProjectKey) => `housing/_projects/${key}/cover.webp`

/** get() এর ক্যাশ (লেখার payload ঠিক করতে বারবার লাগে); প্যানেলের তালিকা (list) সবসময় তাজা */
const CACHE_MS = 60_000

export interface SupabaseProjectsApiOptions {
  /** true = service_role স্ক্রিপ্ট (ক্লায়েন্ট-সাইড এডমিন যাচাই বাদ)। ব্রাউজারে কখনো নয়। */
  trustedServer?: boolean
}

type Row = Record<string, unknown>

function toProject(row: Row, fields: ProjectField[]): Project {
  const p = row as unknown as Project
  return {
    ...p,
    core_fields: p.core_fields ?? {},
    stat_cards: Array.isArray(p.stat_cards) ? p.stat_cards : [],
    display: p.display ?? {},
    fields: fields.filter((f) => f.project_key === p.key),
  }
}

function toField(row: Row): ProjectField {
  const f = row as unknown as ProjectField
  return {
    ...f,
    options: Array.isArray(f.options) ? f.options : [],
    import_aliases: f.import_aliases ?? [],
    min_value: f.min_value === null || f.min_value === undefined ? null : Number(f.min_value),
    max_value: f.max_value === null || f.max_value === undefined ? null : Number(f.max_value),
  }
}

/** প্রকাশিত এবং (থাকলে) গ্রুপও প্রকাশিত — public_project_keys() এর সমান নিয়ম */
function isPublic(p: Project, all: Project[]): boolean {
  if (!p.is_published) return false
  if (!p.parent_key) return true
  return all.find((x) => x.key === p.parent_key)?.is_published ?? false
}

const clone = (p: Project): Project => structuredClone(p)

export function createSupabaseProjectsApi(getClient: GetClient, options: SupabaseProjectsApiOptions = {}): ProjectsApi {
  const guard = async () => {
    if (!options.trustedServer) await assertAdmin(getClient)
  }
  let mode: BackendMode | null = null
  let cache: { at: number; list: Project[] } | null = null
  const invalidate = () => {
    cache = null
  }

  /** "projects টেবিল নেই" হলে লেখা অসম্ভব — আগেই বলে দেওয়া, নইলে ডাটাবেসের এরর থেকে চেনা */
  const assertWritable = () => {
    if (isKnownMissing('projects')) throw legacyWriteError()
  }
  const mapWriteError = (err: unknown): never => {
    if (isMissingError(err)) throw legacyWriteError()
    throw mapSupabaseError(err)
  }

  async function fetchAll(): Promise<Project[]> {
    const list = await withFallback(
      'projects',
      async () => {
        // এক কলে প্রকল্প + ফিল্ড (PostgREST embed, FK project_fields.project_key → projects.key) — M-ধাপ ১৫:
        // প্রতিটি পাতায় রেজিস্ট্রির কল ২ → ১। embed না চললে (PGRST200) বা উত্তরে না এলে আগের মতো আলাদা ফিল্ড-কল।
        const p = await getClient().from(PROJECTS_TABLE).select(`*, ${FIELDS_TABLE}(*)`).order('sort_order').order('key')
        let rows = (p.data ?? []) as Row[]
        let fieldRows: Row[] | null = null
        if (p.error && p.error.code === 'PGRST200') {
          const plain = await getClient().from(PROJECTS_TABLE).select('*').order('sort_order').order('key')
          if (plain.error) throw mapSupabaseError(plain.error)
          rows = (plain.data ?? []) as Row[]
        } else if (p.error) {
          throw mapSupabaseError(p.error)
        } else if (rows.every((r) => Array.isArray(r[FIELDS_TABLE]))) {
          fieldRows = rows.flatMap((r) => r[FIELDS_TABLE] as Row[])
          rows = rows.map(({ [FIELDS_TABLE]: _embedded, ...r }) => r)
        }
        if (!fieldRows) {
          const f = await getClient().from(FIELDS_TABLE).select('*').order('sort_order').order('key')
          if (f.error) throw mapSupabaseError(f.error)
          fieldRows = (f.data ?? []) as Row[]
        }
        // আগের মতো ক্রম: sort_order, তারপর key
        const fields = fieldRows.map(toField).sort((a, b) => a.sort_order - b.sort_order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        mode = 'full'
        return rows.map((r) => toProject(r, fields))
      },
      async () => {
        mode = 'legacy'
        return FALLBACK_PROJECTS.map(clone)
      },
    )
    cache = { at: Date.now(), list }
    return list
  }

  async function cachedAll(): Promise<Project[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.list
    return fetchAll()
  }

  async function fetchOne(key: ProjectKey): Promise<Project> {
    const found = (await fetchAll()).find((p) => p.key === key)
    if (!found) throw new HousingApiError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি')
    return found
  }

  /** পুরনো ডাটাবেসে বা projects_overview না থাকলে: প্রতিটি প্রকাশিত প্রকল্পে একটি স্ট্যাট-কল (ঘর নির্মাণে ৩টি) */
  async function legacyOverview(includeDrafts: boolean): Promise<ProjectOverview> {
    const all = await fetchAll()
    const shown = all.filter((p) => includeDrafts || isPublic(p, all))
    const stats = await Promise.all(shown.map((p) => fetchProjectStats(getClient, p.key, true)))
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
      stats: stats[i],
      featured: null,
      without_photo: null,
    }))
    // শীর্ষ-স্তরের (গ্রুপ বা একক) মোট — উপ-প্রকল্প দুবার গোনা হয় না; জেলা = নামের মিলিত সেট
    const top = items.filter((x) => !x.parent_key)
    const districts = new Set(top.flatMap((x) => Object.keys(x.stats.by_district)))
    return {
      projects: items,
      global: {
        projects: items.filter((x) => !x.is_group).length,
        total: top.reduce((s, x) => s + x.stats.total, 0),
        districts: districts.size,
      },
    }
  }

  const api: ProjectsApi = {
    async backendMode() {
      if (mode === null || isKnownMissing('projects')) await cachedAll()
      return isKnownMissing('projects') ? 'legacy' : (mode ?? 'full')
    },

    async list(opts = {}) {
      const all = await fetchAll()
      return opts.includeDrafts ? all : all.filter((p) => isPublic(p, all))
    },

    async get(key) {
      const found = (await cachedAll()).find((p) => p.key === key)
      if (found) return found
      return fetchOne(key) // ক্যাশে নেই — হয়তো সদ্য তৈরি; একবার তাজা খোঁজ
    },

    async overview(opts = {}) {
      const includeDrafts = !!opts.includeDrafts
      return withFallback(
        'projects_overview',
        async () => {
          const { data, error } = await getClient().rpc('projects_overview', { p_include_drafts: includeDrafts })
          if (error) throw mapSupabaseError(error)
          const raw = (data ?? {}) as Partial<ProjectOverview>
          return {
            projects: (raw.projects ?? []).map((x) => ({ ...x, stats: normalizeStats(x.stats) as ProjectStats })),
            global: { projects: 0, total: 0, districts: 0, ...(raw.global ?? {}) },
          }
        },
        () => legacyOverview(includeDrafts),
      )
    },

    async create(input, fields = []) {
      await guard()
      assertWritable()
      const { data, error } = await getClient().rpc('project_create', { p_project: input, p_fields: fields })
      if (error) mapWriteError(error)
      invalidate()
      return fetchOne((data as { key?: string } | null)?.key ?? input.key)
    },

    async update(key, patch, opts = {}) {
      await guard()
      assertWritable()
      let q = getClient().from(PROJECTS_TABLE).update(patch).eq('key', key)
      if (opts.expectedUpdatedAt) q = q.eq('updated_at', opts.expectedUpdatedAt)
      const { data, error } = await q.select('key').maybeSingle()
      if (error) mapWriteError(error)
      invalidate()
      if (!data) {
        const exists = (await fetchAll()).some((p) => p.key === key)
        if (exists && opts.expectedUpdatedAt) {
          throw new HousingApiError('CONFLICT', 'অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা রিফ্রেশ করে আবার চেষ্টা করুন')
        }
        throw new HousingApiError(exists ? 'FORBIDDEN' : 'NOT_FOUND', exists ? 'প্রকল্প বদলানোর অনুমতি নেই' : 'প্রকল্প পাওয়া যায়নি')
      }
      return fetchOne(key)
    },

    async uploadCover(key, file) {
      await guard()
      assertWritable()
      if (file.type !== PHOTO_SPEC.mime) throw new HousingApiError('VALIDATION_ERROR', 'কভার ছবি WebP হতে হবে')
      if (file.size > COVER_MAX_BYTES) throw new HousingApiError('PAYLOAD_TOO_LARGE', 'কভার ছবি ৫ MB এর বেশি')
      const path = coverPath(key)
      const { error } = await getClient().storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true, contentType: PHOTO_SPEC.mime, cacheControl: '86400' })
      if (error) throw mapSupabaseError(error, 'কভার ছবি আপলোড ব্যর্থ হয়েছে')
      // একই পাথে ওভাররাইট হলেও update এ updated_at বদলায় — URL এর ?v= তাতেই নতুন হয়
      return api.update(key, { cover_path: path })
    },

    async deleteCover(key) {
      if (!options.trustedServer) {
        const uid = await assertAdmin(getClient)
        if ((await adminRole(getClient, uid)) !== 'main_admin') throw new HousingApiError('FORBIDDEN', 'শুধু মূল এডমিন কভার ছবি মুছতে পারেন')
      }
      assertWritable()
      const { error } = await getClient().storage.from(STORAGE_BUCKET).remove([coverPath(key)])
      if (error) throw mapSupabaseError(error, 'কভার ছবি মুছতে সমস্যা হয়েছে')
      return api.update(key, { cover_path: null })
    },

    async delete(key) {
      await guard()
      assertWritable()
      const { data, error } = await getClient().from(PROJECTS_TABLE).delete().eq('key', key).select('key')
      if (error) mapWriteError(error)
      invalidate()
      if (!data || data.length === 0) throw new HousingApiError('FORBIDDEN', 'শুধু মূল এডমিন প্রকল্প মুছতে পারেন')
    },

    async reorder(keys) {
      await guard()
      assertWritable()
      const { error } = await getClient().rpc('projects_reorder', { p_keys: keys })
      if (error) mapWriteError(error)
      invalidate()
    },

    async createField(projectKey, input) {
      await guard()
      assertWritable()
      const { data, error } = await getClient()
        .from(FIELDS_TABLE)
        .insert({ ...input, project_key: projectKey })
        .select('*')
        .single()
      if (error) mapWriteError(error)
      invalidate()
      return toField(data as Row)
    },

    async updateField(id, patch) {
      await guard()
      assertWritable()
      const { data, error } = await getClient().from(FIELDS_TABLE).update(patch).eq('id', id).select('*').maybeSingle()
      if (error) mapWriteError(error)
      invalidate()
      if (!data) throw new HousingApiError('NOT_FOUND', 'ফিল্ড পাওয়া যায়নি')
      return toField(data as Row)
    },

    async deleteField(id) {
      await guard()
      assertWritable()
      const { data, error } = await getClient().from(FIELDS_TABLE).delete().eq('id', id).select('id')
      if (error) mapWriteError(error)
      invalidate()
      if (!data || data.length === 0) throw new HousingApiError('FORBIDDEN', 'শুধু মূল এডমিন ফিল্ড মুছতে পারেন')
    },

    async reorderFields(projectKey, ids) {
      await guard()
      assertWritable()
      const { error } = await getClient().rpc('project_fields_reorder', { p_project: projectKey, p_ids: ids })
      if (error) mapWriteError(error)
      invalidate()
    },

    async fieldUsage(projectKey, fieldKey) {
      await guard()
      if (isKnownMissing('projects')) return { count: 0, values: [] }
      const { data, error } = await getClient().rpc('project_field_usage', { p_project: projectKey, p_key: fieldKey })
      if (error) {
        if (isMissingError(error)) return { count: 0, values: [] } // SQL ১১ নেই
        throw mapSupabaseError(error)
      }
      const r = (data ?? {}) as Partial<FieldUsage>
      return { count: Number(r.count ?? 0), values: Array.isArray(r.values) ? r.values : [] }
    },

    async renameFieldValue(projectKey, fieldKey, from, to) {
      await guard()
      assertWritable()
      const { data, error } = await getClient().rpc('project_field_rename_value', {
        p_project: projectKey,
        p_key: fieldKey,
        p_from: from,
        p_to: to,
      })
      if (error) mapWriteError(error)
      return Number(data ?? 0)
    },
  }

  return api
}
