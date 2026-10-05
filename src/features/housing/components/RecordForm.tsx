import { gn, lt, t } from '@/i18n'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useToast } from '@/components/useToast'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi } from '../../../backend/factory'
import {
  HousingApiError,
  type HousingRecord,
  type HousingRecordInput,
  type PhotoKind,
  type ProjectType,
} from '../../../backend/interfaces/types'
import { getDistricts, getDivisions, getUpazilas, isValidGeo, nfc } from '@/features/geo/geo'
import { processImage } from '../utils/imageProcessing'
import { useProject } from '@/features/projects/registry'
import { revokeUploadItems, type UploadItem } from '../utils/uploadItems'
import { ConfirmDialog } from './ConfirmDialog'
import { PhotoField } from './PhotoField'

interface Props {
  projectType: ProjectType
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
  address: string
  prevSource: string
  currentSource: string
}

type Errors = Partial<Record<keyof Values, string>>

const CURRENT_YEAR = new Date().getFullYear()

const inputClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400'

function initial(record: HousingRecord | null | undefined): Values {
  // ভৌগোলিক মান NFC করে নেওয়া হয়, নইলে ডাটাবেসের ভিন্ন Unicode রূপে <select> এর option মিলবে না
  return {
    serialMode: 'auto',
    serial: record ? String(record.serial_no) : '',
    year: String(record?.year ?? CURRENT_YEAR),
    name: record?.name ?? '',
    father: record?.father_or_husband_name ?? '',
    division: nfc(record?.division),
    district: nfc(record?.district),
    upazila: nfc(record?.upazila),
    address: record?.address ?? '',
    prevSource: record?.prev_photo_source ?? '',
    currentSource: record?.current_photo_source ?? '',
  }
}

/** বাংলা অঙ্ক → ASCII (সিরিয়াল/সাল ইনপুটে) */
const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim()

function validate(v: Values, isEdit: boolean): Errors {
  const e: Errors = {}
  if (!isEdit && v.serialMode === 'manual') {
    const n = Number(ascii(v.serial))
    if (!Number.isInteger(n) || n < 1) e.serial = t('সিরিয়াল ১ বা তার বেশি পূর্ণসংখ্যা')
  }
  const y = Number(ascii(v.year))
  if (!Number.isInteger(y) || y < 2000 || y > 2100) e.year = t('সাল ২০০০–২১০০ এর মধ্যে')
  if (!nfc(v.name)) e.name = t('উপকারভোগীর নাম আবশ্যক')
  else if (nfc(v.name).length > 200) e.name = t('নাম ২০০ অক্ষরের মধ্যে')
  if (v.father.length > 200) e.father = t('২০০ অক্ষরের মধ্যে')
  if (!v.division) e.division = t('বিভাগ বাছুন')
  if (!v.district) e.district = t('জেলা বাছুন')
  if (!v.upazila) e.upazila = t('উপজেলা বাছুন')
  if (v.division && v.district && v.upazila && !isValidGeo(v.division, v.district, v.upazila)) e.upazila = t('বিভাগ/জেলা/উপজেলা তালিকার সাথে মিলছে না')
  if (v.address.length > 1000) e.address = t('১০০০ অক্ষরের মধ্যে')
  for (const [k, val] of [
    ['prevSource', v.prevSource],
    ['currentSource', v.currentSource],
  ] as const) {
    if (val.trim() && !/^https?:\/\//i.test(val.trim())) e[k] = t('http(s):// দিয়ে শুরু হওয়া লিঙ্ক')
  }
  return e
}

/**
 * নতুন/এডিট ফর্ম। ভ্যালিডেশন (নাম, সাল, বিভাগ, জেলা, উপজেলা আবশ্যক), cascading ভৌগোলিক ড্রপডাউন,
 * সিরিয়াল: নতুনে স্বয়ংক্রিয় (পরবর্তী N) বা হাতে (অনন্যতা যাচাই); এডিটে লক, বদলাতে আলাদা সতর্ক ডায়ালগ।
 * ছবি: দুটি PhotoField; সেভের পর নতুন ফাইল কম্প্রেস করে সিরিয়াল পাথে আপলোড (ওভাররাইট)।
 * সব টেক্সট NFC নরমালাইজ করে পাঠানো হয়।
 */
export function RecordForm({ projectType, record, onSaved, onCancel }: Props) {
  const api = getHousingApi()
  const toast = useToast()
  const project = useProject(projectType)

  const [values, setValues] = useState<Values>(() => initial(record))
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [photos, setPhotos] = useState<Record<PhotoKind, UploadItem | null>>({ prev: null, current: null })
  const [current, setCurrent] = useState<HousingRecord | null>(record ?? null)
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

  // আনমাউন্টে প্রিভিউ URL মুক্ত
  useEffect(
    () => () => {
      revokeUploadItems([photos.prev, photos.current].filter((x): x is UploadItem => !!x))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((prev) => {
      const next = { ...prev, [k]: v }
      if (k === 'division') Object.assign(next, { district: '', upazila: '' })
      if (k === 'district') Object.assign(next, { upazila: '' })
      return next
    })
  }

  const liveErrors = useMemo(() => (submitted ? validate(values, isEdit) : errors), [submitted, values, isEdit, errors])

  // ---- সাবমিট ----
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const errs = validate(values, isEdit)
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast.error(t('ফর্মে ভুল আছে, লাল চিহ্নিত ঘরগুলো দেখুন'))
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
      prev_photo_source: values.prevSource.trim() || null,
      current_photo_source: values.currentSource.trim() || null,
    }
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

      // ---- ছবি আপলোড ----
      const kinds = (['prev', 'current'] as PhotoKind[]).filter((k) => photos[k])
      let photoFail = 0
      for (const kind of kinds) {
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
      if (photoFail === 0) {
        toast.success(isEdit ? t('সিরিয়াল {n} সংরক্ষিত হয়েছে', { n: toBanglaNumber(saved.serial_no) }) : t('নতুন রেকর্ড যোগ হয়েছে (সিরিয়াল {n})', { n: toBanglaNumber(saved.serial_no) }))
        onSaved(saved)
      } else {
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

  const divisions = getDivisions()
  const districts = getDistricts(values.division)
  const upazilas = getUpazilas(values.division, values.district)
  const disabled = busy !== null

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
            <span className="text-xs text-slate-500">{t('লক করা — সাধারণ এডিটে বদলায় না')}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setSerialDialog(true)}
              className="ml-auto text-xs font-medium text-amber-800 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t('সিরিয়াল বদলান…')}
            </button>
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

      {/* ---------- তথ্য ---------- */}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field id="f-year" label={t('সাল *')} error={liveErrors.year}>
          <input id="f-year" inputMode="numeric" className={inputClass} value={values.year} onChange={(e) => set('year', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.year} />
        </Field>
        <Field id="f-name" label={t('উপকারভোগীর নাম *')} error={liveErrors.name}>
          <input id="f-name" className={inputClass} value={values.name} onChange={(e) => set('name', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.name} maxLength={200} />
        </Field>
        <Field id="f-father" label={t('পিতা/স্বামীর নাম')} error={liveErrors.father}>
          <input id="f-father" className={inputClass} value={values.father} onChange={(e) => set('father', e.target.value)} disabled={disabled} maxLength={200} />
        </Field>
        <Field id="f-division" label={t('বিভাগ *')} error={liveErrors.division}>
          <select id="f-division" className={inputClass} value={values.division} onChange={(e) => set('division', e.target.value)} disabled={disabled} aria-invalid={!!liveErrors.division}>
            <option value="">{t('বাছুন')}</option>
            {divisions.map((d) => (
              <option key={d.name} value={d.name}>
                {gn(d.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="f-district" label={t('জেলা *')} error={liveErrors.district}>
          <select id="f-district" className={inputClass} value={values.district} onChange={(e) => set('district', e.target.value)} disabled={disabled || !values.division} aria-invalid={!!liveErrors.district}>
            <option value="">{values.division ? t('বাছুন') : t('আগে বিভাগ')}</option>
            {districts.map((d) => (
              <option key={d.name} value={d.name}>
                {gn(d.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="f-upazila" label={t('উপজেলা *')} error={liveErrors.upazila}>
          <select id="f-upazila" className={inputClass} value={values.upazila} onChange={(e) => set('upazila', e.target.value)} disabled={disabled || !values.district} aria-invalid={!!liveErrors.upazila}>
            <option value="">{values.district ? t('বাছুন') : t('আগে জেলা')}</option>
            {upazilas.map((u) => (
              <option key={u.name} value={u.name}>
                {gn(u.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="f-address" label={t('বিস্তারিত ঠিকানা')} error={liveErrors.address} className="sm:col-span-2">
          <textarea id="f-address" rows={2} className={`${inputClass} h-auto py-2`} value={values.address} onChange={(e) => set('address', e.target.value)} disabled={disabled} maxLength={1000} />
        </Field>
        <Field id="f-prev-src" label={t('পূর্বের ছবির মূল লিঙ্ক (রেফারেন্স, ঐচ্ছিক)')} error={liveErrors.prevSource}>
          <input id="f-prev-src" type="url" className={inputClass} value={values.prevSource} onChange={(e) => set('prevSource', e.target.value)} disabled={disabled} placeholder="https://…sharepoint…" />
        </Field>
        <Field id="f-cur-src" label={t('বর্তমান ছবির মূল লিঙ্ক (রেফারেন্স, ঐচ্ছিক)')} error={liveErrors.currentSource}>
          <input id="f-cur-src" type="url" className={inputClass} value={values.currentSource} onChange={(e) => set('currentSource', e.target.value)} disabled={disabled} placeholder="https://…sharepoint…" />
        </Field>
      </section>

      {/* ---------- ছবি ---------- */}
      <section className="grid gap-4 sm:grid-cols-2">
        {(['prev', 'current'] as PhotoKind[]).map((kind) => (
          <PhotoField
            key={kind}
            kind={kind}
            record={current}
            item={photos[kind]}
            onChange={(it) => setPhotos((p) => ({ ...p, [kind]: it }))}
            onDeleteExisting={isEdit && current?.[`${kind}_photo_url`] ? () => setDeleteKind(kind) : undefined}
            disabled={disabled}
          />
        ))}
      </section>
      {!isEdit && (photos.prev || photos.current) && (
        <p className="text-xs text-slate-500">{t('রেকর্ড সংরক্ষণের পর ছবি স্বয়ংক্রিয়ভাবে সিরিয়াল-ভিত্তিক পাথে আপলোড হবে।')}</p>
      )}

      {/* ---------- বাটন ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={disabled} className="inline-flex h-11 items-center rounded-md bg-brand-700 px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
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

function Field({ id, label, error, className = '', children }: { id: string; label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
