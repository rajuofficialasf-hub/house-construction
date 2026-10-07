import type {
  ActivityAction,
  ActivityEntry,
  ActivityListParams,
  BulkInsertInput,
  BulkInsertResult,
  BulkUpdateInput,
  BulkUpdateResult,
  FilterOptions,
  HousingRecord,
  HousingRecordInput,
  ExtraValues,
  HousingRecordPatch,
  ListParams,
  StatsFilters,
  Page,
  PhotoFiles,
  PhotoKind,
  ProjectStats,
  ProjectType,
} from './types'

/**
 * রেকর্ড পড়া/লেখার ইন্টারফেস। UI শুধু এটি ব্যবহার করবে, কখনো সরাসরি fetch নয়।
 *
 * পড়া (list, getById, getBySerial, getBySerials, stats, years, filterOptions): লগইন ছাড়া।
 * লেখা (create, update, delete, bulkInsert, uploadPhoto, deletePhoto): এডমিন লগইন লাগবে;
 * অনুমতি ব্যাকএন্ডে যাচাই হয়, ব্যর্থ হলে UNAUTHENTICATED / FORBIDDEN।
 *
 * ছবি: uploadPhoto ফাইল সংরক্ষণ (সিরিয়াল-ভিত্তিক পাথ, ওভাররাইট) + রেকর্ডের url কলাম + photo_updated_at
 * একসাথে হ্যান্ডেল করে, যাতে UI কে দুই ধাপ (storage → db) নিয়ে ভাবতে না হয়। ফাইল আগে থেকেই WebP (utils/imageProcessing.ts)।
 * প্রকল্পের ছবি-মোড মানা হয়: শুধু-পরের-ছবি প্রকল্পে 'prev' আর ছবিহীন প্রকল্পে যেকোনো ছবি VALIDATION_ERROR (আপলোডের আগেই)।
 *
 * পর্ব ২: রেকর্ডে union_name ও extra (কাস্টম পাবলিক মান); গোপন মান আলাদা (getPrivate/setPrivate)।
 */
export interface HousingApi {
  list(params: ListParams): Promise<Page<HousingRecord>>
  getById(id: string): Promise<HousingRecord>
  getBySerial(projectType: ProjectType, serialNo: number): Promise<HousingRecord>
  /** একসাথে অনেক সিরিয়াল (বাল্ক ছবি আপডেটে মিলানোর জন্য); যেগুলো নেই সেগুলো বাদ, এরর নয় */
  getBySerials(projectType: ProjectType, serialNos: number[]): Promise<HousingRecord[]>
  create(input: HousingRecordInput): Promise<HousingRecord>
  update(id: string, patch: HousingRecordPatch): Promise<HousingRecord>
  delete(id: string): Promise<void>
  bulkInsert(input: BulkInsertInput): Promise<BulkInsertResult>
  /** (project_type, serial_no) মিললে আপডেট; না মিললে missing এ (এরর নয়)। এক কলে ≤ ৫০০ সারি */
  bulkUpdateBySerial(input: BulkUpdateInput): Promise<BulkUpdateResult>
  /**
   * প্রকল্পের পরিসংখ্যান (গ্রুপ দিলে উপ-প্রকল্প মিলিয়ে)। projectType না দিলে 'housing' (পুরনো আচরণ: ঘর নির্মাণের সব)।
   * light = true: হোম কার্ডের হালকা সংস্করণ (by_union ও ক্যাটাগরির by_value বাদ)।
   * filters (খালি নয়): তালিকার একই ফিল্টারে গোনা হালকা পরিসংখ্যান, `filtered: true` — কার্ডগুলো ফিল্টার অনুযায়ী বদলায়।
   *   যে ব্যাকএন্ড ফিল্টার করে না (মক), সে মোট ফেরত দেয়, `filtered: false` — পাতা ভাঙে না।
   */
  stats(projectType?: ProjectType, opts?: { light?: boolean; filters?: StatsFilters }): Promise<ProjectStats>
  years(projectType?: ProjectType): Promise<number[]>
  filterOptions(projectType?: ProjectType): Promise<FilterOptions>
  uploadPhoto(id: string, kind: PhotoKind, files: PhotoFiles): Promise<HousingRecord>
  deletePhoto(id: string, kind: PhotoKind): Promise<HousingRecord>
  /** পরবর্তী স্বয়ংক্রিয় সিরিয়াল (পূর্বাভাস; প্রকৃত বরাদ্দ create এ) */
  nextSerial(projectType: ProjectType): Promise<number>
  /**
   * বিশেষ: সিরিয়াল বদল (এডমিন, সতর্কতাসহ)। অনন্যতা ব্যাকএন্ডে যাচাই (CONFLICT); ছবির ফাইল নতুন সিরিয়ালের পাথে সরে,
   * url কলাম আপডেট হয়; পুরনো সিরিয়াল পুনরায় ব্যবহার হয় না।
   */
  changeSerial(id: string, newSerialNo: number): Promise<HousingRecord>
  /** গোপন ফিল্ডের মান (এডমিন): { phone: '017…' }; না থাকলে {} */
  getPrivate(id: string): Promise<ExtraValues>
  /** গোপন মান পুরোটা বদলে রাখা (এডমিন); কোনো key বাদ দিলে সেটি মুছে যায়। মকে NOT_IMPLEMENTED */
  setPrivate(id: string, data: ExtraValues): Promise<ExtraValues>
  /**
   * অনেক রেকর্ডের গোপন মান একসাথে (এডমিন; গোপন কলামসহ CSV এক্সপোর্ট, M-ধাপ ১০) — এক কলে ≤ ১০০টি id।
   * ফল: { [record_id]: data } — মান নেই এমন রেকর্ড বাদ।
   */
  getPrivateMany(projectType: ProjectType, ids: string[]): Promise<Record<string, ExtraValues>>
  /** একটিভিটি লগ (এডমিন): নতুন আগে, পেজিনেশন */
  listActivity(params: ActivityListParams): Promise<Page<ActivityEntry>>
  /** ক্লায়েন্ট-ইভেন্ট লগ (এডমিন): login/logout/import_run/photo_bulk_run …; ব্যর্থ হলে throw নয় (লগ UI ভাঙবে না) */
  logActivity(action: ActivityAction, details?: Record<string, unknown>, projectType?: ProjectType): Promise<void>
}
