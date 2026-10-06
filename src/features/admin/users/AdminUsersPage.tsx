import { lt, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { getAdminUsersApi, HousingApiError, type AdminUserRow, type Project, type ProjectKey } from '@/backend'
import { childrenOf, topLevelProjects, useProjects } from '@/features/projects/registry'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { formatDateTime } from '@/features/housing/utils/activityLabels'

interface Draft {
  email: string
  all_projects: boolean
  projects: ProjectKey[]
  is_active: boolean
  /** তালিকা থেকে এডিট (ইমেইল বদলানো যায় না) */
  existing: boolean
}

const EMPTY: Draft = { email: '', all_projects: false, projects: [], is_active: true, existing: false }

/** CONFIG_ERROR এ ErrorNotice ".env.local" ইঙ্গিত দেখায় — এখানে আসল কারণ (SQL ১৪ চালানো হয়নি) দেখানো দরকার */
function UsersError({ title, error }: { title: string; error: HousingApiError }) {
  if (error.code !== 'CONFIG_ERROR') return <ErrorNotice title={title} error={error} />
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{error.message}</p>
    </div>
  )
}

/**
 * /admin/users — ইউজার-ব্যবস্থাপনা (পর্ব চ, M-ধাপ ১৯; শুধু মূল এডমিন — RoleGate + ডাটাবেস দুজনেই আটকায়)।
 * অ্যাকাউন্ট আগে Supabase → Authentication → Add user (প্রশ্ন ২৩); এখানে সেই ইমেইলকে প্রকল্প বরাদ্দ, "সব প্রকল্প", চালু/বন্ধ।
 * গ্রুপ বাছলে তার সব উপ-প্রকল্প (পরে যোগ হলেও) পান।
 */
export function AdminUsersPage() {
  useDocumentTitle(t('ইউজার'))
  const projects = useProjects()
  const top = useMemo(() => topLevelProjects(projects), [projects])
  const byKey = useMemo(() => new Map(projects.map((p) => [p.key, p])), [projects])

  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [listError, setListError] = useState<HousingApiError | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<HousingApiError | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await getAdminUsersApi().list())
      setListError(null)
    } catch (err) {
      setListError(HousingApiError.from(err))
    }
  }, [])

  useEffect(() => {
    let alive = true
    getAdminUsersApi()
      .list()
      .then((r) => alive && setRows(r))
      .catch((err) => alive && setListError(HousingApiError.from(err)))
    return () => {
      alive = false
    }
  }, [])

  const edit = (r: AdminUserRow) => {
    setDraft({ email: r.email, all_projects: r.all_projects, projects: r.projects, is_active: r.is_active, existing: true })
    setSaveError(null)
    setSaved(null)
  }

  const toggle = (key: ProjectKey, on: boolean) =>
    setDraft((d) => {
      const kids = childrenOf(key, projects).map((c) => c.key)
      // গ্রুপ বাছলে উপ-প্রকল্পগুলো আলাদা করে রাখার দরকার নেই (গ্রুপ-বরাদ্দেই সব আসে)
      const rest = d.projects.filter((k) => k !== key && !(on && kids.includes(k)))
      return { ...d, projects: on ? [...rest, key] : rest }
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(null)
    try {
      const r = await getAdminUsersApi().save({ email: draft.email, all_projects: draft.all_projects, projects: draft.projects, is_active: draft.is_active })
      setSaved(r.created ? t('{email} যোগ হয়েছে', { email: r.email }) : t('{email} এর তথ্য বদলানো হয়েছে', { email: r.email }))
      setDraft(EMPTY)
      await load()
    } catch (err) {
      setSaveError(HousingApiError.from(err))
    } finally {
      setSaving(false)
    }
  }

  const projectNames = (r: AdminUserRow) =>
    r.role === 'main_admin' || r.all_projects
      ? t('সব প্রকল্প')
      : r.projects.length
        ? r.projects.map((k) => lt(byKey.get(k), 'name') || k).join(', ')
        : '—'

  const box = (p: Project, inGroup: boolean) => {
    const groupOn = !!p.parent_key && draft.projects.includes(p.parent_key)
    const checked = draft.all_projects || groupOn || draft.projects.includes(p.key)
    return (
      <label key={p.key} className={`flex min-h-9 items-center gap-2 text-sm ${inGroup ? 'pl-6' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={saving || draft.all_projects || groupOn}
          onChange={(e) => toggle(p.key, e.target.checked)}
          className="h-4 w-4 accent-brand-700"
        />
        <span className={draft.all_projects || groupOn ? 'text-slate-500' : 'text-slate-800'}>
          {lt(p, 'name')}
          {p.is_group && <span className="text-xs text-slate-500"> {t('(গ্রুপ — সব উপ-প্রকল্প)')}</span>}
          {!p.is_published && <span className="text-xs text-slate-500"> {t('(খসড়া)')}</span>}
        </span>
      </label>
    )
  }

  return (
    <section className="container-page py-10 sm:py-14">
      <p className="text-sm text-slate-500">
        <Link to="/admin" className="hover:text-brand-700">
          {t('এডমিন')}
        </Link>{' '}
        / {t('ইউজার')}
      </p>
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('ইউজার')}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        {t('প্রকল্পের ইউজার নিজের প্রকল্পে রেকর্ড যোগ ও এডিট, ইম্পোর্ট আর নতুন ছবি দিতে পারেন। মোছা, থাকা ছবি বদল, মান ফাঁকা করা, সিরিয়াল বদল, প্রকল্পের সেটিংস আর ইউজার — শুধু মূল এডমিন।')}
      </p>

      {listError ? (
        <div className="mt-6">
          <UsersError title={t('ইউজার-তালিকা আনা যায়নি')} error={listError} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-brand-50 text-left text-xs font-semibold text-brand-900 uppercase">
              <tr>
                <th className="px-3 py-2 pl-4">{t('ইমেইল')}</th>
                <th className="px-3 py-2">{t('ভূমিকা')}</th>
                <th className="px-3 py-2">{t('প্রকল্প')}</th>
                <th className="px-3 py-2">{t('অবস্থা')}</th>
                <th className="px-3 py-2">{t('শেষ লগইন')}</th>
                <th className="px-3 py-2 pr-4" aria-label={t('কাজ')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows === null ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    {t('লোড হচ্ছে…')}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.user_id} className={r.is_active ? '' : 'bg-slate-50 text-slate-500'}>
                    <td className="px-3 py-2 pl-4 font-medium break-all">{r.email}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.role === 'main_admin' ? t('মূল এডমিন') : t('প্রকল্পের ইউজার')}</td>
                    <td className="px-3 py-2">{projectNames(r)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.is_active ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{t('চালু')}</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{t('বন্ধ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.last_sign_in_at ? formatDateTime(r.last_sign_in_at) : '—'}</td>
                    <td className="px-3 py-2 pr-4 text-right">
                      {r.role !== 'main_admin' && (
                        <button type="button" onClick={() => edit(r)} className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                          {t('বদলান')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {rows && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{t('মোট {n} জন', { n: toBanglaNumber(rows.length) })}</p>}
        </div>
      )}

      {!(listError?.code === 'CONFIG_ERROR') && (
        <form onSubmit={(e) => void submit(e)} className="mt-8 max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="user-form-title">
          <h2 id="user-form-title" className="text-lg font-semibold text-slate-900">
            {draft.existing ? t('ইউজার বদলান') : t('নতুন ইউজার যোগ')}
          </h2>
          {!draft.existing && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>{t('আগে Supabase → Authentication → Users → Add user দিয়ে ইমেইল-পাসওয়ার্ডে অ্যাকাউন্ট খুলুন ("Auto Confirm User" চালু রাখুন)।')}</li>
              <li>{t('তারপর সেই ইমেইল এখানে লিখে প্রকল্প বাছুন ও সংরক্ষণ করুন। পাসওয়ার্ড ইউজারকে নিজে জানাবেন।')}</li>
            </ol>
          )}

          <label htmlFor="user-email" className="mt-4 mb-1 block text-sm font-medium text-slate-700">
            {t('ইমেইল')}
          </label>
          <input
            id="user-email"
            type="email"
            required
            autoComplete="off"
            value={draft.email}
            readOnly={draft.existing}
            disabled={saving}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm read-only:bg-slate-100"
          />

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-slate-700">{t('প্রকল্প')}</legend>
            <label className="mt-1 flex min-h-9 items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={draft.all_projects}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, all_projects: e.target.checked }))}
                className="h-4 w-4 accent-brand-700"
              />
              {t('সব প্রকল্প (পরে নতুন প্রকল্প হলে সেটিও)')}
            </label>
            <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {top.map((p) => (
                <div key={p.key}>
                  {box(p, false)}
                  {p.is_group && childrenOf(p.key, projects).map((c) => box(c, true))}
                </div>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active}
              disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
              className="h-4 w-4 accent-brand-700"
            />
            {t('চালু (বন্ধ করলে লগইন থাকলেও কিছু বদলাতে পারবেন না)')}
          </label>

          {saveError && (
            <div className="mt-4">
              <UsersError title={t('সংরক্ষণ হয়নি')} error={saveError} />
            </div>
          )}
          {saved && (
            <p role="status" className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
              {saved}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? t('সংরক্ষণ হচ্ছে…') : t('সংরক্ষণ')}
            </button>
            {draft.existing && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setDraft(EMPTY)
                  setSaveError(null)
                }}
                className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-slate-400"
              >
                {t('বাতিল — নতুন ইউজার')}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
