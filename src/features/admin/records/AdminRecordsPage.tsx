import { lt, t as tr } from '@/i18n'
import { useCallback, useMemo, useState } from 'react'
import { Link, NavLink, useParams, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useToast } from '@/components/useToast'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { DEFAULT_LIST_ORDER, DEFAULT_PAGE_SIZE, getHousingApi, HousingApiError, type HousingRecord, type ListParams, type Project } from '@/backend'
import { useProjects } from '@/features/projects/registry'
import { downloadText } from '@/features/housing/utils/csvExport'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { HousingFilters } from '@/features/housing/components/HousingFilters'
import { Pagination } from '@/features/housing/components/Pagination'
import { useHousingList } from '@/features/housing/hooks/useHousingList'
import { applyFiltersToSearchParams, filtersEqual, filtersFromSearchParams, hasActiveFilters, type HousingFilters as Filters } from '@/features/housing/utils/filters'
import { adminPath, useRecordProjectByKey } from '@/features/housing/utils/housingProjects'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AdminRecordsTable } from './AdminRecordsTable'
import { canEditProject, isMainAdmin, useAdminUser } from '../adminUser'
import { CategoryValuesPanel } from './CategoryValuesPanel'
import { adminLayout } from './recordColumns'
import { csvFilename, exportRecordsCsv, hasPrivateFields } from './recordsCsv'
import { categoryFields, useCategoryUsage } from './useCategoryUsage'

const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim()

/**
 * /admin/records/:key — যেকোনো প্রকল্পের রেকর্ড (M-ধাপ ১০; খসড়াও): একই গ্রুপের প্রকল্পের ট্যাব, ফিল্টার (খোঁজার বক্সে
 * সংখ্যা দিলে সিরিয়াল ধরে; ক্যাটাগরি ফিল্টার `f.<key>`), কনফিগ-চালিত টেবিল/কার্ড, টাকার কলামে পাতার মোট,
 * এডিট/ডিলেট ও বাল্ক ডিলেট (ছবিসহ; শুধু মূল এডমিন — প্রশ্ন ১৬), ক্যাটাগরির বানান একীকরণ, CSV এক্সপোর্ট।
 */
export function AdminRecordsPage() {
  const { key } = useParams()
  const project = useRecordProjectByKey(key)
  if (!project) return <NotFoundPage />
  return <RecordsManager key={project.key} project={project} />
}

function RecordsManager({ project }: { project: Project }) {
  useDocumentTitle(tr('{title} — রেকর্ড', { title: lt(project, 'name') }))
  const projectType = project.key
  const all = useProjects()
  const parent = project.parent_key ? all.find((p) => p.key === project.parent_key) : undefined
  // একই গ্রুপের প্রকল্প (ঘর নির্মাণ: সেমিপাকা, টিন) — একক প্রকল্পে ট্যাব নেই
  const me = useAdminUser()
  // প্রকল্পের ইউজার শুধু নিজের বরাদ্দ প্রকল্পের ট্যাব দেখেন (পর্ব চ)
  const tabs = project.parent_key ? all.filter((p) => p.parent_key === project.parent_key && !p.is_group && canEditProject(me, p.key)) : []
  const toast = useToast()
  const mainAdmin = isMainAdmin(me)
  const layout = useMemo(() => adminLayout(project), [project])
  const catFilters = useMemo(() => categoryFields(project).filter((f) => f.filterable), [project])
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams])
  const fieldFilters = useMemo(() => {
    const out: Record<string, string> = {}
    for (const f of catFilters) {
      const v = searchParams.get(`f.${f.key}`)?.trim()
      if (v) out[f.key] = v
    }
    return out
  }, [catFilters, searchParams])
  const [reload, setReload] = useState(0)
  const usage = useCategoryUsage(project, reload)

  // খোঁজার বক্সে শুধু সংখ্যা → সিরিয়াল ধরে খোঁজা
  const serialQuery = useMemo(() => {
    const n = Number(ascii(filters.q))
    return filters.q && /^[0-9০-৯]+$/.test(filters.q.trim()) && Number.isInteger(n) && n >= 1 ? n : undefined
  }, [filters.q])

  const params = useMemo<ListParams>(
    () => ({
      project_type: projectType,
      page,
      page_size: DEFAULT_PAGE_SIZE,
      ...DEFAULT_LIST_ORDER, // নতুন সাল আগে, একই সালে সিরিয়াল ক্রমে (M-ধাপ ১৭)
      year: filters.year ?? undefined,
      division: filters.division || undefined,
      district: filters.district || undefined,
      upazila: filters.upazila || undefined,
      serial_no: serialQuery,
      q: serialQuery === undefined && filters.q ? filters.q : undefined,
      fields: Object.keys(fieldFilters).length ? fieldFilters : undefined,
    }),
    [projectType, page, filters, serialQuery, fieldFilters],
  )
  const list = useHousingList(params, reload)
  const refresh = () => setReload((n) => n + 1)

  const goToPage = useCallback(
    (next: number) =>
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev)
        if (next <= 1) sp.delete('page')
        else sp.set('page', String(next))
        return sp
      }),
    [setSearchParams],
  )
  const setFilters = useCallback(
    (next: Filters) =>
      setSearchParams(
        (prev) => {
          if (filtersEqual(filtersFromSearchParams(prev), next)) return prev
          const sp = applyFiltersToSearchParams(prev, next)
          sp.delete('page')
          return sp
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  const setFieldFilter = (fieldKey: string, value: string) =>
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        if (value) sp.set(`f.${fieldKey}`, value)
        else sp.delete(`f.${fieldKey}`)
        sp.delete('page')
        return sp
      },
      { replace: true },
    )

  // ---- নির্বাচন ----
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = (ids: string[], checked: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      for (const id of ids) {
        if (checked) n.add(id)
        else n.delete(id)
      }
      return n
    })

  // ---- ডিলেট ----
  const [pending, setPending] = useState<HousingRecord[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const data = list.data
  const askDeleteSelected = () => {
    const recs = (data?.data ?? []).filter((r) => selected.has(r.id))
    if (recs.length) setPending(recs)
  }
  const confirmDelete = async () => {
    if (!pending) return
    setDeleting(true)
    const api = getHousingApi()
    let ok = 0
    const failed: string[] = []
    for (const r of pending) {
      try {
        await api.delete(r.id)
        ok++
      } catch (err) {
        failed.push(`${toBanglaNumber(r.serial_no)}: ${HousingApiError.from(err).message}`)
      }
    }
    setDeleting(false)
    setPending(null)
    setSelected(new Set())
    refresh()
    if (ok) toast.success(tr('{n} টি রেকর্ড (ছবিসহ) মুছে ফেলা হয়েছে', { n: formatBanglaNumber(ok) }))
    if (failed.length) toast.error(tr('{n} টি মোছা যায়নি — {first}', { n: formatBanglaNumber(failed.length), first: failed[0] }))
  }

  const active = hasActiveFilters(filters) || Object.keys(fieldFilters).length > 0
  const selectedCount = selected.size

  // ---- এক্সপোর্ট ----
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportAsk, setExportAsk] = useState(false)
  const [withPrivate, setWithPrivate] = useState(false)
  const exportCsv = async (includePrivate: boolean) => {
    setExportAsk(false)
    setExporting(tr('প্রস্তুত হচ্ছে…'))
    try {
      const api = getHousingApi()
      const { csv, rows } = await exportRecordsCsv(api, project, includePrivate, (d, t) => setExporting(`${formatBanglaNumber(d)} / ${formatBanglaNumber(t)}`))
      downloadText(csvFilename(project, parent?.slug ?? null, includePrivate), csv)
      void api.logActivity('records_export', { rows, private: includePrivate }, projectType)
      toast.success(tr('CSV ডাউনলোড শুরু হয়েছে'))
    } catch (err) {
      toast.error(tr('এক্সপোর্ট ব্যর্থ: {message}', { message: HousingApiError.from(err).message }))
    } finally {
      setExporting(null)
    }
  }
  const startExport = () => {
    if (hasPrivateFields(project)) {
      setWithPrivate(false)
      setExportAsk(true)
    } else void exportCsv(false)
  }

  return (
    <section className="container-page py-8 sm:py-10">
      {/* ---------- ট্যাব + যোগ ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tabs.length > 1 ? (
          <nav aria-label={tr('প্রকল্প')} className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
            {tabs.map((p) => (
              <NavLink
                key={p.key}
                to={adminPath(p.key)}
                className={({ isActive }) => `rounded-md px-4 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {lt(p, 'name')}
              </NavLink>
            ))}
          </nav>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startExport}
            disabled={!!exporting}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
            title={tr('সব রেকর্ড সিরিয়াল, নাম, ঠিকানা ও ছবির লিঙ্কসহ CSV')}
          >
            {exporting ? tr('এক্সপোর্ট {status}', { status: exporting }) : tr('সিরিয়াল সহ এক্সপোর্ট (CSV)')}
          </button>
          <Link to={`/admin/import?project=${encodeURIComponent(projectType)}`} className="inline-flex h-10 items-center rounded-md border border-brand-600 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50">
            {tr('বাল্ক ইম্পোর্ট')}
          </Link>
          <Link
            to={adminPath(projectType, 'new')}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <span aria-hidden="true">+</span> {tr('নতুন যোগ করুন')}
          </Link>
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-bold text-slate-900">
        {tr('{title} — রেকর্ড', { title: lt(project, 'name') })}
        {!project.is_published && <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 align-middle text-xs font-semibold text-amber-900">{tr('খসড়া')}</span>}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{tr('খোঁজার বক্সে শুধু সংখ্যা লিখলে সিরিয়াল ধরে খুঁজবে; নাম লিখলে নামে।')}</p>

      <div className="mt-4">
        <HousingFilters projectType={projectType} value={filters} onChange={setFilters} />
      </div>
      {catFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {catFilters.map((f) => {
            const id = `ff-${f.key}`
            const values = usage?.[f.key] ?? []
            const cur = fieldFilters[f.key] ?? ''
            return (
              <div key={f.key} className="min-w-48">
                <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
                  {lt(f, 'label')}
                </label>
                <select id={id} value={cur} onChange={(e) => setFieldFilter(f.key, e.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm">
                  <option value="">{tr('সব')}</option>
                  {cur && !values.some((v) => v.value === cur) && <option value={cur}>{cur}</option>}
                  {values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.value} ({formatBanglaNumber(v.n)})
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}

      {categoryFields(project).length > 0 && (
        <div className="mt-3">
          <CategoryValuesPanel project={project} usage={usage} onChanged={refresh} />
        </div>
      )}

      {/* ---------- বাল্ক টুলবার ---------- */}
      {selectedCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm">
          <span className="font-medium text-brand-900">{tr('{n} টি নির্বাচিত', { n: formatBanglaNumber(selectedCount) })}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
              {tr('নির্বাচন বাতিল')}
            </button>
            {mainAdmin && (
              <button type="button" onClick={askDeleteSelected} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">
                {tr('নির্বাচিতগুলো মুছুন')}
              </button>
            )}
          </div>
        </div>
      )}

      {list.status === 'error' && (
        <div className="mt-4">
          <ErrorNotice title={tr('তালিকা লোড করা যায়নি')} error={list.error} />
        </div>
      )}
      {list.status !== 'error' && !data && (
        <div className="mt-4 animate-pulse space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-200" />
          ))}
        </div>
      )}
      {data && (
        <>
          {data.meta.total === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              {active ? tr('কোনো তথ্য পাওয়া যায়নি।') : tr('এখনো কোনো রেকর্ড নেই — "নতুন যোগ করুন" দিয়ে শুরু করুন।')}
            </p>
          ) : (
            <>
              <div className="mt-4">
                <AdminRecordsTable
                  project={project}
                  layout={layout}
                  records={data.data}
                  page={data.meta.page}
                  pageSize={data.meta.page_size}
                  busy={list.status === 'loading'}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                  onDelete={mainAdmin ? (r) => setPending([r]) : undefined}
                />
              </div>
              <div className="mt-5">
                <Pagination meta={data.meta} onPageChange={goToPage} disabled={list.status === 'loading'} />
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending && pending.length > 1 ? tr('{n} টি রেকর্ড মুছবেন?', { n: formatBanglaNumber(pending.length) }) : tr('আপনি কি নিশ্চিত?')}
        tone="danger"
        confirmLabel={pending && pending.length > 1 ? tr('হ্যাঁ, সব মুছুন') : tr('হ্যাঁ, মুছুন')}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPending(null)}
      >
        {pending && (
          <>
            <ul className="max-h-40 list-disc overflow-y-auto pl-5">
              {pending.slice(0, 10).map((r) => (
                <li key={r.id}>
                  {tr('সিরিয়াল {n} — {name}', { n: toBanglaNumber(r.serial_no), name: r.name })}
                </li>
              ))}
              {pending.length > 10 && <li>{tr('… আরও {n} টি', { n: formatBanglaNumber(pending.length - 10) })}</li>}
            </ul>
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
              {tr('রেকর্ড ও তার ছবি স্টোরেজ থেকে মুছে যাবে। সিরিয়াল পুনরায় ব্যবহার হবে না। এটি ফেরানো যাবে না।')}
            </p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={exportAsk}
        title={tr('গোপন কলামসহ এক্সপোর্ট করবেন?')}
        tone={withPrivate ? 'danger' : 'primary'}
        confirmLabel={tr('এক্সপোর্ট করুন')}
        onConfirm={() => void exportCsv(withPrivate)}
        onCancel={() => setExportAsk(false)}
      >
        <p className="text-sm text-slate-700">{tr('এই প্রকল্পে শুধু-এডমিন (গোপন) ফিল্ড আছে, যেমন মোবাইল নম্বর।')}</p>
        {[false, true].map((v) => (
          <label key={String(v)} className="mt-2 flex min-h-11 items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" name="export-private" checked={withPrivate === v} onChange={() => setWithPrivate(v)} className="mt-0.5 h-4 w-4 accent-brand-700" />
            <span>{v ? tr('🔒 গোপন কলামসহ — ফাইলের নামে "-private"; ফাইলটি কাউকে পাঠাবেন না') : tr('গোপন কলাম ছাড়া (সাধারণ)')}</span>
          </label>
        ))}
      </ConfirmDialog>
    </section>
  )
}
