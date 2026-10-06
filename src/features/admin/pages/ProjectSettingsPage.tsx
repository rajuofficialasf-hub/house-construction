import { lt, pick, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { getHousingApi, getProjectsApi, HousingApiError, type Project, type ProjectPatch, type ProjectStats } from '@/backend'
import { useToast } from '@/components/useToast'
import { ACCENTS, PROJECT_ICONS, ProjectIcon, projectPath, refreshProjects, type ProjectIconKey } from '@/features/projects/registry'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { friendlyProjectError, photoNameExample, prefixError, slugError } from '../projects/projectRules'
import { publishChecklist } from '../projects/publishChecklist'
import { UnpublishDialog } from '../projects/UnpublishDialog'
import { CoverUpload } from '../projects/CoverUpload'
import { FieldsTab } from '../projects/tabs/FieldsTab'
import { StatsTab } from '../projects/tabs/StatsTab'
import { Badge } from '../ui/Badge'
import { Field } from '../ui/Field'
import { card, inputClass, primaryButton, secondaryButton, selectClass, textareaClass } from '../ui/styles'

type Tab = 'general' | 'fields' | 'stats' | 'photos' | 'display'

/** এই পাতায় বদলানো যায় এমন কলাম (ফিল্ড ও স্ট্যাট কার্ড M-ধাপ ৮-এ) */
const EDITABLE = [
  'name_bn', 'name_en', 'summary_bn', 'summary_en', 'description_bn', 'description_en', 'unit_bn', 'unit_en',
  'slug', 'parent_key', 'file_prefix', 'geo_depth', 'icon', 'accent', 'show_on_home',
  'photo_mode', 'prev_label_bn', 'prev_label_en', 'current_label_bn', 'current_label_en', 'display',
] as const satisfies readonly (keyof Project)[]
type Editable = Pick<Project, (typeof EDITABLE)[number]>

const pickEditable = (p: Project): Editable => Object.fromEntries(EDITABLE.map((k) => [k, p[k]])) as Editable

/** শুধু বদলানো কলাম পাঠানো (অন্য কেউ অন্য কলাম বদলালেও ঝামেলা কম; CONFLICT তো updated_at দিয়েই ধরা হয়) */
function diff(before: Editable, after: Editable): ProjectPatch {
  const out: Record<string, unknown> = {}
  for (const k of EDITABLE) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k]
  return out as ProjectPatch
}

const len = (s: string, max: number) => (s.length > max ? t('সর্বোচ্চ {n} অক্ষর', { n: formatBanglaNumber(max) }) : null)

/**
 * /admin/projects/:key?tab=general|photos|display — প্রকল্পের সেটিংস (পরিকল্পনা M-ধাপ ৭)।
 * সংরক্ষণে updated_at মেলানো হয় (দুই এডমিন একসাথে বদলালে পরেরজন CONFLICT পান); ডাটাবেসের গার্ড (প্রকাশিত প্রকল্পের URL,
 * ছবি থাকা অবস্থায় ছবি-মোড বদল ইত্যাদি) এর বার্তা বাংলায় দেখায়। উপরে প্রকাশ/অপ্রকাশ ও প্রকাশের চেকলিস্ট।
 */
export function ProjectSettingsPage() {
  const { key = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const toast = useToast()
  const [all, setAll] = useState<Project[] | null>(null)
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loadError, setLoadError] = useState<HousingApiError | null>(null)
  const [form, setForm] = useState<Editable | null>(null)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)

  const fetchAll = useCallback(async () => {
    const list = await getProjectsApi().list({ includeDrafts: true })
    const p = list.find((x) => x.key === key)
    const s = p ? await getHousingApi().stats(p.key).catch(() => null) : null
    return { list, p, s }
  }, [key])

  const apply = useCallback((r: { list: Project[]; p: Project | undefined; s: ProjectStats | null }) => {
    setAll(r.list)
    setStats(r.s)
    setForm(r.p ? pickEditable(r.p) : null)
    setConflict(false)
    setServerError(null)
  }, [])

  useEffect(() => {
    let alive = true
    fetchAll()
      .then((r) => alive && apply(r))
      .catch((err: unknown) => alive && setLoadError(HousingApiError.from(err)))
    return () => {
      alive = false
    }
  }, [fetchAll, apply])

  const reload = async () => apply(await fetchAll())

  const project = useMemo(() => all?.find((p) => p.key === key), [all, key])
  useDocumentTitle(project ? t('{name} — সেটিংস', { name: lt(project, 'name') }) : t('প্রকল্পের সেটিংস'))

  if (loadError) {
    return (
      <section className="px-4 py-8 sm:px-6">
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError.message}
        </p>
      </section>
    )
  }
  if (!all) {
    return (
      <section className="px-4 py-8 sm:px-6" aria-busy="true">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
      </section>
    )
  }
  if (!project || !form) return <NotFoundPage />

  const allowed: readonly Tab[] = project.is_group ? ['general', 'stats'] : ['general', 'fields', 'stats', 'photos', 'display']
  const tab: Tab = allowed.find((x) => x === sp.get('tab')) ?? 'general'
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const patch = diff(pickEditable(project), form)
  const dirty = Object.keys(patch).length > 0
  const groups = all.filter((p) => p.is_group && p.key !== project.key)
  const categoryFields = project.fields.filter((f) => f.type === 'category' && f.visibility === 'public' && f.is_active)
  const records = stats?.total ?? 0
  const check = publishChecklist({ ...project, ...form }, all, stats)

  const errors = {
    name_bn: !form.name_bn.trim() ? t('বাংলা নাম দিন') : len(form.name_bn, 120),
    name_en: !form.name_en.trim() ? t('ইংরেজি নাম দিন') : len(form.name_en, 120),
    summary_bn: len(form.summary_bn, 300),
    summary_en: len(form.summary_en, 300),
    description_bn: len(form.description_bn, 2000),
    description_en: len(form.description_en, 2000),
    unit_bn: len(form.unit_bn, 40),
    unit_en: len(form.unit_en, 40),
    slug: slugError(form.slug, all, project.key),
    file_prefix: project.is_group || form.file_prefix === null ? null : prefixError(form.file_prefix, all, project.key),
    prev_label_bn: len(form.prev_label_bn, 60),
    prev_label_en: len(form.prev_label_en, 60),
    current_label_bn: len(form.current_label_bn, 60),
    current_label_en: len(form.current_label_en, 60),
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!dirty || hasErrors || busy) return
    setBusy(true)
    setServerError(null)
    try {
      await getProjectsApi().update(project.key, patch, { expectedUpdatedAt: project.updated_at })
      await refreshProjects({ includeDrafts: true })
      await reload()
      toast.success(t('সংরক্ষিত'))
    } catch (err) {
      const ex = HousingApiError.from(err)
      if (ex.code === 'CONFLICT') setConflict(true)
      else setServerError(friendlyProjectError(ex))
    } finally {
      setBusy(false)
    }
  }

  const setPublished = async (value: boolean) => {
    setBusy(true)
    setServerError(null)
    try {
      await getProjectsApi().update(project.key, { is_published: value }, { expectedUpdatedAt: project.updated_at })
      await refreshProjects({ includeDrafts: true })
      await reload()
      setConfirmUnpublish(false)
      toast.success(value ? t('প্রকাশ করা হয়েছে') : t('অপ্রকাশ করা হয়েছে'))
    } catch (err) {
      const ex = HousingApiError.from(err)
      if (ex.code === 'CONFLICT') setConflict(true)
      else setServerError(friendlyProjectError(ex))
      setConfirmUnpublish(false)
    } finally {
      setBusy(false)
    }
  }
  const askUnpublish = () => {
    const publishedChildren = all.some((c) => c.parent_key === project.key && c.is_published)
    if (records > 0 || publishedChildren) setConfirmUnpublish(true)
    else void setPublished(false)
  }

  const TAB_LABELS: Record<Tab, string> = { general: t('সাধারণ'), fields: t('ফিল্ড'), stats: t('পরিসংখ্যান'), photos: t('ছবি'), display: t('প্রদর্শন') }
  const tabs = allowed.map((id) => ({ id, label: TAB_LABELS[id] }))
  /** ফিল্ড/পরিসংখ্যান ট্যাব নিজে সংরক্ষণ করে — তার পরে সাইটের রেজিস্ট্রি ও এই পাতা নতুন করে */
  const changed = async () => {
    await refreshProjects({ includeDrafts: true })
    await reload()
  }

  return (
    <section className="px-4 py-8 sm:px-6">
      <p className="text-sm text-slate-500">
        <Link to="/admin/projects" className="hover:text-brand-700">
          {t('প্রকল্পসমূহ')}
        </Link>{' '}
        / {lt(project, 'name')}
      </p>

      {/* ---------- শিরোনাম, অবস্থা, প্রকাশ ---------- */}
      <div className={`${card} mt-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{lt(project, 'name')}</h1>
              {project.is_published ? <Badge tone="green">{t('প্রকাশিত')}</Badge> : <Badge tone="amber">{t('খসড়া')}</Badge>}
              {project.is_group && <Badge tone="blue">{t('গ্রুপ')}</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-mono">{projectPath(project, all)}</span> · key <span className="font-mono">{project.key}</span> ·{' '}
              {t('{n}টি রেকর্ড', { n: formatBanglaNumber(records) })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={projectPath(project, all)} className={secondaryButton}>
              {project.is_published ? t('পাবলিক পেইজ') : t('প্রিভিউ')}
            </Link>
            {project.is_published ? (
              <button type="button" className={secondaryButton} disabled={busy || dirty} onClick={askUnpublish} title={dirty ? t('আগে পরিবর্তন সংরক্ষণ করুন') : undefined}>
                {t('অপ্রকাশ করুন')}
              </button>
            ) : (
              <button
                type="button"
                className={primaryButton}
                disabled={busy || dirty || check.blocking.length > 0}
                onClick={() => void setPublished(true)}
                title={dirty ? t('আগে পরিবর্তন সংরক্ষণ করুন') : check.blocking.join(' · ') || undefined}
              >
                {t('প্রকাশ করুন')}
              </button>
            )}
          </div>
        </div>
        {(check.blocking.length > 0 || check.warnings.length > 0) && (
          <div className="mt-4 space-y-1 text-sm">
            {!project.is_published &&
              check.blocking.map((b) => (
                <p key={b} className="text-red-700">
                  ✕ {b}
                </p>
              ))}
            {check.warnings.map((w) => (
              <p key={w} className="text-amber-800">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {conflict && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{t('অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন। আপনার পরিবর্তন সংরক্ষিত হয়নি — নতুন অবস্থা এনে আবার করুন।')}</span>
          <button type="button" className={secondaryButton} onClick={() => void reload()}>
            {t('নতুন অবস্থা আনুন')}
          </button>
        </div>
      )}

      {/* ---------- ট্যাব ---------- */}
      <div role="tablist" aria-label={t('সেটিংসের অংশ')} className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setSp((prev) => {
              const n = new URLSearchParams(prev)
              n.set('tab', x.id)
              return n
            }, { replace: true })}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${tab === x.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-600 hover:text-brand-700'}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'fields' && (
        <div className="mt-5">
          <FieldsTab key={project.updated_at + project.fields.length} project={project} blocked={dirty} onChanged={changed} />
        </div>
      )}
      {tab === 'stats' && (
        <div className="mt-5 max-w-5xl">
          <StatsTab key={project.updated_at} project={project} stats={stats} blocked={dirty} onChanged={changed} />
        </div>
      )}
      {tab !== 'fields' && tab !== 'stats' && (
      <form onSubmit={(e) => void save(e)} noValidate className="mt-5 max-w-3xl space-y-5">
        {tab === 'general' && (
          <>
            <div className={`${card} space-y-4`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('বাংলা নাম')} required error={errors.name_bn}>
                  {(p) => <input {...p} className={inputClass} value={form.name_bn} onChange={(e) => set('name_bn', e.target.value)} maxLength={120} />}
                </Field>
                <Field label={t('ইংরেজি নাম')} required error={errors.name_en}>
                  {(p) => <input {...p} className={inputClass} value={form.name_en} onChange={(e) => set('name_en', e.target.value)} maxLength={120} />}
                </Field>
                <Field label={t('ছোট বর্ণনা (বাংলা)')} help={t('হোমের কার্ডে')} error={errors.summary_bn}>
                  {(p) => <textarea {...p} rows={2} className={textareaClass} value={form.summary_bn} onChange={(e) => set('summary_bn', e.target.value)} maxLength={300} />}
                </Field>
                <Field label={t('ছোট বর্ণনা (ইংরেজি)')} error={errors.summary_en}>
                  {(p) => <textarea {...p} rows={2} className={textareaClass} value={form.summary_en} onChange={(e) => set('summary_en', e.target.value)} maxLength={300} />}
                </Field>
                <Field label={t('পরিচিতি (বাংলা)')} help={t('প্রকল্পের পেইজে, নামের নিচে')} error={errors.description_bn}>
                  {(p) => <textarea {...p} rows={4} className={textareaClass} value={form.description_bn} onChange={(e) => set('description_bn', e.target.value)} maxLength={2000} />}
                </Field>
                <Field label={t('পরিচিতি (ইংরেজি)')} error={errors.description_en}>
                  {(p) => <textarea {...p} rows={4} className={textareaClass} value={form.description_en} onChange={(e) => set('description_en', e.target.value)} maxLength={2000} />}
                </Field>
                <Field label={t('একক শব্দ (বাংলা)')} help={t('যেমন "ঘর", "উপকারভোগী" — মানচিত্র ও পরিসংখ্যানে')} error={errors.unit_bn}>
                  {(p) => <input {...p} className={inputClass} value={form.unit_bn} onChange={(e) => set('unit_bn', e.target.value)} maxLength={40} />}
                </Field>
                <Field label={t('একক শব্দ (ইংরেজি)')} error={errors.unit_en}>
                  {(p) => <input {...p} className={inputClass} value={form.unit_en} onChange={(e) => set('unit_en', e.target.value)} maxLength={40} />}
                </Field>
              </div>
            </div>

            <div className={`${card} space-y-4`}>
              <Field
                label={t('URL অংশ (slug)')}
                required
                error={errors.slug}
                help={project.is_published ? t('প্রকাশিত প্রকল্পের URL বদলানো যায় না (শেয়ার করা লিংক ভাঙবে) — আগে অপ্রকাশ করতে হবে।') : t('পেইজের ঠিকানা: {url}', { url: projectPath({ ...project, slug: form.slug, parent_key: form.parent_key }, all) })}
              >
                {(p) => <input {...p} className={`${inputClass} font-mono`} value={form.slug} disabled={project.is_published} onChange={(e) => set('slug', e.target.value.toLowerCase())} maxLength={60} />}
              </Field>
              {!project.is_group && (
                <Field label={t('অবস্থান')} help={project.is_published ? t('প্রকাশিত প্রকল্পের অবস্থান বদলানো যায় না।') : undefined}>
                  {(p) => (
                    <select {...p} className={selectClass} value={form.parent_key ?? ''} disabled={project.is_published} onChange={(e) => set('parent_key', e.target.value || null)}>
                      <option value="">{t('একক প্রকল্প (কোনো গ্রুপে নয়)')}</option>
                      {groups.map((g) => (
                        <option key={g.key} value={g.key}>
                          {t('উপ-প্রকল্প: {name}', { name: lt(g, 'name') })}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              {!project.is_group && form.file_prefix !== null && (
                <Field label={t('ছবির ফাইল-প্রিফিক্স')} error={errors.file_prefix} help={t('উদাহরণ (সিরিয়াল ১২): {example}', { example: photoNameExample(form.file_prefix, form.photo_mode) })}>
                  {(p) => <input {...p} className={`${inputClass} font-mono`} value={form.file_prefix ?? ''} onChange={(e) => set('file_prefix', e.target.value.toLowerCase())} maxLength={16} />}
                </Field>
              )}
              {!project.is_group && (
                <Field label={t('ঠিকানা কোন স্তর পর্যন্ত')}>
                  {(p) => (
                    <select {...p} className={selectClass} value={form.geo_depth} onChange={(e) => set('geo_depth', e.target.value as Project['geo_depth'])}>
                      <option value="upazila">{t('উপজেলা পর্যন্ত')}</option>
                      <option value="union">{t('ইউনিয়ন পর্যন্ত (ইউনিয়ন আবশ্যক নয়)')}</option>
                    </select>
                  )}
                </Field>
              )}
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.show_on_home} onChange={(e) => set('show_on_home', e.target.checked)} />
                {t('হোম পেইজে কার্ড দেখান')}
              </label>
            </div>

            <div className={`${card} space-y-4`}>
              <p className="text-sm font-medium text-slate-700">{t('আইকন ও রং')}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('আইকন')}>
                {(Object.keys(PROJECT_ICONS) as ProjectIconKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={form.icon === k}
                    aria-label={pick(PROJECT_ICONS[k].label_bn, PROJECT_ICONS[k].label_en)}
                    title={pick(PROJECT_ICONS[k].label_bn, PROJECT_ICONS[k].label_en)}
                    onClick={() => set('icon', k)}
                    className={`flex h-14 w-14 items-center justify-center rounded-xl border ${form.icon === k ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-200 text-slate-600 hover:border-brand-300'}`}
                  >
                    <ProjectIcon icon={k} className="h-9 w-9" />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('রং')}>
                {(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={form.accent === k}
                    onClick={() => set('accent', k)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${form.accent === k ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200'}`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-md ${ACCENTS[k].soft}`}>
                      <ProjectIcon icon={form.icon} className="h-5 w-5" />
                    </span>
                    {pick(ACCENTS[k].label_bn, ACCENTS[k].label_en)}
                  </button>
                ))}
              </div>
            </div>

            <CoverUpload project={project} blocked={dirty} onChanged={changed} />
          </>
        )}

        {tab === 'photos' && (
          <div className={`${card} space-y-4`}>
            <Field label={t('ছবি মোড')} help={t('ছবিসহ রেকর্ড থাকলে "শুধু পরের ছবি" বা "ছবি নেই" করা যায় না — ডাটাবেস সংখ্যাসহ জানাবে।')}>
              {(p) => (
                <select {...p} className={selectClass} value={form.photo_mode} onChange={(e) => set('photo_mode', e.target.value as Project['photo_mode'])}>
                  <option value="before_after">{t('আগে-পরে (দুটি ছবি, তুলনাসহ)')}</option>
                  <option value="after_only">{t('শুধু পরের ছবি (একটি)')}</option>
                  <option value="none">{t('ছবি নেই')}</option>
                </select>
              )}
            </Field>
            {form.photo_mode === 'before_after' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('পূর্বের ছবির লেবেল (বাংলা)')} error={errors.prev_label_bn}>
                  {(p) => <input {...p} className={inputClass} value={form.prev_label_bn} onChange={(e) => set('prev_label_bn', e.target.value)} maxLength={60} placeholder={t('যেমন পূর্বের ঘর')} />}
                </Field>
                <Field label={t('পূর্বের ছবির লেবেল (ইংরেজি)')} error={errors.prev_label_en}>
                  {(p) => <input {...p} className={inputClass} value={form.prev_label_en} onChange={(e) => set('prev_label_en', e.target.value)} maxLength={60} placeholder="Before" />}
                </Field>
              </div>
            )}
            {form.photo_mode !== 'none' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('বর্তমান ছবির লেবেল (বাংলা)')} error={errors.current_label_bn}>
                  {(p) => <input {...p} className={inputClass} value={form.current_label_bn} onChange={(e) => set('current_label_bn', e.target.value)} maxLength={60} placeholder={t('যেমন উপকরণসহ ছবি')} />}
                </Field>
                <Field label={t('বর্তমান ছবির লেবেল (ইংরেজি)')} error={errors.current_label_en}>
                  {(p) => <input {...p} className={inputClass} value={form.current_label_en} onChange={(e) => set('current_label_en', e.target.value)} maxLength={60} placeholder="Photo with the item" />}
                </Field>
              </div>
            )}
          </div>
        )}

        {tab === 'display' && (
          <div className={`${card} space-y-4`}>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.display.show_map !== false} onChange={(e) => set('display', { ...form.display, show_map: e.target.checked })} />
              {t('তালিকা পেইজে মানচিত্র দেখান')}
            </label>
            <Field label={t('টেবিলে ঠিকানার কলাম')}>
              {(p) => (
                <select {...p} className={selectClass} value={form.display.geo_columns ?? 'split'} onChange={(e) => set('display', { ...form.display, geo_columns: e.target.value as 'split' | 'merged' })}>
                  <option value="split">{t('আলাদা (বিভাগ, জেলা, উপজেলা আলাদা কলামে)')}</option>
                  <option value="merged">{t('একসাথে (এক কলামে)')}</option>
                </select>
              )}
            </Field>
            <Field label={t('বিতরণ চার্টের ফিল্ড')} help={categoryFields.length ? t('যেমন "ক্যাটাগরি অনুযায়ী বিতরণ: গরু ৪৫ জন, ৳ ১৫,৭৫,০০০"') : t('এই প্রকল্পে কোনো ক্যাটাগরি ফিল্ড নেই — "ফিল্ড" ট্যাবে যোগ করুন।')}>
              {(p) => (
                <select
                  {...p}
                  className={selectClass}
                  value={form.display.breakdown_field ?? ''}
                  disabled={!categoryFields.length}
                  onChange={(e) => {
                    const v = e.target.value
                    const next = { ...form.display }
                    if (v) next.breakdown_field = v
                    else delete next.breakdown_field
                    set('display', next)
                  }}
                >
                  <option value="">{t('— চার্ট নেই —')}</option>
                  {categoryFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {lt(f, 'label')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        )}

        {serverError && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {serverError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={busy || !dirty || hasErrors}>
            {busy ? t('সংরক্ষণ হচ্ছে…') : t('সংরক্ষণ করুন')}
          </button>
          <button type="button" className={secondaryButton} disabled={busy || !dirty} onClick={() => setForm(pickEditable(project))}>
            {t('পরিবর্তন বাতিল')}
          </button>
          {dirty && <span className="text-sm text-amber-800">{t('সংরক্ষণ হয়নি এমন পরিবর্তন আছে')}</span>}
        </div>
      </form>
      )}

      {confirmUnpublish && (
        <UnpublishDialog project={project} projects={all} records={records} busy={busy} onCancel={() => setConfirmUnpublish(false)} onConfirm={() => void setPublished(false)} />
      )}
    </section>
  )
}
