import { lt, pick, t } from '@/i18n'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useToast } from '@/components/useToast'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi, getProjectsApi } from '@/backend'
import {
  HousingApiError,
  type ExtraValues,
  type HousingRecord,
  type HousingRecordInput,
  type PhotoKind,
  type Project,
} from '@/backend'
import { isValidGeo, nfc } from '@/features/geo/geo'
import { GeoSelect, type GeoValue } from '@/features/geo/GeoSelect'
import { FIELD_INPUT_CLASS, fieldErrorMessage, fieldSpec, parseField, resolveFields, type FieldDef } from '@/features/projects/fields'
import { processImage } from '@/features/housing/utils/imageProcessing'
import { revokeUploadItems, type UploadItem } from '@/features/housing/utils/uploadItems'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { PhotoField } from '@/features/housing/components/PhotoField'
import { photoKindsOf, photoSlotLabel } from './recordColumns'
import { isMainAdmin, useAdminUser } from '../adminUser'

interface Props {
  project: Project
  /** থাকলে এডিট মোড */
  record?: HousingRecord | null
  onSaved: (record: HousingRecord) => void
  onCancel: () => void
}

interface Values {
  serialMode: 'auto' | 'manual'
  serial: string
  year: string
  name: string
  father: string
  division: string
  district: string
  upazila: string
  union: string
  address: string
  prevSource: string
  currentSource: string
  /** কাস্টম ফিল্ডের লেখা (পাবলিক ও গোপন) — key → ঘরের লেখা; জমার আগে parseField */
  custom: Record<string, string>
}

type ErrorKey = Exclude<keyof Values, 'custom' | 'serialMode'> | `custom.${string}`
type Errors = Partial<Record<ErrorKey, string>>

const CURRENT_YEAR = new Date().getFullYear()

const inputClass = FIELD_INPUT_CLASS

function initial(record: HousingRecord | null | undefined, custom: readonly FieldDef[]): Values {
  // ভৌগোলিক মান NFC করে নেওয়া হয়, নইলে ডাটাবেসের ভিন্ন Unicode রূপে <select> এর option মিলবে না
  const values: Record<string, string> = {}
  for (const d of custom) if (d.source === 'extra') values[d.key] = fieldSpec(d.type).toInput(record?.extra?.[d.key] ?? null, d)
  return {
    serialMode: 'auto',
    serial: record ? String(record.serial_no) : '',
    year: String(record?.year ?? CURRENT_YEAR),
    name: record?.name ?? '',
    father: record?.father_or_husband_name ?? '',
    division: nfc(record?.division),
    district: nfc(record?.district),
    upazila: nfc(record?.upazila),
    union: record?.union_name ?? '',
    address: record?.address ?? '',
    prevSource: record?.prev_photo_source ?? '',
    currentSource: record?.current_photo_source ?? '',
    custom: values,
  }
}

/** বাংলা অঙ্ক → ASCII (সিরিয়াল/সাল ইনপুটে) */
const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim()
const oneSpace = (s: string) => nfc(s).replace(/\s+/g, ' ')

interface Ctx {
  isEdit: boolean
  father?: FieldDef
  address?: FieldDef
  union?: FieldDef
  custom: readonly FieldDef[]
  kinds: PhotoKind[]
  /** প্রকল্পের ইউজারের এডিটে আগের মান (পর্ব চ): ভরা ঘর ফাঁকা করা যায় না — শুধু মূল এডমিন; null = সীমা নেই */
  noClear?: Values | null
}

function validate(v: Values, c: Ctx): Errors {
  const e: Errors = {}
  if (!c.isEdit && v.serialMode === 'manual') {
    const n = Number(ascii(v.serial))
    if (!Number.isInteger(n) || n < 1) e.serial = t('সিরিয়াল ১ বা তার বেশি পূর্ণসংখ্যা')
  }
  const y = Number(ascii(v.year))
  if (!Number.isInteger(y) || y < 2000 || y > 2100) e.year = t('সাল ২০০০–২১০০ এর মধ্যে')
  if (!nfc(v.name)) e.name = t('উপকারভোগীর নাম আবশ্যক')
  else if (nfc(v.name).length > 200) e.name = t('নাম ২০০ অক্ষরের মধ্যে')
  if (c.father?.required && !nfc(v.father)) e.father = t('আবশ্যক')
  else if (v.father.length > 200) e.father = t('২০০ অক্ষরের মধ্যে')
  if (!v.division) e.division = t('বিভাগ বাছুন')
  if (!v.district) e.district = t('জেলা বাছুন')
  if (!v.upazila) e.upazila = t('উপজেলা বাছুন')
  if (v.division && v.district && v.upazila && !isValidGeo(v.division, v.district, v.upazila)) e.upazila = t('বিভাগ/জেলা/উপজেলা তালিকার সাথে মিলছে না')
  if (c.union?.required && !oneSpace(v.union)) e.union = t('আবশ্যক')
  else if (oneSpace(v.union).length > 100) e.union = t('১০০ অক্ষরের মধ্যে')
  if (c.address?.required && !nfc(v.address)) e.address = t('আবশ্যক')
  else if (v.address.length > 1000) e.address = t('১০০০ অক্ষরের মধ্যে')
  for (const [k, kind, val] of [
    ['prevSource', 'prev', v.prevSource],
    ['currentSource', 'current', v.currentSource],
  ] as const) {
    if (c.kinds.includes(kind) && val.trim() && !/^https?:\/\//i.test(val.trim())) e[k] = t('http(s):// দিয়ে শুরু হওয়া লিঙ্ক')
  }
  for (const d of c.custom) {
    const r = parseField(d, v.custom[d.key] ?? '')
    if (!r.ok) e[`custom.${d.key}`] = fieldErrorMessage(r.error)
  }
  // প্রকল্পের ইউজার: আগে থেকে ভরা ঘর ফাঁকা করা "মোছার সমান" — শুধু মূল এডমিন (ডাটাবেসও আটকায়; প্রশ্ন ২৪)
  if (c.noClear) {
    const o = c.noClear
    const msg = t('আগের মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন')
    for (const k of ['father', 'union', 'address', 'prevSource', 'currentSource'] as const) {
      if (o[k].trim() && !v[k].trim()) e[k] = msg
    }
    for (const d of c.custom) {
      if ((o.custom[d.key] ?? '').trim() && !(v.custom[d.key] ?? '').trim()) e[`custom.${d.key}`] = msg
    }
  }
  return e
}

/** কাস্টম মানগুলো আগের মানের উপর বসানো — আর্কাইভ করা ফিল্ডের পুরনো মান মুছে যায় না */
function mergeValues(base: ExtraValues | null | undefined, defs: readonly FieldDef[], raw: Record<string, string>): ExtraValues {
  const out: ExtraValues = { ...(base ?? {}) }
  for (const d of defs) {
    const r = parseField(d, raw[d.key] ?? '')
    if (!r.ok) continue
    if (r.value === null) delete out[d.key]
    else out[d.key] = r.value
  }
  return out
}
const sameValues = (a: ExtraValues, b: ExtraValues) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && String(a[k]) === String(b[k]))
}

type PrivateState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; data: ExtraValues } | { status: 'error'; message: string }

/**
 * নতুন/এডিট ফর্ম — প্রকল্পের ফিল্ড-সংজ্ঞা থেকে (M-ধাপ ১০; resolveFields):
 *   সিরিয়াল (নতুনে স্বয়ংক্রিয় বা হাতে; এডিটে লক, বদলাতে আলাদা সতর্ক ডায়ালগ) — আগের মতোই
 *   পরিচয় (সাল, নাম, পিতা/স্বামী — প্রকল্পের লেবেল/চালু/আবশ্যক) · GeoSelect (ইউনিয়ন-স্তরের প্রকল্পে ইউনিয়নসহ) · ঠিকানা
 *   কাস্টম পাবলিক ফিল্ড (টাকা: MoneyInput; ক্যাটাগরি: আগে ব্যবহৃত মানের সাজেশন) · "🔒 শুধু এডমিন তথ্য" (গোপন ফিল্ড)
 *   ছবির ঘর ছবি মোড অনুযায়ী, লেবেল প্রকল্প থেকে; সেভের পর ছবি কম্প্রেস করে সিরিয়াল পাথে আপলোড
 * সব লেখা NFC করে পাঠানো হয়; চূড়ান্ত যাচাই ডাটাবেসে (housing_validate_record)।
 */
export function RecordForm({ project, record, onSaved, onCancel }: Props) {
  const api = getHousingApi()
  const toast = useToast()
  const projectType = project.key

  const defs = useMemo(() => resolveFields(project), [project])
  const father = defs.find((d) => d.key === 'father_or_husband_name')
  const address = defs.find((d) => d.key === 'address')
  const union = defs.find((d) => d.key === 'union_name')
  const yearDef = defs.find((d) => d.key === 'year')
  const nameDef = defs.find((d) => d.key === 'name')
  const customPublic = useMemo(() => defs.filter((d) => d.source === 'extra'), [defs])
  const customPrivate = useMemo(() => defs.filter((d) => d.source === 'private'), [defs])
  const custom = useMemo(() => [...customPublic, ...customPrivate], [customPublic, customPrivate])
  const kinds = photoKindsOf(project)

  const [values, setValues] = useState<Values>(() => initial(record, customPublic))
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [photos, setPhotos] = useState<Record<PhotoKind, UploadItem | null>>({ prev: null, current: null })
  const [current, setCurrent] = useState<HousingRecord | null>(record ?? null)
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({})
  // গোপন মান: এডিটে আগে আনা হয় — না আসা পর্যন্ত সংরক্ষণ বন্ধ (নইলে আগের গোপন মান মুছে যেতে পারে)
  const [priv, setPriv] = useState<PrivateState>(() => (customPrivate.length && record ? { status: 'loading' } : { status: 'none' }))
  // নতুন রেকর্ড একবার তৈরি হয়ে গেলে (ছবি ব্যর্থ হলেও) ফর্ম এডিট মোডে যায় — আবার সেভে ডুপ্লিকেট তৈরি হয় না
  const isEdit = current !== null

  // নতুন: পরবর্তী সিরিয়াল পূর্বাভাস
  useEffect(() => {
    if (isEdit) return
    let alive = true
    api
      .nextSerial(projectType)
      .then((n) => alive && setNextSerial(n))
      .catch(() => alive && setNextSerial(null))
    return () => {
      alive = false
    }
  }, [api, isEdit, projectType])

  // এডিট: গোপন মান
  const recordId = record?.id
  useEffect(() => {
    if (!recordId || !customPrivate.length) return
    let alive = true
    api
      .getPrivate(recordId)
      .then((data) => {
        if (!alive) return
        setPriv({ status: 'ready', data })
        setValues((v) => {
          const next = { ...v.custom }
          for (const d of customPrivate) next[d.key] = fieldSpec(d.type).toInput(data[d.key] ?? null, d)
          return { ...v, custom: next }
        })
      })
      .catch((err: unknown) => alive && setPriv({ status: 'error', message: HousingApiError.from(err).message }))
    return () => {
      alive = false
    }
  }, [api, recordId, customPrivate])

  // ক্যাটাগরির সাজেশন: এই প্রকল্পে আগে ব্যবহৃত মান (বেশি ব্যবহৃত আগে) — একই বানান রাখতে
  const categoryKeys = customPublic.filter((d) => d.type === 'category').map((d) => d.key).join(',')
  useEffect(() => {
    if (!categoryKeys) return
    let alive = true
    const papi = getProjectsApi()
    Promise.all(categoryKeys.split(',').map((k) => papi.fieldUsage(projectType, k).then((u) => [k, [...u.values].sort((a, b) => b.n - a.n).map((x) => x.value)] as const).catch(() => [k, []] as const)))
      .then((pairs) => alive && setSuggestions(Object.fromEntries(pairs)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [categoryKeys, projectType])

  // আনমাউন্টে প্রিভিউ URL মুক্ত
  useEffect(
    () => () => {
      revokeUploadItems([photos.prev, photos.current].filter((x): x is UploadItem => !!x))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const set = <K extends Exclude<keyof Values, 'custom'>>(k: K, v: Values[K]) => setValues((prev) => ({ ...prev, [k]: v }))
  const setCustom = (key: string, v: string) => setValues((prev) => ({ ...prev, custom: { ...prev.custom, [key]: v } }))
  const setGeo = (g: GeoValue) => setValues((prev) => ({ ...prev, division: g.division, district: g.district, upazila: g.upazila, union: g.union_name }))

  // প্রকল্পের ইউজার (পর্ব চ): এডিটে আগের মান — ফাঁকা করা যায় না; সিরিয়াল বদল ও থাকা ছবি বদল/মোছা শুধু মূল এডমিন
  const mainAdmin = isMainAdmin(useAdminUser())
  const original = useMemo(() => {
    if (!current || mainAdmin) return null
    const v = initial(current, customPublic)
    if (priv.status === 'ready') for (const d of customPrivate) v.custom[d.key] = fieldSpec(d.type).toInput(priv.data[d.key] ?? null, d)
    return v
  }, [current, mainAdmin, customPublic, customPrivate, priv])
  const ctx: Ctx = { isEdit, father, address, union, custom, kinds, noClear: original }
  const liveErrors = submitted ? validate(values, ctx) : errors
  const privBlocked = priv.status === 'loading' || priv.status === 'error'

  // ---- সাবমিট ----
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const errs = validate(values, ctx)
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast.error(t('ফর্মে ভুল আছে, লাল চিহ্নিত ঘরগুলো দেখুন'))
      return
    }
    if (privBlocked) {
      toast.error(t('গোপন তথ্য এখনো আসেনি — একটু পরে আবার চেষ্টা করুন'))
      return
    }
    const input: HousingRecordInput = {
      project_type: projectType,
      year: Number(ascii(values.year)),
      name: nfc(values.name),
      father_or_husband_name: nfc(values.father),
      division: nfc(values.division),
      district: nfc(values.district),
      upazila: nfc(values.upazila),
      address: nfc(values.address),
      prev_photo_source: kinds.includes('prev') ? values.prevSource.trim() || null : (current?.prev_photo_source ?? null),
      current_photo_source: kinds.includes('current') ? values.currentSource.trim() || null : (current?.current_photo_source ?? null),
    }
    if (union) input.union_name = oneSpace(values.union)
    // কাস্টম পাবলিক মান: ফিল্ড থাকলে (বা আগের মান থাকলে) পুরো extra — আর্কাইভ ফিল্ডের মান অক্ষত
    if (customPublic.length || Object.keys(current?.extra ?? {}).length) input.extra = mergeValues(current?.extra, customPublic, values.custom)
    try {
      let saved: HousingRecord
      if (isEdit && current) {
        setBusy(t('সংরক্ষণ হচ্ছে…'))
        const { project_type: _pt, ...patch } = input
        saved = await api.update(current.id, patch)
      } else {
        if (values.serialMode === 'manual') {
          const n = Number(ascii(values.serial))
          setBusy(t('সিরিয়াল যাচাই হচ্ছে…'))
          try {
            await api.getBySerial(projectType, n)
            setErrors({ serial: t('সিরিয়াল {n} আগে থেকেই আছে', { n: toBanglaNumber(n) }) })
            toast.error(t('এই সিরিয়াল আগে থেকেই ব্যবহৃত'))
            return
          } catch (err) {
            if (!(HousingApiError.is(err) && err.code === 'NOT_FOUND')) throw err
          }
          input.serial_no = n
        }
        setBusy(t('সংরক্ষণ হচ্ছে…'))
        saved = await api.create(input)
      }
      setCurrent(saved)

      // ---- গোপন মান (আলাদা জায়গায়; বদলালে তবেই) ----
      let privFail = false
      if (customPrivate.length) {
        const before = priv.status === 'ready' ? priv.data : {}
        const nextPriv = mergeValues(before, customPrivate, values.custom)
        if (!sameValues(before, nextPriv)) {
          try {
            setBusy(t('গোপন তথ্য সংরক্ষণ হচ্ছে…'))
            const data = await api.setPrivate(saved.id, nextPriv)
            setPriv({ status: 'ready', data })
          } catch (err) {
            privFail = true
            toast.error(t('গোপন তথ্য সংরক্ষণ ব্যর্থ: {message}', { message: HousingApiError.from(err).message }))
          }
        } else if (priv.status === 'none') setPriv({ status: 'ready', data: before })
      }

      // ---- ছবি আপলোড ----
      const toUpload = kinds.filter((k) => photos[k])
      let photoFail = 0
      for (const kind of toUpload) {
        const item = photos[kind]!
        try {
          setBusy(t('{kind} ছবি কম্প্রেস ও আপলোড হচ্ছে…', { kind: kind === 'prev' ? t('পূর্বের') : t('বর্তমান') }))
          const processed = await processImage(item.file)
          saved = await api.uploadPhoto(saved.id, kind, { photo: processed.photo, thumb: processed.thumb })
          revokeUploadItems([item])
          setPhotos((p) => ({ ...p, [kind]: null }))
        } catch (err) {
          photoFail++
          toast.error(t('{kind} ছবি আপলোড ব্যর্থ: {message}', { kind: kind === 'prev' ? t('পূর্বের') : t('বর্তমান'), message: HousingApiError.from(err).message }))
        }
      }
      setCurrent(saved)
      if (photoFail === 0 && !privFail) {
        toast.success(isEdit ? t('সিরিয়াল {n} সংরক্ষিত হয়েছে', { n: toBanglaNumber(saved.serial_no) }) : t('নতুন রেকর্ড যোগ হয়েছে (সিরিয়াল {n})', { n: toBanglaNumber(saved.serial_no) }))
        onSaved(saved)
      } else if (photoFail) {
        toast.info(
          t('রেকর্ড সংরক্ষিত (সিরিয়াল {n}), কিন্তু কিছু ছবি আপলোড হয়নি — ব্যর্থ ছবি আবার বেছে "সংরক্ষণ করুন" চাপুন', { n: toBanglaNumber(saved.serial_no) }),
        )
      }
    } catch (err) {
      const e2 = HousingApiError.from(err)
      if (e2.code === 'CONFLICT') {
        setErrors({ serial: t('এই সিরিয়াল আগে থেকেই আছে') })
        toast.error(t('সিরিয়াল ডুপ্লিকেট — অন্য সিরিয়াল দিন'))
      } else if (e2.code === 'UNAUTHENTICATED' || e2.code === 'FORBIDDEN') {
        toast.error(t('অনুমতি নেই — আবার লগইন করুন'))
      } else {
        toast.error(t('সংরক্ষণ ব্যর্থ: {message}', { message: e2.message }))
      }
    } finally {
      setBusy(null)
    }
  }

  // ---- বিদ্যমান ছবি মোছা ----
  const [deleteKind, setDeleteKind] = useState<PhotoKind | null>(null)
  const confirmDeletePhoto = async () => {
    if (!current || !deleteKind) return
    setBusy(t('ছবি মোছা হচ্ছে…'))
    try {
      const updated = await api.deletePhoto(current.id, deleteKind)
      setCurrent(updated)
      toast.success(t('ছবি মুছে ফেলা হয়েছে'))
    } catch (err) {
      toast.error(t('ছবি মোছা যায়নি: {message}', { message: HousingApiError.from(err).message }))
    } finally {
      setBusy(null)
      setDeleteKind(null)
    }
  }

  // ---- সিরিয়াল বদল (এডিট) ----
  const [serialDialog, setSerialDialog] = useState(false)
  const [newSerial, setNewSerial] = useState('')
  const newSerialNum = Number(ascii(newSerial))
  const newSerialValid = Number.isInteger(newSerialNum) && newSerialNum >= 1 && newSerialNum !== current?.serial_no
  const confirmChangeSerial = async () => {
    if (!current || !newSerialValid) return
    setBusy(t('সিরিয়াল বদলানো হচ্ছে…'))
    try {
      const updated = await api.changeSerial(current.id, newSerialNum)
      setCurrent(updated)
      setValues((v) => ({ ...v, serial: String(updated.serial_no) }))
      setSerialDialog(false)
      setNewSerial('')
      toast.success(t('সিরিয়াল {from} → {to} বদলানো হয়েছে; ছবির পাথও সরানো হয়েছে', { from: toBanglaNumber(current.serial_no), to: toBanglaNumber(updated.serial_no) }))
      onSaved(updated)
    } catch (err) {
      const e2 = HousingApiError.from(err)
      toast.error(e2.code === 'CONFLICT' ? t('এই সিরিয়াল আগে থেকেই আছে') : t('সিরিয়াল বদল ব্যর্থ: {message}', { message: e2.message }))
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null
  const label = (d: FieldDef | undefined, fallback: string) => (d ? `${lt(d, 'label')}${d.required ? ' *' : ''}` : fallback)
  const customField = (d: FieldDef) => {
    const id = `f-x-${d.key}`
    const err = liveErrors[`custom.${d.key}`]
    const help = pick(d.help_bn, d.help_en)
    const { Input } = fieldSpec(d.type)
    const lockedPrivate = d.source === 'private' && privBlocked
    return (
      <Field key={d.key} id={id} label={label(d, d.key)} error={err} help={help} className={d.type === 'long_text' ? 'sm:col-span-2' : ''}>
        <Input
          id={id}
          def={d}
          value={values.custom[d.key] ?? ''}
          onChange={(v) => setCustom(d.key, v)}
          disabled={disabled || lockedPrivate}
          invalid={!!err}
          describedBy={help ? `${id}-help` : undefined}
          suggestions={suggestions[d.key]}
          className={d.type === 'long_text' ? `${inputClass} h-auto py-2` : inputClass}
        />
      </Field>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
      {/* ---------- সিরিয়াল ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">{t('সিরিয়াল নম্বর')}</h2>
        {isEdit ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-slate-100 px-3 py-1.5 text-lg font-bold text-brand-800 tabular-nums">
              {toBanglaNumber(current?.serial_no ?? 0)}
            </span>
            <span className="text-xs text-slate-500">{mainAdmin ? t('লক করা — সাধারণ এডিটে বদলায় না') : t('লক করা — সিরিয়াল বদলাতে পারেন শুধু মূল এডমিন')}</span>
            {mainAdmin && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setSerialDialog(true)}
                className="ml-auto text-xs font-medium text-amber-800 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {t('সিরিয়াল বদলান…')}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="serialMode" checked={values.serialMode === 'auto'} onChange={() => set('serialMode', 'auto')} disabled={disabled} className="accent-brand-700" />
              {t('স্বয়ংক্রিয়')}{' '}
              <span className="text-slate-500">
                {nextSerial !== null ? t('(পরবর্তী: {n})', { n: toBanglaNumber(nextSerial) }) : t('(পরবর্তী সিরিয়াল সার্ভার দেবে)')}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="serialMode" checked={values.serialMode === 'manual'} onChange={() => set('serialMode', 'manual')} disabled={disabled} className="accent-brand-700" />
              {t('হাতে দিন')}
            </label>
            {values.serialMode === 'manual' && (
              <Field id="f-serial" label={t('সিরিয়াল')} error={liveErrors.serial}>
                <input id="f-serial" inputMode="numeric" className={inputClass} value={values.serial} onChange={(e) => set('serial', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.serial} />
              </Field>
            )}
          </div>
        )}
      </section>

      {/* ---------- পরিচয় ও ঠিকানা ---------- */}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field id="f-year" label={label(yearDef, t('সাল *'))} error={liveErrors.year}>
          <input id="f-year" inputMode="numeric" className={inputClass} value={values.year} onChange={(e) => set('year', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.year} />
        </Field>
        <Field id="f-name" label={label(nameDef, t('উপকারভোগীর নাম *'))} error={liveErrors.name}>
          <input id="f-name" className={inputClass} value={values.name} onChange={(e) => set('name', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.name} maxLength={200} />
        </Field>
        {father && (
          <Field id="f-father" label={label(father, '')} error={liveErrors.father}>
            <input id="f-father" className={inputClass} value={values.father} onChange={(e) => set('father', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.father} maxLength={200} />
          </Field>
        )}
        <GeoSelect
          value={{ division: values.division, district: values.district, upazila: values.upazila, union_name: values.union }}
          onChange={setGeo}
          errors={{ division: liveErrors.division, district: liveErrors.district, upazila: liveErrors.upazila, union_name: liveErrors.union }}
          disabled={disabled}
          union={!!union}
          unionRequired={!!union?.required}
          unionLabel={union ? lt(union, 'label') : undefined}
        />
        {address && (
          <Field id="f-address" label={label(address, '')} error={liveErrors.address} className="sm:col-span-2">
            <textarea id="f-address" rows={2} className={`${inputClass} h-auto py-2`} value={values.address} onChange={(e) => set('address', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.address} maxLength={1000} />
          </Field>
        )}
        {kinds.includes('prev') && (
          <Field id="f-prev-src" label={t('পূর্বের ছবির মূল লিঙ্ক (রেফারেন্স, ঐচ্ছিক)')} error={liveErrors.prevSource}>
            <input id="f-prev-src" type="url" className={inputClass} value={values.prevSource} onChange={(e) => set('prevSource', e.target.value)} disabled={disabled} placeholder="https://…sharepoint…" />
          </Field>
        )}
        {kinds.includes('current') && (
          <Field id="f-cur-src" label={t('বর্তমান ছবির মূল লিঙ্ক (রেফারেন্স, ঐচ্ছিক)')} error={liveErrors.currentSource}>
            <input id="f-cur-src" type="url" className={inputClass} value={values.currentSource} onChange={(e) => set('currentSource', e.target.value)} disabled={disabled} placeholder="https://…sharepoint…" />
          </Field>
        )}
      </section>

      {/* ---------- কাস্টম (পাবলিক) ---------- */}
      {customPublic.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">{t('প্রকল্পের তথ্য')}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{customPublic.map(customField)}</div>
        </section>
      )}

      {/* ---------- গোপন ---------- */}
      {customPrivate.length > 0 && (
        <section className="rounded-xl border border-slate-300 bg-slate-50 p-4" aria-labelledby="f-private-title">
          <h2 id="f-private-title" className="text-sm font-semibold text-slate-800">
            🔒 {t('শুধু এডমিন তথ্য')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t('পাবলিক সাইট, তালিকা, ফিল্টার বা পাবলিক এক্সপোর্টে কখনো দেখায় না।')}</p>
          {priv.status === 'loading' && <p className="mt-2 text-xs text-slate-500" aria-busy="true">{t('গোপন তথ্য আসছে…')}</p>}
          {priv.status === 'error' && (
            <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {t('গোপন তথ্য আনা যায়নি ({message}) — পাতা আবার খুলুন; এখন সংরক্ষণ বন্ধ।', { message: priv.message })}
            </p>
          )}
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{customPrivate.map(customField)}</div>
        </section>
      )}

      {/* ---------- ছবি ---------- */}
      {kinds.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2">
          {kinds.map((kind) => (
            <PhotoField
              key={kind}
              kind={kind}
              label={photoSlotLabel(project, kind)}
              record={current}
              item={photos[kind]}
              onChange={(it) => setPhotos((p) => ({ ...p, [kind]: it }))}
              onDeleteExisting={mainAdmin && isEdit && current?.[`${kind}_photo_url`] ? () => setDeleteKind(kind) : undefined}
              locked={!mainAdmin}
              disabled={disabled}
            />
          ))}
        </section>
      )}
      {!isEdit && (photos.prev || photos.current) && (
        <p className="text-xs text-slate-500">{t('রেকর্ড সংরক্ষণের পর ছবি স্বয়ংক্রিয়ভাবে সিরিয়াল-ভিত্তিক পাথে আপলোড হবে।')}</p>
      )}

      {/* ---------- বাটন ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={disabled || privBlocked} className="inline-flex h-11 items-center rounded-md bg-brand-700 px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {busy ?? (isEdit ? t('সংরক্ষণ করুন') : t('{title} — যোগ করুন', { title: lt(project, 'name') }))}
        </button>
        <button type="button" onClick={onCancel} disabled={disabled} className="inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {isEdit ? t('ফিরে যান') : t('বাতিল')}
        </button>
        <span className="text-xs text-slate-400">{t('* আবশ্যক')}</span>
      </div>

      {/* ---------- ডায়ালগ ---------- */}
      <ConfirmDialog
        open={deleteKind !== null}
        title={t('ছবি মুছবেন?')}
        tone="danger"
        confirmLabel={t('মুছুন')}
        busy={busy !== null}
        onConfirm={() => void confirmDeletePhoto()}
        onCancel={() => setDeleteKind(null)}
      >
        {t('{kind} ঘরের ছবি ও থাম্বনেইল স্টোরেজ থেকে মুছে যাবে। এটি ফেরানো যাবে না।', { kind: deleteKind === 'prev' ? t('পূর্বের') : t('বর্তমান') })}
      </ConfirmDialog>

      <ConfirmDialog
        open={serialDialog}
        title={t('সিরিয়াল নম্বর বদলাবেন?')}
        tone="danger"
        confirmLabel={t('হ্যাঁ, সিরিয়াল বদলান')}
        busy={busy !== null}
        confirmDisabled={!newSerialValid}
        onConfirm={() => void confirmChangeSerial()}
        onCancel={() => {
          setSerialDialog(false)
          setNewSerial('')
        }}
      >
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <strong>{t('সতর্কতা:')}</strong> {t('সিরিয়াল স্থায়ী পরিচয়। বদলালে ছবির ফাইল নতুন সিরিয়ালের পাথে সরে যাবে, শেয়ার করা পুরনো লিঙ্ক (')}
          <code>/housing/…/{toBanglaNumber(current?.serial_no ?? 0)}</code>{t(') আর কাজ করবে না, এবং পুরনো সিরিয়াল আর কাউকে দেওয়া হবে না।')}
        </p>
        <label htmlFor="f-new-serial" className="mt-3 block text-sm font-medium text-slate-700">
          {t('নতুন সিরিয়াল')}
        </label>
        <input id="f-new-serial" inputMode="numeric" className={`${inputClass} mt-1`} value={newSerial} onChange={(e) => setNewSerial(e.target.value)} autoFocus />
        {newSerial && !newSerialValid && <p className="mt-1 text-xs text-red-700">{t('১ বা তার বেশি, বর্তমানটির থেকে ভিন্ন')}</p>}
      </ConfirmDialog>
    </form>
  )
}

function Field({ id, label, error, help, className = '', children }: { id: string; label: string; error?: string; help?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">
          {help}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
