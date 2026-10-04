/**
 * REST endpoint পাথ — docs/api/API_CONTRACT.md এর সাথে হুবহু মিলে থাকতে হবে।
 * বেস URL (VITE_API_BASE_URL) এর সাপেক্ষে।
 */
import type { PhotoKind, ProjectType } from '../interfaces/types'

export const ENDPOINTS = {
  auth: {
    login: () => '/api/auth/login', // POST
    logout: () => '/api/auth/logout', // POST
    me: () => '/api/auth/me', // GET
  },
  housing: {
    list: () => '/api/housing', // GET (query: project_type, year, division, district, upazila, q, page, page_size, sort, order)
    create: () => '/api/housing', // POST
    bulk: () => '/api/housing/bulk', // POST (নতুন যোগ) / PUT (সিরিয়াল ধরে আপডেট)
    stats: () => '/api/housing/stats', // GET ?project_type=
    years: () => '/api/housing/years', // GET ?project_type=
    nextSerial: (projectType: ProjectType) => `/api/housing/next-serial?project_type=${projectType}`, // GET
    serial: (id: string) => `/api/housing/${encodeURIComponent(id)}/serial`, // POST { serial_no } (সিরিয়াল বদল)
    activity: () => '/api/housing/activity', // GET (এডমিন, ফিল্টার+পেজিনেশন) / POST { action, details, project_type } (ক্লায়েন্ট-ইভেন্ট)
    bySerial: (projectType: ProjectType, serialNo: number) =>
      `/api/housing/${projectType}/serial/${serialNo}`, // GET
    bySerials: (projectType: ProjectType, serialNos: number[]) =>
      `/api/housing/${projectType}/serials?nos=${serialNos.join(',')}`, // GET (≤ 100 per call)
    byId: (id: string) => `/api/housing/${encodeURIComponent(id)}`, // GET / PUT / DELETE
    photo: (id: string, kind?: PhotoKind) =>
      `/api/housing/${encodeURIComponent(id)}/photo${kind ? `?kind=${kind}` : ''}`, // POST (multipart) / DELETE ?kind=
  },
} as const
