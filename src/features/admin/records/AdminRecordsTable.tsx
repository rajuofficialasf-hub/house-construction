import { gn, lt, t } from '@/i18n'
import { Link } from 'react-router'
import { formatTaka } from '@/lib/money'
import { toBanglaNumber } from '@/lib/banglaNumber'
import type { HousingRecord, Project } from '@/backend'
import { gnUnion, useUnionData } from '@/features/geo/unions'
import { fieldSpec, fieldValue, type FieldDef } from '@/features/projects/fields'
import { photoSrc } from '@/features/housing/utils/imagePath'
import { adminPath } from '@/features/housing/utils/housingProjects'
import { SafeImage } from '@/features/housing/components/SafeImage'
import { photoSlotLabel, type AdminLayout } from './recordColumns'

interface Props {
  project: Project
  layout: AdminLayout
  records: HousingRecord[]
  page: number
  pageSize: number
  busy?: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[], checked: boolean) => void
  /** না দিলে মোছার বোতাম নেই (সাধারণ এডমিন — প্রশ্ন ১৬) */
  onDelete?: (record: HousingRecord) => void
}

function adminEditPath(r: HousingRecord): string {
  return adminPath(r.project_type, `${r.serial_no}/edit`)
}

/** উপজেলা, জেলা, বিভাগ (ইউনিয়ন থাকলে আগে) */
function place(r: HousingRecord, withDivision = true): string {
  const parts = [r.union_name ? gnUnion(r.district, r.upazila, r.union_name) : '', gn(r.upazila), gn(r.district), withDivision ? gn(r.division) : '']
  return parts.filter(Boolean).join(', ')
}

function Value({ def, r }: { def: FieldDef; r: HousingRecord }) {
  const { Cell } = fieldSpec(def.type)
  return <Cell def={def} value={fieldValue(def, r)} />
}

/**
 * এডমিন তালিকা (M-ধাপ ১০: প্রকল্পের ফিল্ড-সংজ্ঞা থেকে — recordColumns.ts): চেকবক্স (বাল্ক ডিলেট), ক্রম, সিরিয়াল,
 * পরিচয়ের ঘর, ঠিকানা, "টেবিলে" চালু কাস্টম ফিল্ড, ছবি (ছবি মোড অনুযায়ী), এডিট/ডিলেট। টাকার কলামে পাতার মোট।
 * md+ টেবিল, ছোট পর্দায় কার্ড। ঘর নির্মাণে (কাস্টম ফিল্ড নেই) আগের কলামগুলোই।
 */
export function AdminRecordsTable({ project, layout, records, page, pageSize, busy = false, selected, onToggle, onToggleAll, onDelete }: Props) {
  // ইউনিয়ন থাকলে তার ইংরেজি নাম (তালিকা lazy)
  useUnionData(project.geo_depth === 'union' && records.some((r) => r.union_name))
  const ids = records.map((r) => r.id)
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id))
  const someChecked = !allChecked && ids.some((id) => selected.has(id))
  const ordinal = (i: number) => toBanglaNumber((page - 1) * pageSize + i + 1)
  const pageSum = (def: FieldDef) => records.reduce((s, r) => s + (Number(r.extra?.[def.key]) || 0), 0)
  const kinds = layout.photoKinds
  const thumbs = (r: HousingRecord, size: string) => (
    <div className="flex gap-1">
      {kinds.map((k) => (
        <SafeImage key={k} src={photoSrc(r[`${k}_thumb_url`], r.photo_updated_at)} alt={photoSlotLabel(project, k)} className={`${size} rounded object-cover`} placeholderClassName={`${size} rounded`} />
      ))}
    </div>
  )

  return (
    <div aria-busy={busy} className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {/* ---------- ডেস্কটপ ---------- */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-amber-50 text-left text-xs font-semibold tracking-wide text-amber-900 uppercase">
            <tr>
              <th className="w-10 px-3 py-3 pl-4">
                <input
                  type="checkbox"
                  aria-label={t('এই পেইজের সব নির্বাচন')}
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked
                  }}
                  onChange={(e) => onToggleAll(ids, e.target.checked)}
                  className="h-4 w-4 accent-brand-700"
                />
              </th>
              <th className="px-3 py-3">{t('ক্রম')}</th>
              <th className="px-3 py-3">{t('সিরিয়াল')}</th>
              {layout.columns.map((c, i) =>
                c.kind === 'field' ? (
                  <th key={c.def.key} className={`px-3 py-3 ${fieldSpec(c.def.type).align === 'right' && c.def.source !== 'system' ? 'text-right' : ''}`}>
                    {lt(c.def, 'label')}
                  </th>
                ) : (
                  <th key={`${c.kind}-${i}`} className="px-3 py-3">
                    {c.kind === 'address' ? t('ঠিকানা') : t('ছবি')}
                  </th>
                ),
              )}
              <th className="px-3 py-3 pr-4">{t('কাজ')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r, i) => (
              <tr key={r.id} className={selected.has(r.id) ? 'bg-brand-50/60' : 'hover:bg-slate-50'}>
                <td className="px-3 py-2 pl-4">
                  <input
                    type="checkbox"
                    aria-label={t('{name} নির্বাচন', { name: r.name })}
                    checked={selected.has(r.id)}
                    onChange={() => onToggle(r.id)}
                    className="h-4 w-4 accent-brand-700"
                  />
                </td>
                <td className="px-3 py-2 text-slate-500 tabular-nums">{ordinal(i)}</td>
                <td className="px-3 py-2 font-semibold text-brand-800 tabular-nums">{toBanglaNumber(r.serial_no)}</td>
                {layout.columns.map((c) => {
                  if (c.kind === 'photos') return <td key="photos" className="px-3 py-2">{thumbs(r, 'h-10 w-10')}</td>
                  if (c.kind === 'address')
                    return (
                      <td key="address" className="max-w-[16rem] px-3 py-2 text-slate-600">
                        {place(r)}
                        {r.address && <span className="block text-xs text-slate-400">{r.address}</span>}
                      </td>
                    )
                  const d = c.def
                  const cls =
                    d.key === 'year'
                      ? 'px-3 py-2 tabular-nums'
                      : d.key === 'name'
                        ? 'px-3 py-2 font-medium text-slate-900'
                        : d.key === 'father_or_husband_name'
                          ? 'px-3 py-2 text-slate-700'
                          : `px-3 py-2 text-slate-700 ${fieldSpec(d.type).align === 'right' ? 'text-right' : ''}`
                  if (d.key === 'year') return <td key={d.key} className={cls}>{toBanglaNumber(r.year)}</td>
                  if (d.key === 'name') return <td key={d.key} className={cls}>{r.name}</td>
                  if (d.key === 'father_or_husband_name') return <td key={d.key} className={cls}>{r.father_or_husband_name || '—'}</td>
                  return (
                    <td key={d.key} className={cls}>
                      <Value def={d} r={r} />
                    </td>
                  )
                })}
                <td className="px-3 py-2 pr-4">
                  <Actions record={r} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
          {layout.moneyFields.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm">
              <tr>
                <td colSpan={3} className="px-3 py-2 pl-4 text-xs font-semibold text-slate-600">
                  {t('এই পাতার মোট')}
                </td>
                {layout.columns.map((c, i) => (
                  <td key={c.kind === 'field' ? c.def.key : `${c.kind}-${i}`} className="px-3 py-2 text-right font-bold whitespace-nowrap text-slate-900 tabular-nums">
                    {c.kind === 'field' && layout.moneyFields.includes(c.def) ? formatTaka(pageSum(c.def)) : ''}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ---------- মোবাইল ---------- */}
      <ul className="space-y-3 md:hidden">
        {records.map((r, i) => (
          <li key={r.id} className={`rounded-xl border p-4 shadow-sm ${selected.has(r.id) ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={t('{name} নির্বাচন', { name: r.name })}
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
                className="mt-1 h-4 w-4 accent-brand-700"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">
                  {t('ক্রম')} {ordinal(i)} · {t('সিরিয়াল')} <span className="font-semibold text-brand-800">{toBanglaNumber(r.serial_no)}</span> · {toBanglaNumber(r.year)}
                </p>
                <h3 className="truncate text-base font-semibold text-slate-900">{r.name}</h3>
                <p className="truncate text-sm text-slate-600">{place(r, false)}</p>
                {layout.cardFields.map((d) => (
                  <p key={d.key} className="truncate text-sm text-slate-600">
                    <span className="text-slate-400">{lt(d, 'label')}:</span> <Value def={d} r={r} />
                  </p>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              {kinds.length ? thumbs(r, 'h-12 w-12') : <span />}
              <Actions record={r} onDelete={onDelete} />
            </div>
          </li>
        ))}
      </ul>
      {layout.moneyFields.length > 0 && records.length > 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 px-4 py-2 text-sm md:hidden">
          {t('এই পাতার মোট')}: {layout.moneyFields.map((d) => `${lt(d, 'label')} ${formatTaka(pageSum(d))}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function Actions({ record: r, onDelete }: { record: HousingRecord; onDelete?: (r: HousingRecord) => void }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <Link
        to={adminEditPath(r)}
        className="inline-flex h-8 items-center rounded-md border border-brand-600 px-2.5 text-xs font-medium text-brand-700 hover:bg-brand-600 hover:text-white"
      >
        {t('এডিট')}
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(r)}
          className="inline-flex h-8 items-center rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-700 hover:bg-red-600 hover:text-white"
        >
          {t('ডিলেট')}
        </button>
      )}
    </div>
  )
}
