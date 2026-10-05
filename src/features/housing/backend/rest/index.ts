/**
 * REST অ্যাডাপ্টার — নিজস্ব সার্ভারের সাথে docs/api/API_CONTRACT.md অনুযায়ী (পাথ: ./endpoints.ts, helper: ./http.ts)।
 * AuthProvider ও HousingApi সম্পূর্ণ। ছবির রাউট সার্ভারে আসবে
 * docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md এর C5 এ; তার আগে uploadPhoto/deletePhoto
 * সার্ভার থেকে লগইন ছাড়া 401, লগইনসহ 404 পায়।
 */
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  MAX_PAGE_SIZE,
  type ActivityEntry,
  type ActivityListParams,
  type FilterOptions,
  type HousingRecord,
  type HousingStats,
  type ListParams,
  type Page,
  type ProjectType,
} from '../interfaces/types'
import { ENDPOINTS } from './endpoints'
import { restRequest } from './http'

export { ENDPOINTS } from './endpoints'
export { createRestAuthProvider } from './authProvider'

function notImplemented(method: string): never {
  throw new HousingApiError('NOT_IMPLEMENTED', `REST অ্যাডাপ্টার: ${method} এখনো তৈরি হয়নি`)
}

// সার্ভার যা নেয়: q ≤ ১০০ অক্ষর, এক কলে ≤ ১০০ সিরিয়াল, সিরিয়াল int4 এর মধ্যে (API_CONTRACT §৪.১, §৪.৩ক)
const MAX_SEARCH = 100
const SERIALS_PER_CALL = 100
const INT4_MAX = 2147483647

const clampPage = (page?: number) => Math.max(1, Math.floor(page ?? 1))
const clampPageSize = (pageSize?: number) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)))

/** undefined ও ফাঁকা মান বাদ দিয়ে query string */
function queryOf(values: Record<string, string | number | undefined>): URLSearchParams {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return query
}

/**
 * সার্ভার পরিসীমার বাইরের page/page_size এ 400 দেয়; HousingApi আগের মতোই সীমিত করে (Supabase অ্যাডাপ্টারের মতো),
 * তাই কোনো পেজ ভুল মানে ভাঙে না। ফাঁকা মান পাঠানো হয় না।
 */
function listQuery(params: ListParams): URLSearchParams {
  const values = {
    project_type: params.project_type,
    serial_no: params.serial_no,
    year: params.year,
    division: params.division,
    district: params.district,
    upazila: params.upazila,
    q: params.q?.trim().slice(0, MAX_SEARCH),
    page: clampPage(params.page),
    page_size: clampPageSize(params.page_size),
    sort: params.sort,
    order: params.order,
  }
  return queryOf(values)
}

/**
 * একটিভিটি পেইজ দিনের শুরু/শেষ অফসেট ছাড়া পাঠায় (`2026-10-05T00:00:00`, ব্রাউজারের নিজের সময়ে);
 * সার্ভার শুধু অফসেটসহ ISO নেয়, তাই এখানে UTC তে বদলানো হয়।
 */
const isoInstant = (value?: string) => (value ? new Date(value).toISOString() : undefined)

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

const projectQuery = (projectType?: ProjectType) =>
  new URLSearchParams(projectType ? { project_type: projectType } : {})

export function createRestHousingApi(baseUrl: string): HousingApi {
  /** Calls the server and returns the `data` of its `{ data }` answer. */
  const call = async <T>(path: string, opts?: Parameters<typeof restRequest>[2]) => (await restRequest<{ data: T }>(baseUrl, path, opts)).data
  const get = <T>(path: string) => call<T>(path)
  const send = <T>(method: 'POST' | 'PUT', path: string, body: unknown) => call<T>(path, { method, body })

  return {
    list: (params) => restRequest<Page<HousingRecord>>(baseUrl, ENDPOINTS.housing.list(listQuery(params))),
    getById: (id) => get<HousingRecord>(ENDPOINTS.housing.byId(id)),
    getBySerial: (projectType, serialNo) => get<HousingRecord>(ENDPOINTS.housing.bySerial(projectType, serialNo)),
    async getBySerials(projectType, serialNos) {
      // ছোট থেকে বড় সাজিয়ে ভাগ করলে প্রতিটি উত্তর ক্রমে আসে, জোড়া দিলেও পুরোটা সিরিয়াল ক্রমে থাকে
      const wanted = [...new Set(serialNos.filter((n) => Number.isInteger(n) && n >= 1 && n <= INT4_MAX))].sort((a, b) => a - b)
      const found: HousingRecord[] = []
      for (let i = 0; i < wanted.length; i += SERIALS_PER_CALL) {
        found.push(...(await get<HousingRecord[]>(ENDPOINTS.housing.bySerials(projectType, wanted.slice(i, i + SERIALS_PER_CALL)))))
      }
      return found
    },
    create: (input) => send<HousingRecord>('POST', ENDPOINTS.housing.create(), input),
    update: (id, patch) => send<HousingRecord>('PUT', ENDPOINTS.housing.byId(id), patch),
    async delete(id) {
      await restRequest<void>(baseUrl, ENDPOINTS.housing.byId(id), { method: 'DELETE' })
    },
    // ভাগ করে পাঠানো হয় না: এক অনুরোধ সার্ভারে এক ট্রানজ্যাকশন (all-or-nothing), আর ৫০০ এর বেশি সারি 413 পায়।
    // ইম্পোর্ট পেইজ নিজেই ২০০ করে পাঠায়।
    bulkInsert: (input) => send('POST', ENDPOINTS.housing.bulk(), input),
    bulkUpdateBySerial: (input) => send('PUT', ENDPOINTS.housing.bulk(), input),
    stats: (projectType) => get<HousingStats>(ENDPOINTS.housing.stats(projectQuery(projectType))),
    years: (projectType) => get<number[]>(ENDPOINTS.housing.years(projectQuery(projectType))),
    filterOptions: (projectType) => get<FilterOptions>(ENDPOINTS.housing.filterOptions(projectQuery(projectType))),
    async uploadPhoto(id, kind, files) {
      const form = new FormData()
      form.append('kind', kind)
      form.append('photo', files.photo, 'photo.webp')
      form.append('thumb', files.thumb, 'thumb.webp')
      return call<HousingRecord>(ENDPOINTS.housing.photo(id), { method: 'POST', formData: form })
    },
    deletePhoto: (id, kind) => call<HousingRecord>(ENDPOINTS.housing.photo(id, kind), { method: 'DELETE' }),
    nextSerial: async (projectType) =>
      (await get<{ next_serial: number }>(ENDPOINTS.housing.nextSerial(projectType))).next_serial,
    changeSerial: (id, serialNo) => send<HousingRecord>('POST', ENDPOINTS.housing.serial(id), { serial_no: serialNo }),
    listActivity: (params) => restRequest<Page<ActivityEntry>>(baseUrl, ENDPOINTS.housing.activity(activityQuery(params))),
    async logActivity(action, details, projectType) {
      if (SERVER_LOGGED_EVENTS.has(action)) return
      try {
        await restRequest(baseUrl, ENDPOINTS.housing.activity(), { method: 'POST', body: { action, details, project_type: projectType } })
      } catch {
        // চুক্তি অনুযায়ী নীরব ব্যর্থতা (Supabase অ্যাডাপ্টারের মতো): লগের ইভেন্ট না গেলে মূল কাজ (ইম্পোর্ট ইত্যাদি) থামে না
      }
    },
  }
}

/**
 * REST মোডে ছবি রাখা/মোছা HousingApi.uploadPhoto/deletePhoto এর endpoint দিয়ে হয়;
 * এই ইন্টারফেস শুধু URL গণনার জন্য থাকবে (publicUrl/pathFromUrl)।
 */
export function createRestImageStorage(_baseUrl: string): ImageStorage {
  return {
    upload: async () => notImplemented('upload'),
    delete: async () => notImplemented('delete'),
    move: async () => notImplemented('move'),
    publicUrl: () => notImplemented('publicUrl'),
    pathFromUrl: () => null,
  }
}
