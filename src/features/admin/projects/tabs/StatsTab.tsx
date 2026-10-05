import { pick, t } from '@/i18n'
import { useState } from 'react'
import { getProjectsApi, HousingApiError, type Project, type ProjectStats, type StatCardDef } from '@/backend'
import { useToast } from '@/components/useToast'
import { STAT_ICONS, StatIcon, type StatIconKey } from '@/features/projects/registry'
import { cardSummary, cardValue, formatCardValue } from '@/features/projects/stats/statCards'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { Badge } from '../../ui/Badge'
import { card, inputClass, primaryButton, secondaryButton, smallButton } from '../../ui/styles'
import { friendlyProjectError } from '../projectRules'
import { StatCardPicker } from '../StatCardPicker'

const MAX_CARDS = 8
const MAX_HOME = 3

/**
 * "পরিসংখ্যান" ট্যাব (পরিকল্পনা M-ধাপ ৮): কার্ডের তালিকা — লেবেল (দুই ভাষা; হোমে আলাদা লেবেল ঐচ্ছিক), আইকন, ↑↓ ক্রম,
 * হোমে দেখানো (সর্বোচ্চ ৩টি), মোছা; নতুন কার্ড (StatCardPicker); মোট সর্বোচ্চ ৮টি। উপরে লাইভ প্রিভিউ — আসল সংখ্যা
 * (project_stats)। সংরক্ষণ প্রকল্পের updated_at মিলিয়ে।
 */
export function StatsTab({ project, stats, blocked, onChanged }: { project: Project; stats: ProjectStats | null; blocked: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [cards, setCards] = useState<StatCardDef[]>(() => structuredClone(project.stat_cards))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(cards) !== JSON.stringify(project.stat_cards)
  const homes = cards.filter((c) => c.home).length
  const missingLabel = cards.some((c) => !c.label_bn.trim())

  const update = (i: number, patch: Partial<StatCardDef>) =>
    setCards((cs) =>
      cs.map((c, k) => {
        if (k !== i) return c
        const next: StatCardDef = { ...c, ...patch }
        for (const key of ['home_label_bn', 'home_label_en'] as const) if (next[key] === '') delete next[key]
        if (next.home === false) delete next.home
        return next
      }),
    )
  const move = (i: number, dir: -1 | 1) =>
    setCards((cs) => {
      const j = i + dir
      if (j < 0 || j >= cs.length) return cs
      const out = [...cs]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })

  const save = async () => {
    if (!dirty || busy || missingLabel) return
    setBusy(true)
    setError(null)
    try {
      await getProjectsApi().update(project.key, { stat_cards: cards }, { expectedUpdatedAt: project.updated_at })
      await onChanged()
      toast.success(t('সংরক্ষিত'))
    } catch (err) {
      const e = HousingApiError.from(err)
      setError(e.code === 'CONFLICT' ? t('অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন। আপনার পরিবর্তন সংরক্ষিত হয়নি — নতুন অবস্থা এনে আবার করুন।') : friendlyProjectError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {blocked && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('অন্য ট্যাবে সংরক্ষণ হয়নি এমন পরিবর্তন আছে — আগে সেগুলো সংরক্ষণ বা বাতিল করুন।')}
        </p>
      )}

      {/* ---------- লাইভ প্রিভিউ ---------- */}
      <section className={card}>
        <h2 className="text-base font-bold text-slate-900">{t('প্রিভিউ (আসল সংখ্যা)')}</h2>
        {cards.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('কোনো কার্ড নেই — প্রকাশের আগে অন্তত একটি লাগবে।')}</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  <StatIcon icon={c.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-slate-500">{pick(c.label_bn, c.label_en) || '—'}</span>
                  <span className="block truncate text-lg font-bold text-slate-900 tabular-nums">{formatCardValue(c, cardValue(c, stats))}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{t('হোম পেইজের কার্ডে: {list}', { list: cards.filter((c) => c.home).map((c) => pick(c.home_label_bn || c.label_bn, c.home_label_en || c.label_en)).join(' · ') || '—' })}</p>
      </section>

      {/* ---------- কার্ডের তালিকা ---------- */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">{t('কার্ড')}</h2>
          <span className="text-xs text-slate-500">
            {t('মোট {n}/{max} · হোমে {h}/{hmax}', { n: toBanglaNumber(cards.length), max: toBanglaNumber(MAX_CARDS), h: toBanglaNumber(homes), hmax: toBanglaNumber(MAX_HOME) })}
          </span>
        </div>
        <ul className="mt-4 space-y-4">
          {cards.map((c, i) => (
            <li key={c.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{t({ count: 'গণনা', geo: 'এলাকা কভার', sum: 'যোগফল', distinct: 'ক্যাটাগরি সংখ্যা' }[c.kind])}</Badge>
                  <span className="font-mono text-xs text-slate-400">{cardSummary(c, project)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={smallButton} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('উপরে সরান')} title={t('উপরে সরান')}>
                    ↑
                  </button>
                  <button type="button" className={smallButton} disabled={i === cards.length - 1} onClick={() => move(i, 1)} aria-label={t('নিচে সরান')} title={t('নিচে সরান')}>
                    ↓
                  </button>
                  <button type="button" className={`${smallButton} text-red-700`} onClick={() => setCards((cs) => cs.filter((_, k) => k !== i))}>
                    {t('সরান')}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{t('লেবেল (বাংলা)')}</span>
                  <input className={inputClass} value={c.label_bn} onChange={(e) => update(i, { label_bn: e.target.value })} maxLength={60} aria-invalid={!c.label_bn.trim() || undefined} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{t('লেবেল (ইংরেজি)')}</span>
                  <input className={inputClass} value={c.label_en} onChange={(e) => update(i, { label_en: e.target.value })} maxLength={60} />
                </label>
              </div>
              <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!c.home} disabled={!c.home && homes >= MAX_HOME} onChange={(e) => update(i, { home: e.target.checked })} />
                {t('হোম পেইজের কার্ডে দেখান')}
                {!c.home && homes >= MAX_HOME && <span className="text-xs text-slate-500">{t('(হোমে সর্বোচ্চ ৩টি)')}</span>}
              </label>
              {c.home && (
                <div className="mt-1 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">{t('হোমের লেবেল (বাংলা, ঐচ্ছিক)')}</span>
                    <input className={inputClass} value={c.home_label_bn ?? ''} placeholder={c.label_bn} onChange={(e) => update(i, { home_label_bn: e.target.value })} maxLength={60} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">{t('হোমের লেবেল (ইংরেজি, ঐচ্ছিক)')}</span>
                    <input className={inputClass} value={c.home_label_en ?? ''} placeholder={c.label_en} onChange={(e) => update(i, { home_label_en: e.target.value })} maxLength={60} />
                  </label>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('আইকন')}>
                {(Object.keys(STAT_ICONS) as StatIconKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={c.icon === k}
                    aria-label={pick(STAT_ICONS[k].label_bn, STAT_ICONS[k].label_en)}
                    title={pick(STAT_ICONS[k].label_bn, STAT_ICONS[k].label_en)}
                    onClick={() => update(i, { icon: k })}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border ${c.icon === k ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-200 text-slate-500 hover:border-brand-300'}`}
                  >
                    <StatIcon icon={k} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          {cards.length < MAX_CARDS ? (
            <StatCardPicker project={project} cards={cards} disabled={busy} onAdd={(c) => setCards((cs) => [...cs, c])} />
          ) : (
            <p className="text-sm text-amber-800">{t('সর্বোচ্চ ৮টি কার্ড — নতুন যোগ করতে একটি সরান।')}</p>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {missingLabel && <p className="text-sm text-red-700">{t('প্রতিটি কার্ডে বাংলা লেবেল দিন।')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} disabled={busy || blocked || !dirty || missingLabel} onClick={() => void save()}>
          {busy ? t('সংরক্ষণ হচ্ছে…') : t('কার্ড সংরক্ষণ করুন')}
        </button>
        <button type="button" className={secondaryButton} disabled={busy || !dirty} onClick={() => setCards(structuredClone(project.stat_cards))}>
          {t('পরিবর্তন বাতিল')}
        </button>
        {dirty && <span className="text-sm text-amber-800">{t('সংরক্ষণ হয়নি এমন পরিবর্তন আছে')}</span>}
      </div>
    </div>
  )
}
