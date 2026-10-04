/**
 * ঘর নির্মাণ প্রকল্পের ডোমেইন টাইপ।
 * ব্যাকএন্ড-নিরপেক্ষ: Supabase ও REST দুই অ্যাডাপ্টারই এই টাইপে ডাটা ফেরত দেয়।
 * ফিল্ডের নাম ডাটাবেস টেবিল `housing_beneficiaries` ও docs/api/API_CONTRACT.md এর সাথে হুবহু মেলে।
 */

export type ProjectType = 'semi_pucca' | 'tin'
export const PROJECT_TYPES: readonly ProjectType[] = ['semi_pucca', 'tin'] as const

/** কোন ছবি: আগের ঘর (prev) না বর্তমান ঘর (current) */
export type PhotoKind = 'prev' | 'current'
/** পূর্ণ ছবি না থাম্বনেইল */
export type PhotoVariant = 'full' | 'thumb'

export interface HousingRecord {
  id: string
  project_type: ProjectType
  /** প্রতি project_type এ আলাদা, ১ থেকে শুরু, অপরিবর্তনীয়, পুনঃব্যবহার হয় না */
  serial_no: number
  year: number
  name: string
  father_or_husband_name: string
  division: string
  district: string
  upazila: string
  address: string
  prev_photo_url: string | null
  prev_thumb_url: string | null
  current_photo_url: string | null
  current_thumb_url: string | null
  /** শীটের মূল SharePoint/OneDrive লিঙ্ক; শুধু রেফারেন্স, UI তে দেখানো হয় না */
  prev_photo_source: string | null
  current_photo_source: string | null
  /** ছবি বদলালে বদলায়; ছবির URL এ ?v= হিসেবে ক্যাশ ভাঙতে ব্যবহার হয় */
  photo_updated_at: string | null
  created_at: string
  updated_at: string
}

/** create এর ইনপুট (সার্ভার-নির্ধারিত ও ছবির ফিল্ড বাদ; source লিঙ্ক ঐচ্ছিক) */
export interface HousingRecordInput {
  project_type: ProjectType
  /** না দিলে সার্ভার স্বয়ংক্রিয় (পরবর্তী সিরিয়াল); দিলে অনন্য হতে হবে (CONFLICT নইলে) */
  serial_no?: number
  year: number
  name: string
  father_or_husband_name: string
  division: string
  district: string
  upazila: string
  address: string
  prev_photo_source?: string | null
  current_photo_source?: string | null
}

/** update এর ইনপুট: আংশিক; project_type ও serial_no বদলানো যায় না (সিরিয়াল বদল: changeSerial) */
export type HousingRecordPatch = Partial<Omit<HousingRecordInput, 'project_type' | 'serial_no'>>

/** শীট থেকে ইম্পোর্টের এক সারি (project_type ব্যাচ-স্তরে আসে) */
export interface HousingBulkRow extends Omit<HousingRecordInput, 'project_type'> {
  /** mode = use_given_serial হলে আবশ্যক */
  serial_no?: number
}

export type BulkInsertMode = 'assign_serial' | 'use_given_serial'

export interface BulkInsertInput {
  project_type: ProjectType
  mode: BulkInsertMode
  rows: HousingBulkRow[]
}

export interface BulkInsertResult {
  inserted: number
  failed: { row_index: number; error: ApiError }[]
}

/** "সিরিয়াল ধরে আপডেট" মোডের ইনপুট: প্রতিটি সারিতে serial_no আবশ্যক; অন্য ফিল্ড না দিলে অপরিবর্তিত */
export interface BulkUpdateInput {
  project_type: ProjectType
  rows: (Partial<Omit<HousingRecordInput, 'project_type' | 'serial_no'>> & { serial_no: number })[]
}

export interface BulkUpdateResult {
  updated: number
  /** যেসব সিরিয়ালের রেকর্ড নেই */
  missing: number[]
}

export type SortField = 'serial_no' | 'year' | 'name' | 'created_at'
export type SortOrder = 'asc' | 'desc'

export interface ListParams {
  project_type?: ProjectType
  /** নির্দিষ্ট সিরিয়াল (এডমিন খোঁজা) */
  serial_no?: number
  year?: number
  division?: string
  district?: string
  upazila?: string
  /** নাম / পিতা-স্বামীর নাম / ঠিকানায় আংশিক মিল */
  q?: string
  /** ১ থেকে শুরু */
  page?: number
  /** ডিফল্ট ৫০, সর্বোচ্চ ১০০ */
  page_size?: number
  sort?: SortField
  order?: SortOrder
}

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export interface PageMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface Page<T> {
  data: T[]
  meta: PageMeta
}

/** পরিসংখ্যান; project_type না দিলে দুই প্রকল্প মিলিয়ে */
export interface HousingStats {
  total: number
  by_year: Record<string, number>
  by_division: Record<string, number>
  by_district: Record<string, number>
  by_upazila: Record<string, number>
  /**
   * ডাটাবেসে থাকা ঠিকানা থেকে distinct সংখ্যা (স্থির তালিকার মোট নয়)।
   * upazilas = distinct (district, upazila) জোড়া, যাতে একই নামের উপজেলা ভিন্ন জেলায় আলাদা গোনা হয়।
   */
  distinct: {
    divisions: number
    districts: number
    upazilas: number
  }
  /** মানচিত্রের জন্য: key = "জেলা|উপজেলা" (একই নামের উপজেলা ভিন্ন জেলায় আলাদা) */
  by_location: Record<string, number>
}

/** ফিল্টার ড্রপডাউনের জন্য: ডাটাবেসে বাস্তবে যেসব মান আছে */
export interface FilterOptions {
  years: number[]
  divisions: string[]
  districts: string[]
  upazilas: string[]
}

export interface PhotoFiles {
  /** পূর্ণ ছবি (jpeg/png/webp) */
  photo: Blob
  /** থাম্বনেইল (ক্লায়েন্টে তৈরি, jpeg) */
  thumb: Blob
}

// ---------------------------------------------------------------- একটিভিটি লগ
export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'photo_update'
  | 'serial_change'
  | 'login'
  | 'logout'
  | 'import_run'
  | 'photo_bulk_run'
  | (string & {})

export interface ActivityEntry {
  id: number
  at: string
  actor_id: string | null
  /** ইমেইল; স্ক্রিপ্ট হলে 'service_role' */
  actor_email: string | null
  action: ActivityAction
  project_type: ProjectType | null
  record_id: string | null
  serial_no: number | null
  record_name: string | null
  /** update/photo_update/serial_change: { changes: { field: { old, new } }, photo_kinds: [] }; create/delete: snapshot; ইভেন্ট: যেকোনো */
  details: Record<string, unknown>
}

export interface ActivityListParams {
  action?: ActivityAction
  project_type?: ProjectType
  /** নির্দিষ্ট রেকর্ডের ইতিহাস */
  record_id?: string
  actor_email?: string
  /** ISO তারিখ (এর পর থেকে) */
  from?: string
  /** ISO তারিখ (এর আগে পর্যন্ত) */
  to?: string
  page?: number
  page_size?: number
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'CONFIG_ERROR'
  | 'NOT_IMPLEMENTED'

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}

/** সব অ্যাডাপ্টার ব্যর্থতায় এই ক্লাস throw করবে, যাতে UI একইভাবে হ্যান্ডেল করতে পারে */
export class HousingApiError extends Error implements ApiError {
  readonly code: ApiErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'HousingApiError'
    this.code = code
    this.details = details
  }

  static is(err: unknown): err is HousingApiError {
    return err instanceof HousingApiError
  }

  /** যেকোনো throw হওয়া মানকে HousingApiError এ রূপান্তর (UI তে একরকম হ্যান্ডলিংয়ের জন্য) */
  static from(err: unknown): HousingApiError {
    if (HousingApiError.is(err)) return err
    const message = err instanceof Error ? err.message : 'অজানা ত্রুটি'
    return new HousingApiError('INTERNAL_ERROR', message)
  }
}

/** এডমিনের ভূমিকা — আপাতত শুধু 'admin'; ভবিষ্যতে যোগ করলে এই ইউনিয়ন বাড়াতে হবে */
export type AdminRole = 'admin'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  /** housing_admins টেবিল থেকে; আপাতত সবার সমান অধিকার */
  role: AdminRole
}

export interface UploadTarget {
  project_type: ProjectType
  serial_no: number
  kind: PhotoKind
  variant: PhotoVariant
}

export interface UploadResult {
  /** স্টোরেজ পাথ, যেমন semi/semi_0001_prev.jpg */
  path: string
  /** পাবলিক URL (?v= ছাড়া) */
  url: string
}
