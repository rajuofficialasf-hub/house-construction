import { lt, pick, t } from '@/i18n'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { getProjectsApi, HousingApiError, type GeoDepth, type PhotoMode, type Project } from '@/backend'
import { useToast } from '@/components/useToast'
import { ACCENTS, PROJECT_ICONS, ProjectIcon, refreshProjects, type ProjectIconKey } from '@/features/projects/registry'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { keyError, keyFromSlug, photoNameExample, prefixError, slugError, slugify, suggestPrefix, friendlyProjectError } from '../projects/projectRules'
import { PROJECT_TEMPLATES, buildProjectInput, templateOf, type TemplateKey } from '../projects/projectTemplates'
import { Field } from '../ui/Field'
import { Step } from '../ui/Step'
import { inputClass, primaryButton, secondaryButton, selectClass } from '../ui/styles'

type Location = 'single' | 'child' | 'group'

const PHOTO_MODES: { value: PhotoMode; label: string }[] = [
  { value: 'before_after', label: 'আগে-পরে (দুটি ছবি, তুলনাসহ)' },
  { value: 'after_only', label: 'শুধু পরের ছবি (একটি)' },
  { value: 'none', label: 'ছবি নেই' },
]

/**
 * /admin/projects/new — নতুন প্রকল্প উইজার্ড (পরিকল্পনা M-ধাপ ৭): টেমপ্লেট → অবস্থান (একক / গ্রুপের উপ-প্রকল্প / নতুন গ্রুপ)
 * → নাম (দুই ভাষা) → URL (ইংরেজি নাম থেকে, সাথে সাথে যাচাই ও প্রিভিউ) → key (শুধু দেখার) → ফাইল-প্রিফিক্স (উদাহরণসহ)
 * → ছবি মোড, ঠিকানার স্তর, আইকন, রং → "খসড়া হিসেবে তৈরি করুন" (project_create — প্রকল্প + টেমপ্লেটের ফিল্ড একসাথে)।
 */
export function ProjectWizardPage() {
  useDocumentTitle(t('নতুন প্রকল্প'))
  const navigate = useNavigate()
  const toast = useToast()
  const [existing, setExisting] = useState<Project[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [template, setTemplate] = useState<TemplateKey>('grant')
  const [location, setLocation] = useState<Location>('single')
  const [parentKey, setParentKey] = useState('')
  const [nameBn, setNameBn] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [prefixTouched, setPrefixTouched] = useState(false)
  const tpl = templateOf(template)
  const [photoMode, setPhotoMode] = useState<PhotoMode>(tpl.photo_mode)
  const [geoDepth, setGeoDepth] = useState<GeoDepth>(tpl.geo_depth)
  const [icon, setIcon] = useState(tpl.icon)
  const [accent, setAccent] = useState(tpl.accent)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // খসড়াসহ সব প্রকল্প (key/slug/প্রিফিক্সের অনন্যতা যাচাই, গ্রুপের তালিকা) — সবসময় তাজা
  useEffect(() => {
    let alive = true
    getProjectsApi()
      .list({ includeDrafts: true })
      .then((list) => alive && setExisting(list))
      .catch((err: unknown) => alive && setLoadError(HousingApiError.from(err).message))
    return () => {
      alive = false
    }
  }, [])

  const projects = useMemo(() => existing ?? [], [existing])
  const groups = projects.filter((p) => p.is_group)
  const isGroup = location === 'group'

  /** টেমপ্লেটের শুরুর মান বসানো (অবস্থান না ছুঁয়ে) */
  const applyTemplate = (k: TemplateKey) => {
    const next = templateOf(k)
    setTemplate(k)
    setPhotoMode(next.photo_mode)
    setGeoDepth(next.geo_depth)
    setIcon(next.icon)
    setAccent(next.accent)
  }
  // "গ্রুপ" টেমপ্লেট ⇔ "নতুন প্রকল্প-গ্রুপ" অবস্থান — দুটো সবসময় একসাথে
  const chooseTemplate = (k: TemplateKey) => {
    applyTemplate(k)
    if (templateOf(k).is_group) setLocation('group')
    else if (location === 'group') setLocation('single')
  }
  const chooseLocation = (l: Location) => {
    setLocation(l)
    if (l === 'group' && template !== 'group') applyTemplate('group')
    if (l !== 'group' && template === 'group') applyTemplate('grant')
  }

  // ইংরেজি নাম থেকে স্বয়ংক্রিয় slug ও প্রিফিক্স (নিজে বদলালে আর বদলায় না)
  const effectiveSlug = slugTouched ? slug : slugify(nameEn)
  const key = keyFromSlug(effectiveSlug)
  const effectivePrefix = prefixTouched ? prefix : suggestPrefix(effectiveSlug)
  const parent = groups.find((g) => g.key === parentKey)
  const urlPreview = location === 'child' && parent ? `/${parent.slug}/${effectiveSlug || '…'}` : `/${effectiveSlug || '…'}`

  const errors = {
    parent: location === 'child' && !parent ? t('গ্রুপ বাছাই করুন') : null,
    nameBn: !nameBn.trim() ? t('বাংলা নাম দিন') : nameBn.trim().length > 120 ? t('সর্বোচ্চ ১২০ অক্ষর') : null,
    nameEn: !nameEn.trim() ? t('ইংরেজি নাম দিন (URL এখান থেকে তৈরি হয়)') : nameEn.trim().length > 120 ? t('সর্বোচ্চ ১২০ অক্ষর') : null,
    slug: slugError(effectiveSlug, projects),
    key: effectiveSlug ? keyError(key, projects) : null,
    prefix: isGroup ? null : prefixError(effectivePrefix, projects),
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const show = (e: string | null) => (submitted ? e : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (hasErrors || !existing || busy) return
    setBusy(true)
    const { project: input, fields } = buildProjectInput({
      template,
      location,
      parentKey: location === 'child' ? parentKey : null,
      key,
      slug: effectiveSlug,
      name_bn: nameBn,
      name_en: nameEn,
      file_prefix: effectivePrefix,
      photo_mode: photoMode,
      geo_depth: geoDepth,
      icon,
      accent,
    })
    try {
      const created = await getProjectsApi().create(input, fields)
      await refreshProjects({ includeDrafts: true })
      toast.success(t('«{name}» খসড়া হিসেবে তৈরি হয়েছে', { name: lt(created, 'name') }))
      navigate(`/admin/projects/${encodeURIComponent(created.key)}`)
    } catch (err) {
      setServerError(friendlyProjectError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="px-4 py-8 sm:px-6">
      <p className="text-sm text-slate-500">
        <Link to="/admin/projects" className="hover:text-brand-700">
          {t('প্রকল্পসমূহ')}
        </Link>{' '}
        / {t('নতুন প্রকল্প')}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{t('নতুন প্রকল্প')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('খসড়া হিসেবে তৈরি হবে — প্রকাশ না করা পর্যন্ত দর্শকেরা দেখতে পান না। পরে সব বদলানো যাবে (key ছাড়া)।')}</p>
      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      )}

      <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 max-w-3xl space-y-5">
        <Step n={1} title={t('টেমপ্লেট')} hint={t('শুধু শুরুর সেটিং — তৈরির পর ফিল্ড, কার্ড সব বদলানো যায়')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROJECT_TEMPLATES.map((x) => (
              <label key={x.key} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${template === x.key ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-brand-300'}`}>
                <input type="radio" name="tpl" className="mt-1 h-4 w-4 accent-brand-700" checked={template === x.key} onChange={() => chooseTemplate(x.key)} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{pick(x.label_bn, x.label_en)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{pick(x.hint_bn, x.hint_en)}</span>
                </span>
              </label>
            ))}
          </div>
        </Step>

        <Step n={2} title={t('অবস্থান')}>
          <div className="grid gap-2">
            {(
              [
                ['single', t('একক প্রকল্প'), t('নিজের পেইজ, যেমন /self-reliance')],
                ['child', t('কোনো গ্রুপের উপ-প্রকল্প'), t('যেমন ঘর নির্মাণের ভেতরে "ঘর মেরামত" — /housing/…')],
                ['group', t('নতুন প্রকল্প-গ্রুপ'), t('কয়েকটি প্রকল্পের ছাতা; নিজের রেকর্ড থাকে না')],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${location === v ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                <input type="radio" name="loc" className="mt-1 h-4 w-4 accent-brand-700" checked={location === v} onChange={() => chooseLocation(v)} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {location === 'child' && (
            <Field label={t('গ্রুপ')} required error={show(errors.parent)}>
              {(p) => (
                <select {...p} className={selectClass} value={parentKey} onChange={(e) => setParentKey(e.target.value)}>
                  <option value="">{t('— বাছাই করুন —')}</option>
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {lt(g, 'name')} (/{g.slug})
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </Step>

        <Step n={3} title={t('নাম')} hint={t('দুই ভাষাতেই আবশ্যক — ইংরেজি মোডে ইংরেজি নাম দেখায়')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('বাংলা নাম')} required error={show(errors.nameBn)}>
              {(p) => <input {...p} className={inputClass} value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder={t('যেমন স্বাবলম্বী প্রকল্প')} maxLength={120} />}
            </Field>
            <Field label={t('ইংরেজি নাম')} required error={show(errors.nameEn)}>
              {(p) => <input {...p} className={inputClass} value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Self-Reliance Project" maxLength={120} />}
            </Field>
          </div>
        </Step>

        <Step n={4} title={t('URL ও key')}>
          <Field
            label={t('URL অংশ (slug)')}
            required
            error={effectiveSlug || submitted ? errors.slug : null}
            help={t('ইংরেজি নাম থেকে নিজে তৈরি হয়; চাইলে ছোট করুন। প্রকাশের পর আর বদলানো যায় না (শেয়ার করা লিংক ভাঙবে)।')}
          >
            {(p) => (
              <input
                {...p}
                className={`${inputClass} font-mono`}
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(e.target.value.toLowerCase())
                }}
                placeholder="self-reliance"
                maxLength={60}
              />
            )}
          </Field>
          <p className="text-sm text-slate-600">
            {t('পেইজের ঠিকানা:')} <span className="font-mono font-semibold text-slate-900">{urlPreview}</span>
          </p>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">{t('স্থায়ী key:')}</span> <span className="font-mono font-semibold text-slate-900">{key || '—'}</span>{' '}
            <span className="text-xs text-amber-800">{t('(পরে বদলানো যাবে না — সিরিয়াল, ছবির পাথ ও লগ এর ওপর নির্ভর করে)')}</span>
            {errors.key && (effectiveSlug || submitted) && (
              <p role="alert" className="mt-1 text-xs font-medium text-red-700">
                {errors.key}
              </p>
            )}
          </div>
        </Step>

        {!isGroup && (
          <Step n={5} title={t('ছবি ও ঠিকানা')}>
            <Field label={t('ছবি মোড')}>
              {(p) => (
                <select {...p} className={selectClass} value={photoMode} onChange={(e) => setPhotoMode(e.target.value as PhotoMode)}>
                  {PHOTO_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {t(m.label)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label={t('ছবির ফাইল-প্রিফিক্স')}
              required
              error={submitted || prefixTouched ? errors.prefix : null}
              help={t('বাল্ক ছবি আপলোডে ফাইলনাম চেনার জন্য। উদাহরণ (সিরিয়াল ১২): {example}', { example: photoNameExample(effectivePrefix, photoMode) })}
            >
              {(p) => (
                <input
                  {...p}
                  className={`${inputClass} font-mono`}
                  value={effectivePrefix}
                  onChange={(e) => {
                    setPrefixTouched(true)
                    setPrefix(e.target.value.toLowerCase())
                  }}
                  maxLength={16}
                />
              )}
            </Field>
            <Field label={t('ঠিকানা কোন স্তর পর্যন্ত')}>
              {(p) => (
                <select {...p} className={selectClass} value={geoDepth} onChange={(e) => setGeoDepth(e.target.value as GeoDepth)}>
                  <option value="upazila">{t('উপজেলা পর্যন্ত')}</option>
                  <option value="union">{t('ইউনিয়ন পর্যন্ত (ইউনিয়ন আবশ্যক নয়)')}</option>
                </select>
              )}
            </Field>
          </Step>
        )}

        <Step n={isGroup ? 5 : 6} title={t('আইকন ও রং')}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('আইকন')}>
            {(Object.keys(PROJECT_ICONS) as ProjectIconKey[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={icon === k}
                title={pick(PROJECT_ICONS[k].label_bn, PROJECT_ICONS[k].label_en)}
                aria-label={pick(PROJECT_ICONS[k].label_bn, PROJECT_ICONS[k].label_en)}
                onClick={() => setIcon(k)}
                className={`flex h-14 w-14 items-center justify-center rounded-xl border ${icon === k ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-200 text-slate-600 hover:border-brand-300'}`}
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
                aria-checked={accent === k}
                onClick={() => setAccent(k)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${accent === k ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200'}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${ACCENTS[k].soft}`}>
                  <ProjectIcon icon={icon} className="h-5 w-5" />
                </span>
                {pick(ACCENTS[k].label_bn, ACCENTS[k].label_en)}
              </button>
            ))}
          </div>
        </Step>

        {(serverError || (submitted && hasErrors)) && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {serverError ?? t('উপরের লাল চিহ্নিত ঘরগুলো ঠিক করুন।')}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={primaryButton} disabled={busy || !existing}>
            {busy ? t('তৈরি হচ্ছে…') : t('খসড়া হিসেবে তৈরি করুন')}
          </button>
          <Link to="/admin/projects" className={secondaryButton}>
            {t('বাতিল')}
          </Link>
        </div>
      </form>
    </section>
  )
}
