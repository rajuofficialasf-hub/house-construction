import { lt, t } from '@/i18n'
import { useCallback, useMemo, useRef } from 'react'
import { Outlet, useSearchParams } from 'react-router'
import type { ListOutletContext } from './listContext'
import { DEFAULT_PAGE_SIZE, type ListParams, type Project } from '../../../backend/interfaces/types'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import {
  applyFiltersToSearchParams,
  filtersEqual,
  filtersFromSearchParams,
  hasActiveFilters,
  type HousingFilters as Filters,
} from '../utils/filters'
import { HousingSubnav } from '../components/HousingSubnav'
import { StatCards } from '../components/StatCards'
import { HousingFilters } from '../components/HousingFilters'
import { Lazy, LazyUpazilaMapPanel } from './lazyPages'
import { HousingTable } from '../components/HousingTable'
import { Pagination } from '../components/Pagination'
import { ErrorNotice } from '../components/ErrorNotice'
import { useHousingList } from '../hooks/useHousingList'

interface Props {
  /** রেজিস্ট্রি থেকে (রাউট রেজিস্ট্রি-চালিত, M-ধাপ ৬) */
  project: Project
}

function parsePage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * শেয়ারড তালিকা পেইজ। /housing/semi-pucca ও /housing/tin দুটোই এই কম্পোনেন্ট ব্যবহার করে,
 * শুধু project prop আলাদা (রাউট রেজিস্ট্রি থেকে তৈরি)।
 * উপরে পরিসংখ্যান কার্ড (ফিল্টার-নিরপেক্ষ), তারপর ফিল্টার, নিচে টেবিল + সার্ভার-সাইড পেজিনেশন।
 * ফিল্টার ও পেইজ URL query params এ (?year=&division=&district=&upazila=&q=&page=)।
 * child route /:serial (ভিউ মোড) <Outlet> দিয়ে এর উপরে মডাল হিসেবে রেন্ডার হয়।
 */
export function HousingListPage({ project }: Props) {
  const projectType = project.key
  useDocumentTitle(lt(project, 'name'))
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePage(searchParams.get('page'))
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams])
  const tableTop = useRef<HTMLDivElement>(null)

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
          const current = filtersFromSearchParams(prev)
          if (filtersEqual(current, next)) return prev
          const sp = applyFiltersToSearchParams(prev, next)
          sp.delete('page') // ফিল্টার বদলালে পেইজ ১
          return sp
        },
        { replace: true }, // প্রতিটি কী-স্ট্রোক/ড্রপডাউন Back-হিস্টরিতে জমা না হোক
      )
    },
    [setSearchParams],
  )

  const data = list.data
  const active = hasActiveFilters(filters)

  // ভিউ মোড (child route /:serial) কে তালিকার ক্রম ও params দেওয়া হয়
  const outletContext = useMemo<ListOutletContext>(
    () => ({ project, projectType, params, list, page }),
    [project, projectType, params, list, page],
  )

  return (
    <section className="container-page py-10 sm:py-14">
      <Outlet context={outletContext} />
      <HousingSubnav group={project.parent_key} />
      <h1 className="mt-6 text-2xl font-bold text-slate-900 sm:text-3xl">{lt(project, 'name')}</h1>
      <p className="mt-2 text-slate-600">{lt(project, 'description')}</p>

      <div className="mt-8">
        <StatCards projectType={projectType} />
      </div>

      <div ref={tableTop} className="mt-10 scroll-mt-20">
        <h2 className="text-lg font-semibold text-slate-800 sm:text-xl">{t('উপকারভোগীদের তালিকা')}</h2>

        {/* ইন্টারেক্টিভ উপজেলা মানচিত্র — ফিল্টারের উপরে, ডিফল্টে লুকানো; ফিল্টারের সাথে দুই-দিকে সিঙ্ক */}
        <div className="mt-4">
          <Lazy>
            <LazyUpazilaMapPanel projectType={projectType} filters={filters} onChange={setFilters} />
          </Lazy>
        </div>

        <div className="mt-4">
          <HousingFilters projectType={projectType} value={filters} onChange={setFilters} />
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
                  <HousingTable
                    records={data.data}
                    page={data.meta.page}
                    pageSize={data.meta.page_size}
                    busy={list.status === 'loading'}
                  />
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
