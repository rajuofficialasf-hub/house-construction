import { lt, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { getAdminUsersApi, HousingApiError, type AdminRole, type AdminUserInput, type AdminUserRow, type Project, type ProjectKey } from '@/backend'
import { childrenOf, topLevelProjects, useProjects } from '@/features/projects/registry'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { formatDateTime } from '@/features/housing/utils/activityLabels'

interface Draft {
  email: string
  role: AdminUserInput['role']
  all_projects: boolean
  projects: ProjectKey[]
  is_active: boolean
  /** তালিকা থেকে এডিট (ইমেইল বদলানো যায় না) */
  existing: boolean
}

const EMPTY: Draft = { email: '', role: 'editor', all_projects: false, projects: [], is_active: true, existing: false }

const ROLE_LABELS: Record<AdminRole, string> = { main_admin: 'মূল এডমিন', admin: 'এডমিন', editor: 'প্রকল্পের ইউজার' }
const roleLabel = (role: AdminRole) => t(ROLE_LABELS[role])

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-green-800">{t('চালু')}</span>
  ) : (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-700">{t('বন্ধ')}</span>
  )
}

/**
 * /admin/users — ইউজার-ব্যবস্থাপনা (শুধু মূল এডমিন — RoleGate আর সার্ভার দুজনেই আটকায়; docs/api/PROJECTS_API_CONTRACT.md §৪.৬)।
 * লগইন আগে সার্ভারের এডমিন CLI দিয়ে খোলা হয় (`npm --prefix server run admin -- create`); এখানে সেই লগইনের ভূমিকা
 * (এডমিন বা প্রকল্পের ইউজার), প্রকল্প বরাদ্দ, "সব প্রকল্প" আর চালু/বন্ধ। গ্রুপ বাছলে তার সব উপ-প্রকল্প (পরে যোগ হলেও) পান।
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
  const formRef = useRef<HTMLFormElement>(null)

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
    const role = r.role === 'admin' ? 'admin' : 'editor'
    setDraft({ email: r.email, role, all_projects: role === 'editor' && r.all_projects, projects: r.projects, is_active: r.is_active, existing: true })
    setSaveError(null)
    setSaved(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      const { email, role, all_projects, projects: keys, is_active } = draft
      const r = await getAdminUsersApi().save({ email, role, all_projects, projects: keys, is_active })
      setSaved(t('{email} এর তথ্য বদলানো হয়েছে', { email: r.email }))
      setDraft(EMPTY)
      await load()
    } catch (err) {
      setSaveError(HousingApiError.from(err))
    } finally {
      setSaving(false)
    }
  }

  const projectNames = (r: AdminUserRow) =>
    r.all_projects
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
        {t('প্রকল্পের ইউজার নিজের প্রকল্পে রেকর্ড যোগ ও এডিট, ইম্পোর্ট আর নতুন ছবি দিতে পারেন। থাকা ছবি বদল, মান ফাঁকা করা, সিরিয়াল বদল আর প্রকল্পের সেটিংস পারেন এডমিন ও মূল এডমিন। মোছা আর ইউজার সামলানো শুধু মূল এডমিনের কাজ।')}
      </p>

      {listError ? (
        <div className="mt-6">
          <ErrorNotice title={t('ইউজার-তালিকা আনা যায়নি')} error={listError} />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* ফোনে কার্ড (টেবিল পাশে স্ক্রল হলে "বদলান" চোখে পড়ে না) — M-ধাপ ২০ */}
          <ul className="divide-y divide-slate-100 sm:hidden" aria-label={t('ইউজার')}>
            {rows === null ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">{t('লোড হচ্ছে…')}</li>
            ) : (
              rows.map((r) => (
                <li key={r.id} className={`px-4 py-3 text-sm ${r.is_active ? '' : 'bg-slate-50 text-slate-500'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium break-all">
                      {r.email}
                      {r.name && <span className="block text-xs font-normal text-slate-500">{r.name}</span>}
                    </p>
                    <StatusBadge active={r.is_active} />
                  </div>
                  <p className="mt-1 text-slate-600">
                    {roleLabel(r.role)} · {projectNames(r)}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      {t('শেষ সক্রিয়')}: {r.last_seen_at ? formatDateTime(r.last_seen_at) : '—'}
                    </p>
                    {r.role !== 'main_admin' && (
                      <button type="button" disabled={saving} onClick={() => edit(r)} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                        {t('বদলান')}
                      </button>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-brand-50 text-left text-xs font-semibold text-brand-900 uppercase">
              <tr>
                <th className="px-3 py-2 pl-4">{t('ইমেইল')}</th>
                <th className="px-3 py-2">{t('ভূমিকা')}</th>
                <th className="px-3 py-2">{t('প্রকল্প')}</th>
                <th className="px-3 py-2">{t('অবস্থা')}</th>
                <th className="px-3 py-2">{t('শেষ সক্রিয়')}</th>
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
                  <tr key={r.id} className={r.is_active ? '' : 'bg-slate-50 text-slate-500'}>
                    <td className="px-3 py-2 pl-4 font-medium break-all">
                      {r.email}
                      {r.name && <span className="block text-xs font-normal text-slate-500">{r.name}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{roleLabel(r.role)}</td>
                    <td className="px-3 py-2">{projectNames(r)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusBadge active={r.is_active} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.last_seen_at ? formatDateTime(r.last_seen_at) : '—'}</td>
                    <td className="px-3 py-2 pr-4 text-right">
                      {r.role !== 'main_admin' && (
                        <button type="button" disabled={saving} onClick={() => edit(r)} className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                          {t('বদলান')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          {rows && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{t('মোট {n} জন', { n: toBanglaNumber(rows.length) })}</p>}
        </div>
      )}

      <form ref={formRef} onSubmit={(e) => void submit(e)} className="mt-8 max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="user-form-title">
        <h2 id="user-form-title" className="text-lg font-semibold text-slate-900">
          {draft.existing ? t('ইউজার বদলান') : t('নতুন ইউজার যোগ')}
        </h2>
        {!draft.existing && (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>
              {t('আগে সার্ভারে এই কমান্ড চালিয়ে ইমেইল-পাসওয়ার্ডে অ্যাকাউন্ট খুলুন:')}{' '}
              <code className="break-all">npm --prefix server run admin -- create --email … --name …</code>
            </li>
            <li>{t('তারপর সেই ইমেইল এখানে লিখে ভূমিকা ও প্রকল্প বাছুন, তারপর সংরক্ষণ করুন। পাসওয়ার্ড ইউজারকে নিজে জানাবেন।')}</li>
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
          <legend className="text-sm font-medium text-slate-700">{t('ভূমিকা')}</legend>
          {(['editor', 'admin'] as const).map((role) => (
            <label key={role} className="mt-1 flex min-h-9 items-center gap-2 text-sm">
              <input
                type="radio"
                name="user-role"
                value={role}
                checked={draft.role === role}
                disabled={saving}
                onChange={() => setDraft((d) => ({ ...d, role }))}
                className="h-4 w-4 accent-brand-700"
              />
              {roleLabel(role)}
              <span className="text-xs text-slate-500">
                {role === 'editor' ? t('— বাছাই করা প্রকল্পে যোগ ও এডিট') : t('— সব প্রকল্পে সব কাজ, শুধু মোছা নয়')}
              </span>
            </label>
          ))}
        </fieldset>

        {draft.role === 'editor' && (
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
        )}

        <label className="mt-4 flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_active}
            disabled={saving}
            onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
            className="h-4 w-4 accent-brand-700"
          />
          {t('চালু (বন্ধ করলে সঙ্গে সঙ্গে লগআউট হয়ে যাবেন, আর লগইন করতে পারবেন না)')}
        </label>

        {saveError && (
          <div className="mt-4">
            <ErrorNotice title={t('সংরক্ষণ হয়নি')} error={saveError} />
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
    </section>
  )
}
