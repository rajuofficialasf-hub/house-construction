import { t, gn } from '@/i18n'
import { Link } from 'react-router'
import { toBanglaNumber } from '@/lib/banglaNumber'
import type { HousingRecord } from '../../../backend/interfaces/types'
import { photoSrc } from '../utils/imagePath'
import { PROJECT_META } from '../utils/projectType'
import { SafeImage } from './SafeImage'

interface Props {
  records: HousingRecord[]
  page: number
  pageSize: number
  busy?: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[], checked: boolean) => void
  onDelete: (record: HousingRecord) => void
}

function adminEditPath(r: HousingRecord): string {
  return `/housing/admin/${PROJECT_META[r.project_type].slug}/${r.serial_no}/edit`
}

/**
 * এডমিন তালিকা: চেকবক্স (বাল্ক ডিলেট), ক্রম, সিরিয়াল (আলাদা কলাম), সাল, নাম, পিতা/স্বামী, ঠিকানা, ছবি, এডিট/ডিলেট।
 * md+ টেবিল, ছোট পর্দায় কার্ড।
 */
export function AdminRecordsTable({ records, page, pageSize, busy = false, selected, onToggle, onToggleAll, onDelete }: Props) {
  const ids = records.map((r) => r.id)
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id))
  const someChecked = !allChecked && ids.some((id) => selected.has(id))
  const ordinal = (i: number) => toBanglaNumber((page - 1) * pageSize + i + 1)

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
              <th className="px-3 py-3">{t('সাল')}</th>
              <th className="px-3 py-3">{t('উপকারভোগীর নাম')}</th>
              <th className="px-3 py-3">{t('পিতা/স্বামীর নাম')}</th>
              <th className="px-3 py-3">{t('ঠিকানা')}</th>
              <th className="px-3 py-3">{t('ছবি')}</th>
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
                <td className="px-3 py-2 tabular-nums">{toBanglaNumber(r.year)}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-3 py-2 text-slate-700">{r.father_or_husband_name || '—'}</td>
                <td className="max-w-[16rem] px-3 py-2 text-slate-600">
                  {gn(r.upazila)}, {gn(r.district)}, {gn(r.division)}
                  {r.address && <span className="block text-xs text-slate-400">{r.address}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <SafeImage src={photoSrc(r.prev_thumb_url, r.photo_updated_at)} alt={t('পূর্বের')} className="h-10 w-10 rounded object-cover" placeholderClassName="h-10 w-10 rounded" />
                    <SafeImage src={photoSrc(r.current_thumb_url, r.photo_updated_at)} alt={t('বর্তমান')} className="h-10 w-10 rounded object-cover" placeholderClassName="h-10 w-10 rounded" />
                  </div>
                </td>
                <td className="px-3 py-2 pr-4">
                  <Actions record={r} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
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
                <p className="truncate text-sm text-slate-600">
                  {gn(r.upazila)}, {gn(r.district)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1">
                <SafeImage src={photoSrc(r.prev_thumb_url, r.photo_updated_at)} alt={t('পূর্বের')} className="h-12 w-12 rounded object-cover" placeholderClassName="h-12 w-12 rounded" />
                <SafeImage src={photoSrc(r.current_thumb_url, r.photo_updated_at)} alt={t('বর্তমান')} className="h-12 w-12 rounded object-cover" placeholderClassName="h-12 w-12 rounded" />
              </div>
              <Actions record={r} onDelete={onDelete} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Actions({ record: r, onDelete }: { record: HousingRecord; onDelete: (r: HousingRecord) => void }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <Link
        to={adminEditPath(r)}
        className="inline-flex h-8 items-center rounded-md border border-brand-600 px-2.5 text-xs font-medium text-brand-700 hover:bg-brand-600 hover:text-white"
      >
        {t('এডিট')}
      </Link>
      <button
        type="button"
        onClick={() => onDelete(r)}
        className="inline-flex h-8 items-center rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-700 hover:bg-red-600 hover:text-white"
      >
        {t('ডিলেট')}
      </button>
    </div>
  )
}
