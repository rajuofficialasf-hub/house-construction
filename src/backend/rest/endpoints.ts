/**
 * REST endpoint পাথ — docs/API_CONTRACT.md **v1.0** এর সাথে হুবহু মিলে থাকতে হবে (পর্ব ২, M-ধাপ ৪)।
 * বেস URL (VITE_API_BASE_URL) এর সাপেক্ষে। সব প্রকল্পের জন্য একই পাথ — প্রকল্প চেনা হয় `:key` দিয়ে।
 * নিজস্ব সার্ভার এখনো নেই (ধাপ ১৩ স্থগিত); তাই v0.9 থেকে পাথ বদলালে কিছু ভাঙে না।
 */
import type { PhotoKind, ProjectKey } from '../interfaces/types'

const enc = encodeURIComponent

export const ENDPOINTS = {
  auth: {
    login: () => '/api/auth/login', // POST
    logout: () => '/api/auth/logout', // POST
    me: () => '/api/auth/me', // GET
  },
  projects: {
    /** GET ?include=fields&drafts=1 (খসড়া ও গোপন ফিল্ড শুধু এডমিন) · POST (এডমিন; প্রকল্প + fields একসাথে) */
    list: () => '/api/projects',
    /** GET (পাবলিক) */
    overview: () => '/api/projects/overview',
    /** GET · PATCH (এডমিন; If-Match: <updated_at>, না মিললে 409) · DELETE (মূল এডমিন) */
    byKey: (key: ProjectKey) => `/api/projects/${enc(key)}`,
    /** PUT { keys: [] } (এডমিন) */
    order: () => '/api/projects/order',
    /** PUT multipart (এডমিন) — কভার ছবি */
    cover: (key: ProjectKey) => `/api/projects/${enc(key)}/cover`,
    /** GET (পড়া পাবলিক) · POST (এডমিন) */
    fields: (key: ProjectKey) => `/api/projects/${enc(key)}/fields`,
    /** PUT { ids: [] } (এডমিন) */
    fieldsOrder: (key: ProjectKey) => `/api/projects/${enc(key)}/fields/order`,
    /** GET (এডমিন) */
    fieldUsage: (key: ProjectKey, fieldKey: string) => `/api/projects/${enc(key)}/fields/${enc(fieldKey)}/usage`,
    /** POST { from, to } (এডমিন) — ক্যাটাগরির বানান একীকরণ */
    fieldRenameValue: (key: ProjectKey, fieldKey: string) =>
      `/api/projects/${enc(key)}/fields/${enc(fieldKey)}/rename-value`,
    /** GET ?light=1 (পাবলিক; খসড়া শুধু এডমিন) */
    stats: (key: ProjectKey) => `/api/projects/${enc(key)}/stats`,
    /** GET (পাবলিক) — বছরের তালিকা */
    years: (key: ProjectKey) => `/api/projects/${enc(key)}/years`,
    /** GET (খসড়ায় শুধু এডমিন; বাকিদের next_serial: null) */
    nextSerial: (key: ProjectKey) => `/api/projects/${enc(key)}/next-serial`,
    /** GET ?year&division&district&upazila&union_name&q&f.<key>=&sort&order&page&page_size · POST (এডমিন) */
    records: (key: ProjectKey) => `/api/projects/${enc(key)}/records`,
    /** POST (নতুন যোগ) / PUT (সিরিয়াল ধরে আপডেট) — এডমিন */
    recordsBulk: (key: ProjectKey) => `/api/projects/${enc(key)}/records/bulk`,
    /** POST { ids } (এডমিন; ≤ ১০০) — অনেক রেকর্ডের গোপন মান একসাথে (গোপনসহ CSV এক্সপোর্ট, চুক্তি v১.১) */
    recordsPrivate: (key: ProjectKey) => `/api/projects/${enc(key)}/records/private`,
    /** GET (পাবলিক) */
    recordBySerial: (key: ProjectKey, serialNo: number) => `/api/projects/${enc(key)}/records/serial/${serialNo}`,
    /** GET (পাবলিক; ≤ ১০০ প্রতি কলে) */
    recordsBySerials: (key: ProjectKey, serialNos: number[]) =>
      `/api/projects/${enc(key)}/records/serials?nos=${serialNos.join(',')}`,
  },
  fields: {
    /** PATCH (এডমিন) · DELETE (মূল এডমিন) */
    byId: (id: string) => `/api/fields/${enc(id)}`,
  },
  records: {
    /** GET (পাবলিক) · PATCH (এডমিন) · DELETE (মূল এডমিন) */
    byId: (id: string) => `/api/records/${enc(id)}`,
    /** GET · PUT (এডমিন) — গোপন ফিল্ডের মান */
    private: (id: string) => `/api/records/${enc(id)}/private`,
    /** POST { serial_no } (এডমিন) — সিরিয়াল বদল */
    serial: (id: string) => `/api/records/${enc(id)}/serial`,
    /** PUT multipart (এডমিন) · DELETE (মূল এডমিন) */
    photo: (id: string, slot: PhotoKind) => `/api/records/${enc(id)}/photos/${slot}`,
  },
  /** GET (এডমিন, ফিল্টার+পেজিনেশন) / POST { action, details, project_type } (ক্লায়েন্ট-ইভেন্ট) */
  activity: () => '/api/activity',
} as const
