import { gn, lt, t } from '@/i18n'
import type { Project } from '@/backend'
import { fieldSpec, resolveFields, type FieldDef, type FieldValue } from '@/features/projects/fields'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { card } from '../ui/styles'
import { MAX_TABLE_COLUMNS, tableColumns } from './fieldRules'

/** নমুনা মান (দেখানোর জন্য) — নাম/ঠিকানা আসল সাইটের মতোই বাংলায় থাকে, ভূগোল gn() দিয়ে */
const SAMPLE = {
  name_bn: 'রহিমা খাতুন',
  father_bn: 'আব্দুল করিম',
  division_bn: 'রংপুর',
  district_bn: 'কুড়িগ্রাম',
  upazila_bn: 'উলিপুর',
  union_bn: 'দলদলিয়া',
  address_bn: 'গ্রাম: দলদলিয়া',
  text_bn: 'দুগ্ধবতী গাভী',
  category_bn: 'গরু',
} as const

function sampleValue(f: FieldDef): FieldValue | null {
  switch (f.key) {
    case 'year':
      return 2025
    case 'name':
      return SAMPLE.name_bn
    case 'father_or_husband_name':
      return SAMPLE.father_bn
    case 'division':
      return SAMPLE.division_bn
    case 'district':
      return SAMPLE.district_bn
    case 'upazila':
      return SAMPLE.upazila_bn
    case 'union_name':
      return SAMPLE.union_bn
    case 'address':
      return SAMPLE.address_bn
  }
  switch (f.type) {
    case 'money':
      return 25000
    case 'number':
      return 12
    case 'category':
      return SAMPLE.category_bn
    case 'date':
      return '2025-03-15'
    case 'phone':
      return '01711-000000'
    default:
      return SAMPLE.text_bn
  }
}

function Cell({ f }: { f: FieldDef }) {
  if (f.key === 'geo') return <span>{`${gn(SAMPLE.upazila_bn)}, ${gn(SAMPLE.district_bn)}`}</span>
  if (f.geo) return <span>{gn(String(sampleValue(f)))}</span>
  const C = fieldSpec(f.type).Cell
  return <C def={f} value={sampleValue(f)} />
}

/**
 * ফিল্ডের প্রিভিউ (পরিকল্পনা M-ধাপ ৮): ফর্ম (সব ফিল্ড, গোপনসহ — এডমিনের ফর্ম), টেবিলের একটি সারি (ডেস্কটপ; কলাম-গণনা
 * "৭/৯"), আর মোবাইল কার্ড (কার্ডে-চালু পাবলিক ফিল্ড)। সংরক্ষিত সেটিং থেকে; আসল তালিকা-পাতা M-ধাপ ১৩-এ এই নিয়মেই হবে।
 */
export function FieldPreview({ project }: { project: Project }) {
  const all = resolveFields(project)
  const cols = tableColumns(project)
  const cardFields = resolveFields(project, { includePrivate: false }).filter((f) => f.show_in_card && f.key !== 'name')
  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="text-sm font-bold text-slate-900">{t('ফর্মের প্রিভিউ')}</h3>
        <div className="mt-3 space-y-3">
          {all.map((f) => {
            const I = fieldSpec(f.type).Input
            return (
              <div key={f.key}>
                <p className="mb-1 text-xs font-medium text-slate-600">
                  {lt(f, 'label')}
                  {f.required && <span className="text-red-600"> *</span>}
                  {f.visibility === 'admin' && <span className="ml-1">🔒</span>}
                </p>
                <I def={f} value={fieldSpec(f.type).toInput(sampleValue(f), f)} onChange={() => {}} disabled />
              </div>
            )
          })}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{t('টেবিলের সারি (ডেস্কটপ)')}</h3>
          <span className={`text-xs font-semibold ${cols.length >= MAX_TABLE_COLUMNS ? 'text-amber-700' : 'text-slate-500'}`}>
            {t('কলাম: {n}/{max}', { n: toBanglaNumber(cols.length), max: toBanglaNumber(MAX_TABLE_COLUMNS) })}
          </span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                {cols.map((f) => (
                  <th key={f.key} className={`px-2 py-1.5 font-medium ${fieldSpec(f.type).align === 'right' ? 'text-right' : ''}`}>
                    {lt(f, 'label')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-slate-800">
                {cols.map((f) => (
                  <td key={f.key} className={`px-2 py-2 ${fieldSpec(f.type).align === 'right' ? 'text-right' : ''}`}>
                    <Cell f={f} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('সাথে থাকবে: ক্রম, ছবি ও "বিস্তারিত" কলাম')}</p>
      </div>

      <div className={card}>
        <h3 className="text-sm font-bold text-slate-900">{t('মোবাইল কার্ড')}</h3>
        <div className="mt-3 max-w-xs rounded-xl border border-slate-200 p-3 text-sm">
          <p className="font-bold text-slate-900">{SAMPLE.name_bn}</p>
          <dl className="mt-1 space-y-0.5 text-slate-600">
            {cardFields.map((f) => (
              <div key={f.key} className="flex gap-1">
                <dt className="shrink-0 text-slate-400">{lt(f, 'label')}:</dt>
                <dd className="min-w-0">
                  <Cell f={f} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
