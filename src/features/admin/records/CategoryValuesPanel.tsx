import { lt, t } from '@/i18n'
import { useState } from 'react'
import { useToast } from '@/components/useToast'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { nearDuplicates } from '@/lib/fuzzyMatch'
import { getProjectsApi, HousingApiError, type Project, type ProjectField } from '@/backend'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { categoryFields, type CategoryUsage } from './useCategoryUsage'

interface Props {
  project: Project
  usage: CategoryUsage | null
  /** একীকরণের পর (তালিকা ও মান নতুন করে আনতে) */
  onChanged: () => void
}

interface Merge {
  field: ProjectField
  a: { value: string; n: number }
  b: { value: string; n: number }
  /** যে বানানে আনা হবে */
  to: string
}

/**
 * ক্যাটাগরির মান (M-ধাপ ১০): প্রতিটি ক্যাটাগরি ফিল্ডের মান ও কতটি রেকর্ডে; কাছাকাছি বানান ("গাভী" / "গাভি")
 * পাশাপাশি, আর "এক বানানে আনুন" — নিশ্চিতকরণের পর project_field_rename_value (সব রেকর্ডে একসাথে, লগসহ)।
 */
export function CategoryValuesPanel({ project, usage, onChanged }: Props) {
  const toast = useToast()
  const [merge, setMerge] = useState<Merge | null>(null)
  const [busy, setBusy] = useState(false)
  const fields = categoryFields(project)
  if (!fields.length) return null

  const run = async () => {
    if (!merge) return
    const from = merge.to === merge.a.value ? merge.b.value : merge.a.value
    setBusy(true)
    try {
      const n = await getProjectsApi().renameFieldValue(project.key, merge.field.key, from, merge.to)
      toast.success(t('{n}টি রেকর্ডে «{from}» → «{to}»', { n: formatBanglaNumber(n), from, to: merge.to }))
      setMerge(null)
      onChanged()
    } catch (err) {
      toast.error(t('এক বানানে আনা যায়নি: {message}', { message: HousingApiError.from(err).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('ক্যাটাগরির মান ও বানান')}</summary>
      {!usage && (
        <p className="mt-3 text-sm text-slate-500" aria-busy="true">
          {t('লোড হচ্ছে…')}
        </p>
      )}
      {usage &&
        fields.map((f) => {
          const values = usage[f.key] ?? []
          const byValue = new Map(values.map((v) => [v.value, v]))
          const pairs = nearDuplicates(values.map((v) => v.value))
          return (
            <div key={f.key} className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700">
                {lt(f, 'label')} <span className="font-normal text-slate-500">· {t('{n}টি মান', { n: formatBanglaNumber(values.length) })}</span>
              </h3>
              {values.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">{t('এখনো কোনো মান নেই।')}</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {values.map((v) => (
                    <li key={v.value} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                      {v.value} <span className="text-slate-400 tabular-nums">· {formatBanglaNumber(v.n)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {pairs.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">{t('কাছাকাছি বানান — একই জিনিস হলে এক বানানে আনুন:')}</p>
                  <ul className="mt-2 space-y-2">
                    {pairs.map((p) => {
                      const a = byValue.get(p.a)!
                      const b = byValue.get(p.b)!
                      return (
                        <li key={`${p.a}|${p.b}`} className="flex flex-wrap items-center gap-2 text-sm text-amber-950">
                          <span>
                            «{a.value}» ({formatBanglaNumber(a.n)}) · «{b.value}» ({formatBanglaNumber(b.n)})
                          </span>
                          <button
                            type="button"
                            onClick={() => setMerge({ field: f, a, b, to: a.n >= b.n ? a.value : b.value })}
                            className="inline-flex min-h-9 items-center rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                          >
                            {t('এক বানানে আনুন')}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )
        })}

      <ConfirmDialog
        open={merge !== null}
        title={t('এক বানানে আনবেন?')}
        confirmLabel={t('হ্যাঁ, এক বানানে আনুন')}
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => setMerge(null)}
      >
        {merge && (
          <fieldset>
            <legend className="text-sm text-slate-700">{t('কোন বানান থাকবে? অন্যটির সব রেকর্ড এই বানানে বদলে যাবে (লগে থাকবে)।')}</legend>
            {[merge.a, merge.b].map((v) => (
              <label key={v.value} className="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
                <input type="radio" name="merge-to" checked={merge.to === v.value} onChange={() => setMerge({ ...merge, to: v.value })} className="h-4 w-4 accent-brand-700" />
                «{v.value}» <span className="text-slate-500">({t('{n}টি রেকর্ড', { n: formatBanglaNumber(v.n) })})</span>
              </label>
            ))}
          </fieldset>
        )}
      </ConfirmDialog>
    </details>
  )
}
