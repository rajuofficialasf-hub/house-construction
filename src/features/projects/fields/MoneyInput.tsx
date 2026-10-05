import { lt } from '@/i18n'
import { useId } from 'react'
import { formatTaka } from '@/lib/money'
import type { FieldInputProps } from './fieldComponents'
import { FIELD_INPUT_CLASS } from './fieldStyles'
import { parseField } from './fieldValues'

/**
 * টাকার ঘর (M-ধাপ ১০): বাংলা বা ইংরেজি অঙ্ক, কমা, ৳/টাকা/Tk, শেষে /- সবই লেখা যায় ("১,২০,০০০", "১২০০০০/-"),
 * পাশে সাথে সাথে "৳ ১,২০,০০০" — যা সংরক্ষিত হবে। মোবাইলে সংখ্যার কীবোর্ড (inputMode="numeric")।
 * ভুল হলে পাশের লেখা দেখায় না (ত্রুটি ফর্মের ঘরের নিচে, parseField থেকে)।
 */
export function MoneyInput(p: FieldInputProps) {
  const previewId = useId()
  const r = p.value.trim() ? parseField({ ...p.def, required: false }, p.value) : null
  const preview = r && r.ok && typeof r.value === 'number' ? formatTaka(r.value) : null
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={p.id}
        value={p.value}
        disabled={p.disabled}
        required={p.def.required}
        aria-invalid={p.invalid || undefined}
        aria-describedby={[p.describedBy, preview ? previewId : ''].filter(Boolean).join(' ') || undefined}
        aria-label={p.id ? undefined : lt(p.def, 'label')}
        onChange={(e) => p.onChange(e.target.value)}
        className={`${p.className ?? FIELD_INPUT_CLASS} pr-36 tabular-nums`}
      />
      {preview && (
        <span id={previewId} aria-live="polite" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-brand-800 tabular-nums">
          {preview}
        </span>
      )}
    </div>
  )
}
