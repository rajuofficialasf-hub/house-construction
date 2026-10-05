import { nfc } from '@/features/geo/geo'

/** ইম্পোর্টে সিস্টেমের ফিল্ড (ক্রম = প্রিভিউ/এক্সপোর্টের কলাম ক্রম) */
export const IMPORT_FIELDS = [
  'serial_no',
  'year',
  'name',
  'father_or_husband_name',
  'division',
  'district',
  'upazila',
  'address',
  'prev_photo_source',
  'current_photo_source',
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

export const FIELD_LABEL: Record<ImportField, string> = {
  serial_no: 'সিরিয়াল',
  year: 'সাল',
  name: 'উপকারভোগীর নাম',
  father_or_husband_name: 'পিতা/স্বামীর নাম',
  division: 'বিভাগ',
  district: 'জেলা',
  upazila: 'উপজেলা',
  address: 'বিস্তারিত ঠিকানা',
  prev_photo_source: 'পূর্বের ঘরের ছবি (লিঙ্ক)',
  current_photo_source: 'বর্তমান ঘরের ছবি (লিঙ্ক)',
}

export const REQUIRED_FIELDS: ImportField[] = ['year', 'name', 'division', 'district', 'upazila']

/** হেডারে এসব শব্দ থাকলে সেই ফিল্ড অনুমান (ক্রম গুরুত্বপূর্ণ: আগে নির্দিষ্ট, পরে সাধারণ) */
const HINTS: [ImportField, RegExp][] = [
  ['serial_no', /সিরিয়াল|ক্রমিক|serial|^sl\.?\s*(no)?$|^sn$|^id$/i],
  ['year', /সাল|বছর|year/i],
  ['father_or_husband_name', /পিতা|স্বামী|father|husband|guardian/i],
  ['name', /উপকারভোগী|নাম|name|beneficiary/i],
  ['division', /বিভাগ|division/i],
  ['district', /জেলা|district|dist/i],
  ['upazila', /উপজেলা|থানা|upazila|upazilla|thana/i],
  ['prev_photo_source', /(পূর্ব|আগ|before|prev|old).*(ছবি|photo|image|লিঙ্ক|link)|(ছবি|photo|image).*(পূর্ব|আগ|before|prev|old)/i],
  ['current_photo_source', /(বর্তমান|পর|after|current|new).*(ছবি|photo|image|লিঙ্ক|link)|(ছবি|photo|image).*(বর্তমান|পর|after|current|new)/i],
  ['address', /ঠিকানা|গ্রাম|address|village/i],
]

/**
 * ফাইলের হেডার → সিস্টেম ফিল্ড অনুমান। প্রতিটি ফিল্ড একবারই বসে (প্রথম মিলে)।
 * ফেরত: header index → field | null
 */
export function guessMapping(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>()
  const out: (ImportField | null)[] = headers.map(() => null)
  // দুই পাসে: আগে ছবি/পিতা (নির্দিষ্ট), তারপর বাকিগুলো — যাতে "পূর্বের ঘরের ছবি" ভুল করে "নাম" না হয়
  const ordered: ImportField[] = ['prev_photo_source', 'current_photo_source', 'father_or_husband_name', 'serial_no', 'year', 'division', 'district', 'upazila', 'address', 'name']
  for (const field of ordered) {
    const re = HINTS.find(([f]) => f === field)![1]
    const idx = headers.findIndex((h, i) => out[i] === null && re.test(nfc(h)))
    if (idx !== -1 && !used.has(field)) {
      out[idx] = field
      used.add(field)
    }
  }
  return out
}
