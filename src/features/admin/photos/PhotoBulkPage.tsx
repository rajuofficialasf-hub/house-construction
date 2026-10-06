import { gn, lt, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi, HousingApiError, type HousingRecord, type PhotoKind, type Project, type ProjectKey } from '@/backend'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { SafeImage } from '@/features/housing/components/SafeImage'
import { ImageUploader, ProgressBar, StatusPill } from '@/features/housing/components/ImageUploader'
import { createUploadItems, revokeUploadItems, type UploadItem } from '@/features/housing/utils/uploadItems'
import { formatBytes, processImage } from '@/features/housing/utils/imageProcessing'
import { photoSrc } from '@/features/housing/utils/imagePath'
import { buildProjectAliases, parsePhotoFilename, photoNameExamples, photoTarget, type PhotoTarget } from '@/features/housing/utils/photoFilename'
import { useRecordProjects } from '@/features/housing/utils/housingProjects'
import { photoSlotLabel } from '../records/recordColumns'

const UPLOAD_CONCURRENCY = 2

type BadReason = Extract<PhotoTarget, { ok: false }>['reason']
type Match =
  | { kind: 'ok'; project_type: ProjectKey; serial_no: number; photoKind: PhotoKind; record: HousingRecord }
  | { kind: 'unparsed' }
  | { kind: 'bad_kind'; project_type: ProjectKey; serial_no: number; reason: BadReason }
  | { kind: 'no_record'; project_type: ProjectKey; serial_no: number; photoKind: PhotoKind }
  | { kind: 'duplicate'; project_type: ProjectKey; serial_no: number; photoKind: PhotoKind }

interface Row {
  item: UploadItem
  match: Match
}

type Parsed =
  | { item: UploadItem; ok: true; project_type: ProjectKey; serial_no: number; photoKind: PhotoKind }
  | { item: UploadItem; ok: false; bad?: { project_type: ProjectKey; serial_no: number; reason: BadReason } }

interface Lookup {
  key: string
  records: Map<string, HousingRecord>
  error: HousingApiError | null
}

const BAD_MESSAGE: Record<BadReason, string> = {
  prev_not_allowed: 'এই প্রকল্পে শুধু পরের ছবি — "_prev" ফাইল চলবে না',
  kind_missing: 'আগে না পরে লেখা নেই — নামের শেষে _prev বা _current দিন',
  no_photos: 'এই প্রকল্পে ছবি নেই',
}

/**
 * /admin/photos?project=<key> — ছবি বাল্ক আপডেট (M-ধাপ ১২: যেকোনো প্রকল্পের)।
 * ফাইলনাম (প্রিফিক্স রেজিস্ট্রি থেকে: file_prefix/key/slug) → প্রকল্প/সিরিয়াল/ধরন (ছবি মোড অনুযায়ী) → রেকর্ড মিলিয়ে প্রিভিউ →
 * ওভাররাইট থাকলে নিশ্চিতকরণ → ব্যাচে (২টি একসাথে) কম্প্রেস + আপলোড → রিপোর্ট; লগ প্রতিটি প্রকল্পের জন্য আলাদা।
 * RequireAdmin এর ভেতরে (লগইন ছাড়া পৌঁছানো যায় না); লেখার অনুমতি তবু ব্যাকএন্ডে যাচাই হয়।
 */
export function PhotoBulkPage() {
  useDocumentTitle(t('ছবি বাল্ক আপডেট'))
  const all = useRecordProjects()
  const withPhotos = useMemo(() => all.filter((p) => p.photo_mode !== 'none'), [all])
  const byKey = useMemo(() => new Map(all.map((p) => [p.key, p])), [all])
  const [searchParams] = useSearchParams()
  const asked = searchParams.get('project')
  const [chosen, setChosen] = useState<ProjectKey | null>(null)
  // URL এর প্রকল্প (খসড়া হলে এডমিনের রেজিস্ট্রিতে একটু পরে আসে) — এলে সেটিই; ব্যবহারকারী বাছলে সেটি
  const defaultProject = chosen ?? (withPhotos.some((p) => p.key === asked) ? asked : null) ?? withPhotos[0]?.key ?? 'semi_pucca'
  const current = byKey.get(defaultProject)
  const [items, setItems] = useState<UploadItem[]>([])
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [phase, setPhase] = useState<'select' | 'uploading' | 'done'>('select')
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  // object URL মুক্ত করা শুধু আনমাউন্টে (items বদলালে নয় — তাহলে প্রিভিউ ভেঙে যেত)
  const itemsRef = useRef<UploadItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => () => revokeUploadItems(itemsRef.current), [])

  const addFiles = useCallback((files: File[]) => {
    setItems((prev) => {
      const existing = new Set(prev.map((p) => `${p.file.name}|${p.file.size}`))
      const fresh = createUploadItems(files.filter((f) => !existing.has(`${f.name}|${f.size}`)))
      return [...prev, ...fresh]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((p) => p.id === id)
      if (gone) revokeUploadItems([gone])
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const clearAll = () => {
    revokeUploadItems(items)
    setItems([])
    setLookup(null)
    setPhase('select')
  }

  // ---- ফাইলনাম পার্স + রেকর্ড খোঁজা ----
  // প্রিফিক্স প্রকল্প-রেজিস্ট্রির সব প্রকল্প থেকে (file_prefix, key, slug)
  const aliases = useMemo(() => buildProjectAliases(all), [all])
  const parsed = useMemo<Parsed[]>(
    () =>
      items.map((item) => {
        const p = parsePhotoFilename(item.file.name, aliases)
        if (!p) return { item, ok: false }
        const project_type = p.project_type ?? defaultProject
        const target = photoTarget(p.kind, byKey.get(project_type)?.photo_mode ?? 'before_after')
        return target.ok
          ? { item, ok: true, project_type, serial_no: p.serial_no, photoKind: target.kind }
          : { item, ok: false, bad: { project_type, serial_no: p.serial_no, reason: target.reason } }
      }),
    [items, defaultProject, aliases, byKey],
  )

  const lookupKey = useMemo(() => {
    const keys = parsed.filter((p) => p.ok).map((p) => `${p.project_type}:${p.serial_no}`)
    return [...new Set(keys)].sort().join(',')
  }, [parsed])

  useEffect(() => {
    if (!lookupKey) return
    let alive = true
    const byProject = new Map<ProjectKey, number[]>()
    for (const k of lookupKey.split(',')) {
      const [pt, s] = k.split(':')
      const list = byProject.get(pt) ?? []
      list.push(Number(s))
      byProject.set(pt, list)
    }
    ;(async () => {
      const records = new Map<string, HousingRecord>()
      try {
        const api = getHousingApi()
        for (const [pt, serials] of byProject) {
          const recs = await api.getBySerials(pt, serials)
          for (const r of recs) records.set(`${r.project_type}:${r.serial_no}`, r)
        }
        if (alive) setLookup({ key: lookupKey, records, error: null })
      } catch (err) {
        if (alive) setLookup({ key: lookupKey, records, error: HousingApiError.from(err) })
      }
    })()
    return () => {
      alive = false
    }
  }, [lookupKey])

  // উত্তর কোন key এর তা রাখা হয়; key মিললে তবেই ব্যবহার (নইলে "মিলানো হচ্ছে")
  const lookupBusy = !!lookupKey && lookup?.key !== lookupKey
  const records = lookup?.key === lookupKey ? lookup.records : null
  const lookupError = lookup?.key === lookupKey ? lookup.error : null

  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>()
    return parsed.map((p) => {
      if (!p.ok) return { item: p.item, match: p.bad ? { kind: 'bad_kind', ...p.bad } : { kind: 'unparsed' } }
      const target = `${p.project_type}:${p.serial_no}:${p.photoKind}`
      const base = { project_type: p.project_type, serial_no: p.serial_no, photoKind: p.photoKind }
      if (seen.has(target)) return { item: p.item, match: { kind: 'duplicate', ...base } }
      seen.add(target)
      const record = records?.get(`${p.project_type}:${p.serial_no}`)
      if (!record) return { item: p.item, match: { kind: 'no_record', ...base } }
      return { item: p.item, match: { kind: 'ok', ...base, record } }
    })
  }, [parsed, records])

  const counts = useMemo(() => {
    const c = { ok: 0, overwrite: 0, unparsed: 0, bad_kind: 0, no_record: 0, duplicate: 0 }
    for (const r of rows) {
      if (r.match.kind === 'ok') {
        c.ok++
        if (r.match.record[`${r.match.photoKind}_photo_url`]) c.overwrite++
      } else c[r.match.kind]++
    }
    return c
  }, [rows])

  const patch = (id: string, changes: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)))

  // ---- আপলোড ----
  const startUpload = async () => {
    setConfirmOverwrite(false)
    setPhase('uploading')
    const api = getHousingApi()
    const queue = rows.filter((r) => r.match.kind === 'ok')
    for (const r of rows) {
      if (r.match.kind !== 'ok') {
        patch(r.item.id, {
          status: 'skipped',
          message:
            r.match.kind === 'unparsed'
              ? t('ফাইলনাম বোঝা যায়নি')
              : r.match.kind === 'bad_kind'
                ? t(BAD_MESSAGE[r.match.reason])
                : r.match.kind === 'no_record'
                  ? t('এই সিরিয়ালের রেকর্ড নেই')
                  : t('একই সিরিয়াল/ধরনের আরেকটি ফাইল আগে আছে'),
        })
      }
    }
    let next = 0
    const failedIds = new Set<string>()
    const worker = async () => {
      while (next < queue.length) {
        const r = queue[next++]
        if (r.match.kind !== 'ok') continue
        try {
          patch(r.item.id, { status: 'processing', message: undefined })
          const processed = await processImage(r.item.file)
          patch(r.item.id, { status: 'uploading', progress: 30, message: `${formatBytes(processed.photo.size)} WebP` })
          await api.uploadPhoto(r.match.record.id, r.match.photoKind, { photo: processed.photo, thumb: processed.thumb })
          patch(r.item.id, { status: 'done', progress: 100, message: `${formatBytes(processed.photo.size)} · ${toBanglaNumber(processed.width)}×${toBanglaNumber(processed.height)}` })
        } catch (err) {
          const e = HousingApiError.from(err)
          failedIds.add(r.item.id)
          patch(r.item.id, { status: 'error', message: e.message })
        }
      }
    }
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker))
    setPhase('done')
    // লগ: প্রতিটি প্রকল্পের জন্য আলাদা (একই ব্যাচে কয়েকটি প্রকল্পের ফাইল থাকতে পারে)
    const perProject = new Map<ProjectKey, { rows: number; done: number; failed: number; overwrite: number }>()
    for (const r of queue) {
      if (r.match.kind !== 'ok') continue
      const s = perProject.get(r.match.project_type) ?? { rows: 0, done: 0, failed: 0, overwrite: 0 }
      s.rows++
      if (failedIds.has(r.item.id)) s.failed++
      else s.done++
      if (r.match.record[`${r.match.photoKind}_photo_url`]) s.overwrite++
      perProject.set(r.match.project_type, s)
    }
    const skipped = rows.length - queue.length
    let first = true
    for (const [pt, s] of perProject) {
      void api.logActivity('photo_bulk_run', { ...s, ...(first && skipped ? { skipped } : {}) }, pt)
      first = false
    }
    if (perProject.size === 0) void api.logActivity('photo_bulk_run', { rows: 0, done: 0, failed: 0, skipped }, defaultProject)
  }
  const askUpload = () => (counts.overwrite > 0 ? setConfirmOverwrite(true) : void startUpload())

  const doneCount = items.filter((i) => i.status === 'done').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const skippedCount = items.filter((i) => i.status === 'skipped').length
  const finished = doneCount + errorCount + skippedCount
  const canUpload = phase === 'select' && counts.ok > 0 && !lookupBusy && !lookupError
  const slot = (p: Project | undefined, k: PhotoKind) => (p ? photoSlotLabel(p, k) : k)
  const examples = current ? photoNameExamples(current) : []

  return (
    <section className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/admin" className="hover:text-brand-700">
              {t('এডমিন')}
            </Link>{' '}
            / {t('ছবি বাল্ক আপডেট')}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('ছবি বাল্ক আপডেট')}</h1>
        </div>
        <p className="text-sm text-slate-600">
          {t('ফাইলনাম:')}{' '}
          {examples.map((x) => (
            <span key={x}>
              <code className="rounded bg-slate-100 px-1">{x}</code>,{' '}
            </span>
          ))}
          {t('বা')} <code className="rounded bg-slate-100 px-1">{current?.photo_mode === 'after_only' ? '0001.jpg' : '0001_current.jpg'}</code> ({t('প্রকল্প নিচে বাছুন')})
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div>
          <label htmlFor="bulk-project" className="mb-1 block text-xs font-medium text-slate-600">
            {t('প্রকল্প (ফাইলনামে প্রিফিক্স না থাকলে)')}
          </label>
          <select
            id="bulk-project"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={defaultProject}
            disabled={phase !== 'select'}
            onChange={(e) => setChosen(e.target.value)}
          >
            {withPhotos.map((p) => (
              <option key={p.key} value={p.key}>
                {p.is_published ? lt(p, 'name') : t('{name} (খসড়া)', { name: lt(p, 'name') })}
              </option>
            ))}
          </select>
          {current?.photo_mode === 'after_only' && <p className="mt-1 text-xs text-slate-500">{t('এই প্রকল্পে শুধু পরের ছবি ("{label}") — নামে আগে/পরে লাগে না।', { label: slot(current, 'current') })}</p>}
        </div>
        <ImageUploader items={items} onAdd={addFiles} showList={false} disabled={phase !== 'select'} />
      </div>

      {lookupError && (
        <div className="mt-4">
          <ErrorNotice title={t('রেকর্ড মিলানো যায়নি')} error={lookupError} />
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            <Badge className="bg-green-100 text-green-800">{t('মিলেছে {n}', { n: toBanglaNumber(counts.ok) })}</Badge>
            {counts.overwrite > 0 && <Badge className="bg-amber-100 text-amber-800">{t('ওভাররাইট হবে {n}', { n: toBanglaNumber(counts.overwrite) })}</Badge>}
            {counts.bad_kind > 0 && <Badge className="bg-red-100 text-red-800">{t('ভুল ছবির ঘর {n}', { n: toBanglaNumber(counts.bad_kind) })}</Badge>}
            {counts.no_record > 0 && <Badge className="bg-red-100 text-red-800">{t('রেকর্ড নেই {n}', { n: toBanglaNumber(counts.no_record) })}</Badge>}
            {counts.unparsed > 0 && <Badge className="bg-slate-200 text-slate-700">{t('ফাইলনাম বোঝা যায়নি {n}', { n: toBanglaNumber(counts.unparsed) })}</Badge>}
            {counts.duplicate > 0 && <Badge className="bg-slate-200 text-slate-700">{t('ডুপ্লিকেট {n}', { n: toBanglaNumber(counts.duplicate) })}</Badge>}
            {lookupBusy && <span className="text-slate-500">{t('রেকর্ড মিলানো হচ্ছে…')}</span>}
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-brand-50 text-left text-xs font-semibold text-brand-900 uppercase">
                <tr>
                  <th className="px-3 py-2 pl-4">{t('নতুন ছবি')}</th>
                  <th className="px-3 py-2">{t('ফাইল')}</th>
                  <th className="px-3 py-2">{t('প্রকল্প / সিরিয়াল / ধরন')}</th>
                  <th className="px-3 py-2">{t('উপকারভোগী')}</th>
                  <th className="px-3 py-2">{t('আগের ছবি')}</th>
                  <th className="px-3 py-2 pr-4">{t('অবস্থা')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ item, match }) => (
                  <tr key={item.id} className={match.kind === 'ok' ? '' : match.kind === 'bad_kind' ? 'bg-red-50' : 'bg-slate-50/60'}>
                    <td className="px-3 py-2 pl-4">
                      <img src={item.previewUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                    </td>
                    <td className="max-w-[14rem] px-3 py-2">
                      <p className="truncate font-medium text-slate-800" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {match.kind === 'unparsed' ? (
                        <span className="text-red-700">{t('ফাইলনাম বোঝা যায়নি')}</span>
                      ) : (
                        <>
                          {lt(byKey.get(match.project_type), 'name') || match.project_type}
                          <br />
                          <span className="text-slate-600">
                            {t('সিরিয়াল')} {toBanglaNumber(match.serial_no)}
                            {match.kind !== 'bad_kind' && <> · {slot(byKey.get(match.project_type), match.photoKind)}</>}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {match.kind === 'ok' ? (
                        <>
                          <p className="font-medium text-slate-900">{match.record.name}</p>
                          <p className="text-xs text-slate-500">
                            {gn(match.record.upazila)}, {gn(match.record.district)}
                          </p>
                        </>
                      ) : match.kind === 'bad_kind' ? (
                        <span role="alert" className="font-medium text-red-700">
                          {t(BAD_MESSAGE[match.reason])}
                        </span>
                      ) : match.kind === 'no_record' ? (
                        <span className="text-red-700">{t('এই সিরিয়ালের রেকর্ড নেই')}</span>
                      ) : match.kind === 'duplicate' ? (
                        <span className="text-slate-600">{t('একই লক্ষ্যের আরেকটি ফাইল আগে আছে — বাদ')}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {match.kind === 'ok' && match.record[`${match.photoKind}_photo_url`] ? (
                        <div className="flex items-center gap-2">
                          <SafeImage
                            src={photoSrc(match.record[`${match.photoKind}_thumb_url`], match.record.photo_updated_at)}
                            alt={t('আগের ছবি')}
                            className="h-14 w-14 rounded-md object-cover"
                            placeholderClassName="h-14 w-14 rounded-md"
                          />
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{t('ওভাররাইট হবে')}</span>
                        </div>
                      ) : match.kind === 'ok' ? (
                        <span className="text-xs text-slate-500">{t('নেই (নতুন)')}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <StatusPill status={match.kind === 'ok' || item.status !== 'pending' ? item.status : 'skipped'} />
                        {phase === 'select' && (
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            aria-label={t('তালিকা থেকে বাদ দিন')}
                            className="text-slate-400 hover:text-red-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {(item.status === 'processing' || item.status === 'uploading') && (
                        <ProgressBar value={item.status === 'processing' ? undefined : item.progress} />
                      )}
                      {item.message && <p className="mt-1 max-w-[16rem] text-xs text-slate-600">{item.message}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {phase !== 'select' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{phase === 'uploading' ? t('আপলোড চলছে…') : t('শেষ')}</span>
                <span className="text-slate-600">
                  {toBanglaNumber(finished)} / {toBanglaNumber(items.length)}
                </span>
              </div>
              <ProgressBar value={items.length ? (finished / items.length) * 100 : 0} label={t('মোট অগ্রগতি')} />
              {phase === 'done' && (
                <p className="mt-3 text-sm" role="status">
                  <span className="font-medium text-green-700">{t('সফল {n}', { n: formatBanglaNumber(doneCount) })}</span> ·{' '}
                  <span className="font-medium text-red-700">{t('ব্যর্থ {n}', { n: formatBanglaNumber(errorCount) })}</span> ·{' '}
                  <span className="text-slate-600">{t('বাদ {n}', { n: formatBanglaNumber(skippedCount) })}</span>
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {phase === 'select' && (
              <button
                type="button"
                disabled={!canUpload}
                onClick={askUpload}
                className="inline-flex h-10 items-center rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {counts.overwrite > 0
                  ? t('নিশ্চিত: {ok}টি আপলোড ({ow}টি ওভাররাইট)', { ok: toBanglaNumber(counts.ok), ow: toBanglaNumber(counts.overwrite) })
                  : t('{n}টি ছবি আপলোড করুন', { n: toBanglaNumber(counts.ok) })}
              </button>
            )}
            <button
              type="button"
              disabled={phase === 'uploading'}
              onClick={clearAll}
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-40"
            >
              {phase === 'done' ? t('নতুন ব্যাচ') : t('সব বাদ দিন')}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOverwrite}
        title={t('{n}টি ছবি ওভাররাইট হবে', { n: toBanglaNumber(counts.overwrite) })}
        tone="danger"
        confirmLabel={t('হ্যাঁ, ওভাররাইট করে আপলোড করুন')}
        onConfirm={() => void startUpload()}
        onCancel={() => setConfirmOverwrite(false)}
      >
        <p>{t('এই রেকর্ডগুলোতে আগে থেকেই ছবি আছে; নতুন ছবি একই সিরিয়াল-পাথে বসবে, আগেরটি আর ফেরানো যাবে না।')}</p>
        <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-sm">
          {rows
            .filter((r) => r.match.kind === 'ok' && r.match.record[`${r.match.photoKind}_photo_url`])
            .slice(0, 10)
            .map((r) =>
              r.match.kind === 'ok' ? (
                <li key={r.item.id}>
                  {lt(byKey.get(r.match.project_type), 'name')} · {t('সিরিয়াল')} {toBanglaNumber(r.match.serial_no)} · {slot(byKey.get(r.match.project_type), r.match.photoKind)} ({r.item.file.name})
                </li>
              ) : null,
            )}
        </ul>
      </ConfirmDialog>
    </section>
  )
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}
