import { lt, pick, t } from '@/i18n'
import { useEffect, useState, type FormEvent } from 'react'
import { FIELD_TYPES, getProjectsApi, type FieldType, type Project, type ProjectField, type ProjectFieldInput, type ProjectFieldPatch } from '@/backend'
import { FIELD_VALUE_SPECS } from '@/features/projects/fields'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { parseBanglaNumber } from '@/lib/money'
import { Field } from '../ui/Field'
import { inputClass, primaryButton, secondaryButton, selectClass, textareaClass } from '../ui/styles'
import { MAX_TABLE_COLUMNS, SENSITIVE_LABEL, fieldKeyError, fieldKeyFrom, tableColumns } from './fieldRules'
import { friendlyProjectError } from './projectRules'

interface Form {
  type: FieldType
  label_bn: string
  label_en: string
  help_bn: string
  help_en: string
  key: string
  required: boolean
  visibility: 'public' | 'admin'
  show_in_table: boolean
  show_in_card: boolean
  show_in_detail: boolean
  filterable: boolean
  searchable: boolean
  fill_down: boolean
  max_length: string
  min_value: string
  max_value: string
  import_aliases: string
}

const fromField = (f: ProjectField | null): Form => ({
  type: f?.type ?? 'text',
  label_bn: f?.label_bn ?? '',
  label_en: f?.label_en ?? '',
  help_bn: f?.help_bn ?? '',
  help_en: f?.help_en ?? '',
  key: f?.key ?? '',
  required: f?.required ?? false,
  visibility: f?.visibility ?? 'public',
  show_in_table: f?.show_in_table ?? false,
  show_in_card: f?.show_in_card ?? false,
  show_in_detail: f?.show_in_detail ?? true,
  filterable: f?.filterable ?? false,
  searchable: f?.searchable ?? false,
  fill_down: f?.fill_down ?? false,
  max_length: f?.max_length == null ? '' : String(f.max_length),
  min_value: f?.min_value == null ? '' : String(f.min_value),
  max_value: f?.max_value == null ? '' : String(f.max_value),
  import_aliases: (f?.import_aliases ?? []).join(', '),
})

const TEXTY: FieldType[] = ['text', 'long_text', 'category']
const NUMERIC: FieldType[] = ['number', 'money']
const FILTERABLE: FieldType[] = ['text', 'category', 'number', 'money']
const SEARCHABLE: FieldType[] = ['text', 'long_text', 'category']

/** ফর্মের নিয়মে ঠিক করা মান: ফোন সবসময় গোপন; গোপন হলে টেবিল/কার্ড/ফিল্টার/সার্চ বন্ধ; ধরনে অচল অপশন বন্ধ */
function normalize(f: Form): Form {
  const visibility = f.type === 'phone' ? 'admin' : f.visibility
  const priv = visibility === 'admin'
  return {
    ...f,
    visibility,
    show_in_table: priv ? false : f.show_in_table,
    show_in_card: priv ? false : f.show_in_card,
    filterable: priv || !FILTERABLE.includes(f.type) ? false : f.filterable,
    searchable: priv || !SEARCHABLE.includes(f.type) ? false : f.searchable,
  }
}

/**
 * ফিল্ড যোগ/সম্পাদনার পাশের প্যানেল (পরিকল্পনা M-ধাপ ৮): ধরন, লেবেল (দুই ভাষা), সাহায্য-লেখা, key (লেবেল থেকে নিজে;
 * ডাটা আসার পর লক), পাবলিক/শুধু-এডমিন (ফোন সবসময় এডমিন; লেবেলে ফোন/মোবাইল/NID থাকলে লাল পরামর্শ), কোথায় দেখাবে,
 * ফিল্টার/সার্চ/ফিল-ডাউন, ইম্পোর্টের বিকল্প শিরোনাম, সীমা। টেবিলে সর্বোচ্চ ৯টি ডাটা-কলাম।
 */
export function FieldEditorDrawer({
  project,
  field,
  usage,
  onClose,
  onSaved,
}: {
  project: Project
  /** null = নতুন ফিল্ড */
  field: ProjectField | null
  /** কতগুলো রেকর্ডে মান আছে (null = জানা যাচ্ছে) */
  usage: number | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState<Form>(() => fromField(field))
  const [keyTouched, setKeyTouched] = useState(!!field)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [busy, onClose])

  const locked = !!field && (usage ?? 0) > 0
  const others = project.fields.filter((f) => f.id !== field?.id)
  const takenKeys = others.map((f) => f.key)
  const f = normalize(form)
  const key = keyTouched || locked ? form.key : fieldKeyFrom(form.label_en, form.label_bn, takenKeys)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => ({ ...x, [k]: v }))

  // টেবিলের কলাম-গণনা: এই ফিল্ড সহ (প্রস্তাবিত অবস্থায়)
  const asField = { ...(field ?? {}), id: field?.id ?? 'new', project_key: project.key, key, type: f.type, label_bn: f.label_bn, label_en: f.label_en, visibility: f.visibility, show_in_table: true, is_active: field?.is_active ?? true, sort_order: field?.sort_order ?? 9999 } as ProjectField
  const withThis = tableColumns(project, [...others, asField]).length
  const withoutThis = tableColumns(project, others).length
  const tableFull = !f.show_in_table && withoutThis >= MAX_TABLE_COLUMNS
  const columnsNow = f.show_in_table ? withThis : withoutThis

  const num = (s: string) => (s.trim() === '' ? null : parseBanglaNumber(s))
  const minV = num(f.min_value)
  const maxV = num(f.max_value)
  const maxLen = num(f.max_length)
  const errors = {
    label_bn: !f.label_bn.trim() ? t('বাংলা লেবেল দিন') : f.label_bn.length > 120 ? t('সর্বোচ্চ ১২০ অক্ষর') : null,
    label_en: f.label_en.length > 120 ? t('সর্বোচ্চ ১২০ অক্ষর') : null,
    help: f.help_bn.length > 300 || f.help_en.length > 300 ? t('সাহায্য-লেখা সর্বোচ্চ ৩০০ অক্ষর') : null,
    key: locked ? null : fieldKeyError(key, takenKeys),
    min: Number.isNaN(minV) ? t('শুধু সংখ্যা দিন (যেমন ১০০০০)') : null,
    max: Number.isNaN(maxV) ? t('শুধু সংখ্যা দিন (যেমন ১০০০০)') : minV !== null && maxV !== null && !Number.isNaN(minV) && !Number.isNaN(maxV) && maxV < minV ? t('সর্বোচ্চ মান সর্বনিম্নের চেয়ে ছোট') : null,
    max_length: maxLen === null ? null : Number.isNaN(maxLen) || !Number.isInteger(maxLen) || maxLen < 1 || maxLen > 2000 ? t('১ থেকে ২০০০ এর মধ্যে পূর্ণসংখ্যা') : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const sensitive = f.visibility === 'public' && (SENSITIVE_LABEL.test(f.label_bn) || SENSITIVE_LABEL.test(f.label_en))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors || busy) return
    setBusy(true)
    setError(null)
    const aliases = [...new Set(f.import_aliases.split(/[,\n]/).map((s) => s.trim().normalize('NFC')).filter(Boolean))]
    const body: ProjectFieldInput = {
      key,
      type: f.type,
      label_bn: f.label_bn.trim().normalize('NFC'),
      label_en: f.label_en.trim(),
      help_bn: f.help_bn.trim().normalize('NFC'),
      help_en: f.help_en.trim(),
      required: f.required,
      visibility: f.visibility,
      show_in_table: f.show_in_table,
      show_in_card: f.show_in_card,
      show_in_detail: f.show_in_detail,
      filterable: f.filterable,
      searchable: f.searchable,
      fill_down: f.fill_down,
      max_length: TEXTY.includes(f.type) ? maxLen : null,
      min_value: NUMERIC.includes(f.type) ? minV : null,
      max_value: NUMERIC.includes(f.type) ? maxV : null,
      import_aliases: aliases,
    }
    try {
      const api = getProjectsApi()
      if (!field) {
        await api.createField(project.key, { ...body, sort_order: Math.max(0, ...project.fields.map((x) => x.sort_order)) + 10 })
      } else {
        // শুধু বদলানো কলাম (ডাটা থাকা ফিল্ডে key/ধরন/গোপনীয়তা পাঠানোই হয় না)
        const patch: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(body)) {
          if (locked && (k === 'key' || k === 'type' || k === 'visibility')) continue
          if (JSON.stringify(v) !== JSON.stringify((field as unknown as Record<string, unknown>)[k])) patch[k] = v
        }
        if (Object.keys(patch).length) await api.updateField(field.id, patch as ProjectFieldPatch)
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(friendlyProjectError(err))
    } finally {
      setBusy(false)
    }
  }

  const check = (k: 'required' | 'show_in_table' | 'show_in_card' | 'show_in_detail' | 'filterable' | 'searchable' | 'fill_down', label: string, opts: { disabled?: boolean; hint?: string } = {}) => (
    <label className={`flex min-h-11 items-start gap-2 rounded-md px-1 py-2 text-sm ${opts.disabled ? 'text-slate-400' : 'text-slate-700'}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={f[k]} disabled={opts.disabled} onChange={(e) => set(k, e.target.checked)} />
      <span>
        {label}
        {opts.hint && <span className="block text-xs text-slate-500">{opts.hint}</span>}
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={field ? t('ফিল্ড সম্পাদনা') : t('নতুন ফিল্ড')}>
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label={t('বন্ধ করুন')} onClick={() => !busy && onClose()} />
      <form onSubmit={(e) => void save(e)} noValidate className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-bold text-slate-900">{field ? t('ফিল্ড সম্পাদনা: {name}', { name: lt(field, 'label') }) : t('নতুন ফিল্ড')}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={t('বন্ধ করুন')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {locked && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t('{n}টি রেকর্ডে মান আছে — key, ধরন ও পাবলিক/গোপন বদলানো যায় না।', { n: formatBanglaNumber(usage ?? 0) })}
            </p>
          )}

          <Field label={t('ধরন')} help={f.type === 'category' ? t('শীটের কলামে যা লেখা থাকবে, সেটাই ক্যাটাগরি — আলাদা অপশন-তালিকা বানাতে হয় না। একই লেখা = একই ক্যাটাগরি।') : undefined}>
            {(p) => (
              <select {...p} className={selectClass} value={f.type} disabled={locked} onChange={(e) => set('type', e.target.value as FieldType)}>
                {FIELD_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {pick(FIELD_VALUE_SPECS[ty].label_bn, FIELD_VALUE_SPECS[ty].label_en)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('লেবেল (বাংলা)')} required error={submitted ? errors.label_bn : null}>
              {(p) => <input {...p} className={inputClass} value={form.label_bn} onChange={(e) => set('label_bn', e.target.value)} maxLength={120} placeholder={t('যেমন উপকরণের নাম')} />}
            </Field>
            <Field label={t('লেবেল (ইংরেজি)')} error={errors.label_en} help={!f.label_en.trim() ? t('খালি থাকলে ইংরেজি মোডে বাংলা দেখাবে') : undefined}>
              {(p) => <input {...p} className={inputClass} value={form.label_en} onChange={(e) => set('label_en', e.target.value)} maxLength={120} placeholder="Item name" />}
            </Field>
            <Field label={t('সাহায্য-লেখা (বাংলা)')} error={errors.help} help={t('ফর্মে ঘরের নিচে ছোট করে')}>
              {(p) => <textarea {...p} rows={2} className={textareaClass} value={form.help_bn} onChange={(e) => set('help_bn', e.target.value)} maxLength={300} />}
            </Field>
            <Field label={t('সাহায্য-লেখা (ইংরেজি)')}>
              {(p) => <textarea {...p} rows={2} className={textareaClass} value={form.help_en} onChange={(e) => set('help_en', e.target.value)} maxLength={300} />}
            </Field>
          </div>

          <Field
            label="key"
            error={submitted || keyTouched ? errors.key : null}
            help={locked ? t('ডাটা আছে — বদলানো যায় না।') : t('লেবেল থেকে নিজে তৈরি হয় (ইংরেজি না থাকলে বাংলা থেকে)। ডাটা আসার পর আর বদলানো যায় না।')}
          >
            {(p) => (
              <input
                {...p}
                className={`${inputClass} font-mono`}
                value={key}
                disabled={locked}
                onChange={(e) => {
                  setKeyTouched(true)
                  set('key', e.target.value.toLowerCase())
                }}
                maxLength={40}
              />
            )}
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('কে দেখবে')}</legend>
            {(['public', 'admin'] as const).map((v) => (
              <label key={v} className={`flex min-h-11 items-start gap-2 rounded-md border px-3 py-2 text-sm ${f.visibility === v ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  name="vis"
                  className="mt-0.5 h-4 w-4 accent-brand-700"
                  checked={f.visibility === v}
                  disabled={locked || f.type === 'phone'}
                  onChange={() => set('visibility', v)}
                />
                <span>
                  {v === 'public' ? t('পাবলিক — সবাই দেখবে') : t('🔒 শুধু-এডমিন (গোপন) — পাবলিক সাইট, টেবিল, ফিল্টার, এক্সপোর্টের পাবলিক অংশে কখনো নয়')}
                </span>
              </label>
            ))}
            {f.type === 'phone' && <p className="text-xs text-slate-500">{t('মোবাইল নম্বর সবসময় শুধু-এডমিন।')}</p>}
            {sensitive && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                {t('এটি গোপন তথ্য মনে হচ্ছে (ফোন/মোবাইল/NID) — "শুধু-এডমিন" করুন। ডাটা আসার পর আর বদলানো যাবে না।')}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('কোথায় দেখাবে ও কীভাবে কাজ করবে')}</legend>
            <div className="grid sm:grid-cols-2">
              {check('required', t('আবশ্যক'))}
              {check('show_in_detail', t('বিস্তারিত পাতায়'))}
              {check('show_in_table', t('টেবিলে (ডেস্কটপ)'), {
                disabled: f.visibility === 'admin' || tableFull,
                hint: tableFull ? t('টেবিলে সর্বোচ্চ {max}টি কলাম — এখন {n}/{max}', { n: toBanglaNumber(withoutThis), max: toBanglaNumber(MAX_TABLE_COLUMNS) }) : t('কলাম: {n}/{max}', { n: toBanglaNumber(columnsNow), max: toBanglaNumber(MAX_TABLE_COLUMNS) }),
              })}
              {check('show_in_card', t('মোবাইল কার্ডে'), { disabled: f.visibility === 'admin' })}
              {check('filterable', t('ফিল্টারে'), { disabled: f.visibility === 'admin' || !FILTERABLE.includes(f.type), hint: f.type === 'category' ? t('ডাটায় থাকা মানগুলো ড্রপডাউনে') : undefined })}
              {check('searchable', t('নামের সাথে সার্চে'), { disabled: f.visibility === 'admin' || !SEARCHABLE.includes(f.type) })}
              {check('fill_down', t('ইম্পোর্টে ফিল-ডাউন'), { hint: t('শীটে খালি ঘরে উপরের সারির মান') })}
            </div>
          </fieldset>

          {TEXTY.includes(f.type) && (
            <Field label={t('সর্বোচ্চ দৈর্ঘ্য (অক্ষর)')} error={errors.max_length} help={t('খালি = ডিফল্ট ({n})', { n: toBanglaNumber(f.type === 'long_text' ? 2000 : f.type === 'category' ? 100 : 500) })}>
              {(p) => <input {...p} className={inputClass} inputMode="numeric" value={form.max_length} onChange={(e) => set('max_length', e.target.value)} />}
            </Field>
          )}
          {NUMERIC.includes(f.type) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('সর্বনিম্ন মান')} error={errors.min}>
                {(p) => <input {...p} className={inputClass} inputMode="decimal" value={form.min_value} onChange={(e) => set('min_value', e.target.value)} />}
              </Field>
              <Field label={t('সর্বোচ্চ মান')} error={errors.max}>
                {(p) => <input {...p} className={inputClass} inputMode="decimal" value={form.max_value} onChange={(e) => set('max_value', e.target.value)} />}
              </Field>
            </div>
          )}
          <Field label={t('ইম্পোর্টে শীটের বিকল্প শিরোনাম')} help={t('কমা দিয়ে আলাদা, যেমন: টাকার পরিমাণ, অনুদান, amount — শীটের কলামের নাম এর কোনোটি হলে নিজে মিলবে')}>
            {(p) => <input {...p} className={inputClass} value={form.import_aliases} onChange={(e) => set('import_aliases', e.target.value)} />}
          </Field>
        </div>

        <div className="border-t border-slate-200 px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={primaryButton} disabled={busy || (submitted && hasErrors)}>
              {busy ? t('সংরক্ষণ হচ্ছে…') : field ? t('সংরক্ষণ করুন') : t('ফিল্ড যোগ করুন')}
            </button>
            <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>
              {t('বাতিল')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
