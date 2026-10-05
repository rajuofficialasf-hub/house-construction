/**
 * ডোমেইন টাইপ (সব প্রকল্প)।
 * ব্যাকএন্ড-নিরপেক্ষ: Supabase ও REST দুই অ্যাডাপ্টারই এই টাইপে ডাটা ফেরত দেয়।
 * ফিল্ডের নাম ডাটাবেস টেবিল (`housing_beneficiaries`, `projects`, `project_fields`) ও docs/API_CONTRACT.md এর সাথে হুবহু মেলে।
 */

/** প্রকল্পের স্থায়ী key (`projects.key`), যেমন 'semi_pucca', 'tin', 'self_reliance' — ডাটাবেস-চালিত, তাই string */
export type ProjectKey = string
/** পুরনো নাম (পর্ব ১) — নতুন কোডে ProjectKey। প্রকল্পের তালিকা আসে রেজিস্ট্রি থেকে (src/features/projects/registry) */
export type ProjectType = ProjectKey

// ---------------------------------------------------------------- প্রকল্প রেজিস্ট্রি (পর্ব ২; SQL ১০)
export type PhotoMode = 'before_after' | 'after_only' | 'none'
export type GeoDepth = 'upazila' | 'union'
export type GeoLevel = 'division' | 'district' | 'upazila' | 'union'
export const FIELD_TYPES = ['text', 'long_text', 'number', 'money', 'category', 'date', 'phone'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
/** public = সবাই দেখে; admin = গোপন (মান থাকে beneficiary_private এ, শুধু এডমিন) */
export type FieldVisibility = 'public' | 'admin'

/** সিস্টেম ফিল্ড (রেকর্ডের নিজস্ব কলাম) — name/division/district/upazila/year সবসময় চালু ও আবশ্যক */
export type CoreFieldKey =
  | 'year'
  | 'name'
  | 'father_or_husband_name'
  | 'division'
  | 'district'
  | 'upazila'
  | 'union_name'
  | 'address'
export interface CoreFieldConfig {
  label_bn?: string
  label_en?: string
  enabled?: boolean
  required?: boolean
}
export type CoreFieldsConfig = Partial<Record<CoreFieldKey, CoreFieldConfig>>

export type StatCardKind = 'count' | 'geo' | 'sum' | 'distinct'
/** স্ট্যাট কার্ডের উপস্থাপনা; সংখ্যা আসে ProjectStats থেকে */
export interface StatCardDef {
  id: string
  kind: StatCardKind
  /** kind = geo */
  level?: GeoLevel
  /** kind = sum (money/number) বা distinct (category) — ফিল্ডের key */
  field?: string
  label_bn: string
  label_en: string
  /** হোম কার্ডে আলাদা লেবেল (না থাকলে label_*) */
  home_label_bn?: string
  home_label_en?: string
  icon?: string
  /** হোম কার্ডে দেখাবে (প্রতি প্রকল্পে ≤ ৩টি) */
  home?: boolean
  format?: 'money' | 'number'
}

export interface ProjectDisplay {
  show_map?: boolean
  geo_columns?: 'split' | 'merged'
  /** বিতরণ চার্টের ক্যাটাগরি ফিল্ড */
  breakdown_field?: string
}

export interface ProjectField {
  id: string
  project_key: ProjectKey
  /** প্রকল্পের ভেতরে অনন্য; রেকর্ডের extra.<key> (পাবলিক) বা beneficiary_private.data.<key> (গোপন) */
  key: string
  label_bn: string
  /** খালি হতে পারে (দেখানোর সময় pick() বাংলায় ফেরে) */
  label_en: string
  help_bn: string
  help_en: string
  type: FieldType
  /** এখন ব্যবহার নেই (ভবিষ্যতের select ধরনের জন্য) */
  options: unknown[]
  required: boolean
  visibility: FieldVisibility
  show_in_table: boolean
  show_in_card: boolean
  show_in_detail: boolean
  filterable: boolean
  searchable: boolean
  fill_down: boolean
  max_length: number | null
  min_value: number | null
  max_value: number | null
  import_aliases: string[]
  sort_order: number
  /** false = আর্কাইভ */
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  key: ProjectKey
  /** গ্রুপের key (যেমন semi_pucca → housing); একক প্রকল্পে null */
  parent_key: ProjectKey | null
  /** গ্রুপে রেকর্ড, ফিল্ড, ছবি বা ফাইল-প্রিফিক্স থাকে না */
  is_group: boolean
  slug: string
  name_bn: string
  name_en: string
  summary_bn: string
  summary_en: string
  description_bn: string
  description_en: string
  unit_bn: string
  unit_en: string
  photo_mode: PhotoMode
  prev_label_bn: string
  prev_label_en: string
  current_label_bn: string
  current_label_en: string
  geo_depth: GeoDepth
  core_fields: CoreFieldsConfig
  stat_cards: StatCardDef[]
  display: ProjectDisplay
  /** ছবির ফাইলনামের শুরু (semi, tin …); গ্রুপে null */
  file_prefix: string | null
  icon: string
  accent: string
  /** কভার ছবির স্টোরেজ পাথ (URL নয়) */
  cover_path: string | null
  sort_order: number
  is_published: boolean
  show_on_home: boolean
  created_at: string
  updated_at: string
  /** এই প্রকল্পের ফিল্ড (sort_order অনুযায়ী; আর্কাইভসহ); anon পায় শুধু পাবলিক */
  fields: ProjectField[]
}

/** প্রকল্প তৈরি: key/slug/নাম আবশ্যক; সবসময় খসড়া হিসেবে তৈরি হয় (প্রকাশ আলাদা update এ) */
export type ProjectInput = Pick<Project, 'key' | 'slug' | 'name_bn' | 'name_en'> &
  Partial<Omit<Project, 'key' | 'slug' | 'name_bn' | 'name_en' | 'fields' | 'is_published' | 'created_at' | 'updated_at'>>
/** প্রকল্প বদল (key বদলায় না; প্রকাশিত হলে slug/parent_key বদল ডাটাবেস আটকায়) */
export type ProjectPatch = Partial<Omit<Project, 'key' | 'fields' | 'created_at' | 'updated_at'>>
export type ProjectFieldInput = Pick<ProjectField, 'key' | 'label_bn' | 'type'> &
  Partial<Omit<ProjectField, 'id' | 'project_key' | 'key' | 'label_bn' | 'type' | 'created_at' | 'updated_at'>>
/** ফিল্ড বদল (ডাটা আসার পর key/type/visibility বদল ডাটাবেস আটকায়) */
export type ProjectFieldPatch = Partial<Omit<ProjectField, 'id' | 'project_key' | 'created_at' | 'updated_at'>>

/** একটি ফিল্ড কতগুলো রেকর্ডে ব্যবহৃত (ক্যাটাগরি হলে মান অনুযায়ী; গোপন ফিল্ডে মানের তালিকা খালি) */
export interface FieldUsage {
  count: number
  values: { value: string; n: number }[]
}

/** ডাটাবেসের অবস্থা: full = SQL ১০–১২ চালানো; legacy = পুরনো ডাটাবেস (adapter ফলব্যাকে চলছে) */
export type BackendMode = 'full' | 'legacy'

/** রেকর্ডের কাস্টম (পাবলিক) মান: extra.<key> — টাকা/সংখ্যা JSON number, বাকি string */
export type ExtraValues = Record<string, string | number>

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
  /** ইউনিয়ন/পৌরসভা ('' = নেই); পুরনো ডাটাবেসে adapter '' বসায় */
  union_name: string
  address: string
  /** কাস্টম পাবলিক ফিল্ডের মান; পুরনো ডাটাবেসে adapter {} বসায় */
  extra: ExtraValues
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
  /** প্রকল্প ইউনিয়ন ব্যবহার করলে (geo_depth = union) পাঠানো হয়; নইলে adapter বাদ দেয় */
  union_name?: string
  /** প্রকল্পে কাস্টম ফিল্ড থাকলে পাঠানো হয়; নইলে adapter বাদ দেয় (পুরনো ডাটাবেসেও লেখা চলে) */
  extra?: ExtraValues
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

/**
 * "সিরিয়াল ধরে আপডেট" মোডের ইনপুট: প্রতিটি সারিতে serial_no আবশ্যক; অন্য ফিল্ড না দিলে, null বা '' দিলে অপরিবর্তিত।
 * কোনো ঐচ্ছিক মান মুছতে: `_clear: ['address', 'extra.item_name']` (আবশ্যক ফিল্ড মোছা যায় না)।
 */
export interface BulkUpdateInput {
  project_type: ProjectType
  rows: (Partial<Omit<HousingRecordInput, 'project_type' | 'serial_no'>> & { serial_no: number; _clear?: string[] })[]
}

export interface BulkUpdateResult {
  updated: number
  /** যেসব সিরিয়ালের রেকর্ড নেই */
  missing: number[]
}

/** `extra.<key>` = কাস্টম পাবলিক ফিল্ড অনুযায়ী সাজানো (key প্রকল্পের ফিল্ডের সাথে মিলিয়ে whitelist) */
export type SortField = 'serial_no' | 'year' | 'name' | 'created_at' | 'union_name' | `extra.${string}`
export type SortOrder = 'asc' | 'desc'

export interface ListParams {
  project_type?: ProjectType
  /** নির্দিষ্ট সিরিয়াল (এডমিন খোঁজা) */
  serial_no?: number
  year?: number
  division?: string
  district?: string
  upazila?: string
  /** ইউনিয়ন (হুবহু মিল; পুরনো ডাটাবেসে উপেক্ষিত) */
  union_name?: string
  /**
   * কাস্টম ফিল্ডের ফিল্টার: { category: 'গরু' } — হুবহু মিল।
   * শুধু প্রকল্পের পাবলিক ও filterable ফিল্ডের key গৃহীত; অন্য key নীরবে বাদ (whitelist)।
   */
  fields?: Record<string, string>
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

export interface NumericFieldStats {
  type: 'money' | 'number'
  sum: number
  count: number
}
export interface CategoryFieldStats {
  type: 'category'
  /** ভিন্ন মানের সংখ্যা ("মোট ক্যাটাগরি") */
  distinct: number
  /** মান → সংখ্যা ও টাকা/সংখ্যা ফিল্ডের যোগফল; হালকা (light) স্ট্যাটে নেই */
  by_value?: Record<string, { n: number; sums: Record<string, number> }>
}
export type FieldStats = NumericFieldStats | CategoryFieldStats

/**
 * প্রকল্পের পরিসংখ্যান (`project_stats`) — HousingStats এর সব কী, সাথে নতুন কী।
 * পুরনো ডাটাবেসে adapter `housing_stats` থেকে বানায়: by_union {}, fields {}, distinct.unions 0।
 */
export interface ProjectStats extends HousingStats {
  distinct: HousingStats['distinct'] & { unions: number }
  /** উপ-প্রকল্প অনুযায়ী মোট (গ্রুপে প্রতিটি সন্তান; একক প্রকল্পে নিজে) */
  by_project: Record<ProjectKey, number>
  /** key = "জেলা|উপজেলা|ইউনিয়ন"; হালকা স্ট্যাটে {} */
  by_union: Record<string, number>
  /** পাবলিক টাকা/সংখ্যা/ক্যাটাগরি ফিল্ড অনুযায়ী */
  fields: Record<string, FieldStats>
}

/** হোম পেইজের কার্ডের একটি ছবি (প্রকাশিত রেকর্ড থেকে) */
export interface OverviewFeatured {
  project_type: ProjectKey
  serial_no: number
  name: string
  thumb_url: string
  photo_updated_at: string | null
}

export interface ProjectOverviewItem
  extends Pick<
    Project,
    | 'key'
    | 'parent_key'
    | 'is_group'
    | 'slug'
    | 'name_bn'
    | 'name_en'
    | 'summary_bn'
    | 'summary_en'
    | 'unit_bn'
    | 'unit_en'
    | 'photo_mode'
    | 'icon'
    | 'accent'
    | 'cover_path'
    | 'sort_order'
    | 'is_published'
    | 'show_on_home'
    | 'stat_cards'
  > {
  /** হালকা স্ট্যাট */
  stats: ProjectStats
  featured: OverviewFeatured | null
  /** ছবি-বাকি রেকর্ড (শুধু এডমিনের খসড়াসহ ওভারভিউতে; বাকিদের null) */
  without_photo: number | null
}

/** হোম পেইজ ও ড্যাশবোর্ড: এক কলে সব প্রকল্প */
export interface ProjectOverview {
  projects: ProjectOverviewItem[]
  global: {
    /** প্রকাশিত একক/উপ-প্রকল্পের সংখ্যা (গ্রুপ বাদ) */
    projects: number
    total: number
    districts: number
  }
}

/** ফিল্টার ড্রপডাউনের জন্য: ডাটাবেসে বাস্তবে যেসব মান আছে */
export interface FilterOptions {
  years: number[]
  divisions: string[]
  districts: string[]
  upazilas: string[]
  /** "জেলা|উপজেলা|ইউনিয়ন" (stats.by_union থেকে; পুরনো ডাটাবেসে খালি) */
  unions: string[]
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
  /** ক্লায়েন্ট-ইভেন্ট (M-ধাপ ১০): CSV এক্সপোর্ট — details { rows, private } (মান নয়) */
  | 'records_export'
  // পর্ব ২ (SQL ১২): গোপন মান (শুধু ফিল্ডের নাম, মান নয়) আর প্রকল্প/ফিল্ডের সেটিং
  | 'private_update'
  | 'project_create'
  | 'project_update'
  | 'project_publish'
  | 'project_unpublish'
  | 'project_delete'
  | 'field_create'
  | 'field_update'
  | 'field_archive'
  | 'field_restore'
  | 'field_delete'
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

/**
 * এডমিনের ভূমিকা (পর্ব ২, ২০২৬-১০-০৫): 'main_admin' = মূল এডমিন (একজন) — যোগ, এডিট ও মোছা;
 * 'admin' = সাধারণ এডমিন — শুধু যোগ ও এডিট। মোছার নিষেধ ডাটাবেসে (RLS/ট্রিগার) প্রয়োগ হয়।
 */
export type AdminRole = 'admin' | 'main_admin'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  /** housing_admins টেবিল থেকে: main_admin (মোছা পারেন) বা admin */
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
