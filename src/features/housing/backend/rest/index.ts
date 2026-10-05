/**
 * REST অ্যাডাপ্টার — নিজস্ব সার্ভারের সাথে docs/api/API_CONTRACT.md অনুযায়ী (পাথ: ./endpoints.ts, helper: ./http.ts)।
 * AuthProvider ও HousingApi-র পড়ার মেথড বাস্তবায়িত। লেখা ও ImageStorage এখনো কাঠামো:
 * docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md এর C4 (লেখা) ও C5 (ছবি)।
 */
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  MAX_PAGE_SIZE,
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
    page: Math.max(1, Math.floor(params.page ?? 1)),
    page_size: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.page_size ?? DEFAULT_PAGE_SIZE))),
    sort: params.sort,
    order: params.order,
  }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return query
}

const projectQuery = (projectType?: ProjectType) =>
  new URLSearchParams(projectType ? { project_type: projectType } : {})

export function createRestHousingApi(baseUrl: string): HousingApi {
  const get = async <T>(path: string) => (await restRequest<{ data: T }>(baseUrl, path)).data

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
    create: async () => notImplemented('create'), // POST ENDPOINTS.housing.create
    update: async () => notImplemented('update'), // PUT  ENDPOINTS.housing.byId
    delete: async () => notImplemented('delete'), // DELETE ENDPOINTS.housing.byId
    bulkInsert: async () => notImplemented('bulkInsert'), // POST ENDPOINTS.housing.bulk
    bulkUpdateBySerial: async () => notImplemented('bulkUpdateBySerial'), // PUT  ENDPOINTS.housing.bulk
    stats: (projectType) => get<HousingStats>(ENDPOINTS.housing.stats(projectQuery(projectType))),
    years: (projectType) => get<number[]>(ENDPOINTS.housing.years(projectQuery(projectType))),
    filterOptions: (projectType) => get<FilterOptions>(ENDPOINTS.housing.filterOptions(projectQuery(projectType))),
    uploadPhoto: async () => notImplemented('uploadPhoto'), // POST ENDPOINTS.housing.photo (multipart)
    deletePhoto: async () => notImplemented('deletePhoto'), // DELETE ENDPOINTS.housing.photo?kind=
    nextSerial: async (projectType) =>
      (await get<{ next_serial: number }>(ENDPOINTS.housing.nextSerial(projectType))).next_serial,
    changeSerial: async () => notImplemented('changeSerial'), // POST ENDPOINTS.housing.serial
    listActivity: async () => notImplemented('listActivity'), // GET  ENDPOINTS.housing.activity
    logActivity: async () => {}, // POST ENDPOINTS.housing.activity (ব্যর্থতা নীরব)
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
