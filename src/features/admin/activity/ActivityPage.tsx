import { gn, lt, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { DEFAULT_PAGE_SIZE, getHousingApi, HousingApiError, type ActivityEntry, type ActivityListParams, type Page, type Project } from '@/backend'
import { FIELD_VALUE_SPECS, formatField, resolveFields, type FieldDef } from '@/features/projects/fields'
import { useProject, useProjects } from '@/features/projects/registry'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { Pagination } from '@/features/housing/components/Pagination'
import { ACTION_CLASS, ACTION_LABEL, formatDateTime } from '@/features/housing/utils/activityLabels'
import { adminPath } from '@/features/housing/utils/housingProjects'
import { photoSlotLabel } from '../records/recordColumns'

/** রেকর্ডের কলাম যা ফিল্ড-সংজ্ঞায় নেই (বা পুরনো লগে) — বাংলা লেবেল */
const RECORD_COL: Record<string, string> = {
  serial_no: 'সিরিয়াল',
  year: 'সাল',
  name: 'নাম',
  father_or_husband_name: 'পিতা/স্বামী',
  division: 'বিভাগ',
  district: 'জেলা',
  upazila: 'উপজেলা',
  union_name: 'ইউনিয়ন/পৌরসভা',
  address: 'ঠিকানা',
  prev_photo_source: 'পূর্বের ছবির লিঙ্ক',
  current_photo_source: 'বর্তমান ছবির লিঙ্ক',
  prev_photo: 'পূর্বের ছবি',
  current_photo: 'বর্তমান ছবি',
}

/** প্রকল্পের সেটিং-বদলের কলাম */
const PROJECT_COL: Record<string, string> = {
  name_bn: 'নাম (বাংলা)',
  name_en: 'নাম (ইংরেজি)',
  slug: 'URL অংশ',
  parent_key: 'গ্রুপ',
  summary_bn: 'ছোট বর্ণনা (বাংলা)',
  summary_en: 'ছোট বর্ণনা (ইংরেজি)',
  description_bn: 'পরিচিতি (বাংলা)',
  description_en: 'পরিচিতি (ইংরেজি)',
  unit_bn: 'একক (বাংলা)',
  unit_en: 'একক (ইংরেজি)',
  photo_mode: 'ছবি মোড',
  prev_label_bn: 'আগের ছবির লেবেল',
  prev_label_en: 'আগের ছবির লেবেল (ইংরেজি)',
  current_label_bn: 'পরের ছবির লেবেল',
  current_label_en: 'পরের ছবির লেবেল (ইংরেজি)',
  geo_depth: 'ঠিকানার স্তর',
  core_fields: 'সিস্টেম ফিল্ড',
  stat_cards: 'স্ট্যাট কার্ড',
  display: 'প্রদর্শন',
  file_prefix: 'ফাইল-প্রিফিক্স',
  icon: 'আইকন',
  accent: 'রং',
  cover_path: 'কভার ছবি',
  is_published: 'প্রকাশিত',
  show_on_home: 'হোমে দেখান',
}

/** ফিল্ডের সেটিং-বদলের কলাম */
const FIELD_COL: Record<string, string> = {
  key: 'key',
  label_bn: 'লেবেল (বাংলা)',
  label_en: 'লেবেল (ইংরেজি)',
  help_bn: 'সাহায্য-লেখা (বাংলা)',
  help_en: 'সাহায্য-লেখা (ইংরেজি)',
  type: 'ধরন',
  required: 'আবশ্যক',
  visibility: 'কে দেখবে',
  show_in_table: 'টেবিলে',
  show_in_card: 'কার্ডে',
  show_in_detail: 'বিস্তারিত পাতায়',
  filterable: 'ফিল্টারে',
  searchable: 'সার্চে',
  fill_down: 'ফিল-ডাউন',
  max_length: 'সর্বোচ্চ দৈর্ঘ্য',
  min_value: 'সর্বনিম্ন মান',
  max_value: 'সর্বোচ্চ মান',
  import_aliases: 'বিকল্প শিরোনাম',
  is_active: 'সক্রিয়',
}

/** কোড-মান → বাংলা */
const ENUM: Record<string, string> = {
  before_after: 'আগে-পরে',
  after_only: 'শুধু পরে',
  none: 'ছবি নেই',
  public: 'পাবলিক',
  admin: 'শুধু-এডমিন',
  upazila: 'উপজেলা',
  union: 'ইউনিয়ন',
}

const IMPORT_KEYS: Record<string, string> = { mode: 'মোড', inserted: 'যোগ', updated: 'আপডেট', failed: 'ব্যর্থ', missing: 'মিলেনি', rows: 'সারি', file: 'ফাইল', done: 'সফল', skipped: 'বাদ', overwrite: 'ওভাররাইট', private: 'গোপনসহ' }

type State = { status: 'loading'; data: Page<ActivityEntry> | null } | { status: 'ready'; data: Page<ActivityEntry> } | { status: 'error'; error: HousingApiError }

/**
 * /admin/activity — একটিভিটি লগ (M-ধাপ ১২: সব প্রকল্পের): কে, কখন, কী করেছে। ফিল্টার (ধরন, প্রকল্প — ডাটাবেসের তালিকা থেকে,
 * কে, তারিখ) URL এ; পেজিনেশন। বদলের লেবেল ফিল্ডের সংজ্ঞা থেকে (অচেনা হলে কাঁচা key), টাকা "৳ ৫০,০০০ → ৳ ৬০,০০০";
 * প্রকল্প/ফিল্ডের সেটিং-বদল, গোপন মান (শুধু ফিল্ডের নাম), এক্সপোর্ট, ক্যাটাগরির এক-বানান।
 * উৎস: ডাটাবেস ট্রিগার (রেকর্ড, ছবি, সিরিয়াল, গোপন মান, প্রকল্প, ফিল্ড) + ক্লায়েন্ট-ইভেন্ট (login/logout/import_run/
 * photo_bulk_run/records_export/category_merge)।
 */
export function ActivityPage() {
  useDocumentTitle(t('একটিভিটি লগ'))
  const [sp, setSp] = useSearchParams()
  const projects = useProjects()
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const params = useMemo<ActivityListParams>(
    () => ({
      page,
      page_size: DEFAULT_PAGE_SIZE,
      action: sp.get('action') || undefined,
      project_type: sp.get('project') || undefined,
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

  // প্রকল্প ফিল্টার: ডাটাবেসের রেজিস্ট্রি (এডমিনে খসড়াসহ) — গ্রুপ, তার নিচে উপ-প্রকল্প, তারপর একক
  const projectOptions = useMemo(() => {
    const out: { key: string; label: string }[] = []
    const label = (p: Project) => (p.is_published ? lt(p, 'name') : t('{name} (খসড়া)', { name: lt(p, 'name') }))
    for (const p of projects.filter((x) => !x.parent_key)) {
      out.push({ key: p.key, label: label(p) })
      for (const c of projects.filter((x) => x.parent_key === p.key)) out.push({ key: c.key, label: `↳ ${label(c)}` })
    }
    return out
  }, [projects])

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
          {projectOptions.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
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

const isConfig = (a: string) => a.startsWith('project_') || a.startsWith('field_')

function Entry({ e }: { e: ActivityEntry }) {
  const project = useProject(e.project_type)
  const defs = useMemo(() => (project ? resolveFields(project, { includePrivate: true, includeArchived: true }) : []), [project])
  const config = isConfig(e.action)
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
        {e.record_id && e.serial_no !== null && (
          <span className="text-slate-700">
            → {project ? lt(project, 'name') : e.project_type} · {t('সিরিয়াল')}{' '}
            {e.action === 'delete' || !project ? (
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
        {!e.record_id && config && e.project_type && (
          <span className="text-slate-700">
            → {project ? lt(project, 'name') : e.project_type}
            {e.action.startsWith('field_') && e.record_name && <span className="text-slate-600"> · {t('ফিল্ড «{name}»', { name: e.record_name })}</span>}
            {e.action !== 'project_delete' && (
              <Link to={`/admin/projects/${encodeURIComponent(e.project_type)}${e.action.startsWith('field_') ? '?tab=fields' : ''}`} className="ml-2 text-xs text-slate-500 hover:text-brand-700 hover:underline">
                {t('সেটিংস')}
              </Link>
            )}
          </span>
        )}
        {!e.record_id && !config && project && <span className="text-slate-600">· {lt(project, 'name')}</span>}
      </div>
      <Details e={e} project={project ?? null} defs={defs} />
    </li>
  )
}

/** রেকর্ডের বদলের লেবেল ও মান: ফিল্ডের সংজ্ঞা থেকে (টাকা ৳), অচেনা হলে কাঁচা key */
function recordChange(field: string, project: Project | null, defs: FieldDef[]): { label: string; def: FieldDef | null } {
  if (field === 'prev_photo' || field === 'current_photo') return { label: project ? photoSlotLabel(project, field === 'prev_photo' ? 'prev' : 'current') : t(RECORD_COL[field]), def: null }
  const key = field.startsWith('extra.') ? field.slice(6) : field
  const def = defs.find((d) => d.key === key && (field.startsWith('extra.') ? d.source !== 'system' : d.source === 'system')) ?? null
  if (def) return { label: lt(def, 'label'), def }
  return { label: RECORD_COL[field] ? t(RECORD_COL[field]) : field, def: null }
}

function fmt(v: unknown, def: FieldDef | null = null): string {
  if (v === null || v === undefined || v === '') return '—'
  if (def && (typeof v === 'string' || typeof v === 'number')) {
    const s = formatField(def, v)
    if (s) return s
  }
  if (typeof v === 'boolean') return v ? t('হ্যাঁ') : t('না')
  if (typeof v === 'number') return toBanglaNumber(v)
  if (typeof v === 'string') {
    if (ENUM[v]) return t(ENUM[v])
    if (v in FIELD_VALUE_SPECS) return t(FIELD_VALUE_SPECS[v as keyof typeof FIELD_VALUE_SPECS].label_bn)
    return v.length > 60 ? `${v.slice(0, 60)}…` : v
  }
  return t('(বদলেছে)')
}

function Details({ e, project, defs }: { e: ActivityEntry; project: Project | null; defs: FieldDef[] }) {
  const d = (e.details ?? {}) as Record<string, unknown>
  const changes = (d.changes ?? null) as Record<string, { old: unknown; new: unknown }> | null
  if (changes && Object.keys(changes).length) {
    const config = isConfig(e.action)
    const cols = e.action.startsWith('project_') ? PROJECT_COL : FIELD_COL
    return (
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {Object.entries(changes).map(([field, v]) => {
          const { label, def } = config ? { label: cols[field] ? t(cols[field]) : field, def: null } : recordChange(field, project, defs)
          return (
            <li key={field}>
              <span className="font-medium text-slate-700">{label}:</span>{' '}
              {field.endsWith('_photo') && !config ? (
                <>
                  {v.old ? t('ছিল') : t('ছিল না')} → <span className="text-slate-900">{v.new ? t('আছে') : t('নেই')}</span>
                </>
              ) : (
                <>
                  <span className="line-through">{fmt(v.old, def)}</span> → <span className="text-slate-900">{fmt(v.new, def)}</span>
                </>
              )}
            </li>
          )
        })}
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
  if (e.action === 'private_update') {
    const keys = Array.isArray(d.fields) ? (d.fields as string[]) : []
    return (
      <p className="mt-1 text-xs text-slate-600">
        🔒 {keys.map((k) => recordChange(`extra.${k}`, project, defs).label).join(', ')} <span className="text-slate-400">({t('মান লগে রাখা হয় না')})</span>
      </p>
    )
  }
  if (e.action === 'category_merge') {
    const fieldLabel = recordChange(`extra.${String(d.field ?? '')}`, project, defs).label
    return (
      <p className="mt-1 text-xs text-slate-600">
        <span className="font-medium text-slate-700">{fieldLabel}:</span> «{String(d.from ?? '')}» → <span className="text-slate-900">«{String(d.to ?? '')}»</span> · {t('{n}টি রেকর্ড', { n: formatBanglaNumber(Number(d.records ?? 0)) })}
      </p>
    )
  }
  if ((e.action === 'project_create' || e.action === 'field_create' || e.action === 'project_delete' || e.action === 'field_delete') && d.snapshot) {
    const s = d.snapshot as Record<string, unknown>
    const parts = e.action.startsWith('field_')
      ? [s.type && fmt(s.type), s.visibility && fmt(s.visibility), s.key && `key: ${String(s.key)}`]
      : [s.slug && `/${String(s.slug)}`, s.photo_mode && fmt(s.photo_mode), s.is_published === false && t('খসড়া')]
    return <p className="mt-1 text-xs text-slate-600">{parts.filter(Boolean).join(' · ')}</p>
  }
  if (['import_run', 'photo_bulk_run', 'records_export'].includes(e.action)) {
    return (
      <p className="mt-1 text-xs text-slate-600">
        {Object.entries(d)
          .map(([k, v]) => `${IMPORT_KEYS[k] ? t(IMPORT_KEYS[k]) : k}: ${typeof v === 'number' ? formatBanglaNumber(v) : typeof v === 'boolean' ? (v ? t('হ্যাঁ') : t('না')) : String(v)}`)
          .join(' · ')}
      </p>
    )
  }
  return null
}
