/**
 * REST endpoint পাথ — docs/api/API_CONTRACT.md এর সাথে হুবহু মিলে থাকতে হবে।
 * বেস URL (VITE_API_BASE_URL) এর সাপেক্ষে। সার্ভার কন্ট্রাক্টের প্রতিটি /api/x পাথ /api/v1/x এ দেয়।
 */
import type { PhotoKind, ProjectKey, ProjectType } from '../interfaces/types'

const API = '/api/v1'
const enc = encodeURIComponent

/** `?a=1&b=2`, অথবা কিছু না থাকলে ফাঁকা */
const withQuery = (path: string, query?: URLSearchParams) => {
  const qs = query?.toString()
  return qs ? `${path}?${qs}` : path
}

export const ENDPOINTS = {
  auth: {
    login: () => `${API}/auth/login`, // POST
    logout: () => `${API}/auth/logout`, // POST
    me: () => `${API}/auth/me`, // GET
  },
  housing: {
    list: (query?: URLSearchParams) => withQuery(`${API}/housing`, query), // GET (query: project_type, serial_no, year, division, district, upazila, q, page, page_size, sort, order)
    create: () => `${API}/housing`, // POST
    bulk: () => `${API}/housing/bulk`, // POST (নতুন যোগ) / PUT (সিরিয়াল ধরে আপডেট)
    stats: (query?: URLSearchParams) => withQuery(`${API}/housing/stats`, query), // GET ?project_type=
    years: (query?: URLSearchParams) => withQuery(`${API}/housing/years`, query), // GET ?project_type=
    filterOptions: (query?: URLSearchParams) => withQuery(`${API}/housing/filter-options`, query), // GET ?project_type=
    nextSerial: (projectType: ProjectType) => `${API}/housing/next-serial?project_type=${projectType}`, // GET
    serial: (id: string) => `${API}/housing/${encodeURIComponent(id)}/serial`, // POST { serial_no } (সিরিয়াল বদল)
    activity: (query?: URLSearchParams) => withQuery(`${API}/housing/activity`, query), // GET (এডমিন, ফিল্টার+পেজিনেশন) / POST { action, details, project_type } (ক্লায়েন্ট-ইভেন্ট)
    bySerial: (projectType: ProjectType, serialNo: number) =>
      `${API}/housing/${projectType}/serial/${serialNo}`, // GET
    bySerials: (projectType: ProjectType, serialNos: number[]) =>
      `${API}/housing/${projectType}/serials?nos=${serialNos.join(',')}`, // GET (≤ 100 per call)
    byId: (id: string) => `${API}/housing/${encodeURIComponent(id)}`, // GET / PUT / DELETE
    photo: (id: string, kind?: PhotoKind) =>
      `${API}/housing/${encodeURIComponent(id)}/photo${kind ? `?kind=${kind}` : ''}`, // POST (multipart) / DELETE ?kind=
  },
  /** প্রকল্প ও ফিল্ড (docs/api/PROJECTS_API_CONTRACT.md §৪.১–৪.২) */
  projects: {
    list: (query?: URLSearchParams) => withQuery(`${API}/projects`, query), // GET ?include=fields&drafts=1 · POST
    overview: (query?: URLSearchParams) => withQuery(`${API}/projects/overview`, query), // GET ?drafts=1
    order: () => `${API}/projects/order`, // PUT { keys }
    byKey: (key: ProjectKey) => `${API}/projects/${enc(key)}`, // GET · PATCH (If-Match) · DELETE
    cover: (key: ProjectKey) => `${API}/projects/${enc(key)}/cover`, // PUT multipart · DELETE
    fields: (key: ProjectKey) => `${API}/projects/${enc(key)}/fields`, // POST
    fieldsOrder: (key: ProjectKey) => `${API}/projects/${enc(key)}/fields/order`, // PUT { ids }
    fieldUsage: (key: ProjectKey, fieldKey: string) => `${API}/projects/${enc(key)}/fields/${enc(fieldKey)}/usage`, // GET
    fieldRenameValue: (key: ProjectKey, fieldKey: string) => `${API}/projects/${enc(key)}/fields/${enc(fieldKey)}/rename-value`, // POST { from, to }
  },
  fields: {
    byId: (id: string) => `${API}/fields/${enc(id)}`, // PATCH · DELETE
  },
  /** ইউজার-ব্যবস্থাপনা (শুধু মূল এডমিন; চুক্তি v১.৫ §৪.৭) — নিজস্ব সার্ভারে নেই (প্যারিটি a8e2154 এ স্থির) */
  adminUsers: {
    list: () => `${API}/admin/users`, // GET
    save: () => `${API}/admin/users`, // PUT
  },
} as const
