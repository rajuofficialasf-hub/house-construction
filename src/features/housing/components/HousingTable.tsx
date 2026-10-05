import { t, gn } from '@/i18n'
import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { toBanglaNumber } from '@/lib/banglaNumber'
import type { HousingRecord, PhotoKind } from '../../../backend/interfaces/types'
import { photoSrc } from '../utils/imagePath'
import { projectPath } from '../utils/projectType'
import { Lightbox, type LightboxImage } from './Lightbox'
import { SafeImage } from './SafeImage'

interface Props {
  records: HousingRecord[]
  /** বর্তমান পেইজ ও পেইজ সাইজ — "ক্রম" কলামের জন্য */
  page: number
  pageSize: number
  /** নতুন পেইজ লোড হচ্ছে: টেবিল হালকা হয়ে থাকে */
  busy?: boolean
}

const COLUMNS = [
  'ক্রম',
  'সাল',
  'উপকারভোগীর নাম',
  'পিতা/স্বামীর নাম',
  'বিভাগ',
  'জেলা',
  'উপজেলা',
  'বিস্তারিত ঠিকানা',
  'পূর্বের ছবি',
  'বর্তমান ছবি',
  'বিস্তারিত',
] as const

const KIND_LABEL: Record<PhotoKind, string> = { prev: 'পূর্বের ঘর', current: 'বর্তমান ঘর' }

/** ভিউ মোডের পাথ: /housing/<slug>/<serial_no> + বর্তমান ফিল্টার/পেইজ (query string) */
function viewPath(r: HousingRecord, search: string): string {
  return `${projectPath(r.project_type)}/${r.serial_no}${search}`
}

/**
 * উপকারভোগী তালিকা: lg+ (≥1024px) এ টেবিল (অনুভূমিক স্ক্রলসহ); ফোন/ট্যাবে কার্ড (sm+ এ ২ কলাম) — ট্যাবে অনুভূমিক স্ক্রল ছাড়া পড়া যায়।
 * টেবিলে শুধু থাম্বনেইল (lazy); ক্লিকে লাইটবক্সে বড় ছবি। "ক্রম" = (পেইজ−১)×সাইজ+ইনডেক্স+১, serial_no নয়।
 */
export function HousingTable({ records, page, pageSize, busy = false }: Props) {
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null)
  const closeLightbox = useCallback(() => setLightbox(null), [])

  const openPhoto = (r: HousingRecord, kind: PhotoKind) => {
    const full = photoSrc(r[`${kind}_photo_url`], r.photo_updated_at)
    const thumb = photoSrc(r[`${kind}_thumb_url`], r.photo_updated_at)
    setLightbox({
      src: full ?? thumb,
      alt: `${r.name} — ${t(KIND_LABEL[kind])}`,
      caption: `${r.name} · ${t(KIND_LABEL[kind])} · ${t('সিরিয়াল')} ${toBanglaNumber(r.serial_no)}`,
    })
  }

  const ordinal = (i: number) => toBanglaNumber((page - 1) * pageSize + i + 1)

  return (
    <div aria-busy={busy} className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {/* ---------- ডেস্কটপ টেবিল ---------- */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        {/* min-width নেই: ডেস্কটপে (≥1024) টেবিল কন্টেইনারে ফিট করে, অনুভূমিক স্ক্রল নেই; শিরোনাম দরকারে দুই লাইনে */}
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-left text-xs font-semibold text-brand-900">
            <tr className="align-bottom">
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="px-2 py-2.5 leading-tight first:pl-4 last:pr-4">
                  {t(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r, i) => (
              <tr key={r.id} className="align-middle hover:bg-slate-50">
                <td className="px-2 py-2 pl-4 text-slate-500 tabular-nums">{ordinal(i)}</td>
                <td className="px-2 py-2 whitespace-nowrap tabular-nums">{toBanglaNumber(r.year)}</td>
                <td className="px-2 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-2 py-2 text-slate-700">{r.father_or_husband_name || '—'}</td>
                <td className="px-2 py-2">{gn(r.division)}</td>
                <td className="px-2 py-2">{gn(r.district)}</td>
                <td className="px-2 py-2">{gn(r.upazila)}</td>
                <td className="max-w-[14rem] px-2 py-2 text-slate-600">{r.address || '—'}</td>
                <td className="px-2 py-2">
                  <Thumb record={r} kind="prev" onOpen={openPhoto} />
                </td>
                <td className="px-2 py-2">
                  <Thumb record={r} kind="current" onOpen={openPhoto} />
                </td>
                <td className="px-2 py-2 pr-4">
                  <ViewButton record={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- মোবাইল/ট্যাব কার্ড ---------- */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {records.map((r, i) => (
          <li key={r.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {t('ক্রম')} {ordinal(i)} · {t('সাল')} {toBanglaNumber(r.year)}
                </p>
                <h3 className="mt-0.5 text-[17px] leading-snug font-semibold text-slate-900">{r.name}</h3>
                {r.father_or_husband_name && (
                  <p className="text-sm text-slate-600">{t('পিতা/স্বামী:')} {r.father_or_husband_name}</p>
                )}
              </div>
              <ViewButton record={r} compact />
            </div>
            <p className="mt-2 text-sm text-slate-700">
              {gn(r.upazila)}, {gn(r.district)}, {gn(r.division)}
            </p>
            {r.address && <p className="mt-0.5 text-sm break-words text-slate-500">{r.address}</p>}
            <div className="mt-auto grid grid-cols-2 gap-3 pt-3">
              {(['prev', 'current'] as PhotoKind[]).map((kind) => (
                <div key={kind}>
                  <p className="mb-1 text-xs font-medium text-slate-500">{t(KIND_LABEL[kind])}</p>
                  <Thumb record={r} kind={kind} onOpen={openPhoto} size="lg" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <Lightbox image={lightbox} onClose={closeLightbox} />
    </div>
  )
}

function Thumb({
  record: r,
  kind,
  onOpen,
  size = 'sm',
}: {
  record: HousingRecord
  kind: PhotoKind
  onOpen: (r: HousingRecord, kind: PhotoKind) => void
  size?: 'sm' | 'lg'
}) {
  const thumb = photoSrc(r[`${kind}_thumb_url`], r.photo_updated_at)
  const hasFull = !!r[`${kind}_photo_url`]
  const box = size === 'sm' ? 'h-14 w-14' : 'aspect-[4/3] w-full'
  const img = (
    <SafeImage
      src={thumb}
      alt={`${r.name} — ${t(KIND_LABEL[kind])}`}
      className={`${box} rounded-md object-cover`}
      placeholderClassName={`${box} rounded-md`}
      width={size === 'sm' ? 56 : undefined}
      height={size === 'sm' ? 56 : undefined}
    />
  )
  if (!thumb && !hasFull) return img
  return (
    <button
      type="button"
      onClick={() => onOpen(r, kind)}
      aria-label={`${t(KIND_LABEL[kind])} — ${t('বড় করে দেখুন')}`}
      className="block overflow-hidden rounded-md ring-brand-400 transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      {img}
    </button>
  )
}

function ViewButton({ record: r, compact = false }: { record: HousingRecord; compact?: boolean }) {
  const { search } = useLocation()
  return (
    <Link
      to={viewPath(r, search)}
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-600 font-medium whitespace-nowrap text-brand-700 transition hover:bg-brand-600 hover:text-white',
        compact ? 'h-9 px-3 text-sm' : 'px-3 py-1.5 text-sm',
      ].join(' ')}
      aria-label={`${r.name} — ${t('বিস্তারিত দেখুন')}`}
    >
      {t('বিস্তারিত')}
    </Link>
  )
}
