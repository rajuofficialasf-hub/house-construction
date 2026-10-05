/**
 * ফলব্যাক প্রকল্প-রেজিস্ট্রি (পরিকল্পনা §৫.১৪): `projects` টেবিল না থাকলে (SQL ১০ চালানো হয়নি) adapter এই ৩টি সারি দেয়।
 * মান হুবহু supabase/sql/10_projects.sql এর seed (লাইভে ২০২৬-১০-০৫ যেমন আছে) — ঘর নির্মাণ গ্রুপ, সেমিপাকা, টিন।
 * এখানে বদলালে seed-এর সাথে মিলিয়ে বদলাতে হবে। ফিল্ড নেই (ঘর নির্মাণে কাস্টম ফিল্ড নেই)।
 */
import type { Project, StatCardDef } from './interfaces/types'

const SEEDED_AT = '2026-10-05T04:53:59.119554+00:00'

const LEAF_CARDS: StatCardDef[] = [
  { id: 'total', kind: 'count', label_bn: 'মোট উপকারভোগী', label_en: 'Total beneficiaries', home_label_bn: 'মোট ঘর নির্মাণ', home_label_en: 'Houses built', icon: 'users', home: true },
  { id: 'divisions', kind: 'geo', level: 'division', label_bn: 'মোট বিভাগ', label_en: 'Divisions', icon: 'map' },
  { id: 'districts', kind: 'geo', level: 'district', label_bn: 'মোট জেলা', label_en: 'Districts', home_label_bn: 'মোট জেলা কভার', home_label_en: 'Districts covered', icon: 'pin', home: true },
  { id: 'upazilas', kind: 'geo', level: 'upazila', label_bn: 'মোট উপজেলা', label_en: 'Upazilas', home_label_bn: 'মোট উপজেলা কভার', home_label_en: 'Upazilas covered', icon: 'grid', home: true },
]

const base = {
  summary_bn: '',
  summary_en: '',
  unit_bn: 'ঘর',
  unit_en: 'houses',
  photo_mode: 'before_after',
  prev_label_bn: '',
  prev_label_en: '',
  current_label_bn: '',
  current_label_en: '',
  core_fields: {},
  display: {},
  accent: 'brand',
  cover_path: null,
  is_published: true,
  show_on_home: true,
  created_at: SEEDED_AT,
  updated_at: SEEDED_AT,
  fields: [],
} satisfies Partial<Project>

function leaf(p: Pick<Project, 'key' | 'slug' | 'name_bn' | 'name_en' | 'summary_bn' | 'summary_en' | 'file_prefix' | 'icon' | 'sort_order'>): Project {
  return {
    ...base,
    ...p,
    parent_key: 'housing',
    is_group: false,
    description_bn: p.summary_bn,
    description_en: p.summary_en,
    prev_label_bn: 'পূর্বের ঘর',
    prev_label_en: 'Before',
    current_label_bn: 'বর্তমান ঘর',
    current_label_en: 'After',
    geo_depth: 'union',
    core_fields: { union_name: { required: false } },
    stat_cards: LEAF_CARDS,
    display: { show_map: true, geo_columns: 'split' },
  }
}

export const FALLBACK_PROJECTS: readonly Project[] = [
  {
    ...base,
    key: 'housing',
    parent_key: null,
    is_group: true,
    slug: 'housing',
    name_bn: 'ঘর নির্মাণ প্রকল্প',
    name_en: 'Housing Project',
    description_bn:
      'ঘরহীন ও অসহায় পরিবারের জন্য নিরাপদ বাসস্থান। প্রতিটি ঘরের আগের ও বর্তমান অবস্থার ছবিসহ উপকারভোগীদের পূর্ণ তালিকা এখানে দেখা যায়। প্রকল্পটি চলমান।',
    description_en:
      'Safe homes for homeless and helpless families. The full list of beneficiaries with before and current photos of every house is shown here. The project is ongoing.',
    geo_depth: 'upazila',
    stat_cards: [
      { id: 'total', kind: 'count', label_bn: 'মোট ঘর নির্মাণ', label_en: 'Houses built', icon: 'house', home: true },
      { id: 'districts', kind: 'geo', level: 'district', label_bn: 'মোট জেলা কভার', label_en: 'Districts covered', icon: 'pin', home: true },
      { id: 'upazilas', kind: 'geo', level: 'upazila', label_bn: 'মোট উপজেলা কভার', label_en: 'Upazilas covered', icon: 'grid', home: true },
    ],
    file_prefix: null,
    icon: 'house',
    sort_order: 10,
  },
  leaf({
    key: 'semi_pucca',
    slug: 'semi-pucca',
    name_bn: 'সেমিপাকা ঘর নির্মাণ',
    name_en: 'Semi-pucca House Construction',
    summary_bn: 'ইটের দেয়াল ও টিনের ছাউনিতে টেকসই, নিরাপদ ঘর — দীর্ঘমেয়াদি বাসস্থানের সমাধান।',
    summary_en: 'Durable, safe homes with brick walls and tin roofs — a long-term housing solution.',
    file_prefix: 'semi',
    icon: 'house',
    sort_order: 10,
  }),
  leaf({
    key: 'tin',
    slug: 'tin',
    name_bn: 'টিনের ঘর নির্মাণ',
    name_en: 'Tin-shed House Construction',
    summary_bn: 'দ্রুত ও স্বল্প ব্যয়ে নির্মিত টিনের ঘর — জরুরি প্রয়োজনে মাথা গোঁজার ঠাঁই।',
    summary_en: 'Quickly built, low-cost tin-shed homes — shelter for urgent needs.',
    file_prefix: 'tin',
    icon: 'tin-house',
    sort_order: 20,
  }),
]
