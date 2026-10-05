/**
 * REST endpoint পাথ — docs/api/API_CONTRACT.md এর সাথে হুবহু মিলে থাকতে হবে।
 * বেস URL (VITE_API_BASE_URL) এর সাপেক্ষে। সার্ভার কন্ট্রাক্টের প্রতিটি /api/x পাথ /api/v1/x এ দেয়।
 */
import type { PhotoKind, ProjectType } from '../interfaces/types'

const API = '/api/v1'

export const ENDPOINTS = {
  auth: {
    login: () => `${API}/auth/login`, // POST
    logout: () => `${API}/auth/logout`, // POST
    me: () => `${API}/auth/me`, // GET
  },
  housing: {
    list: () => `${API}/housing`, // GET (query: project_type, year, division, district, upazila, q, page, page_size, sort, order)
    create: () => `${API}/housing`, // POST
    bulk: () => `${API}/housing/bulk`, // POST (নতুন যোগ) / PUT (সিরিয়াল ধরে আপডেট)
    stats: () => `${API}/housing/stats`, // GET ?project_type=
    years: () => `${API}/housing/years`, // GET ?project_type=
    nextSerial: (projectType: ProjectType) => `${API}/housing/next-serial?project_type=${projectType}`, // GET
    serial: (id: string) => `${API}/housing/${encodeURIComponent(id)}/serial`, // POST { serial_no } (সিরিয়াল বদল)
    activity: () => `${API}/housing/activity`, // GET (এডমিন, ফিল্টার+পেজিনেশন) / POST { action, details, project_type } (ক্লায়েন্ট-ইভেন্ট)
    bySerial: (projectType: ProjectType, serialNo: number) =>
      `${API}/housing/${projectType}/serial/${serialNo}`, // GET
    bySerials: (projectType: ProjectType, serialNos: number[]) =>
      `${API}/housing/${projectType}/serials?nos=${serialNos.join(',')}`, // GET (≤ 100 per call)
    byId: (id: string) => `${API}/housing/${encodeURIComponent(id)}`, // GET / PUT / DELETE
    photo: (id: string, kind?: PhotoKind) =>
      `${API}/housing/${encodeURIComponent(id)}/photo${kind ? `?kind=${kind}` : ''}`, // POST (multipart) / DELETE ?kind=
  },
} as const
