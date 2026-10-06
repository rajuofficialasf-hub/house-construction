import { lt, t } from '@/i18n'
import { toBanglaNumber } from '@/lib/banglaNumber'
import type { HousingRecord, PhotoKind, Project } from '@/backend'
import { fieldSpec, fieldValue } from '@/features/projects/fields'
import { fieldHeader, photoLabel, type ListLayout } from './listColumns'
import { PlaceText, Thumb, ViewButton } from './ProjectTable'

interface Props {
  project: Project
  layout: ListLayout
  records: HousingRecord[]
  ordinal: (i: number) => string
  onOpen: (r: HousingRecord, kind: PhotoKind) => void
}

/**
 * ফোন/ট্যাবের কার্ড-তালিকা (lg এর নিচে; sm+ এ ২ কলাম) — ঘর নির্মাণে আগের হুবহু: ক্রম · সাল, নাম, পিতা/স্বামী, ঠিকানা,
 * নিচে দুটি ছবি পাশাপাশি। কাস্টম "কার্ডে" চালু ফিল্ড ঠিকানার নিচে (টাকা ৳)। শুধু-পরের-ছবি প্রকল্পে একটিই ছবি,
 * পূর্ণ-চওড়া ৪:৩; ছবিহীন প্রকল্পে ছবি নেই।
 */
export function RecordCardList({ project, layout, records, ordinal, onOpen }: Props) {
  const yearDef = layout.columns.find((c) => c.kind === 'field' && c.def.key === 'year')
  const yearLabel = yearDef && yearDef.kind === 'field' ? yearDef.header : t('সাল')
  const fatherShown = layout.columns.some((c) => c.kind === 'field' && c.def.key === 'father_or_husband_name') || project.display?.geo_columns === 'merged'
  const kinds = layout.photoKinds
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
      {records.map((r, i) => (
        <li key={r.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {t('ক্রম')} {ordinal(i)} · {yearLabel} {toBanglaNumber(r.year)}
              </p>
              <h3 className="mt-0.5 text-[17px] leading-snug font-semibold text-slate-900">{r.name}</h3>
              {fatherShown && r.father_or_husband_name && (
                <p className="text-sm text-slate-600">{t('পিতা/স্বামী:')} {r.father_or_husband_name}</p>
              )}
            </div>
            <ViewButton record={r} compact />
          </div>
          <p className="mt-2 text-sm text-slate-700"><PlaceText record={r} withUnion={layout.showUnion} /></p>
          {r.address && <p className="mt-0.5 text-sm break-words text-slate-500">{r.address}</p>}
          {layout.cardFields.map((d) => {
            const { Cell } = fieldSpec(d.type)
            const v = fieldValue(d, r)
            if (v === null || v === undefined || v === '') return null // খালি মান কার্ডে নয়
            return (
              <p key={d.key} className="mt-0.5 text-sm text-slate-700">
                <span className="text-slate-500">{fieldHeader(d, project) || lt(d, 'label')}:</span> <Cell def={d} value={v} />
              </p>
            )
          })}
          {kinds.length === 2 && (
            <div className="mt-auto grid grid-cols-2 gap-3 pt-3">
              {kinds.map((kind) => (
                <div key={kind}>
                  <p className="mb-1 text-xs font-medium text-slate-500">{photoLabel(project, kind)}</p>
                  <Thumb record={r} kind={kind} label={photoLabel(project, kind)} onOpen={onOpen} size="lg" />
                </div>
              ))}
            </div>
          )}
          {kinds.length === 1 && (
            <div className="mt-auto pt-3">
              <p className="mb-1 text-xs font-medium text-slate-500">{photoLabel(project, kinds[0])}</p>
              <Thumb record={r} kind={kinds[0]} label={photoLabel(project, kinds[0])} onOpen={onOpen} size="lg" />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
