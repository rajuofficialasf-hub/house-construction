import { lt } from '@/i18n'
import { useId } from 'react'
import { FIELD_INPUT_CLASS } from './fieldStyles'
import { formatField, type FieldDef, type FieldValue } from './fieldValues'

/**
 * প্রতিটি ফিল্ড-ধরনের Input (ফর্ম) ও Cell (টেবিল/কার্ড/বিস্তারিত) — রেজিস্ট্রি: ./fieldTypes.ts।
 * Input সবসময় লেখা (string) রাখে; জমা দেওয়ার আগে parseField() — তাই বাংলা অঙ্ক, কমা, ৳ সবই লেখা যায়।
 * স্টাইল এখনকার রেকর্ড-ফর্মের (RecordForm.tsx) হুবহু।
 */

export interface FieldInputProps {
  id?: string
  def: FieldDef
  /** ফর্মের লেখা (fieldSpec(type).toInput দিয়ে বানানো) */
  value: string
  onChange: (raw: string) => void
  disabled?: boolean
  invalid?: boolean
  /** ত্রুটি/সাহায্য-লেখার id (aria-describedby) */
  describedBy?: string
  className?: string
  /** ক্যাটাগরি: ডাটায় থাকা মানগুলো (পরামর্শ; নিজে লেখাও চলে) */
  suggestions?: readonly string[]
}

export interface FieldCellProps {
  def: FieldDef
  value: FieldValue | null | undefined
  className?: string
}

function common(p: FieldInputProps) {
  return {
    id: p.id,
    value: p.value,
    disabled: p.disabled,
    required: p.def.required,
    'aria-invalid': p.invalid || undefined,
    'aria-describedby': p.describedBy,
    'aria-label': p.id ? undefined : lt(p.def, 'label'),
  }
}

export function TextInput(p: FieldInputProps) {
  return (
    <input
      type="text"
      {...common(p)}
      maxLength={p.def.max_length ?? 500}
      onChange={(e) => p.onChange(e.target.value)}
      className={p.className ?? FIELD_INPUT_CLASS}
    />
  )
}

export function LongTextInput(p: FieldInputProps) {
  return (
    <textarea
      rows={3}
      {...common(p)}
      maxLength={p.def.max_length ?? 2000}
      onChange={(e) => p.onChange(e.target.value)}
      className={p.className ?? `${FIELD_INPUT_CLASS} h-auto py-2`}
    />
  )
}

/** সংখ্যা ও টাকা: type="text" (বাংলা অঙ্ক, কমা, ৳ লেখা যায়), মোবাইলে সংখ্যার কীবোর্ড */
export function NumberInput(p: FieldInputProps) {
  const decimal = p.def.type === 'number' && !p.def.integer
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      {...common(p)}
      onChange={(e) => p.onChange(e.target.value)}
      className={`${p.className ?? FIELD_INPUT_CLASS} tabular-nums`}
    />
  )
}

export function CategoryInput(p: FieldInputProps) {
  const listId = useId()
  const hasList = !!p.suggestions?.length
  return (
    <>
      <input
        type="text"
        {...common(p)}
        list={hasList ? listId : undefined}
        maxLength={p.def.max_length ?? 100}
        onChange={(e) => p.onChange(e.target.value)}
        className={p.className ?? FIELD_INPUT_CLASS}
      />
      {hasList && (
        <datalist id={listId}>
          {p.suggestions!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  )
}

export function DateInput(p: FieldInputProps) {
  return <input type="date" {...common(p)} onChange={(e) => p.onChange(e.target.value)} className={p.className ?? FIELD_INPUT_CLASS} />
}

export function PhoneInput(p: FieldInputProps) {
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="off"
      {...common(p)}
      maxLength={20}
      onChange={(e) => p.onChange(e.target.value)}
      className={`${p.className ?? FIELD_INPUT_CLASS} tabular-nums`}
    />
  )
}

/** মান না থাকলে "—" */
function shown(def: FieldDef, value: FieldValue | null | undefined): string {
  const s = formatField(def, value)
  return s === '' ? '—' : s
}

export function TextCell({ def, value, className = '' }: FieldCellProps) {
  return <span className={className}>{shown(def, value)}</span>
}

export function LongTextCell({ def, value, className = '' }: FieldCellProps) {
  return <span className={`whitespace-pre-line ${className}`}>{shown(def, value)}</span>
}

export function NumberCell({ def, value, className = '' }: FieldCellProps) {
  return <span className={`tabular-nums ${className}`}>{shown(def, value)}</span>
}

export function MoneyCell({ def, value, className = '' }: FieldCellProps) {
  return <span className={`font-medium whitespace-nowrap tabular-nums ${className}`}>{shown(def, value)}</span>
}
