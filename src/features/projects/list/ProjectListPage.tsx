import { lt, t } from '@/i18n'
import { useCallback, useMemo, useRef } from 'react'
import { Outlet, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE, type ListParams, type Project } from '@/backend'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { ListOutletContext } from '@/features/housing/pages/listContext'
import { HousingSubnav } from '@/features/housing/components/HousingSubnav'
import { Lazy, LazyUpazilaMapPanel } from '@/features/housing/pages/lazyPages'
import { Pagination } from '@/features/housing/components/Pagination'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { useHousingList } from '@/features/housing/hooks/useHousingList'
import { useHousingStats } from '@/features/housing/hooks/useHousingStats'
import type { HousingFilters } from '@/features/housing/utils/filters'
import { listLayout } from './listColumns'
import { applyListFilters, hasActiveListFilters, listFiltersEqual, listFiltersFromSearchParams, type ProjectListFilters as Filters } from './listFilters'
import { ProjectFilters } from './ProjectFilters'
import { ProjectStatCards } from './ProjectStatCards'
import { ProjectTable } from './ProjectTable'

interface Props {
  /** রেজিস্ট্রি থেকে (রাউট রেজিস্ট্রি-চালিত, M-ধাপ ৬) */
  project: Project
}

function parsePage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * যেকোনো প্রকল্পের পাবলিক তালিকা পেইজ (M-ধাপ ১৩; আগে HousingListPage) — ঘর নির্মাণ (/housing/semi-pucca …) আর
 * অনুদান-ধরন (/self-reliance …) একই কম্পোনেন্টে, প্রকল্পের কনফিগ থেকে:
 *   গ্রুপের উপ-প্রকল্প হলে সাব-নেভ · নাম ও বর্ণনা pick() দিয়ে · খসড়া হলে ব্যানার (ProjectFrame)
 *   স্ট্যাট কার্ড (stat_cards) · মানচিত্র (display.show_map)
 *   ফিল্টার (সাল, বিভাগ → জেলা → উপজেলা → ইউনিয়ন, ক্যাটাগরি f_<key>, নাম) · টেবিল/কার্ড (ফিল্ড-টাইপ রেজিস্ট্রি) + পেজিনেশন
 * API কল মোট ২টি: list আর stats (সাল, ইউনিয়ন, ক্যাটাগরির মান, মানচিত্র সবাই এই stats থেকে)। ক্যাটাগরি-চার্ট ছিল, ব্যবহারকারীর সিদ্ধান্তে বাদ (২০২৬-১০-০৬)।
 * ফিল্টার ও পেইজ URL এ (?year=&division=&district=&upazila=&union=&f_<key>=&q=&page=)।
 * child route /:serial (ভিউ মোড) <Outlet> দিয়ে এর উপরে মডাল হিসেবে রেন্ডার হয়।
 */
export function ProjectListPage({ project }: Props) {
  const projectType = project.key
  useDocumentTitle(lt(project, 'name'))
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePage(searchParams.get('page'))
  // ফিল্টারে চালু পাবলিক ক্যাটাগরি ফিল্ড (URL এ f_<key>; API এর whitelist এর সাথে মেলে)
  const categoryFields = useMemo(() => project.fields.filter((f) => f.type === 'category' && f.visibility === 'public' && f.is_active && f.filterable), [project.fields])
  const fieldKeys = useMemo(() => categoryFields.map((f) => f.key), [categoryFields])
  const filters = useMemo(() => listFiltersFromSearchParams(searchParams, fieldKeys), [searchParams, fieldKeys])
  const tableTop = useRef<HTMLDivElement>(null)
  const stats = useHousingStats(projectType)

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
      union_name: filters.union || undefined,
      fields: Object.keys(filters.fields).length ? filters.fields : undefined,
      q: filters.q || undefined,
    }),
    [projectType, page, filters],
  )
  const list = useHousingList(params)

  const goToPage = useCallback(
    (next: number) => {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev)
        if (next <= 1) sp.delete('page')
        else sp.set('page', String(next))
        return sp
      })
      tableTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [setSearchParams],
  )

  const setFilters = useCallback(
    (next: Filters) => {
      setSearchParams(
        (prev) => {
          const current = listFiltersFromSearchParams(prev, fieldKeys)
          if (listFiltersEqual(current, next)) return prev
          const sp = applyListFilters(prev, next, fieldKeys)
          sp.delete('page') // ফিল্টার বদলালে পেইজ ১
          return sp
        },
        { replace: true }, // প্রতিটি কী-স্ট্রোক/ড্রপডাউন Back-হিস্টরিতে জমা না হোক
      )
    },
    [setSearchParams, fieldKeys],
  )
  // মানচিত্র শুধু বিভাগ/জেলা/উপজেলা বদলায় — উপজেলা বদলালে ইউনিয়ন খালি
  const setGeoFromMap = useCallback(
    (next: HousingFilters) => setFilters({ ...filters, ...next, union: next.upazila === filters.upazila ? filters.union : '' }),
    [filters, setFilters],
  )

  const data = list.data
  const active = hasActiveListFilters(filters)
  const statsData = stats.status === 'ready' ? stats.data : null
  // ইউনিয়নের কলাম/লাইন শুধু ডাটায় ইউনিয়ন থাকলে (ঘর নির্মাণে এখনো নেই — টেবিল আগের ১১ কলামই)
  const layout = useMemo(() => listLayout(project, { showUnion: (statsData?.distinct.unions ?? 0) > 0 }), [project, statsData])

  // ভিউ মোড (child route /:serial) কে তালিকার ক্রম ও params দেওয়া হয়
  const outletContext = useMemo<ListOutletContext>(
    () => ({ project, projectType, params, list, page }),
    [project, projectType, params, list, page],
  )

  return (
    <section className="container-page py-10 sm:py-14">
      <Outlet context={outletContext} />
      {project.parent_key && <HousingSubnav group={project.parent_key} />}
      <h1 className={`${project.parent_key ? 'mt-6 ' : ''}text-2xl font-bold text-slate-900 sm:text-3xl`}>{lt(project, 'name')}</h1>
      {lt(project, 'description') && <p className="mt-2 text-slate-600">{lt(project, 'description')}</p>}

      <div className="mt-8">
        <ProjectStatCards project={project} stats={stats} />
      </div>

      <div ref={tableTop} className="mt-10 scroll-mt-20">
        <h2 className="text-lg font-semibold text-slate-800 sm:text-xl">{t('উপকারভোগীদের তালিকা')}</h2>

        {/* ইন্টারেক্টিভ উপজেলা মানচিত্র — ফিল্টারের উপরে, ডিফল্টে লুকানো; ফিল্টারের সাথে দুই-দিকে সিঙ্ক */}
        {project.display?.show_map !== false && (
          <div className="mt-4">
            <Lazy>
              <LazyUpazilaMapPanel project={project} stats={stats} filters={filters} onChange={setGeoFromMap} />
            </Lazy>
          </div>
        )}

        <div className="mt-4">
          <ProjectFilters project={project} stats={stats} categoryFields={categoryFields} value={filters} onChange={setFilters} />
        </div>

        {list.status === 'error' && (
          <div className="mt-4">
            <ErrorNotice title={t('তালিকা লোড করা যায়নি')} error={list.error} />
          </div>
        )}

        {list.status !== 'error' && !data && <TableSkeleton />}

        {data && (
          <>
            {data.meta.total === 0 ? (
              <p
                role="status"
                className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500"
              >
                {active ? t('কোনো তথ্য পাওয়া যায়নি। ফিল্টার বদলে আবার চেষ্টা করুন।') : t('এখনো কোনো রেকর্ড নেই।')}
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <ProjectTable project={project} layout={layout} records={data.data} page={data.meta.page} pageSize={data.meta.page_size} busy={list.status === 'loading'} />
                </div>
                <div className="mt-5">
                  <Pagination meta={data.meta} onPageChange={goToPage} disabled={list.status === 'loading'} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function TableSkeleton() {
  const rows = Array.from({ length: 8 }, (_, i) => i)
  return (
    <div className="mt-4 animate-pulse space-y-2" aria-busy="true" aria-label={t('তালিকা লোড হচ্ছে')}>
      <div className="h-10 rounded-lg bg-brand-50" />
      {rows.map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3">
          <div className="h-4 w-8 rounded bg-slate-200" />
          <div className="h-4 w-12 rounded bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="hidden h-4 w-40 rounded bg-slate-200 md:block" />
          <div className="h-12 w-12 rounded-md bg-slate-200" />
          <div className="h-12 w-12 rounded-md bg-slate-200" />
        </div>
      ))}
    </div>
  )
}
