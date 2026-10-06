import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { getLang, t } from '@/i18n'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { nfc } from './geo'
import { matchUnion, unionLooseKey } from './geoMatch'
import { POURASHAVA_BN, gnUnion, unionsOf, useUnionData } from './unions'

interface Props {
  id: string
  district: string
  upazila: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** RecordForm এর inputClass (একই চেহারা) */
  inputClass: string
  invalid?: boolean
  maxLength?: number
}

const ascii = (s: string) => unionLooseKey(s).replace(/[^a-z]/g, '')

/**
 * ইউনিয়নের কম্বোবক্স (পরিকল্পনা §৫.১২): নির্বাচিত উপজেলার ইউনিয়নগুলো সাজেশন; নিজে লেখাও চলে —
 * তালিকায় না থাকলে হলুদ সতর্কতা (সংরক্ষণ আটকায় না); "<উপজেলা> পৌরসভা" চিপ। ডাটাবেসে সবসময় বাংলা নাম যায়;
 * ইংরেজি মোডে সাজেশনে ইংরেজি নাম আগে। বানান সামান্য আলাদা হলে ("করেরহাট ইউনিয়ন") ঘর ছাড়ার সময় তালিকার বানানে আসে।
 * ARIA 1.2 combobox: ↑↓ দিয়ে বাছাই, Enter নেয়, Esc বন্ধ করে।
 */
export function UnionCombobox({ id, district, upazila, value, onChange, disabled, inputClass, invalid, maxLength = 100 }: Props) {
  const ready = !!(district && upazila)
  const { data, failed } = useUnionData(ready)
  const list = useMemo(() => unionsOf(data, district, upazila), [data, district, upazila])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const en = getLang() === 'en'

  const v = nfc(value).replace(/\s+/g, ' ')
  // ঘর খালি বা তালিকার হুবহু নাম হলে সব দেখায়; নইলে লেখার সাথে মেলে এমনগুলো
  const shown = useMemo(() => {
    if (!v || list.some((x) => x[0] === v)) return list
    const k = unionLooseKey(v)
    const a = ascii(v)
    return list.filter(([bn, enName]) => unionLooseKey(bn).includes(k) || (!!a && ascii(enName).includes(a)))
  }, [list, v])
  const m = useMemo(() => (v && data ? matchUnion(v, data, district, upazila) : null), [v, data, district, upazila])
  const pourashava = upazila ? `${upazila} ${POURASHAVA_BN}` : ''

  const choose = (bn: string) => {
    onChange(bn)
    setOpen(false)
    setActive(-1)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      const n = shown.length
      if (!n) return
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n))
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
      e.preventDefault() // ফর্ম সাবমিট নয়
      choose(shown[active][0])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }
  const label = (bn: string, enName: string) => (en ? `${enName} (${bn})` : bn)
  const expanded = open && ready && (shown.length > 0 || (!data && !failed))

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={inputClass}
        value={value}
        placeholder={ready ? (list.length ? t('বাছুন বা লিখুন') : t('লিখুন')) : t('আগে উপজেলা')}
        disabled={disabled || !ready}
        maxLength={maxLength}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          // সামান্য ভিন্ন বানান → তালিকার বানান (ডাটায় এক বানান থাকে)
          if (m?.match && m.corrected) onChange(m.match)
          else if (value !== v) onChange(v)
        }}
        onKeyDown={onKey}
      />
      {expanded && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {!data ? (
            <li className="px-3 py-2 text-slate-500" role="presentation">
              {t('ইউনিয়নের তালিকা আসছে…')}
            </li>
          ) : (
            shown.map(([bn, enName], i) => (
              <li
                key={bn}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={bn === v}
                className={`flex min-h-11 cursor-pointer items-center px-3 ${i === active ? 'bg-brand-50 text-brand-900' : bn === v ? 'font-semibold text-slate-900' : 'text-slate-700'} hover:bg-slate-50`}
                // mousedown: blur এর আগে নেওয়া (ঘর থেকে ফোকাস না হারিয়ে)
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(bn)
                }}
              >
                {label(bn, enName)}
              </li>
            ))
          )}
        </ul>
      )}

      {ready && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={v === pourashava}
            onClick={() => choose(pourashava)}
            className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium ${v === pourashava ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            + {en ? gnUnion(district, upazila, pourashava) : pourashava}
          </button>
          {data && list.length > 0 && <span className="text-xs text-slate-500">{t('তালিকায় {n}টি ইউনিয়ন', { n: toBanglaNumber(list.length) })}</span>}
          {en && v && gnUnion(district, upazila, v) !== v && <span className="text-xs text-slate-500">→ {gnUnion(district, upazila, v)}</span>}
        </div>
      )}

      {ready && failed && <p className="mt-1 text-xs text-slate-500">{t('ইউনিয়নের তালিকা আনা যায়নি — নিজে লিখুন।')}</p>}
      {ready && data && !list.length && <p className="mt-1 text-xs text-slate-500">{t('এই উপজেলার ইউনিয়ন-তালিকা নেই — নিজে লিখুন।')}</p>}
      {m && !m.match && m.listed && (
        <div role="status" className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>{t('«{v}» এই উপজেলার ইউনিয়ন-তালিকায় নেই। বানান ঠিক থাকলে রেখে দিন (পৌরসভা বা নতুন ইউনিয়ন হতে পারে) — সংরক্ষণ আটকাবে না।', { v })}</p>
          {m.suggestions.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              {t('কাছাকাছি:')}
              {m.suggestions.map((s) => (
                <button key={s} type="button" disabled={disabled} onClick={() => choose(s)} className="rounded-full border border-amber-400 bg-white px-2 py-0.5 font-medium hover:bg-amber-100">
                  {en ? gnUnion(district, upazila, s) : s}
                </button>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
