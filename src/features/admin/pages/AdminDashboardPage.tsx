import { lt, t } from '@/i18n'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  getHousingApi,
  getProjectsApi,
  HousingApiError,
  type ActivityEntry,
  type ProjectOverview,
  type ProjectOverviewItem,
} from '@/backend'
import { projectPath, useProjects } from '@/features/projects/registry'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { ACTION_CLASS, ACTION_LABEL, formatDateTime } from '@/features/housing/utils/activityLabels'
import { adminPath, useRecordProjects } from '@/features/housing/utils/housingProjects'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { formatTaka } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { Badge } from '../ui/Badge'
import { card } from '../ui/styles'

type State =
  | { status: 'loading' }
  | { status: 'ready'; overview: ProjectOverview; activity: ActivityEntry[] }
  | { status: 'error'; error: HousingApiError }

/** প্রকল্পের মোট টাকা = তার সব টাকা-ফিল্ডের যোগফল (হালকা স্ট্যাটেও আছে); টাকা-ফিল্ড না থাকলে null */
function moneyTotal(item: ProjectOverviewItem): number | null {
  const sums = Object.values(item.stats.fields ?? {}).filter((f) => f.type === 'money')
  return sums.length ? sums.reduce((s, f) => s + (f.type === 'money' ? f.sum : 0), 0) : null
}

/**
 * /admin — ড্যাশবোর্ড (পরিকল্পনা M-ধাপ ৭): খসড়াসহ প্রতিটি প্রকল্পের কার্ড (রেকর্ড, মোট টাকা, ছবি বাকি, প্রকাশের অবস্থা,
 * দ্রুত বোতাম) — এক কলে (projects_overview(true)); নিচে লগের শেষ ১০টি এন্ট্রি।
 */
export function AdminDashboardPage() {
  useDocumentTitle(t('ড্যাশবোর্ড'))
  const [state, setState] = useState<State>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const recordKeys = new Set(useRecordProjects().map((p) => p.key))
  const projects = useProjects()

  useEffect(() => {
    let alive = true
    Promise.all([
      getProjectsApi().overview({ includeDrafts: true }),
      getHousingApi()
        .listActivity({ page: 1, page_size: 10 })
        .then((p) => p.data)
        .catch(() => [] as ActivityEntry[]),
    ])
      .then(([overview, activity]) => alive && setState({ status: 'ready', overview, activity }))
      .catch((err: unknown) => alive && setState({ status: 'error', error: HousingApiError.from(err) }))
    return () => {
      alive = false
    }
  }, [reload])

  if (state.status === 'loading') {
    return (
      <section className="px-4 py-8 sm:px-6" aria-busy="true">
        <h1 className="text-2xl font-bold text-slate-900">{t('ড্যাশবোর্ড')}</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('ড্যাশবোর্ড')}</h1>
        <div className="mt-6">
          <ErrorNotice title={t('ড্যাশবোর্ড লোড করা যায়নি')} error={state.error} />
          <button type="button" onClick={() => setReload((n) => n + 1)} className="mt-3 inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-brand-400">
            {t('আবার চেষ্টা করুন')}
          </button>
        </div>
      </section>
    )
  }

  const { overview, activity } = state
  const items = overview.projects
  // গ্রুপের পরে তার উপ-প্রকল্প, তারপর পরের শীর্ষ-স্তর
  const ordered = items
    .filter((x) => !x.parent_key)
    .flatMap((top) => [top, ...items.filter((c) => c.parent_key === top.key)])
  const orphans = items.filter((x) => x.parent_key && !items.some((p) => p.key === x.parent_key))

  return (
    <section className="px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('ড্যাশবোর্ড')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('প্রকাশিত: {p}টি প্রকল্প · {n} জন উপকারভোগী · {d}টি জেলা', {
              p: toBanglaNumber(overview.global.projects),
              n: formatBanglaNumber(overview.global.total),
              d: toBanglaNumber(overview.global.districts),
            })}
          </p>
        </div>
        <Link to="/admin/projects/new" className="inline-flex h-11 items-center gap-1.5 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600">
          <span aria-hidden="true">+</span> {t('নতুন প্রকল্প')}
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...ordered, ...orphans].map((item) => {
          const money = moneyTotal(item)
          const project = projects.find((p) => p.key === item.key)
          const draft = !item.is_published
          return (
            <article key={item.key} className={`${card} flex flex-col ${item.parent_key ? 'md:border-l-4 md:border-l-brand-200' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">{item.is_group ? t('প্রকল্প-গ্রুপ') : item.parent_key ? t('উপ-প্রকল্প') : t('একক প্রকল্প')}</p>
                  <h2 className="truncate text-base font-bold text-slate-900" title={lt(item, 'name')}>
                    {lt(item, 'name')}
                  </h2>
                  <p className="font-mono text-xs text-slate-400">{item.key}</p>
                </div>
                {draft ? <Badge tone="amber">{t('খসড়া')}</Badge> : <Badge tone="green">{t('প্রকাশিত')}</Badge>}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 px-2 py-2">
                  <dt className="text-xs text-slate-500">{t('রেকর্ড')}</dt>
                  <dd className="text-lg font-bold text-slate-900 tabular-nums">{formatBanglaNumber(item.stats.total)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-2">
                  <dt className="text-xs text-slate-500">{t('মোট টাকা')}</dt>
                  <dd className="truncate text-sm font-bold text-slate-900 tabular-nums">{money === null ? '—' : formatTaka(money)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-2">
                  <dt className="text-xs text-slate-500">{t('ছবি বাকি')}</dt>
                  <dd className={`text-lg font-bold tabular-nums ${item.without_photo ? 'text-amber-700' : 'text-slate-900'}`}>
                    {item.is_group || item.photo_mode === 'none' || item.without_photo === null ? '—' : formatBanglaNumber(item.without_photo)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {recordKeys.has(item.key) && (
                  <Link to={adminPath(item.key)} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700">
                    {t('রেকর্ড')}
                  </Link>
                )}
                <Link to={`/admin/projects/${encodeURIComponent(item.key)}`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700">
                  {t('সেটিংস')}
                </Link>
                {project && (
                  <Link to={projectPath(project, projects)} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700">
                    {draft ? t('প্রিভিউ') : t('পাবলিক পেইজ')}
                  </Link>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <div className={`${card} mt-8`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">{t('সাম্প্রতিক কাজ')}</h2>
          <Link to="/admin/activity" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">
            {t('সব দেখুন')}
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('কোনো এন্ট্রি নেই।')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {activity.map((e) => {
              const p = projects.find((x) => x.key === e.project_type)
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <time dateTime={e.at} className="text-xs text-slate-500 tabular-nums">
                    {formatDateTime(e.at)}
                  </time>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_CLASS[e.action] ?? 'bg-slate-100 text-slate-700'}`}>
                    {ACTION_LABEL[e.action] ? t(ACTION_LABEL[e.action]) : e.action}
                  </span>
                  <span className="truncate text-slate-700">{e.actor_email === 'service_role' ? t('স্ক্রিপ্ট (service_role)') : (e.actor_email ?? t('অজানা'))}</span>
                  {p && <span className="text-slate-500">· {lt(p, 'name')}</span>}
                  {e.serial_no !== null && <span className="text-slate-500">· {t('সিরিয়াল')} {toBanglaNumber(e.serial_no)}</span>}
                  {e.record_name && <span className="truncate text-slate-500">({e.record_name})</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
