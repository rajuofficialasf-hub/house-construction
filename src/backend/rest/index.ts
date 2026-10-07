/**
 * REST অ্যাডাপ্টার — নিজস্ব সার্ভারের /api/v1 রাউট (docs/api/PROJECTS_API_CONTRACT.md; পাথ: ./endpoints.ts, helper: ./http.ts)।
 * সার্ভারের উত্তর UI-র টাইপের আকারেই আসে, তাই এখানে কোনো ম্যাপিং নেই। প্রকল্প, খসড়া ও গোপন মান লুকানো, ছবি-মোড আর
 * অনুমতি সার্ভারে যাচাই হয়; রেকর্ডের ও কভারের ছবির URL সার্ভারের দেওয়া (`/api/v1/photos/:id`)।
 */
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  MAX_PAGE_SIZE,
  type ActivityEntry,
  type ActivityListParams,
  type ExtraValues,
  type HousingRecord,
  type ListParams,
  type Page,
  type ProjectStats,
  type ProjectType,
} from '../interfaces/types'
import { hasStatsFilters } from '../statsFilters'
import { ENDPOINTS } from './endpoints'
import { queryOf, restData, restRequest, type RestRequestOptions } from './http'
import type { AdminUsersApi } from '../interfaces/adminUsersApi'

export { ENDPOINTS } from './endpoints'
export { createRestAuthProvider } from './authProvider'
export { createRestProjectsApi } from './projectsApi'

function notImplemented(method: string): never {
  throw new HousingApiError('NOT_IMPLEMENTED', `REST অ্যাডাপ্টার: ${method} এখনো তৈরি হয়নি`)
}

/** সার্ভারে সব প্রকল্পের রেকর্ড বা পরিসংখ্যান একসাথে পাওয়ার রাউট নেই, আর UI সবসময় প্রকল্প দেয় */
function keyOf(projectType: ProjectType | undefined): ProjectType {
  if (!projectType) throw new HousingApiError('VALIDATION_ERROR', 'প্রকল্প বাছাই করা হয়নি', { field: 'project_type' })
  return projectType
}

// সার্ভার যা নেয়: q ≤ ১০০ অক্ষর, এক কলে ≤ ১০০ সিরিয়াল, সিরিয়াল int4 এর মধ্যে (PROJECTS_API_CONTRACT §৪.৪)
const MAX_SEARCH = 100
const SERIALS_PER_CALL = 100
const INT4_MAX = 2147483647

const clampPage = (page?: number) => Math.max(1, Math.floor(page ?? 1))
const clampPageSize = (pageSize?: number) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)))

/**
 * সার্ভার পরিসীমার বাইরের page/page_size এ 400 দেয়; HousingApi আগের মতোই সীমিত করে (Supabase অ্যাডাপ্টারের মতো),
 * তাই কোনো পেজ ভুল মানে ভাঙে না। ফাঁকা মান পাঠানো হয় না। কাস্টম ফিল্ডের ফিল্টার যায় `f.<key>` হিসেবে।
 */
function listQuery(params: ListParams): URLSearchParams {
  const query = queryOf({
    serial_no: params.serial_no,
    year: params.year,
    division: params.division,
    district: params.district,
    upazila: params.upazila,
    union_name: params.union_name,
    q: params.q?.trim().slice(0, MAX_SEARCH),
    page: clampPage(params.page),
    page_size: clampPageSize(params.page_size),
    sort: params.sort,
    order: params.order,
  })
  for (const [key, value] of Object.entries(params.fields ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') query.set(`f.${key}`, value)
  }
  return query
}

/**
 * একটিভিটি পেইজ দিনের শুরু/শেষ অফসেট ছাড়া পাঠায় (`2026-10-05T00:00:00`, ব্রাউজারের নিজের সময়ে);
 * সার্ভার শুধু অফসেটসহ ISO নেয়, তাই এখানে UTC তে বদলানো হয়।
 */
function isoInstant(value?: string): string | undefined {
  const time = value ? Date.parse(value) : NaN
  // URL থেকে আসা অবৈধ তারিখ (যেমন হাতে লেখা ?from=2026-13-45) ফিল্টার ছাড়াই চলে, ভেঙে পড়ে না
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}

function activityQuery(params: ActivityListParams): URLSearchParams {
  return queryOf({
    action: params.action,
    project_type: params.project_type,
    record_id: params.record_id,
    actor_email: params.actor_email,
    from: isoInstant(params.from),
    to: isoInstant(params.to),
    page: clampPage(params.page),
    page_size: clampPageSize(params.page_size),
  })
}

/** সার্ভার নিজেই লগইন ও লগআউট লগ করে; পেইজগুলো এগুলোর জন্যও logActivity ডাকে, তাই দুবার যেন না আসে */
const SERVER_LOGGED_EVENTS = new Set(['login', 'logout'])

/** project_type যায় পাথে; সার্ভারের body strict, তাই body তে থাকে না */
function withoutProject<T extends { project_type?: unknown }>(input: T): Omit<T, 'project_type'> {
  const { project_type: _p, ...rest } = input
  return rest
}

export function createRestHousingApi(baseUrl: string): HousingApi {
  const call = <T>(path: string, opts?: RestRequestOptions) => restData<T>(baseUrl, path, opts)
  const get = <T>(path: string) => call<T>(path)
  const send = <T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown) => call<T>(path, { method, body })

  const api: HousingApi = {
    list: async (params) => restRequest<Page<HousingRecord>>(baseUrl, ENDPOINTS.records.list(keyOf(params.project_type), listQuery(params))),
    getById: (id) => get<HousingRecord>(ENDPOINTS.records.byId(id)),
    getBySerial: (projectType, serialNo) => get<HousingRecord>(ENDPOINTS.records.bySerial(projectType, serialNo)),
    async getBySerials(projectType, serialNos) {
      // ছোট থেকে বড় সাজিয়ে ভাগ করলে প্রতিটি উত্তর ক্রমে আসে, জোড়া দিলেও পুরোটা সিরিয়াল ক্রমে থাকে
      const wanted = [...new Set(serialNos.filter((n) => Number.isInteger(n) && n >= 1 && n <= INT4_MAX))].sort((a, b) => a - b)
      const found: HousingRecord[] = []
      for (let i = 0; i < wanted.length; i += SERIALS_PER_CALL) {
        found.push(...(await get<HousingRecord[]>(ENDPOINTS.records.bySerials(projectType, wanted.slice(i, i + SERIALS_PER_CALL)))))
      }
      return found
    },
    create: (input) => send<HousingRecord>('POST', ENDPOINTS.records.list(input.project_type), withoutProject(input)),
    update: (id, patch) => send<HousingRecord>('PATCH', ENDPOINTS.records.byId(id), patch),
    async delete(id) {
      await restRequest<void>(baseUrl, ENDPOINTS.records.byId(id), { method: 'DELETE' })
    },
    // ভাগ করে পাঠানো হয় না: এক অনুরোধ সার্ভারে এক ট্রানজ্যাকশন (all-or-nothing), আর ৫০০ এর বেশি সারি 413 পায়।
    // ইম্পোর্ট পেইজ নিজেই ২০০ করে পাঠায়।
    bulkInsert: (input) => send('POST', ENDPOINTS.records.bulk(input.project_type), withoutProject(input)),
    bulkUpdateBySerial: (input) => send('PUT', ENDPOINTS.records.bulk(input.project_type), withoutProject(input)),
    async stats(projectType, opts = {}) {
      const stats = await get<ProjectStats>(ENDPOINTS.records.stats(keyOf(projectType), queryOf({ light: opts.light ? '1' : undefined })))
      // সার্ভার এখনো ফিল্টারে গোনে না: মোট ফেরত, সাথে বলে দেওয়া যে ফিল্টার হয়নি (main এর নিজের ফলব্যাক)
      return hasStatsFilters(opts.filters) ? { ...stats, filtered: false } : stats
    },
    years: async (projectType) => get<number[]>(ENDPOINTS.records.years(keyOf(projectType))),
    // সার্ভারে আলাদা রাউট নেই: সাল আর পরিসংখ্যানের কী থেকে (Supabase অ্যাডাপ্টারের মতো)
    async filterOptions(projectType) {
      const [years, stats] = await Promise.all([api.years(projectType), api.stats(projectType)])
      const keys = (o: Record<string, number>) => Object.keys(o).sort((a, b) => a.localeCompare(b, 'bn'))
      return {
        years,
        divisions: keys(stats.by_division),
        districts: keys(stats.by_district),
        upazilas: keys(stats.by_upazila),
        unions: keys(stats.by_union),
      }
    },
    async uploadPhoto(id, kind, files) {
      const form = new FormData()
      form.append('photo', files.photo, 'photo.webp')
      form.append('thumb', files.thumb, 'thumb.webp')
      return call<HousingRecord>(ENDPOINTS.records.photo(id, kind), { method: 'PUT', formData: form })
    },
    deletePhoto: (id, kind) => call<HousingRecord>(ENDPOINTS.records.photo(id, kind), { method: 'DELETE' }),
    nextSerial: async (projectType) => (await get<{ next_serial: number }>(ENDPOINTS.records.nextSerial(keyOf(projectType)))).next_serial,
    changeSerial: (id, serialNo) => send<HousingRecord>('POST', ENDPOINTS.records.serial(id), { serial_no: serialNo }),
    getPrivate: (id) => get<ExtraValues>(ENDPOINTS.records.private(id)),
    setPrivate: (id, data) => send<ExtraValues>('PUT', ENDPOINTS.records.private(id), { data }),
    getPrivateMany: (projectType, ids) =>
      send<Record<string, ExtraValues>>('POST', ENDPOINTS.records.privateMany(projectType), { ids }),
    listActivity: (params) => restRequest<Page<ActivityEntry>>(baseUrl, ENDPOINTS.activity(activityQuery(params))),
    async logActivity(action, details, projectType) {
      if (SERVER_LOGGED_EVENTS.has(action)) return
      try {
        await restRequest(baseUrl, ENDPOINTS.activity(), { method: 'POST', body: { action, details, project_type: projectType } })
      } catch {
        // চুক্তি অনুযায়ী নীরব ব্যর্থতা (Supabase অ্যাডাপ্টারের মতো): লগের ইভেন্ট না গেলে মূল কাজ (ইম্পোর্ট ইত্যাদি) থামে না
      }
    },
  }
  return api
}

/**
 * REST মোডে ছবি রাখা/মোছা HousingApi ও ProjectsApi দিয়ে, আর URL দেয় সার্ভার। UI শুধু publicUrl ডাকে (কভার ছবি,
 * src/features/projects/home/cover.ts), আর সার্ভারের `cover_path` আগেই পূর্ণ URL — তাই সেটি অপরিবর্তিত ফেরে।
 * বাকি মেথড Supabase অ্যাডাপ্টার ও migrate-photos এর জন্য; Supabase সরানোর সময় (পর্ব P9,
 * docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md) সেগুলোও যাবে।
 */
export function createRestImageStorage(_baseUrl: string): ImageStorage {
  return {
    upload: async () => notImplemented('upload'),
    delete: async () => notImplemented('delete'),
    move: async () => notImplemented('move'),
    publicUrl: (path) => (/^https?:\/\//i.test(path) ? path : notImplemented('publicUrl')),
    pathFromUrl: () => null,
  }
}

/** ইউজার-ব্যবস্থাপনা (চুক্তি v১.৫ §৪.৭) — নিজস্ব সার্ভারে পরে */
export function createRestAdminUsersApi(_baseUrl: string): AdminUsersApi {
  return {
    list: async () => notImplemented('adminUsers.list'), // GET  ENDPOINTS.adminUsers.list
    save: async () => notImplemented('adminUsers.save'), // PUT  ENDPOINTS.adminUsers.save
  }
}
