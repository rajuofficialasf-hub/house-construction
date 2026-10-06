import { getLang, lt, t as tr } from '@/i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi, HousingApiError, type HousingRecord, type Project } from '@/backend'
import type { FieldDef } from '@/features/projects/fields'
import { useUnionData } from '@/features/geo/unions'
import { ErrorNotice } from '@/features/housing/components/ErrorNotice'
import { PhotoCompare } from '@/features/housing/components/PhotoCompare'
import { photoSrc } from '@/features/housing/utils/imagePath'
import { projectPath } from '@/features/housing/utils/housingProjects'
import type { ListOutletContext } from '@/features/housing/pages/listContext'
import { fieldHeader, photoLabel } from '@/features/projects/list/listColumns'
import { compareLabels, detailLayout, fieldsFor, fieldText, type DetailLayout } from './detailLayout'
import { FieldValue } from './FieldValue'
import { PhotoViewer } from './PhotoViewer'

const NO_RECORDS: HousingRecord[] = []
const SWIPE_MIN_PX = 60
const SERIAL_FALLBACK_TRIES = 10

type Fetched =
  | { serial: number; status: 'ready'; record: HousingRecord }
  | { serial: number; status: 'error'; error: HousingApiError }

/**
 * /<প্রকল্প>/:serial — ভিউ মোড (M-ধাপ ১৪-এ HousingDetailPage থেকে; সব প্রকল্পের)। ProjectListPage এর ভেতরে (Outlet) full-screen মডাল হিসেবে রেন্ডার হয়,
 * তাই নিচে তালিকা থাকে এবং URL এর ফিল্টার/পেইজ বজায় থাকে। লগইন লাগে না।
 *
 * আগের/পরের: রেকর্ড বর্তমান (ফিল্টার করা) পেইজে থাকলে সেই ক্রমে; পেইজের শেষে গেলে পরের পেইজ API থেকে এনে
 * তার প্রথম রেকর্ডে যায় (URL এ page বদলায়, নিচের তালিকাও সেই পেইজে যায়)।
 * সরাসরি লিঙ্কে রেকর্ড বর্তমান পেইজে না থাকলে getBySerial দিয়ে দেখায়; তখন আগের/পরের সিরিয়াল-ক্রমে চলে।
 *
 * ছবির অংশ ছবি মোড অনুযায়ী: আগে-পরে → PhotoCompare (স্লাইডার; ঘর নির্মাণে আগের মতো), শুধু-পরে → PhotoViewer (একক ছবি,
 * জুম/ফুলস্ক্রিন), ছবি নেই → কিছু নয়। ঘরগুলো show_in_detail ক্রমে FieldValue দিয়ে; টাকা ও ক্যাটাগরি উপরে হাইলাইট কার্ডে।
 */
export function ProjectDetailPage() {
  const ctx = useOutletContext<ListOutletContext>()
  const { serial: serialParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const serialNo = Number(serialParam)
  const validSerial = Number.isInteger(serialNo) && serialNo >= 1
  const project = ctx.project
  const layout = useMemo(() => detailLayout(project), [project])
  const labels = useMemo(() => compareLabels(project), [project])

  // ---- বর্তমান পেইজে রেকর্ড আছে? ----
  const pageRecords = ctx.list.data?.data ?? NO_RECORDS
  const idx = pageRecords.findIndex((r) => r.serial_no === serialNo)
  const inList = idx !== -1
  const listSettled = ctx.list.status !== 'loading'

  // ---- না থাকলে সিরিয়াল ধরে আনা ----
  const [fetched, setFetched] = useState<Fetched | null>(null)
  const needFetch = validSerial && !inList && listSettled
  useEffect(() => {
    if (!needFetch) return
    let alive = true
    getHousingApi()
      .getBySerial(ctx.projectType, serialNo)
      .then((record) => alive && setFetched({ serial: serialNo, status: 'ready', record }))
      .catch((err: unknown) => alive && setFetched({ serial: serialNo, status: 'error', error: HousingApiError.from(err) }))
    return () => {
      alive = false
    }
  }, [needFetch, ctx.projectType, serialNo])

  const fetchedForThis = fetched && fetched.serial === serialNo ? fetched : null
  const record: HousingRecord | null = inList
    ? pageRecords[idx]
    : fetchedForThis?.status === 'ready'
      ? fetchedForThis.record
      : null
  const error = !validSerial
    ? new HousingApiError('VALIDATION_ERROR', tr('সিরিয়াল নম্বর অবৈধ'))
    : ctx.list.status === 'error'
      ? ctx.list.error
      : fetchedForThis?.status === 'error'
        ? fetchedForThis.error
        : null
  const loading = !record && !error
  // ইংরেজিতে ইউনিয়নের ইংরেজি নাম (তালিকা lazy) — শুধু রেকর্ডে ইউনিয়ন থাকলে
  useUnionData(!!record?.union_name && getLang() === 'en')

  // ---- URL helper ----
  const urlFor = useCallback(
    (serial: number, page: number) => {
      const sp = new URLSearchParams(location.search)
      if (page <= 1) sp.delete('page')
      else sp.set('page', String(page))
      const qs = sp.toString()
      return `${projectPath(ctx.projectType)}/${serial}${qs ? `?${qs}` : ''}`
    },
    [location.search, ctx.projectType],
  )
  const listUrl = `${projectPath(ctx.projectType)}${location.search}`
  const close = useCallback(() => navigate(listUrl, { replace: true }), [navigate, listUrl])

  // ---- আগের/পরের ----
  const [navBusy, setNavBusy] = useState(false)
  const totalPages = ctx.list.data?.meta.total_pages ?? 1
  const hasPrev = inList ? idx > 0 || ctx.page > 1 : serialNo > 1
  const hasNext = inList ? idx < pageRecords.length - 1 || ctx.page < totalPages : true

  const go = useCallback(
    async (dir: -1 | 1) => {
      if (navBusy || loading) return
      const api = getHousingApi()
      try {
        if (inList) {
          const ni = idx + dir
          if (ni >= 0 && ni < pageRecords.length) {
            navigate(urlFor(pageRecords[ni].serial_no, ctx.page), { replace: true })
            return
          }
          const nextPage = ctx.page + dir
          if (nextPage < 1 || nextPage > totalPages) return
          setNavBusy(true)
          const p = await api.list({ ...ctx.params, page: nextPage })
          if (p.data.length === 0) return
          const target = dir === 1 ? p.data[0] : p.data[p.data.length - 1]
          navigate(urlFor(target.serial_no, nextPage), { replace: true })
        } else {
          // সিরিয়াল-ক্রমে fallback (ডিলেট হওয়া সিরিয়াল টপকে)
          setNavBusy(true)
          for (let s = serialNo + dir, tries = 0; s >= 1 && tries < SERIAL_FALLBACK_TRIES; s += dir, tries++) {
            try {
              const r = await api.getBySerial(ctx.projectType, s)
              navigate(urlFor(r.serial_no, ctx.page), { replace: true })
              return
            } catch (err) {
              if (!(HousingApiError.is(err) && err.code === 'NOT_FOUND')) throw err
            }
          }
        }
      } catch {
        // নেভিগেশন ব্যর্থ — বর্তমান রেকর্ডেই থাকি
      } finally {
        setNavBusy(false)
      }
    },
    [navBusy, loading, inList, idx, pageRecords, ctx.page, ctx.params, ctx.projectType, totalPages, serialNo, navigate, urlFor],
  )

  // ---- কীবোর্ড, body স্ক্রল লক, ফোকাস ----
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ফুলস্ক্রিন তুলনা বা স্লাইডার হ্যান্ডেলে ফোকাস থাকলে ← → / Esc সেখানে যায়
      if (document.fullscreenElement) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-handle]')) return
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') void go(-1)
      else if (e.key === 'ArrowRight') void go(1)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [close, go])
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // ---- সোয়াইপ ----
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    // তুলনা ফ্রেমের ভেতরের টাচ (স্লাইডার/প্যান/পিঞ্চ) সোয়াইপ-নেভিগেশন নয়
    if ((e.target as HTMLElement | null)?.closest('[data-compare]')) {
      touchStart.current = null
      return
    }
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    const s = touchStart.current
    touchStart.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) void go(dx < 0 ? 1 : -1)
  }

  // ---- অবস্থান ----
  const position = useMemo(() => {
    if (!inList || !ctx.list.data) return null
    const m = ctx.list.data.meta
    return { at: (m.page - 1) * m.page_size + idx + 1, total: m.total }
  }, [inList, ctx.list.data, idx])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm sm:p-4"
      onClick={close}
    >
      <div
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ---------- হেডার ---------- */}
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-700">{lt(project, 'name')}</p>
            <h2 id="detail-title" className="truncate text-base font-bold text-slate-900 sm:text-lg">
              {record ? record.name : loading ? tr('লোড হচ্ছে…') : tr('রেকর্ড')}
              {validSerial && (
                <span className="ml-2 text-sm font-medium text-slate-500">{tr('সিরিয়াল {n}', { n: toBanglaNumber(serialNo) })}</span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {position && (
              <span className="hidden text-sm text-slate-500 sm:inline" aria-live="polite">
                {tr('{total} টির মধ্যে {at}', { total: formatBanglaNumber(position.total), at: formatBanglaNumber(position.at) })}
              </span>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={tr('বন্ধ করুন (Esc)')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none sm:h-9 sm:w-9"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="h-6 w-6">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        {/* ---------- বডি ---------- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {error && <ErrorNotice title={error.code === 'NOT_FOUND' ? tr('রেকর্ড পাওয়া যায়নি') : tr('রেকর্ড লোড করা যায়নি')} error={error} />}
          {loading && <DetailSkeleton photos={layout.photoKinds.length} />}
          {record && <RecordDetail project={project} layout={layout} labels={labels} record={record} />}
        </div>

        {/* ---------- ফুটার: আগের / পরের ---------- */}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-2">
          <NavButton dir={-1} disabled={!hasPrev || navBusy || loading} onClick={() => void go(-1)} />
          <p className="hidden text-center text-xs text-slate-500 sm:block">
            {position
              ? tr('পেইজ {n} · ← → কী বা সোয়াইপ', { n: toBanglaNumber(ctx.page) })
              : inList || loading
                ? tr('← → কী বা সোয়াইপ')
                : tr('সিরিয়াল ক্রমে · ← → কী বা সোয়াইপ')}
          </p>
          <NavButton dir={1} disabled={!hasNext || navBusy || loading} onClick={() => void go(1)} />
        </footer>
      </div>
    </div>
  )
}

type CompareLabels = { before: string; after: string } | undefined

/** রেকর্ডের অংশ: ছবি (ছবি মোড অনুযায়ী), হাইলাইট কার্ড (টাকা/ক্যাটাগরি), বাকি ঘর */
function RecordDetail({ project, layout, labels, record }: { project: Project; layout: DetailLayout; labels: CompareLabels; record: HousingRecord }) {
  const kinds = layout.photoKinds
  const highlightCols = HIGHLIGHT_COLS[Math.min(4, layout.highlight.length)] ?? ''
  return (
    <>
      {kinds.length === 2 && (
        <PhotoCompare
          before={photoSrc(record.prev_photo_url, record.photo_updated_at)}
          after={photoSrc(record.current_photo_url, record.photo_updated_at)}
          alt={record.name}
          compact
          labels={labels}
          frameClassName="h-[clamp(200px,42vh,380px)] sm:h-[clamp(160px,36vh,380px)]"
        />
      )}
      {kinds.length === 1 && (
        <PhotoViewer
          src={photoSrc(kinds[0] === 'prev' ? record.prev_photo_url : record.current_photo_url, record.photo_updated_at)}
          alt={record.name}
          label={photoLabel(project, kinds[0])}
          frameClassName="h-[clamp(220px,46vh,420px)] sm:h-[clamp(200px,44vh,440px)]"
        />
      )}

      {layout.highlight.length > 0 && (
        <div data-highlight="" className={`${kinds.length ? 'mt-3 ' : ''}grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-brand-200 bg-brand-200 ${highlightCols}`}>
          {layout.highlight.map((d) => (
            <div key={d.key} className="min-w-0 bg-brand-50 px-3 py-2">
              <p className="text-[11px] font-medium text-brand-800">{fieldHeader(d, project)}</p>
              <p className="truncate text-lg leading-snug font-bold text-slate-900" title={fieldText(d, record)}>
                <FieldValue def={d} record={record} />
              </p>
            </div>
          ))}
        </div>
      )}

      <dl className={`${kinds.length || layout.highlight.length ? 'mt-3 ' : ''}grid grid-cols-2 gap-2 sm:grid-cols-4`}>
        <Field label={tr('সিরিয়াল নম্বর')} title={toBanglaNumber(record.serial_no)} strong>
          {toBanglaNumber(record.serial_no)}
        </Field>
        {fieldsFor(layout, record).map((d) => (
          <DetailField key={d.key} def={d} project={project} record={record} />
        ))}
      </dl>
    </>
  )
}

/** হাইলাইট কার্ডে বড় পর্দায় কলাম (Tailwind পুরো ক্লাসের নাম দেখতে চায়) */
const HIGHLIGHT_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }

/** একটি ঘর — লম্বা লেখা (ঠিকানা ইত্যাদি) পূর্ণ-চওড়া, লাইন-ভাঙা; নাম মোটা */
function DetailField({ def, project, record }: { def: FieldDef; project: Project; record: HousingRecord }) {
  const long = def.type === 'long_text'
  return (
    <Field label={fieldHeader(def, project)} title={long ? undefined : fieldText(def, record)} strong={def.key === 'name'} wrap={long} className={long ? 'col-span-2 sm:col-span-4' : ''}>
      <FieldValue def={def} record={record} />
    </Field>
  )
}

function Field({ label, title, strong = false, wrap = false, className = '', children }: { label: string; title?: string; strong?: boolean; wrap?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 ${className}`}>
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className={`${wrap ? 'break-words' : 'truncate'} text-slate-900 ${strong ? 'text-sm font-semibold' : 'text-sm'}`} title={wrap ? undefined : title}>
        {children}
      </dd>
    </div>
  )
}

function NavButton({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick: () => void }) {
  const label = dir === -1 ? tr('আগের') : tr('পরের')
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={tr('{label} উপকারভোগী', { label })}
      className="inline-flex h-11 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-3"
    >
      {dir === -1 && <span aria-hidden="true">‹</span>}
      {label}
      {dir === 1 && <span aria-hidden="true">›</span>}
    </button>
  )
}

function DetailSkeleton({ photos }: { photos: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label={tr('লোড হচ্ছে')}>
      {photos === 2 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="aspect-[4/3] rounded-xl bg-slate-200" />
          <div className="aspect-[4/3] rounded-xl bg-slate-200" />
        </div>
      )}
      {photos === 1 && <div className="aspect-[4/3] rounded-xl bg-slate-200 sm:aspect-[16/9]" />}
      <div className={`${photos ? 'mt-5 ' : ''}grid gap-3 sm:grid-cols-2 lg:grid-cols-3`}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-200" />
        ))}
      </div>
    </div>
  )
}
