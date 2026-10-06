import type { HousingRecord } from '@/backend'
import { fieldSpec, fieldValue, type FieldDef } from '@/features/projects/fields'
import { fieldText } from './detailLayout'

/**
 * বিস্তারিত মডালে একটি ফিল্ডের মান (M-ধাপ ১৪) — সিস্টেম ফিল্ড সরাসরি লেখা (আগের মডালের হুবহু DOM),
 * কাস্টম ফিল্ড ফিল্ড-টাইপ রেজিস্ট্রির Cell দিয়ে (টাকা ৳, লম্বা লেখায় লাইন-ভাঙা; ক্যাটাগরি শীটে যেমন লেখা তেমন)।
 */
export function FieldValue({ def, record, className }: { def: FieldDef; record: HousingRecord; className?: string }) {
  if (def.source === 'system') return <>{fieldText(def, record)}</>
  const { Cell } = fieldSpec(def.type)
  return <Cell def={def} value={fieldValue(def, record)} className={className} />
}
