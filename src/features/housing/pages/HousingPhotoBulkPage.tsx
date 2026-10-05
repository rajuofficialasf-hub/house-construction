import { gn, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi } from '../../../backend/factory'
import { HousingApiError, type HousingRecord, type PhotoKind, type ProjectType } from '../../../backend/interfaces/types'
import { ErrorNotice } from '../components/ErrorNotice'
import { SafeImage } from '../components/SafeImage'
import { ImageUploader, ProgressBar, StatusPill } from '../components/ImageUploader'
import { createUploadItems, revokeUploadItems, type UploadItem } from '../utils/uploadItems'
import { formatBytes, processImage } from '../utils/imageProcessing'
import { photoSrc } from '../utils/imagePath'
import { parsePhotoFilename } from '../utils/photoFilename'
import { PROJECT_LIST, PROJECT_META } from '../utils/projectType'

const KIND_LABEL: Record<PhotoKind, string> = { prev: 'পূর্বের ঘর', current: 'বর্তমান ঘর' }
const UPLOAD_CONCURRENCY = 2

type Match =
  | { kind: 'ok'; project_type: ProjectType; serial_no: number; photoKind: PhotoKind; record: HousingRecord }
  | { kind: 'unparsed' }
  | { kind: 'no_record'; project_type: ProjectType; serial_no: number; photoKind: PhotoKind }
  | { kind: 'duplicate'; project_type: ProjectType; serial_no: number; photoKind: PhotoKind }

interface Row {
  item: UploadItem
  match: Match
}

type Parsed =
  | { item: UploadItem; ok: true; project_type: ProjectType; serial_no: number; photoKind: PhotoKind }
  | { item: UploadItem; ok: false }

interface Lookup {
  key: string
  records: Map<string, HousingRecord>
  error: HousingApiError | null
}

/**
 * /housing/admin/photos — ছবি বাল্ক আপডেট।
 * ফাইলনাম থেকে প্রকল্প/সিরিয়াল/ধরন → রেকর্ড মিলিয়ে প্রিভিউ → নিশ্চিত করলে ব্যাচে (২টি একসাথে) কম্প্রেস + আপলোড → রিপোর্ট।
 * RequireAdmin এর ভেতরে (লগইন ছাড়া পৌঁছানো যায় না); লেখার অনুমতি তবু ব্যাকএন্ডে যাচাই হয়।
 */
export function HousingPhotoBulkPage() {
  const [defaultProject, setDefaultProject] = useState<ProjectType>('semi_pucca')
  const [items, setItems] = useState<UploadItem[]>([])
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [phase, setPhase] = useState<'select' | 'uploading' | 'done'>('select')

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
  const parsed = useMemo<Parsed[]>(
    () =>
      items.map((item) => {
        const p = parsePhotoFilename(item.file.name)
        return p
          ? { item, ok: true, project_type: p.project_type ?? defaultProject, serial_no: p.serial_no, photoKind: p.kind }
          : { item, ok: false }
      }),
    [items, defaultProject],
  )

  const lookupKey = useMemo(() => {
    const keys = parsed.filter((p) => p.ok).map((p) => `${p.project_type}:${p.serial_no}`)
    return [...new Set(keys)].sort().join(',')
  }, [parsed])

  useEffect(() => {
    if (!lookupKey) return
    let alive = true
    const byProject = new Map<ProjectType, number[]>()
    for (const k of lookupKey.split(',')) {
      const [pt, s] = k.split(':')
      const list = byProject.get(pt as ProjectType) ?? []
      list.push(Number(s))
      byProject.set(pt as ProjectType, list)
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
      if (!p.ok) return { item: p.item, match: { kind: 'unparsed' } }
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
    const c = { ok: 0, overwrite: 0, unparsed: 0, no_record: 0, duplicate: 0 }
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
    const done = queue.length - failedIds.size
    void api.logActivity('photo_bulk_run', { rows: queue.length, done, failed: failedIds.size, skipped: rows.length - queue.length }, defaultProject)
  }

  const doneCount = items.filter((i) => i.status === 'done').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const skippedCount = items.filter((i) => i.status === 'skipped').length
  const finished = doneCount + errorCount + skippedCount
  const canUpload = phase === 'select' && counts.ok > 0 && !lookupBusy && !lookupError

  return (
    <section className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/housing/admin" className="hover:text-brand-700">
              {t('এডমিন')}
            </Link>{' '}
            / {t('ছবি বাল্ক আপডেট')}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('ছবি বাল্ক আপডেট')}</h1>
        </div>
        <p className="text-sm text-slate-600">
          {t('ফাইলনাম:')} <code className="rounded bg-slate-100 px-1">semi_0001_prev.jpg</code>,{' '}
          <code className="rounded bg-slate-100 px-1">tin_0012_current.png</code> {t('বা')}{' '}
          <code className="rounded bg-slate-100 px-1">0001_current.jpg</code> ({t('প্রকল্প নিচে বাছুন')})
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
            onChange={(e) => setDefaultProject(e.target.value as ProjectType)}
          >
            {PROJECT_LIST.map((p) => (
              <option key={p.type} value={p.type}>
                {t(p.title)}
              </option>
            ))}
          </select>
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
                  <tr key={item.id} className={match.kind === 'ok' ? '' : 'bg-slate-50/60'}>
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
                          {t(PROJECT_META[match.project_type].title)}
                          <br />
                          <span className="text-slate-600">
                            {t('সিরিয়াল')} {toBanglaNumber(match.serial_no)} · {t(KIND_LABEL[match.photoKind])}
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
                onClick={startUpload}
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
    </section>
  )
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}
