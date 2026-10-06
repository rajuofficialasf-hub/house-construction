/**
 * REST endpoint পাথ — docs/api/PROJECTS_API_CONTRACT.md এর সাথে হুবহু মিলে থাকতে হবে।
 * বেস URL (VITE_API_BASE_URL) এর সাপেক্ষে। সার্ভার কন্ট্রাক্টের প্রতিটি /api/x পাথ /api/v1/x এ দেয়।
 */
import type { PhotoKind, ProjectKey } from '../interfaces/types'

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
  /** রেকর্ড (docs/api/PROJECTS_API_CONTRACT.md §৪.৩–৪.৪) */
  records: {
    list: (key: ProjectKey, query?: URLSearchParams) => withQuery(`${API}/projects/${enc(key)}/records`, query), // GET · POST
    bulk: (key: ProjectKey) => `${API}/projects/${enc(key)}/records/bulk`, // POST (নতুন) · PUT (সিরিয়াল ধরে)
    privateMany: (key: ProjectKey) => `${API}/projects/${enc(key)}/records/private`, // POST { ids }
    bySerial: (key: ProjectKey, serialNo: number) => `${API}/projects/${enc(key)}/records/serial/${serialNo}`, // GET
    bySerials: (key: ProjectKey, serialNos: number[]) => `${API}/projects/${enc(key)}/records/serials?nos=${serialNos.join(',')}`, // GET (≤ ১০০)
    stats: (key: ProjectKey, query?: URLSearchParams) => withQuery(`${API}/projects/${enc(key)}/stats`, query), // GET ?light=1
    years: (key: ProjectKey) => `${API}/projects/${enc(key)}/years`, // GET
    nextSerial: (key: ProjectKey) => `${API}/projects/${enc(key)}/next-serial`, // GET
    byId: (id: string) => `${API}/records/${enc(id)}`, // GET · PATCH · DELETE
    serial: (id: string) => `${API}/records/${enc(id)}/serial`, // POST { serial_no }
    photo: (id: string, kind: PhotoKind) => `${API}/records/${enc(id)}/photos/${kind}`, // PUT multipart · DELETE
    private: (id: string) => `${API}/records/${enc(id)}/private`, // GET · PUT { data }
  },
  activity: (query?: URLSearchParams) => withQuery(`${API}/activity`, query), // GET (এডমিন) · POST { action, details, project_type }
  /** ইউজার-ব্যবস্থাপনা (শুধু মূল এডমিন; চুক্তি v১.৫ §৪.৭) — নিজস্ব সার্ভারে নেই (প্যারিটি a8e2154 এ স্থির) */
  adminUsers: {
    list: () => `${API}/admin/users`, // GET
    save: () => `${API}/admin/users`, // PUT
  },
} as const
