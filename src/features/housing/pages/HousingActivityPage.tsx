import { gn, lt, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi } from '../../../backend/factory'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  type ActivityEntry,
  type ActivityListParams,
  type Page,
  type ProjectType,
} from '../../../backend/interfaces/types'
import { ErrorNotice } from '../components/ErrorNotice'
import { Pagination } from '../components/Pagination'
import { leafProjects, useProject, useProjects } from '@/features/projects/registry'
import { adminPath } from '../utils/housingProjects'

const ACTION_LABEL: Record<string, string> = {
  create: 'রেকর্ড যোগ',
  update: 'রেকর্ড সম্পাদনা',
  delete: 'রেকর্ড মুছে ফেলা',
  photo_update: 'ছবি আপডেট',
  serial_change: 'সিরিয়াল বদল',
  login: 'লগইন',
  logout: 'লগআউট',
  import_run: 'বাল্ক ইম্পোর্ট',
  photo_bulk_run: 'ছবি বাল্ক আপডেট',
}
const ACTION_CLASS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  photo_update: 'bg-purple-100 text-purple-800',
  serial_change: 'bg-amber-100 text-amber-900',
  login: 'bg-slate-100 text-slate-700',
  logout: 'bg-slate-100 text-slate-700',
  import_run: 'bg-teal-100 text-teal-800',
  photo_bulk_run: 'bg-purple-100 text-purple-800',
}
const FIELD_LABEL: Record<string, string> = {
  serial_no: 'সিরিয়াল',
  year: 'সাল',
  name: 'নাম',
  father_or_husband_name: 'পিতা/স্বামী',
  division: 'বিভাগ',
  district: 'জেলা',
  upazila: 'উপজেলা',
  address: 'ঠিকানা',
  prev_photo_source: 'পূর্বের ছবির লিঙ্ক',
  current_photo_source: 'বর্তমান ছবির লিঙ্ক',
  prev_photo: 'পূর্বের ছবি',
  current_photo: 'বর্তমান ছবি',
}

type State = { status: 'loading'; data: Page<ActivityEntry> | null } | { status: 'ready'; data: Page<ActivityEntry> } | { status: 'error'; error: HousingApiError }

/**
 * /admin/activity — একটিভিটি লগ: কে, কখন, কী করেছে। ফিল্টার (ধরন, প্রকল্প, কে, তারিখ) URL এ; পেজিনেশন।
 * উৎস: ডাটাবেস ট্রিগার (রেকর্ড create/update/delete/photo/serial) + ক্লায়েন্ট-ইভেন্ট (login/logout/import_run/photo_bulk_run)।
 */
export function HousingActivityPage() {
  useDocumentTitle(t('একটিভিটি লগ'))
  const [sp, setSp] = useSearchParams()
  const projects = useProjects()
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const params = useMemo<ActivityListParams>(
    () => ({
      page,
      page_size: DEFAULT_PAGE_SIZE,
      action: sp.get('action') || undefined,
      project_type: (sp.get('project') as ProjectType) || undefined,
      actor_email: sp.get('actor') || undefined,
      record_id: sp.get('record') || undefined,
      from: sp.get('from') ? `${sp.get('from')}T00:00:00` : undefined,
      to: sp.get('to') ? `${sp.get('to')}T23:59:59.999` : undefined,
    }),
    [sp, page],
  )
  const [state, setState] = useState<State>({ status: 'loading', data: null })
  const key = JSON.stringify(params)
  useEffect(() => {
    let alive = true
    getHousingApi()
      .listActivity(JSON.parse(key) as ActivityListParams)
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((err: unknown) => alive && setState({ status: 'error', error: HousingApiError.from(err) }))
    return () => {
      alive = false
    }
  }, [key])

  const setParam = useCallback(
    (k: string, v: string) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev)
          if (v) n.set(k, v)
          else n.delete(k)
          if (k !== 'page') n.delete('page')
          return n
        },
        { replace: k !== 'page' },
      ),
    [setSp],
  )

  const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm'
  const data = state.status === 'error' ? null : state.data

  return (
    <section className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('একটিভিটি লগ')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('প্রতিটি রেকর্ড যোগ/সম্পাদনা/মোছা, ছবি ও সিরিয়াল বদল, লগইন, ইম্পোর্ট — কে, কখন, কী বদলেছে।')}</p>
        </div>
        {sp.get('record') && (
          <button type="button" onClick={() => setParam('record', '')} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-red-300 hover:text-red-700">
            {t('একটি রেকর্ডের ইতিহাস দেখানো হচ্ছে — সব দেখুন')}
          </button>
        )}
      </div>

      {/* ---------- ফিল্টার ---------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <select className={sel} value={sp.get('action') ?? ''} onChange={(e) => setParam('action', e.target.value)} aria-label={t('কাজের ধরন')}>
          <option value="">{t('সব ধরন')}</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </select>
        <select className={sel} value={sp.get('project') ?? ''} onChange={(e) => setParam('project', e.target.value)} aria-label={t('প্রকল্প')}>
          <option value="">{t('সব প্রকল্প')}</option>
          {leafProjects(projects).map((p) => (
            <option key={p.key} value={p.key}>
              {lt(p, 'name')}
            </option>
          ))}
        </select>
        <input className={`${sel} w-44`} placeholder={t('কে (ইমেইল)')} defaultValue={sp.get('actor') ?? ''} onBlur={(e) => setParam('actor', e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && setParam('actor', (e.target as HTMLInputElement).value.trim())} aria-label={t('ইমেইল')} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          {t('থেকে')} <input type="date" className={sel} value={sp.get('from') ?? ''} onChange={(e) => setParam('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          {t('পর্যন্ত')} <input type="date" className={sel} value={sp.get('to') ?? ''} onChange={(e) => setParam('to', e.target.value)} />
        </label>
        {['action', 'project', 'actor', 'from', 'to', 'record'].some((k) => sp.get(k)) && (
          <button type="button" onClick={() => setSp(new URLSearchParams(), { replace: true })} className="ml-auto text-xs text-slate-600 underline-offset-2 hover:underline">
            {t('ফিল্টার মুছুন')}
          </button>
        )}
      </div>

      {state.status === 'error' && (
        <div className="mt-4">
          <ErrorNotice title={t('লগ লোড করা যায়নি')} error={state.error} />
        </div>
      )}
      {state.status === 'loading' && !data && (
        <div className="mt-4 animate-pulse space-y-2" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-200" />
          ))}
        </div>
      )}
      {data && data.meta.total === 0 && <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{t('কোনো এন্ট্রি নেই।')}</p>}
      {data && data.meta.total > 0 && (
        <>
          <ol className={`mt-4 space-y-2 ${state.status === 'loading' ? 'opacity-60' : ''}`}>
            {data.data.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ol>
          <div className="mt-5">
            <Pagination meta={data.meta} onPageChange={(p) => setParam('page', p <= 1 ? '' : String(p))} disabled={state.status === 'loading'} />
          </div>
        </>
      )}
    </section>
  )
}

function Entry({ e }: { e: ActivityEntry }) {
  const project = useProject(e.project_type)
  const changes = (e.details?.changes ?? null) as Record<string, { old: unknown; new: unknown }> | null
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <time dateTime={e.at} className="text-xs text-slate-500 tabular-nums">
          {formatDateTime(e.at)}
        </time>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_CLASS[e.action] ?? 'bg-slate-100 text-slate-700'}`}>{ACTION_LABEL[e.action] ? t(ACTION_LABEL[e.action]) : e.action}</span>
        <span className="text-slate-700">
          <span className="font-medium">{e.actor_email === 'service_role' ? t('স্ক্রিপ্ট (service_role)') : (e.actor_email ?? t('অজানা'))}</span>
        </span>
        {e.record_id && e.serial_no !== null && project && (
          <span className="text-slate-700">
            → {lt(project, 'name')} · {t('সিরিয়াল')}{' '}
            {e.action === 'delete' ? (
              <span className="font-semibold">{toBanglaNumber(e.serial_no)}</span>
            ) : (
              <Link to={adminPath(project.key, `${e.serial_no}/edit`)} className="font-semibold text-brand-700 hover:underline">
                {toBanglaNumber(e.serial_no)}
              </Link>
            )}
            {e.record_name && <span className="text-slate-600"> ({e.record_name})</span>}
            <Link to={`/admin/activity?record=${e.record_id}`} className="ml-2 text-xs text-slate-500 hover:text-brand-700 hover:underline">
              {t('ইতিহাস')}
            </Link>
          </span>
        )}
        {!e.record_id && project && <span className="text-slate-600">· {lt(project, 'name')}</span>}
      </div>
      <Details e={e} changes={changes} />
    </li>
  )
}

function Details({ e, changes }: { e: ActivityEntry; changes: Record<string, { old: unknown; new: unknown }> | null }) {
  const d = e.details ?? {}
  if (changes && Object.keys(changes).length) {
    return (
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {Object.entries(changes).map(([field, v]) => (
          <li key={field}>
            <span className="font-medium text-slate-700">{FIELD_LABEL[field] ? t(FIELD_LABEL[field]) : field}:</span>{' '}
            {field.endsWith('_photo') ? (
              <>
                {v.old ? t('ছিল') : t('ছিল না')} → <span className="text-slate-900">{v.new ? t('আছে') : t('নেই')}</span>
              </>
            ) : (
              <>
                <span className="line-through">{fmt(v.old)}</span> → <span className="text-slate-900">{fmt(v.new)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    )
  }
  if (e.action === 'create' || e.action === 'delete') {
    return (
      <p className="mt-1 text-xs text-slate-600">
        {[d.year && t('সাল {n}', { n: toBanglaNumber(String(d.year)) }), d.upazila && `${gn(String(d.upazila))}, ${gn(String(d.district))}, ${gn(String(d.division))}`, d.address && String(d.address)].filter(Boolean).join(' · ')}
      </p>
    )
  }
  if (e.action === 'import_run' || e.action === 'photo_bulk_run') {
    return (
      <p className="mt-1 text-xs text-slate-600">
        {Object.entries(d)
          .map(([k, v]) => `${IMPORT_KEYS[k] ? t(IMPORT_KEYS[k]) : k}: ${typeof v === 'number' ? formatBanglaNumber(v) : String(v)}`)
          .join(' · ')}
      </p>
    )
  }
  return null
}

const IMPORT_KEYS: Record<string, string> = { mode: 'মোড', inserted: 'যোগ', updated: 'আপডেট', failed: 'ব্যর্থ', missing: 'মিলেনি', rows: 'সারি', file: 'ফাইল', done: 'সফল', skipped: 'বাদ' }

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return toBanglaNumber(v)
  return String(v)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return toBanglaNumber(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`)
}
