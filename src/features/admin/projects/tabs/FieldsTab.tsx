import { lt, t } from '@/i18n'
import { useState } from 'react'
import { getProjectsApi, HousingApiError, type CoreFieldKey, type CoreFieldsConfig, type Project, type ProjectField } from '@/backend'
import { useToast } from '@/components/useToast'
import { ALWAYS_REQUIRED, FIELD_VALUE_SPECS, SYSTEM_FIELDS } from '@/features/projects/fields'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { useAuth } from '@/features/housing/hooks/useAuth'
import { pick } from '@/i18n'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { Badge } from '../../ui/Badge'
import { card, inputClass, primaryButton, secondaryButton, selectClass, smallButton } from '../../ui/styles'
import { FieldEditorDrawer } from '../FieldEditorDrawer'
import { FieldPreview } from '../FieldPreview'
import { MAX_FIELDS } from '../fieldRules'
import { friendlyProjectError } from '../projectRules'

type Status = 'required' | 'optional' | 'off'

/** সিস্টেম ফিল্ডের অবস্থা core_fields থেকে */
function statusOf(core: CoreFieldsConfig, key: CoreFieldKey, defRequired: boolean): Status {
  const c = core[key]
  if (c?.enabled === false) return 'off'
  return (c?.required ?? defRequired) ? 'required' : 'optional'
}

/**
 * "ফিল্ড" ট্যাব (পরিকল্পনা M-ধাপ ৮): উপরে সিস্টেম ফিল্ড 🔒 (শুধু লেবেল; সাল/নাম/বিভাগ/জেলা/উপজেলা বাদে আবশ্যক/ঐচ্ছিক/বন্ধ —
 * core_fields এ, প্রকল্পের updated_at মিলিয়ে); তারপর কাস্টম ফিল্ড (↑↓ ক্রম, ব্যাজ, সম্পাদনা, আর্কাইভ/ফেরত, মোছা —
 * মূল এডমিন, ডাটা থাকলে আর্কাইভের প্রস্তাব); পাশে প্রিভিউ।
 */
export function FieldsTab({ project, blocked, onChanged }: { project: Project; blocked: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const auth = useAuth()
  const mainAdmin = auth.user?.role === 'main_admin'
  const [core, setCore] = useState<CoreFieldsConfig>(() => structuredClone(project.core_fields ?? {}))
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<{ field: ProjectField | null; usage: number | null } | null>(null)
  const [deleting, setDeleting] = useState<{ field: ProjectField; usage: number } | null>(null)

  const coreDirty = JSON.stringify(core) !== JSON.stringify(project.core_fields ?? {})
  const fields = [...project.fields].sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))
  const systemShown = SYSTEM_FIELDS.filter((f) => f.key !== 'union_name' || project.geo_depth === 'union')

  const setCoreField = (key: CoreFieldKey, patch: Partial<NonNullable<CoreFieldsConfig[CoreFieldKey]>>) =>
    setCore((c) => {
      const next = { ...(c[key] ?? {}), ...patch }
      for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined || next[k] === '') delete next[k]
      const out = { ...c }
      if (Object.keys(next).length) out[key] = next
      else delete out[key]
      return out
    })

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true)
    try {
      await fn()
      await onChanged()
      toast.success(okMsg)
    } catch (err) {
      const e = HousingApiError.from(err)
      toast.error(e.code === 'CONFLICT' ? t('অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা আবার আনা হলো, আবার চেষ্টা করুন') : friendlyProjectError(e))
      if (e.code === 'CONFLICT') await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const saveCore = () => run(() => getProjectsApi().update(project.key, { core_fields: core }, { expectedUpdatedAt: project.updated_at }), t('সংরক্ষিত'))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const ids = fields.map((f) => f.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => getProjectsApi().reorderFields(project.key, ids), t('ক্রম বদলানো হয়েছে'))
  }

  const usageOf = async (f: ProjectField) => (await getProjectsApi().fieldUsage(project.key, f.key)).count

  const openEditor = async (f: ProjectField | null) => {
    if (!f) return setEditor({ field: null, usage: 0 })
    setEditor({ field: f, usage: null })
    try {
      const n = await usageOf(f)
      setEditor((cur) => (cur && cur.field?.id === f.id ? { field: f, usage: n } : cur))
    } catch {
      setEditor((cur) => (cur && cur.field?.id === f.id ? { field: f, usage: 0 } : cur))
    }
  }

  const askDelete = async (f: ProjectField) => {
    setBusy(true)
    try {
      setDeleting({ field: f, usage: await usageOf(f) })
    } catch (err) {
      toast.error(friendlyProjectError(err))
    } finally {
      setBusy(false)
    }
  }

  if (project.is_group) {
    return <p className={`${card} text-sm text-slate-600`}>{t('প্রকল্প-গ্রুপে ফিল্ড থাকে না — ফিল্ড যোগ করুন উপ-প্রকল্পে।')}</p>
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        {blocked && (
          <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t('অন্য ট্যাবে সংরক্ষণ হয়নি এমন পরিবর্তন আছে — আগে সেগুলো সংরক্ষণ বা বাতিল করুন।')}
          </p>
        )}

        {/* ---------- সিস্টেম ফিল্ড ---------- */}
        <section className={card}>
          <h2 className="text-base font-bold text-slate-900">{t('সিস্টেম ফিল্ড')} 🔒</h2>
          <p className="mt-1 text-sm text-slate-500">{t('সব প্রকল্পে থাকে; শুধু লেবেল বদলানো যায়। সাল, নাম ও বিভাগ-জেলা-উপজেলা সবসময় আবশ্যক।')}</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {systemShown.map((f) => {
              const c = core[f.key] ?? {}
              const fixed = ALWAYS_REQUIRED.includes(f.key)
              const status = statusOf(core, f.key, f.required)
              return (
                <li key={f.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_10rem] sm:items-center">
                  <input className={inputClass} value={c.label_bn ?? ''} placeholder={f.label_bn} aria-label={t('{name} — বাংলা লেবেল', { name: f.label_bn })} onChange={(e) => setCoreField(f.key, { label_bn: e.target.value })} maxLength={120} />
                  <input className={inputClass} value={c.label_en ?? ''} placeholder={f.label_en} aria-label={t('{name} — ইংরেজি লেবেল', { name: f.label_bn })} onChange={(e) => setCoreField(f.key, { label_en: e.target.value })} maxLength={120} />
                  {fixed ? (
                    <span className="text-sm text-slate-500">🔒 {t('আবশ্যক')}</span>
                  ) : (
                    <select
                      className={selectClass}
                      value={status}
                      aria-label={t('{name} — অবস্থা', { name: f.label_bn })}
                      onChange={(e) => {
                        const v = e.target.value as Status
                        setCoreField(f.key, { required: v === 'required' ? true : v === 'optional' ? false : undefined, enabled: v === 'off' ? false : undefined })
                      }}
                    >
                      <option value="required">{t('আবশ্যক')}</option>
                      <option value="optional">{t('ঐচ্ছিক')}</option>
                      {f.key !== 'union_name' && <option value="off">{t('বন্ধ')}</option>}
                    </select>
                  )}
                </li>
              )
            })}
          </ul>
          {project.geo_depth !== 'union' && <p className="mt-2 text-xs text-slate-500">{t('ইউনিয়ন চালু করতে "সাধারণ" ট্যাবে ঠিকানার স্তর "ইউনিয়ন পর্যন্ত" করুন।')}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primaryButton} disabled={busy || blocked || !coreDirty} onClick={() => void saveCore()}>
              {t('সিস্টেম ফিল্ড সংরক্ষণ')}
            </button>
            <button type="button" className={secondaryButton} disabled={busy || !coreDirty} onClick={() => setCore(structuredClone(project.core_fields ?? {}))}>
              {t('পরিবর্তন বাতিল')}
            </button>
          </div>
        </section>

        {/* ---------- কাস্টম ফিল্ড ---------- */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">{t('কাস্টম ফিল্ড')}</h2>
            <button type="button" className={primaryButton} disabled={busy || blocked || fields.length >= MAX_FIELDS} onClick={() => void openEditor(null)}>
              <span aria-hidden="true">+</span> {t('ফিল্ড যোগ করুন')}
            </button>
          </div>
          {fields.length >= MAX_FIELDS && <p className="mt-2 text-xs text-amber-800">{t('একটি প্রকল্পে সর্বোচ্চ {n}টি ফিল্ড', { n: toBanglaNumber(MAX_FIELDS) })}</p>}
          {fields.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t('এখনো কোনো কাস্টম ফিল্ড নেই।')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {fields.map((f, i) => (
                <li key={f.id} className={`flex flex-col gap-2 py-3 lg:flex-row lg:items-center ${f.is_active ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {lt(f, 'label')} <span className="font-mono text-xs font-normal text-slate-400">{f.key}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge>{pick(FIELD_VALUE_SPECS[f.type].label_bn, FIELD_VALUE_SPECS[f.type].label_en)}</Badge>
                      {f.required && <Badge tone="red">{t('আবশ্যক')}</Badge>}
                      {f.show_in_table && <Badge tone="blue">{t('টেবিলে')}</Badge>}
                      {f.show_in_card && <Badge tone="blue">{t('কার্ডে')}</Badge>}
                      {f.filterable && <Badge tone="green">{t('ফিল্টারে')}</Badge>}
                      {f.visibility === 'admin' && <Badge tone="slate">🔒 {t('শুধু-এডমিন')}</Badge>}
                      {!f.label_en.trim() && <Badge tone="amber">{t('ইংরেজি নেই')}</Badge>}
                      {!f.is_active && <Badge tone="amber">{t('আর্কাইভ')}</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={smallButton} disabled={busy || blocked || i === 0} onClick={() => move(i, -1)} aria-label={t('উপরে সরান')} title={t('উপরে সরান')}>
                      ↑
                    </button>
                    <button type="button" className={smallButton} disabled={busy || blocked || i === fields.length - 1} onClick={() => move(i, 1)} aria-label={t('নিচে সরান')} title={t('নিচে সরান')}>
                      ↓
                    </button>
                    <button type="button" className={smallButton} disabled={busy || blocked} onClick={() => void openEditor(f)}>
                      {t('সম্পাদনা')}
                    </button>
                    <button
                      type="button"
                      className={smallButton}
                      disabled={busy || blocked}
                      onClick={() => void run(() => getProjectsApi().updateField(f.id, { is_active: !f.is_active }), f.is_active ? t('আর্কাইভ করা হয়েছে') : t('ফেরত আনা হয়েছে'))}
                    >
                      {f.is_active ? t('আর্কাইভ') : t('ফেরত আনুন')}
                    </button>
                    {mainAdmin && (
                      <button type="button" className={`${smallButton} text-red-700`} disabled={busy || blocked} onClick={() => void askDelete(f)}>
                        {t('মুছুন')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start">
        <FieldPreview project={project} />
      </aside>

      {editor && (
        <FieldEditorDrawer
          key={editor.field?.id ?? 'new'}
          project={project}
          field={editor.field}
          usage={editor.usage}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await onChanged()
            toast.success(t('সংরক্ষিত'))
          }}
        />
      )}

      {deleting &&
        (deleting.usage > 0 ? (
          <ConfirmDialog
            open
            title={t('«{name}» মোছা যাবে না', { name: lt(deleting.field, 'label') })}
            confirmLabel={deleting.field.is_active ? t('আর্কাইভ করুন') : t('ঠিক আছে')}
            busy={busy}
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              const f = deleting.field
              if (!f.is_active) return setDeleting(null)
              void run(() => getProjectsApi().updateField(f.id, { is_active: false }), t('আর্কাইভ করা হয়েছে')).then(() => setDeleting(null))
            }}
          >
            <p className="text-sm text-slate-700">
              {t('{n}টি রেকর্ডে মান আছে — মোছা যাবে না, আর্কাইভ করুন। আর্কাইভ করা ফিল্ডে নতুন মান দেওয়া যায় না, পুরনো মান থেকে যায়, পরে ফেরত আনা যায়।', { n: formatBanglaNumber(deleting.usage) })}
            </p>
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            open
            tone="danger"
            title={t('«{name}» মুছে ফেলবেন?', { name: lt(deleting.field, 'label') })}
            confirmLabel={t('মুছুন')}
            busy={busy}
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              const f = deleting.field
              void run(() => getProjectsApi().deleteField(f.id), t('মুছে ফেলা হয়েছে')).then(() => setDeleting(null))
            }}
          >
            <p className="text-sm text-slate-700">{t('কোনো রেকর্ডে এই ফিল্ডের মান নেই, তাই পুরোপুরি মুছে ফেলা যায়। এটি ফেরানো যায় না।')}</p>
          </ConfirmDialog>
        ))}
    </div>
  )
}
