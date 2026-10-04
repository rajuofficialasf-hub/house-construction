import { t as tr } from '@/i18n'
import { useCallback, useMemo, useState } from 'react'
import { Link, NavLink, useParams, useSearchParams } from 'react-router'
import { useToast } from '@/components/useToast'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi } from '../backend/factory'
import { DEFAULT_PAGE_SIZE, HousingApiError, MAX_PAGE_SIZE, type HousingRecord, type ListParams, type ProjectType } from '../backend/interfaces/types'
import { downloadText, toCsv } from '../utils/csvExport'
import { AdminRecordsTable } from '../components/AdminRecordsTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorNotice } from '../components/ErrorNotice'
import { HousingFilters } from '../components/HousingFilters'
import { Pagination } from '../components/Pagination'
import { useHousingList } from '../hooks/useHousingList'
import { applyFiltersToSearchParams, filtersEqual, filtersFromSearchParams, hasActiveFilters, type HousingFilters as Filters } from '../utils/filters'
import { PROJECT_LIST, PROJECT_META, projectFromSlug } from '../utils/projectType'
import { NotFoundPage } from '@/pages/NotFoundPage'

const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim()

/** প্রকল্পের সব রেকর্ড (সব পেইজ) CSV তে — সিরিয়াল Google Sheet এ ফেরানোর জন্য */
async function exportProjectCsv(projectType: ProjectType, onProgress: (done: number, total: number) => void): Promise<string> {
  const api = getHousingApi()
  const all: HousingRecord[] = []
  let page = 1
  let total = Infinity
  while (all.length < total) {
    const p = await api.list({ project_type: projectType, page, page_size: MAX_PAGE_SIZE, sort: 'serial_no', order: 'asc' })
    total = p.meta.total
    all.push(...p.data)
    onProgress(all.length, total)
    if (p.data.length === 0) break
    page++
  }
  const headers = ['সিরিয়াল', 'সাল', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম', 'বিভাগ', 'জেলা', 'উপজেলা', 'বিস্তারিত ঠিকানা', 'পূর্বের ঘরের ছবি (লিঙ্ক)', 'বর্তমান ঘরের ছবি (লিঙ্ক)', 'পূর্বের ছবি (সিস্টেম URL)', 'বর্তমান ছবি (সিস্টেম URL)', 'ছবি আপডেট', 'রেকর্ড আইডি'].map((h) => tr(h))
  const rows = all.map((r) => [r.serial_no, r.year, r.name, r.father_or_husband_name, r.division, r.district, r.upazila, r.address, r.prev_photo_source ?? '', r.current_photo_source ?? '', r.prev_photo_url ?? '', r.current_photo_url ?? '', r.photo_updated_at ?? '', r.id])
  return toCsv(headers, rows)
}

/**
 * /housing/admin/:slug — এডমিন রেকর্ড ব্যবস্থাপনা: প্রকল্প ট্যাব, একই ফিল্টার (খোঁজার বক্সে সংখ্যা দিলে সিরিয়াল ধরে),
 * সিরিয়াল কলামসহ টেবিল, এডিট/ডিলেট, একাধিক নির্বাচন করে বাল্ক ডিলেট, "নতুন যোগ করুন"।
 */
export function HousingAdminRecordsPage() {
  const { slug } = useParams()
  const projectType = projectFromSlug(slug)
  if (!projectType) return <NotFoundPage />
  return <RecordsManager key={projectType} projectType={projectType} />
}

function RecordsManager({ projectType }: { projectType: NonNullable<ReturnType<typeof projectFromSlug>> }) {
  const meta = PROJECT_META[projectType]
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams])
  const [reload, setReload] = useState(0)

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
      sort: 'serial_no',
      order: 'asc',
      year: filters.year ?? undefined,
      division: filters.division || undefined,
      district: filters.district || undefined,
      upazila: filters.upazila || undefined,
      serial_no: serialQuery,
      q: serialQuery === undefined && filters.q ? filters.q : undefined,
    }),
    [projectType, page, filters, serialQuery],
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

  const active = hasActiveFilters(filters)
  const selectedCount = selected.size

  // ---- এক্সপোর্ট ----
  const [exporting, setExporting] = useState<string | null>(null)
  const exportCsv = async () => {
    setExporting(tr('প্রস্তুত হচ্ছে…'))
    try {
      const csv = await exportProjectCsv(projectType, (d, t) => setExporting(`${formatBanglaNumber(d)} / ${formatBanglaNumber(t)}`))
      downloadText(`housing-${meta.slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv)
      toast.success(tr('CSV ডাউনলোড শুরু হয়েছে'))
    } catch (err) {
      toast.error(tr('এক্সপোর্ট ব্যর্থ: {message}', { message: HousingApiError.from(err).message }))
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="container-page py-8 sm:py-10">
      {/* ---------- ট্যাব + যোগ ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={tr('প্রকল্প')} className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          {PROJECT_LIST.map((p) => (
            <NavLink
              key={p.type}
              to={`/housing/admin/${p.slug}`}
              className={({ isActive }) => `rounded-md px-4 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {tr(p.title)}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={!!exporting}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
            title={tr('সব রেকর্ড সিরিয়াল, নাম, ঠিকানা ও ছবির লিঙ্কসহ CSV')}
          >
            {exporting ? tr('এক্সপোর্ট {status}', { status: exporting }) : tr('সিরিয়াল সহ এক্সপোর্ট (CSV)')}
          </button>
          <Link to="/housing/admin/import" className="inline-flex h-10 items-center rounded-md border border-brand-600 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50">
            {tr('বাল্ক ইম্পোর্ট')}
          </Link>
          <Link
            to={`/housing/admin/${meta.slug}/new`}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <span aria-hidden="true">+</span> {tr('নতুন যোগ করুন')}
          </Link>
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-bold text-slate-900">{tr('{title} — রেকর্ড', { title: tr(meta.title) })}</h1>
      <p className="mt-1 text-sm text-slate-500">{tr('খোঁজার বক্সে শুধু সংখ্যা লিখলে সিরিয়াল ধরে খুঁজবে; নাম লিখলে নামে।')}</p>

      <div className="mt-4">
        <HousingFilters projectType={projectType} value={filters} onChange={setFilters} />
      </div>

      {/* ---------- বাল্ক টুলবার ---------- */}
      {selectedCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm">
          <span className="font-medium text-brand-900">{tr('{n} টি নির্বাচিত', { n: formatBanglaNumber(selectedCount) })}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
              {tr('নির্বাচন বাতিল')}
            </button>
            <button type="button" onClick={askDeleteSelected} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">
              {tr('নির্বাচিতগুলো মুছুন')}
            </button>
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
                  records={data.data}
                  page={data.meta.page}
                  pageSize={data.meta.page_size}
                  busy={list.status === 'loading'}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                  onDelete={(r) => setPending([r])}
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
    </section>
  )
}
