/**
 * মক ব্যাকএন্ডের কৃত্রিম ডাটা — প্রকৃত উপকারভোগীর কোনো তথ্য নেই (লাইভ ডাটা কখনো কপি হয় না)।
 * ভৌগোলিক নাম স্থির তালিকা (data/bdGeo.ts) থেকে, তাই ফিল্টার/ম্যাপ/ভ্যালিডেশন বাস্তবের মতো কাজ করে।
 */
import { BD_GEO } from '@/features/geo/data/bdGeo'
import type { AdminRole, HousingRecord, ProjectType } from '../interfaces/types'
import { photoPath } from '@/features/housing/utils/imagePath'

/** seed বদলালে বাড়ান — ব্রাউজারে সংরক্ষিত পুরনো snapshot বাতিল হবে */
export const SEED_VERSION = 1

export interface MockAccount {
  id: string
  email: string
  password: string
  name: string
  admin: boolean
  /** এডমিনের ভূমিকা; মোছা শুধু main_admin (চুক্তি §১) */
  role?: AdminRole
}

export const MOCK_ADMIN: MockAccount = {
  id: 'u_admin',
  email: 'admin@example.test',
  password: 'Admin#12345',
  name: 'টেস্ট এডমিন',
  admin: true,
  role: 'main_admin',
}

/** আছে কিন্তু এডমিন তালিকায় নেই — লগইন করলে FORBIDDEN */
export const MOCK_NON_ADMIN: MockAccount = {
  id: 'u_user',
  email: 'user@example.test',
  password: 'User#12345',
  name: 'সাধারণ ব্যবহারকারী',
  admin: false,
}

export const MOCK_ACCOUNTS: MockAccount[] = [MOCK_ADMIN, MOCK_NON_ADMIN]

/** ছবির URL এর উপসর্গ; vite dev সার্ভার (vite.config.ts) এই পাথে প্লেসহোল্ডার SVG দেয় */
export const MOCK_PHOTO_PREFIX = '/__mock-photos/'

const NAMES = [
  ['রহিমা খাতুন', 'আব্দুল করিম'],
  ['সালমা বেগম', 'মোঃ আলী'],
  ['জমিলা আক্তার', 'মৃত হাসান'],
  ['মমতাজ বেগম', 'মোঃ শামসুল হক'],
  ['ফাতেমা খাতুন', 'আবুল কাশেম'],
  ['নাজমা পারভীন', 'মোঃ রফিক'],
  ['আয়েশা সিদ্দিকা', 'মৃত ইব্রাহিম'],
  ['রোকেয়া বেগম', 'মোঃ সোলায়মান'],
  ['হালিমা খাতুন', 'আব্দুল জব্বার'],
  ['সুফিয়া আক্তার', 'মোঃ নজরুল'],
  ['খদিজা বেগম', 'আব্দুল মান্নান'],
  ['মরিয়ম খাতুন', 'মোঃ ইউসুফ'],
]

function locationFor(i: number) {
  const dv = BD_GEO[i % 3]
  const ds = dv.districts[i % dv.districts.length]
  const up = ds.upazilas[i % ds.upazilas.length]
  return { division: dv.name, district: ds.name, upazila: up.name }
}

function makeRecords(type: ProjectType, count: number, photoCount: number): HousingRecord[] {
  const base = Date.parse('2026-01-01T00:00:00Z')
  const out: HousingRecord[] = []
  for (let n = 1; n <= count; n++) {
    const i = n - 1 + (type === 'tin' ? 5 : 0)
    const [name, father] = NAMES[i % NAMES.length]
    const hasPhotos = n <= photoCount
    const url = (kind: 'prev' | 'current', variant: 'full' | 'thumb') => MOCK_PHOTO_PREFIX + photoPath(type, n, kind, variant)
    const at = new Date(base + i * 86_400_000).toISOString()
    out.push({
      id: `00000000-0000-4000-8000-${type === 'tin' ? '2' : '1'}${String(n).padStart(11, '0')}`,
      project_type: type,
      serial_no: n,
      year: n % 2 === 0 ? 2024 : 2025,
      name: `${name} ${n}`,
      father_or_husband_name: father,
      ...locationFor(i),
      address: `গ্রাম: নমুনা ${n}, ডাকঘর: সদর`,
      union_name: '',
      extra: {},
      prev_photo_url: hasPhotos ? url('prev', 'full') : null,
      prev_thumb_url: hasPhotos ? url('prev', 'thumb') : null,
      current_photo_url: hasPhotos ? url('current', 'full') : null,
      current_thumb_url: hasPhotos ? url('current', 'thumb') : null,
      prev_photo_source: null,
      current_photo_source: null,
      photo_updated_at: hasPhotos ? at : null,
      created_at: at,
      updated_at: at,
    })
  }
  return out
}

export const SEED_COUNTS: Record<ProjectType, number> = { semi_pucca: 12, tin: 6 }

export function seedRecords(): HousingRecord[] {
  return [...makeRecords('semi_pucca', SEED_COUNTS.semi_pucca, 3), ...makeRecords('tin', SEED_COUNTS.tin, 2)]
}
