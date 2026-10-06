import { lt, t } from '@/i18n'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getProjectsApi, HousingApiError, type Project, type ProjectOverview } from '@/backend'
import { useToast } from '@/components/useToast'
import { projectPath, refreshProjects } from '@/features/projects/registry'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { friendlyProjectError, isStaleEdit } from '../projects/projectRules'
import { publishChecklist } from '../projects/publishChecklist'
import { UnpublishDialog } from '../projects/UnpublishDialog'
import { Badge } from '../ui/Badge'
import { card, smallButton } from '../ui/styles'

type Data = { projects: Project[]; totals: Record<string, number> }

/** খসড়াসহ সব প্রকল্প + প্রতিটির রেকর্ড-সংখ্যা (ওভারভিউ থেকে; না পেলে ০) */
async function fetchData(): Promise<Data> {
  const api = getProjectsApi()
  const [projects, overview] = await Promise.all([api.list({ includeDrafts: true }), api.overview({ includeDrafts: true }).catch(() => null as ProjectOverview | null)])
  return { projects, totals: Object.fromEntries((overview?.projects ?? []).map((x) => [x.key, x.stats.total])) }
}

/** শীর্ষ-স্তর, তারপর প্রতিটির উপ-প্রকল্প — তালিকা ও ক্রম বদলের একই ক্রম */
function displayOrder(projects: Project[]): Project[] {
  const byOrder = (a: Project, b: Project) => a.sort_order - b.sort_order || a.key.localeCompare(b.key)
  const top = projects.filter((p) => !p.parent_key || !projects.some((x) => x.key === p.parent_key)).sort(byOrder)
  return top.flatMap((p) => [p, ...projects.filter((c) => c.parent_key === p.key).sort(byOrder)])
}

/**
 * /admin/projects — প্রকল্পের তালিকা (পরিকল্পনা M-ধাপ ৭): গ্রুপ অনুযায়ী, ↑↓ দিয়ে ক্রম বদল (একই স্তরের মধ্যে),
 * প্রকাশ/অপ্রকাশ (প্রকাশের চেকলিস্ট মেনে; অপ্রকাশে রেকর্ড/উপ-প্রকল্প থাকলে নাম লিখে নিশ্চিতকরণ), "হোমে দেখান"।
 * প্রতিটি বদল updated_at মিলিয়ে (অন্য কেউ এর মধ্যে বদলালে CONFLICT)।
 */
export function AdminProjectsPage() {
  useDocumentTitle(t('প্রকল্পসমূহ'))
  const toast = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<HousingApiError | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Project | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await fetchData())
      setError(null)
    } catch (err) {
      setError(HousingApiError.from(err))
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetchData()
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(HousingApiError.from(err)))
    return () => {
      alive = false
    }
  }, [])

  /** যেকোনো বদলের পরে: তালিকা আবার আনা + সাইটের রেজিস্ট্রি (মেনু, রাউট) হালনাগাদ */
  const after = async () => {
    await load()
    await refreshProjects({ includeDrafts: true })
  }

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyKey(key)
    try {
      await fn()
      toast.success(okMsg)
      await after()
    } catch (err) {
      const stale = isStaleEdit(err)
      toast.error(stale ? t('অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — তালিকা আবার আনা হলো, আবার চেষ্টা করুন') : friendlyProjectError(err))
      if (stale) await load()
    } finally {
      setBusyKey(null)
    }
  }

  if (error && !data) {
    return (
      <section className="px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('প্রকল্পসমূহ')}</h1>
        <div className="mt-6">
          <ErrorNotice title={t('প্রকল্পের তালিকা লোড করা যায়নি')} error={error} />
        </div>
      </section>
    )
  }
  if (!data) {
    return (
      <section className="px-4 py-8 sm:px-6" aria-busy="true">
        <h1 className="text-2xl font-bold text-slate-900">{t('প্রকল্পসমূহ')}</h1>
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-slate-200" />
      </section>
    )
  }

  const { projects, totals } = data
  const ordered = displayOrder(projects)

  const move = (p: Project, dir: -1 | 1) => {
    const siblings = ordered.filter((x) => (x.parent_key ?? null) === (p.parent_key ?? null))
    const i = siblings.findIndex((x) => x.key === p.key)
    const j = i + dir
    if (j < 0 || j >= siblings.length) return
    const swapped = [...siblings]
    ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
    // নতুন ক্রমে পুরো তালিকা (একই স্তরের বদলানো ক্রম মেনে) → projects_reorder
    const pos = new Map(swapped.map((x, k) => [x.key, k]))
    const next = displayOrder(
      projects.map((x) => (pos.has(x.key) ? { ...x, sort_order: pos.get(x.key)! } : x)),
    )
    void run(p.key, () => getProjectsApi().reorder(next.map((x) => x.key)), t('ক্রম বদলানো হয়েছে'))
  }

  const setPublished = (p: Project, value: boolean) =>
    run(p.key, () => getProjectsApi().update(p.key, { is_published: value }, { expectedUpdatedAt: p.updated_at }), value ? t('প্রকাশ করা হয়েছে') : t('অপ্রকাশ করা হয়েছে'))

  const askUnpublish = (p: Project) => {
    const records = totals[p.key] ?? 0
    const publishedChildren = projects.some((c) => c.parent_key === p.key && c.is_published)
    if (records > 0 || publishedChildren) setConfirm(p)
    else void setPublished(p, false)
  }

  return (
    <section className="px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('প্রকল্পসমূহ')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('নতুন প্রকল্প সবসময় খসড়া হিসেবে তৈরি হয়; প্রকাশ না করা পর্যন্ত দর্শকেরা দেখতে পান না।')}</p>
        </div>
        <Link to="/admin/projects/new" className="inline-flex h-11 items-center gap-1.5 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600">
          <span aria-hidden="true">+</span> {t('নতুন প্রকল্প')}
        </Link>
      </div>

      <ul className={`${card} mt-6 divide-y divide-slate-100 !p-0`}>
        {ordered.map((p) => {
          const siblings = ordered.filter((x) => (x.parent_key ?? null) === (p.parent_key ?? null))
          const idx = siblings.findIndex((x) => x.key === p.key)
          const check = publishChecklist(p, projects)
          const busy = busyKey === p.key
          return (
            <li key={p.key} className={`flex flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center ${p.parent_key ? 'bg-slate-50/60 lg:pl-12' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/projects/${encodeURIComponent(p.key)}`} className="text-base font-bold text-slate-900 hover:text-brand-700">
                    {lt(p, 'name')}
                  </Link>
                  {p.is_published ? <Badge tone="green">{t('প্রকাশিত')}</Badge> : <Badge tone="amber">{t('খসড়া')}</Badge>}
                  {p.is_group && <Badge tone="blue">{t('গ্রুপ')}</Badge>}
                  {!p.show_on_home && <Badge>{t('হোমে নেই')}</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-mono">{projectPath(p, projects)}</span> · <span className="font-mono">{p.key}</span> ·{' '}
                  {t('{n}টি রেকর্ড', { n: formatBanglaNumber(totals[p.key] ?? 0) })}
                </p>
                {!p.is_published && check.blocking.length > 0 && (
                  <p className="mt-1 text-xs text-amber-800">{t('প্রকাশের আগে: {list}', { list: check.blocking.join(' · ') })}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={smallButton} disabled={busy || idx <= 0} onClick={() => move(p, -1)} aria-label={t('উপরে সরান')} title={t('উপরে সরান')}>
                  ↑
                </button>
                <button type="button" className={smallButton} disabled={busy || idx < 0 || idx >= siblings.length - 1} onClick={() => move(p, 1)} aria-label={t('নিচে সরান')} title={t('নিচে সরান')}>
                  ↓
                </button>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-700"
                    checked={p.show_on_home}
                    disabled={busy}
                    onChange={(e) => void run(p.key, () => getProjectsApi().update(p.key, { show_on_home: e.target.checked }, { expectedUpdatedAt: p.updated_at }), t('সংরক্ষিত'))}
                  />
                  {t('হোমে দেখান')}
                </label>
                {p.is_published ? (
                  <button type="button" className={smallButton} disabled={busy} onClick={() => askUnpublish(p)}>
                    {t('অপ্রকাশ করুন')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${smallButton} border-brand-600 text-brand-700`}
                    disabled={busy || check.blocking.length > 0}
                    title={check.blocking.join(' · ') || undefined}
                    onClick={() => void setPublished(p, true)}
                  >
                    {t('প্রকাশ করুন')}
                  </button>
                )}
                <Link to={`/admin/projects/${encodeURIComponent(p.key)}`} className={smallButton}>
                  {t('সেটিংস')}
                </Link>
              </div>
            </li>
          )
        })}
      </ul>

      {confirm && (
        <UnpublishDialog
          project={confirm}
          projects={projects}
          records={totals[confirm.key] ?? 0}
          busy={busyKey === confirm.key}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const p = confirm
            void setPublished(p, false).then(() => setConfirm(null))
          }}
        />
      )}
    </section>
  )
}
