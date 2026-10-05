/**
 * ফিল্ড-টাইপ রেজিস্ট্রি (পর্ব ২, পরিকল্পনা §৫.১৪) — ফর্ম, ইম্পোর্ট, টেবিল, বিস্তারিত, CSV আর লগ সবাই
 * **এই একটি উৎস** থেকে মান পার্স ও ফরম্যাট করবে:
 *   parse(raw, def) · format(value, def) · toCsv(value, def) · toInput(value, def) — ./fieldValues.ts (React ছাড়া)
 *   Input · Cell — ./fieldComponents.tsx
 */
import type { FieldType } from '@/backend'
import type { ComponentType } from 'react'
import {
  CategoryInput,
  DateInput,
  LongTextCell,
  LongTextInput,
  MoneyCell,
  NumberCell,
  NumberInput,
  PhoneInput,
  TextCell,
  TextInput,
  type FieldCellProps,
  type FieldInputProps,
} from './fieldComponents'
import { FIELD_VALUE_SPECS, type FieldValueSpec } from './fieldValues'

export interface FieldTypeSpec extends FieldValueSpec {
  Input: ComponentType<FieldInputProps>
  Cell: ComponentType<FieldCellProps>
}

const COMPONENTS: Record<FieldType, Pick<FieldTypeSpec, 'Input' | 'Cell'>> = {
  text: { Input: TextInput, Cell: TextCell },
  long_text: { Input: LongTextInput, Cell: LongTextCell },
  number: { Input: NumberInput, Cell: NumberCell },
  money: { Input: NumberInput, Cell: MoneyCell },
  category: { Input: CategoryInput, Cell: TextCell },
  date: { Input: DateInput, Cell: TextCell },
  phone: { Input: PhoneInput, Cell: TextCell },
}

export const FIELD_TYPE_SPECS = Object.fromEntries(
  (Object.keys(FIELD_VALUE_SPECS) as FieldType[]).map((type) => [type, { ...FIELD_VALUE_SPECS[type], ...COMPONENTS[type] }]),
) as Record<FieldType, FieldTypeSpec>

/** ধরন অনুযায়ী পুরো স্পেক (অচেনা হলে text) */
export function fieldSpec(type: FieldType): FieldTypeSpec {
  return FIELD_TYPE_SPECS[type] ?? FIELD_TYPE_SPECS.text
}
