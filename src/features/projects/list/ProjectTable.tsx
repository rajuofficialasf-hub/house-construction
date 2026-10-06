import { t, gn, getLang } from '@/i18n'
import { Fragment, useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { toBanglaNumber } from '@/lib/banglaNumber'
import type { HousingRecord, PhotoKind, Project } from '@/backend'
import { gnUnion, useUnionData } from '@/features/geo/unions'
import { fieldSpec, fieldValue, type FieldDef } from '@/features/projects/fields'
import { photoSrc } from '@/features/housing/utils/imagePath'
import { projectPath } from '@/features/housing/utils/housingProjects'
import { Lightbox, type LightboxImage } from '@/features/housing/components/Lightbox'
import { SafeImage } from '@/features/housing/components/SafeImage'
import { photoLabel, placeParts, type ListLayout } from './listColumns'
import { RecordCardList } from './RecordCardList'

interface Props {
  project: Project
  layout: ListLayout
  records: HousingRecord[]
  /** বর্তমান পেইজ ও পেইজ সাইজ — "ক্রম" কলামের জন্য */
  page: number
  pageSize: number
  /** নতুন পেইজ লোড হচ্ছে: টেবিল হালকা হয়ে থাকে */
  busy?: boolean
}

/** ভিউ মোডের পাথ: /<প্রকল্পের পাথ>/<serial_no> + বর্তমান ফিল্টার/পেইজ (query string) */
function viewPath(r: HousingRecord, search: string): string {
  return `${projectPath(r.project_type)}/${r.serial_no}${search}`
}

/**
 * উপকারভোগী তালিকা (M-ধাপ ১৩: প্রকল্পের ফিল্ড-সংজ্ঞা থেকে — listColumns.ts): lg+ (≥1024px) এ টেবিল; ফোন/ট্যাবে কার্ড
 * (RecordCardList, sm+ এ ২ কলাম)। সেল আঁকা হয় ফিল্ড-টাইপ রেজিস্ট্রি দিয়ে (টাকা ৳); ঘর নির্মাণে আগের হুবহু ১১টি কলাম।
 * টেবিলে শুধু থাম্বনেইল (lazy); ক্লিকে লাইটবক্সে বড় ছবি। "ক্রম" = (পেইজ−১)×সাইজ+ইনডেক্স+১, serial_no নয়।
 */
export function ProjectTable({ project, layout, records, page, pageSize, busy = false }: Props) {
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null)
  const closeLightbox = useCallback(() => setLightbox(null), [])
  // ইংরেজিতে ইউনিয়নের ইংরেজি নাম (তালিকা লেজি-লোড; নামার পর আবার রেন্ডার) — শুধু ডাটায় ইউনিয়ন থাকলে
  useUnionData(layout.showUnion && getLang() === 'en')

  const openPhoto = (r: HousingRecord, kind: PhotoKind) => {
    const full = photoSrc(r[`${kind}_photo_url`], r.photo_updated_at)
    const thumb = photoSrc(r[`${kind}_thumb_url`], r.photo_updated_at)
    const label = photoLabel(project, kind)
    setLightbox({
      src: full ?? thumb,
      alt: `${r.name} — ${label}`,
      caption: `${r.name} · ${label} · ${t('সিরিয়াল')} ${toBanglaNumber(r.serial_no)}`,
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
              <th scope="col" className="px-2 py-2.5 leading-tight first:pl-4 last:pr-4">
                {t('ক্রম')}
              </th>
              {layout.columns.map((c) => (
                <th
                  key={c.kind === 'field' ? c.def.key : c.kind === 'photo' ? c.photo : 'geo'}
                  scope="col"
                  className={`px-2 py-2.5 leading-tight first:pl-4 last:pr-4${c.kind === 'field' && c.def.source !== 'system' && fieldSpec(c.def.type).align === 'right' ? ' text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
              <th scope="col" className="px-2 py-2.5 leading-tight first:pl-4 last:pr-4">
                {t('বিস্তারিত')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r, i) => (
              <tr key={r.id} className="align-middle hover:bg-slate-50">
                <td className="px-2 py-2 pl-4 text-slate-500 tabular-nums">{ordinal(i)}</td>
                {layout.columns.map((c) =>
                  c.kind === 'photo' ? (
                    <td key={c.photo} className="px-2 py-2">
                      <Thumb record={r} kind={c.photo} label={photoLabel(project, c.photo)} onOpen={openPhoto} />
                    </td>
                  ) : c.kind === 'geo' ? (
                    <td key="geo" className="px-2 py-2">
                      <PlaceText record={r} withUnion={layout.showUnion} />
                    </td>
                  ) : (
                    <FieldCell key={c.def.key} def={c.def} record={r} />
                  ),
                )}
                <td className="px-2 py-2 pr-4">
                  <ViewButton record={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- মোবাইল/ট্যাব কার্ড ---------- */}
      <RecordCardList project={project} layout={layout} records={records} ordinal={ordinal} onOpen={openPhoto} />

      <Lightbox image={lightbox} onClose={closeLightbox} />
    </div>
  )
}

/** একটি ঘর: সিস্টেম ফিল্ড আগের চেহারায়, কাস্টম ফিল্ড রেজিস্ট্রির Cell এ */
function FieldCell({ def, record: r }: { def: FieldDef; record: HousingRecord }) {
  switch (def.key) {
    case 'year':
      return <td className="px-2 py-2 whitespace-nowrap tabular-nums">{toBanglaNumber(r.year)}</td>
    case 'name':
      return <td className="px-2 py-2 font-medium text-slate-900">{r.name}</td>
    case 'father_or_husband_name':
      return <td className="px-2 py-2 text-slate-700">{r.father_or_husband_name || '—'}</td>
    case 'division':
    case 'district':
    case 'upazila':
      return <td className="px-2 py-2">{gn(r[def.key])}</td>
    case 'union_name':
      return <td className="px-2 py-2">{r.union_name ? gnUnion(r.district, r.upazila, r.union_name) : '—'}</td>
    case 'address':
      return <td className="max-w-[14rem] px-2 py-2 text-slate-600">{r.address || '—'}</td>
  }
  const { Cell, align } = fieldSpec(def.type)
  return (
    <td className={`px-2 py-2 text-slate-700${align === 'right' ? ' text-right' : ''}`}>
      <Cell def={def} value={fieldValue(def, r)} />
    </td>
  )
}

export function Thumb({
  record: r,
  kind,
  label,
  onOpen,
  size = 'sm',
}: {
  record: HousingRecord
  kind: PhotoKind
  label: string
  onOpen: (r: HousingRecord, kind: PhotoKind) => void
  size?: 'sm' | 'lg'
}) {
  const thumb = photoSrc(r[`${kind}_thumb_url`], r.photo_updated_at)
  const hasFull = !!r[`${kind}_photo_url`]
  const box = size === 'sm' ? 'h-14 w-14' : 'aspect-[4/3] w-full'
  const img = (
    <SafeImage
      src={thumb}
      alt={`${r.name} — ${label}`}
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
      aria-label={`${label} — ${t('বড় করে দেখুন')}`}
      className="block overflow-hidden rounded-md ring-brand-400 transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      {img}
    </button>
  )
}

export function ViewButton({ record: r, compact = false }: { record: HousingRecord; compact?: boolean }) {
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

/**
 * ঠিকানার লাইন "উপজেলা, জেলা, বিভাগ" — আলাদা টেক্সট-নোডে (আগের `{a}, {b}, {c}` এর মতো), যাতে ঘর নির্মাণের কার্ড
 * পিক্সেলে হুবহু থাকে (এক স্ট্রিং হলে ব্রাউজার লেখা একটু অন্যভাবে সাজায়)।
 */
export function PlaceText({ record, withUnion }: { record: HousingRecord; withUnion: boolean }) {
  return placeParts(record, withUnion).map((p, i) => (
    <Fragment key={i}>
      {i > 0 && ', '}
      {p}
    </Fragment>
  ))
}
