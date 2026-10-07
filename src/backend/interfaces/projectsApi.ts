import type {
  FieldUsage,
  Project,
  ProjectField,
  ProjectFieldInput,
  ProjectFieldPatch,
  ProjectInput,
  ProjectKey,
  ProjectOverview,
  ProjectPatch,
} from './types'

/**
 * প্রকল্প-রেজিস্ট্রি ও প্রকল্প-সেটিংয়ের ইন্টারফেস। UI শুধু এটি ব্যবহার করবে, কখনো সরাসরি fetch নয়।
 *
 * পড়া (list, get, overview): লগইন ছাড়া — শুধু প্রকাশিত প্রকল্প ও পাবলিক ফিল্ড; এডমিন খসড়া ও গোপন ফিল্ডও পান।
 * লেখা: এডমিন; মোছা (delete, deleteField) শুধু মূল এডমিন। অনুমতি ব্যাকএন্ডে যাচাই হয়।
 *
 * রেকর্ড ও পরিসংখ্যান HousingApi তে (stats(key) = project_stats)।
 */
export interface ProjectsApi {
  /**
   * সব প্রকল্প (ফিল্ডসহ, sort_order অনুযায়ী)।
   * includeDrafts = false (ডিফল্ট) হলে এডমিনের জন্যও শুধু প্রকাশিত (যার গ্রুপও প্রকাশিত)।
   */
  list(opts?: { includeDrafts?: boolean }): Promise<Project[]>
  /** key দিয়ে একটি (খসড়া শুধু এডমিন পান); না পেলে NOT_FOUND */
  get(key: ProjectKey): Promise<Project>
  /** হোম পেইজ/ড্যাশবোর্ড: সব প্রকল্প + হালকা স্ট্যাট + একটি ছবি, এক কলে */
  overview(opts?: { includeDrafts?: boolean }): Promise<ProjectOverview>

  /** প্রকল্প + ফিল্ড একসাথে (একটি ভুল হলে কিছুই তৈরি হয় না); সবসময় খসড়া */
  create(input: ProjectInput, fields?: ProjectFieldInput[]): Promise<Project>
  /**
   * বদল। expectedUpdatedAt দিলে অন্য কেউ এর মধ্যে বদলালে CONFLICT (দুই এডমিনের একসাথে এডিট)।
   * প্রকাশ/অপ্রকাশ = { is_published }।
   */
  update(key: ProjectKey, patch: ProjectPatch, opts?: { expectedUpdatedAt?: string }): Promise<Project>
  /**
   * কভার ছবি (M-ধাপ ১৫; চুক্তি §৪.১.৮): WebP (ক্লায়েন্টে কম্প্রেস করা), ≤ ৫ MB → `housing/_projects/{key}/cover.webp`
   * (একই পাথে ওভাররাইট), `cover_path` বসে; বদলানো প্রকল্প ফেরত। এডমিন।
   */
  uploadCover(key: ProjectKey, file: Blob): Promise<Project>
  /** কভার ছবির ফাইল ও `cover_path` মোছা — শুধু মূল এডমিন */
  deleteCover(key: ProjectKey): Promise<Project>
  /** মূল এডমিন; রেকর্ড থাকলে (বা আগে ছিল) ডাটাবেস আটকায় */
  delete(key: ProjectKey): Promise<void>
  /** keys এর ক্রমে sort_order */
  reorder(keys: ProjectKey[]): Promise<void>

  createField(projectKey: ProjectKey, input: ProjectFieldInput): Promise<ProjectField>
  /** আর্কাইভ = { is_active: false } */
  updateField(id: string, patch: ProjectFieldPatch): Promise<ProjectField>
  /** মূল এডমিন; ডাটা থাকলে ডাটাবেস আটকায় (আর্কাইভ করুন) */
  deleteField(id: string): Promise<void>
  reorderFields(projectKey: ProjectKey, ids: string[]): Promise<void>
  /** ফিল্ডটি কতগুলো রেকর্ডে আছে (ক্যাটাগরি হলে মান অনুযায়ী) */
  fieldUsage(projectKey: ProjectKey, fieldKey: string): Promise<FieldUsage>
  /** ক্যাটাগরির বানান একীকরণ (from → to); বদলানো রেকর্ডের সংখ্যা ফেরত */
  renameFieldValue(projectKey: ProjectKey, fieldKey: string, from: string, to: string): Promise<number>
}
