/**
 * নতুন প্রকল্প উইজার্ডের টেমপ্লেট (পরিকল্পনা M-ধাপ ৭, §৩.২, §৩.৩) — শুধু শুরুর মান; তৈরির পর প্যানেল থেকে সব বদলানো যায়।
 *   housing — ঘর নির্মাণ ধরন: আগে-পরে ছবি, ইউনিয়ন (আবশ্যক নয় — প্রশ্ন ১২), ৪টি কার্ড (এখনকার সেমিপাকা/টিনের মতো)
 *   grant   — অনুদান/উপকরণ ধরন (§৩.২): শুধু পরের ছবি "উপকরণসহ ছবি" (প্রশ্ন ১০), ইউনিয়ন (আবশ্যক নয় — প্রশ্ন ১১),
 *             ফিল্ড: ক্যাটাগরি (আবশ্যক, প্রশ্ন ৫), উপকরণের নাম (ঐচ্ছিক, প্রশ্ন ৪), টাকা (আবশ্যক, পাবলিক — প্রশ্ন ৮);
 *             কার্ড: মোট উপকারভোগী, মোট টাকা, মোট ক্যাটাগরি (ব্যবহৃত ভিন্ন মান — প্রশ্ন ৬), জেলা, উপজেলা
 *   group   — প্রকল্প-গ্রুপ: কোনো রেকর্ড, ফিল্ড, ছবি বা প্রিফিক্স নেই; কার্ড = উপ-প্রকল্পের যোগফল
 *   blank   — খালি: শুধু পরের ছবি, উপজেলা, একটি কার্ড (মোট উপকারভোগী)
 * কোনো টেমপ্লেটে গোপন ফিল্ড নেই (প্রশ্ন ১৩)।
 */
import type { CoreFieldsConfig, GeoDepth, PhotoMode, ProjectDisplay, ProjectFieldInput, ProjectInput, StatCardDef } from '@/backend'

export type TemplateKey = 'housing' | 'grant' | 'group' | 'blank'

export interface ProjectTemplate {
  key: TemplateKey
  label_bn: string
  label_en: string
  hint_bn: string
  hint_en: string
  is_group: boolean
  photo_mode: PhotoMode
  geo_depth: GeoDepth
  unit_bn: string
  unit_en: string
  prev_label_bn: string
  prev_label_en: string
  current_label_bn: string
  current_label_en: string
  core_fields: CoreFieldsConfig
  stat_cards: StatCardDef[]
  display: ProjectDisplay
  icon: string
  accent: string
  fields: ProjectFieldInput[]
}

const COUNT_CARD: StatCardDef = { id: 'total', kind: 'count', label_bn: 'মোট উপকারভোগী', label_en: 'Total beneficiaries', icon: 'users', home: true }
const GEO_CARDS = {
  division: { label_bn: 'মোট বিভাগ', label_en: 'Divisions', icon: 'map' },
  district: { label_bn: 'জেলা কভার', label_en: 'Districts covered', icon: 'pin' },
  upazila: { label_bn: 'উপজেলা কভার', label_en: 'Upazilas covered', icon: 'grid' },
} as const
const geoCard = (level: keyof typeof GEO_CARDS, home: boolean): StatCardDef => ({
  id: `${level}s`,
  kind: 'geo',
  level,
  ...GEO_CARDS[level],
  ...(home ? { home: true } : {}),
})

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    key: 'grant',
    label_bn: 'অনুদান/উপকরণ ধরন',
    label_en: 'Grant / item type',
    hint_bn: 'স্বাবলম্বী, দক্ষতা ভিত্তিক ইত্যাদি — ক্যাটাগরি, উপকরণের নাম, টাকা; শুধু পরের ছবি',
    hint_en: 'Self-reliance, skill-based etc. — category, item name, amount; after photo only',
    is_group: false,
    photo_mode: 'after_only',
    geo_depth: 'union',
    unit_bn: 'উপকারভোগী',
    unit_en: 'beneficiaries',
    prev_label_bn: '',
    prev_label_en: '',
    current_label_bn: 'উপকরণসহ ছবি',
    current_label_en: 'Photo with the item',
    core_fields: { year: { label_bn: 'অনুদানের সাল', label_en: 'Grant year' }, union_name: { required: false } },
    stat_cards: [
      COUNT_CARD,
      { id: 'money', kind: 'sum', field: 'amount', label_bn: 'মোট টাকা', label_en: 'Total amount', icon: 'coins', home: true, format: 'money' },
      { id: 'cats', kind: 'distinct', field: 'category', label_bn: 'মোট ক্যাটাগরি', label_en: 'Total categories', icon: 'tags', home: true },
      geoCard('district', false),
      geoCard('upazila', false),
    ],
    display: { show_map: true, geo_columns: 'merged', breakdown_field: 'category' },
    icon: 'hands-heart',
    accent: 'teal',
    fields: [
      {
        key: 'category', label_bn: 'উপকরণের ক্যাটাগরি', label_en: 'Item category', type: 'category', required: true,
        show_in_table: true, show_in_card: true, show_in_detail: true, filterable: true, searchable: true, sort_order: 10,
        import_aliases: ['ক্যাটাগরি', 'ক্যাটাগরী', 'উপকরণের ক্যাটাগরি', 'category'],
      },
      {
        key: 'item_name', label_bn: 'উপকরণের নাম/বিবরণ', label_en: 'Item name / description', type: 'text', required: false,
        show_in_table: false, show_in_card: true, show_in_detail: true, searchable: true, sort_order: 20,
        import_aliases: ['উপকরণ', 'উপকরণের নাম', 'বিবরণ', 'item'],
      },
      {
        key: 'amount', label_bn: 'টাকা', label_en: 'Amount', type: 'money', required: true,
        show_in_table: true, show_in_card: true, show_in_detail: true, sort_order: 30,
        import_aliases: ['টাকার পরিমাণ', 'অনুদানের পরিমাণ', 'অনুদান', 'amount'],
      },
    ],
  },
  {
    key: 'housing',
    label_bn: 'ঘর নির্মাণ ধরন',
    label_en: 'Housing type',
    hint_bn: 'আগে-পরে ছবি, ৪টি পরিসংখ্যান কার্ড — সেমিপাকা/টিনের মতো (যেমন "ঘর মেরামত")',
    hint_en: 'Before/after photos, 4 stat cards — like semi-pucca/tin-shed (e.g. "House repair")',
    is_group: false,
    photo_mode: 'before_after',
    geo_depth: 'union',
    unit_bn: 'ঘর',
    unit_en: 'houses',
    prev_label_bn: 'পূর্বের ঘর',
    prev_label_en: 'Before',
    current_label_bn: 'বর্তমান ঘর',
    current_label_en: 'After',
    core_fields: { union_name: { required: false } },
    stat_cards: [{ ...COUNT_CARD, home_label_bn: 'মোট ঘর নির্মাণ', home_label_en: 'Houses built' }, geoCard('division', false), geoCard('district', true), geoCard('upazila', true)],
    display: { show_map: true, geo_columns: 'split' },
    icon: 'house',
    accent: 'brand',
    fields: [],
  },
  {
    key: 'group',
    label_bn: 'প্রকল্প-গ্রুপ',
    label_en: 'Project group',
    hint_bn: 'কয়েকটি প্রকল্পের ছাতা (যেমন "ঘর নির্মাণ") — নিজের রেকর্ড, ফিল্ড বা ছবি নেই',
    hint_en: 'An umbrella over several projects (like "Housing") — no records, fields or photos of its own',
    is_group: true,
    photo_mode: 'none',
    geo_depth: 'upazila',
    unit_bn: 'উপকারভোগী',
    unit_en: 'beneficiaries',
    prev_label_bn: '',
    prev_label_en: '',
    current_label_bn: '',
    current_label_en: '',
    core_fields: {},
    stat_cards: [COUNT_CARD, geoCard('district', true), geoCard('upazila', true)],
    display: {},
    icon: 'hands-heart',
    accent: 'brand',
    fields: [],
  },
  {
    key: 'blank',
    label_bn: 'খালি',
    label_en: 'Blank',
    hint_bn: 'শুধু সিস্টেম ফিল্ড (নাম, সাল, ঠিকানা) আর একটি কার্ড — বাকিটা নিজে সাজাবেন',
    hint_en: 'Only system fields (name, year, address) and one card — set up the rest yourself',
    is_group: false,
    photo_mode: 'after_only',
    geo_depth: 'upazila',
    unit_bn: 'উপকারভোগী',
    unit_en: 'beneficiaries',
    prev_label_bn: '',
    prev_label_en: '',
    current_label_bn: 'ছবি',
    current_label_en: 'Photo',
    core_fields: {},
    stat_cards: [COUNT_CARD],
    display: { show_map: true, geo_columns: 'split' },
    icon: 'hands-heart',
    accent: 'brand',
    fields: [],
  },
]

export function templateOf(key: TemplateKey): ProjectTemplate {
  return PROJECT_TEMPLATES.find((x) => x.key === key) ?? PROJECT_TEMPLATES[0]
}

/** উইজার্ডের পছন্দগুলো (টেমপ্লেটের শুরুর মান বদলে) */
export interface WizardChoices {
  template: TemplateKey
  /** single = একক, child = গ্রুপের উপ-প্রকল্প, group = নতুন গ্রুপ */
  location: 'single' | 'child' | 'group'
  parentKey: string | null
  key: string
  slug: string
  name_bn: string
  name_en: string
  file_prefix: string
  photo_mode: PhotoMode
  geo_depth: GeoDepth
  icon: string
  accent: string
}

/**
 * উইজার্ড → project_create এর ইনপুট (প্রকল্প + ফিল্ড)। গ্রুপে ফিল্ড/ছবি/প্রিফিক্স নেই; ছবির লেবেল শুধু যে স্লট ব্যবহার হয়।
 * (আলাদা ফাংশন, যাতে লোকাল Postgres এ আসল project_create দিয়ে টেমপ্লেটগুলো যাচাই করা যায়।)
 */
export function buildProjectInput(c: WizardChoices): { project: ProjectInput; fields: ProjectFieldInput[] } {
  const isGroup = c.location === 'group'
  const base = templateOf(isGroup ? 'group' : c.template)
  const photo = isGroup ? 'none' : c.photo_mode
  return {
    project: {
      key: c.key,
      slug: c.slug,
      name_bn: c.name_bn.trim().normalize('NFC'),
      name_en: c.name_en.trim(),
      parent_key: c.location === 'child' ? c.parentKey : null,
      is_group: isGroup,
      photo_mode: photo,
      geo_depth: isGroup ? 'upazila' : c.geo_depth,
      unit_bn: base.unit_bn,
      unit_en: base.unit_en,
      prev_label_bn: photo === 'before_after' ? base.prev_label_bn || 'পূর্বের ছবি' : '',
      prev_label_en: photo === 'before_after' ? base.prev_label_en || 'Before' : '',
      current_label_bn: photo !== 'none' ? base.current_label_bn || 'বর্তমান ছবি' : '',
      current_label_en: photo !== 'none' ? base.current_label_en || 'After' : '',
      core_fields: base.core_fields,
      stat_cards: base.stat_cards,
      display: base.display,
      file_prefix: isGroup ? null : c.file_prefix,
      icon: c.icon,
      accent: c.accent,
      show_on_home: true,
    },
    fields: isGroup ? [] : base.fields,
  }
}
