/**
 * সিস্টেম ফিল্ড (রেকর্ডের নিজস্ব কলাম, পরিকল্পনা §৫.২) — সব প্রকল্পে একই, শুধু লেবেল/চালু/আবশ্যক প্রকল্পভেদে
 * (`projects.core_fields`, resolveFields.ts এ মেলানো হয়)। লেবেল এখনকার ঘর নির্মাণের ফর্ম/ইম্পোর্টের হুবহু।
 *   year, name, division, district, upazila — সবসময় চালু ও আবশ্যক (প্রশ্ন ৩: সাল সব প্রকল্পে আবশ্যক)
 *   father_or_husband_name, address — ঐচ্ছিক (প্রকল্প চাইলে আবশ্যক বা বন্ধ)
 *   union_name — শুধু geo_depth = 'union' প্রকল্পে (প্রশ্ন ১১/১২: আবশ্যক নয়, প্রকল্প চাইলে আবশ্যক)
 * সীমাগুলো docs/API_CONTRACT.md §৫.১ এর সমান।
 */
import type { CoreFieldKey } from '@/backend'
import type { FieldDef } from './fieldValues'

const base: Omit<FieldDef, 'key' | 'type' | 'label_bn' | 'label_en'> = {
  source: 'system',
  help_bn: '',
  help_en: '',
  required: false,
  visibility: 'public',
  max_length: null,
  min_value: null,
  max_value: null,
  show_in_table: true,
  show_in_card: true,
  show_in_detail: true,
  filterable: false,
  searchable: false,
  fill_down: false,
  import_aliases: [],
  sort_order: 0,
  is_active: true,
}

export const SYSTEM_FIELDS: readonly (FieldDef & { key: CoreFieldKey })[] = [
  { ...base, key: 'year', type: 'number', label_bn: 'সাল', label_en: 'Year', required: true, integer: true, plain: true, min_value: 2000, max_value: 2100, filterable: true, fill_down: true, sort_order: -80 },
  { ...base, key: 'name', type: 'text', label_bn: 'উপকারভোগীর নাম', label_en: 'Beneficiary name', required: true, max_length: 200, searchable: true, sort_order: -70 },
  { ...base, key: 'father_or_husband_name', type: 'text', label_bn: 'পিতা/স্বামীর নাম', label_en: "Father's/Husband's name", max_length: 200, searchable: true, sort_order: -60 },
  { ...base, key: 'division', type: 'text', label_bn: 'বিভাগ', label_en: 'Division', required: true, max_length: 100, geo: 'division', filterable: true, fill_down: true, sort_order: -50 },
  { ...base, key: 'district', type: 'text', label_bn: 'জেলা', label_en: 'District', required: true, max_length: 100, geo: 'district', filterable: true, fill_down: true, sort_order: -40 },
  { ...base, key: 'upazila', type: 'text', label_bn: 'উপজেলা', label_en: 'Upazila', required: true, max_length: 100, geo: 'upazila', filterable: true, fill_down: true, sort_order: -30 },
  { ...base, key: 'union_name', type: 'text', label_bn: 'ইউনিয়ন/পৌরসভা', label_en: 'Union/Municipality', max_length: 100, geo: 'union', filterable: true, sort_order: -20 },
  { ...base, key: 'address', type: 'long_text', label_bn: 'বিস্তারিত ঠিকানা', label_en: 'Detailed address', max_length: 1000, searchable: true, show_in_card: false, sort_order: -10 },
]

/** যেগুলো সবসময় চালু ও আবশ্যক — প্যানেলে "বন্ধ/ঐচ্ছিক" অপশন দেখাবে না */
export const ALWAYS_REQUIRED: readonly CoreFieldKey[] = ['year', 'name', 'division', 'district', 'upazila']
