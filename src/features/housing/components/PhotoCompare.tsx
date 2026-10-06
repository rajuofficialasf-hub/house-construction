import { t as tr } from '@/i18n'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { SafeImage } from './SafeImage'

/**
 * আগে-পরে ছবির তুলনা (Remini স্টাইল) — কোনো লাইব্রেরি ছাড়া, Pointer Events দিয়ে।
 * - স্লাইডার মোড: এক ফ্রেমে দুই ছবি; উল্লম্ব হ্যান্ডেল টানলে clip-path দিয়ে বাম/ডান ভাগ।
 * - পাশাপাশি মোড: দুই ফ্রেম, একই জুম/প্যান।
 * - জুম: মাউস হুইল, ডাবল-ক্লিক/ডাবল-ট্যাপ, পিঞ্চ; জুম অবস্থায় ড্র্যাগে প্যান। দুই ছবিতে সিঙ্ক (একই transform)।
 * - বাটন: −, +, রিসেট, ফুলস্ক্রিন (Fullscreen API)। কীবোর্ড: হ্যান্ডেলে ← → (স্লাইডার), Home/End।
 * - ভিন্ন আকার/অনুপাতের ছবি একই 4:3 ফ্রেমে object-contain; একটি ছবি না থাকলে একক ভিউ + বার্তা।
 * - লেবেল (M-ধাপ ১৪): প্রকল্পের ছবির লেবেল props এ (যেমন "মেরামতের আগে"); না দিলে ঘর নির্মাণের আগের লেখা হুবহু।
 * ZoomFrame/Layer/Badge/ToolButton export — শুধু-পরের-ছবির PhotoViewer একই জুম/প্যান/পিঞ্চ ব্যবহার করে।
 */

interface Props {
  before: string | null
  after: string | null
  /** alt এর ভিত্তি, যেমন উপকারভোগীর নাম */
  alt: string
  className?: string
  /** ফ্রেমের উচ্চতা/অনুপাতের ক্লাস (ডিফল্ট 4:3); কম্প্যাক্ট মডালে যেমন "h-[clamp(180px,34vh,380px)]" */
  frameClassName?: string
  /** true: নিচের ইঙ্গিত-লাইন লুকানো, টুলবার ছোট */
  compact?: boolean
  /** প্রকল্পের ছবির লেবেল (বর্তমান ভাষায়); না দিলে "পূর্বের"/"বর্তমান" (ঘর নির্মাণের আগের মতো) */
  labels?: { before: string; after: string }
}

type Mode = 'slider' | 'side'

export interface Transform {
  z: number
  tx: number
  ty: number
}

const IDENTITY: Transform = { z: 1, tx: 0, ty: 0 }
const MIN_Z = 1
const MAX_Z = 6
const DOUBLE_TAP_Z = 2.5
const TAP_MS = 320
const TAP_PX = 24
const BEFORE_LABEL = 'পূর্বের'
const AFTER_LABEL = 'বর্তমান'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** ফ্রেমের সীমার মধ্যে transform রাখা (ছবি ফ্রেম ছেড়ে না যায়) */
function clampTransform(t: Transform, w: number, h: number): Transform {
  const z = clamp(t.z, MIN_Z, MAX_Z)
  const maxX = ((z - 1) * w) / 2
  const maxY = ((z - 1) * h) / 2
  return { z, tx: clamp(t.tx, -maxX, maxX), ty: clamp(t.ty, -maxY, maxY) }
}

/** ফ্রেম-কেন্দ্র সাপেক্ষে বিন্দু p স্থির রেখে factor গুণ জুম */
function zoomAt(t: Transform, p: { x: number; y: number }, factor: number, w: number, h: number): Transform {
  const z = clamp(t.z * factor, MIN_Z, MAX_Z)
  const k = z / t.z
  return clampTransform({ z, tx: p.x - (p.x - t.tx) * k, ty: p.y - (p.y - t.ty) * k }, w, h)
}

export function PhotoCompare({ before, after, alt, className = '', frameClassName = 'aspect-[4/3]', compact = false, labels }: Props) {
  // ব্যাজ ও alt এর লেখা: প্রকল্পের লেবেল, নইলে আগের হুবহু
  const badgeBefore = labels?.before ?? tr(BEFORE_LABEL)
  const badgeAfter = labels?.after ?? tr(AFTER_LABEL)
  const altBefore = alt + ' — ' + (labels?.before ?? tr('পূর্বের ঘর'))
  const altAfter = alt + ' — ' + (labels?.after ?? tr('বর্তমান ঘর'))
  const [mode, setMode] = useState<Mode>('slider')
  const [t, setT] = useState<Transform>(IDENTITY)
  const [split, setSplit] = useState(50)
  const [isFs, setIsFs] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fsSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled

  useEffect(() => {
    const onChange = () => setIsFs(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await rootRef.current?.requestFullscreen()
    } catch {
      // অসমর্থিত/অনুমতি নেই — উপেক্ষা
    }
  }

  const zoomBy = (factor: number) => setT((cur) => zoomAt(cur, { x: 0, y: 0 }, factor, 0, 0))
  const reset = () => setT(IDENTITY)

  const both = !!before && !!after
  const single = !both && (before || after)

  return (
    <div
      ref={rootRef}
      data-compare=""
      className={[
        'flex flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm',
        isFs ? 'h-screen w-screen rounded-none border-0 bg-black' : 'bg-white',
        className,
      ].join(' ')}
    >
      {/* ---------- টুলবার ---------- */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-3 ${compact ? 'py-1.5' : 'py-2'} ${isFs ? 'bg-black/80 text-white' : 'bg-white'}`}>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-medium" role="group" aria-label={tr('দেখার ধরন')}>
          <ModeButton active={mode === 'slider'} onClick={() => setMode('slider')} disabled={!both}>
            {tr('স্লাইডার দেখুন')}
          </ModeButton>
          <ModeButton active={mode === 'side'} onClick={() => setMode('side')} disabled={!both}>
            {tr('পাশাপাশি দেখুন')}
          </ModeButton>
        </div>
        <div className="flex items-center gap-1">
          <ToolButton label={tr('ছোট করুন')} onClick={() => zoomBy(1 / 1.25)} disabled={t.z <= MIN_Z}>
            −
          </ToolButton>
          <span className={`w-12 text-center text-xs tabular-nums ${isFs ? 'text-white' : 'text-slate-600'}`} aria-live="polite">
            {toBanglaNumber(Math.round(t.z * 100))}%
          </span>
          <ToolButton label={tr('বড় করুন')} onClick={() => zoomBy(1.25)} disabled={t.z >= MAX_Z}>
            +
          </ToolButton>
          <ToolButton label={tr('রিসেট')} onClick={reset} disabled={t.z === 1 && t.tx === 0 && t.ty === 0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </svg>
          </ToolButton>
          {fsSupported && (
            <ToolButton label={isFs ? tr('ফুলস্ক্রিন বন্ধ') : tr('ফুলস্ক্রিন')} onClick={() => void toggleFullscreen()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                {isFs ? (
                  <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                ) : (
                  <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
                )}
              </svg>
            </ToolButton>
          )}
        </div>
      </div>

      {/* ---------- ফ্রেম ---------- */}
      {!before && !after && (
        <div className={`flex items-center justify-center text-sm text-slate-500 ${isFs ? 'flex-1' : frameClassName} bg-slate-100`}>
          {tr('এই উপকারভোগীর কোনো ছবি নেই।')}
        </div>
      )}

      {single && (
        <div className={`flex min-h-0 flex-col ${isFs ? 'flex-1' : ''}`}>
          <ZoomFrame t={t} onChange={setT} fill={isFs} frameClass={frameClassName}>
            <Layer src={(before ?? after)!} alt={before ? altBefore : altAfter} t={t} />
            <Badge side="left">{before ? badgeBefore : badgeAfter}</Badge>
          </ZoomFrame>
          <p className={`px-3 py-2 text-xs ${isFs ? 'text-white/80' : 'text-slate-500'}`}>
            {labels ? tr('«{label}» ছবি নেই', { label: before ? labels.after : labels.before }) : before ? tr('বর্তমান ঘরের ছবি নেই') : tr('পূর্বের ঘরের ছবি নেই')} — {tr('তুলনা সম্ভব নয়, একটি ছবিই দেখানো হচ্ছে।')}
          </p>
        </div>
      )}

      {both && mode === 'slider' && (
        <ZoomFrame t={t} onChange={setT} fill={isFs} frameClass={frameClassName}>
          <Layer src={before!} alt={altBefore} t={t} />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
            <Layer src={after!} alt={altAfter} t={t} />
          </div>
          <Badge side="left">{badgeBefore}</Badge>
          <Badge side="right">{badgeAfter}</Badge>
          <SliderHandle split={split} onChange={setSplit} />
        </ZoomFrame>
      )}

      {both && mode === 'side' && (
        <div className={`grid grid-cols-2 gap-0.5 bg-slate-200 ${isFs ? 'min-h-0 flex-1' : ''}`}>
          <ZoomFrame t={t} onChange={setT} fill={isFs} frameClass={frameClassName}>
            <Layer src={before!} alt={altBefore} t={t} />
            <Badge side="left">{badgeBefore}</Badge>
          </ZoomFrame>
          <ZoomFrame t={t} onChange={setT} fill={isFs} frameClass={frameClassName}>
            <Layer src={after!} alt={altAfter} t={t} />
            <Badge side="left">{badgeAfter}</Badge>
          </ZoomFrame>
        </div>
      )}

      {(both || single) && !isFs && !compact && (
        <p className="px-3 py-1.5 text-[11px] text-slate-400">
          {tr('হুইল/পিঞ্চ: জুম · ডাবল-ক্লিক/ডাবল-ট্যাপ: জুম টগল · জুম অবস্থায় টেনে সরান')}
          {both && mode === 'slider' ? ' · ' + tr('হ্যান্ডেল টেনে তুলনা') : ''}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- ফ্রেম (জুম/প্যান জেসচার)
interface FrameProps {
  t: Transform
  onChange: (next: Transform | ((cur: Transform) => Transform)) => void
  fill: boolean
  /** fill না হলে ফ্রেমের আকারের ক্লাস */
  frameClass: string
  children: ReactNode
}

export function ZoomFrame({ t, onChange, fill, frameClass, children }: FrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const size = () => {
      const r = el.getBoundingClientRect()
      return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    }
    /** ক্লায়েন্ট বিন্দু → ফ্রেম-কেন্দ্র সাপেক্ষ বিন্দু */
    const rel = (x: number, y: number) => {
      const s = size()
      return { x: x - s.cx, y: y - s.cy }
    }
    const isHandle = (e: Event) => (e.target as HTMLElement | null)?.closest('[data-handle]') != null

    const pointers = new Map<number, { x: number; y: number }>()
    let pan: { x: number; y: number; tx: number; ty: number } | null = null
    let pinch: { dist: number; z: number; mid: { x: number; y: number }; tx: number; ty: number } | null = null
    let lastTap: { time: number; x: number; y: number } | null = null
    let moved = false

    const onDown = (e: PointerEvent) => {
      if (isHandle(e)) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved = false
      const cur = tRef.current
      if (pointers.size === 1) {
        pan = { x: e.clientX, y: e.clientY, tx: cur.tx, ty: cur.ty }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pan = null
        pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          z: cur.z,
          mid: rel((a.x + b.x) / 2, (a.y + b.y) / 2),
          tx: cur.tx,
          ty: cur.ty,
        }
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const s = size()
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const factor = dist / (pinch.dist || 1)
        const mid = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
        const base: Transform = { z: pinch.z, tx: pinch.tx, ty: pinch.ty }
        const zoomed = zoomAt(base, pinch.mid, factor, s.w, s.h)
        // মধ্যবিন্দু সরলে সাথে প্যান
        onChange(clampTransform({ ...zoomed, tx: zoomed.tx + (mid.x - pinch.mid.x), ty: zoomed.ty + (mid.y - pinch.mid.y) }, s.w, s.h))
        moved = true
        return
      }
      if (pan) {
        const dx = e.clientX - pan.x
        const dy = e.clientY - pan.y
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        if (tRef.current.z > 1) {
          e.preventDefault()
          onChange(clampTransform({ z: tRef.current.z, tx: pan.tx + dx, ty: pan.ty + dy }, s.w, s.h))
        }
      }
    }

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) {
        pan = null
        // ডাবল-ট্যাপ (টাচ/পেন); মাউসের জন্য dblclick ইভেন্ট
        if (e.pointerType !== 'mouse' && !moved) {
          const now = Date.now()
          if (lastTap && now - lastTap.time < TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TAP_PX) {
            toggleZoom(e.clientX, e.clientY)
            lastTap = null
          } else {
            lastTap = { time: now, x: e.clientX, y: e.clientY }
          }
        }
      }
    }

    const toggleZoom = (cx: number, cy: number) => {
      const s = size()
      const cur = tRef.current
      if (cur.z > 1.05) onChange(IDENTITY)
      else onChange(zoomAt(cur, rel(cx, cy), DOUBLE_TAP_Z, s.w, s.h))
    }

    const onDbl = (e: MouseEvent) => {
      if (isHandle(e)) return
      e.preventDefault()
      toggleZoom(e.clientX, e.clientY)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = size()
      const factor = Math.exp(-e.deltaY * 0.0022)
      onChange(zoomAt(tRef.current, rel(e.clientX, e.clientY), factor, s.w, s.h))
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('dblclick', onDbl)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('dblclick', onDbl)
      el.removeEventListener('wheel', onWheel)
    }
  }, [onChange])

  return (
    <div
      ref={ref}
      className={[
        'relative min-h-0 w-full overflow-hidden bg-slate-900 select-none',
        fill ? 'flex-1' : frameClass,
        t.z > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
      ].join(' ')}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  )
}

/** একটি ছবির স্তর — সব স্তরে একই transform, তাই জুম/প্যান সিঙ্ক */
export function Layer({ src, alt, t }: { src: string; alt: string; t: Transform }) {
  return (
    <div
      className="absolute inset-0 will-change-transform"
      style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.z})`, transformOrigin: 'center center' }}
    >
      <SafeImage
        src={src}
        alt={alt}
        loading="eager"
        draggable={false}
        className="h-full w-full object-contain"
        placeholderClassName="h-full w-full"
      />
    </div>
  )
}

export function Badge({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <span
      className={`pointer-events-none absolute top-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm ${side === 'left' ? 'left-2' : 'right-2'}`}
    >
      {children}
    </span>
  )
}

/** স্লাইডার হ্যান্ডেল: টেনে বা ← → দিয়ে ভাগ বদল */
function SliderHandle({ split, onChange }: { split: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const handle = ref.current
      const frame = handle?.parentElement
      if (!handle || !frame) return
      e.preventDefault()
      handle.setPointerCapture(e.pointerId)
      const rect = frame.getBoundingClientRect()
      const update = (clientX: number) => onChange(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100))
      update(e.clientX)
      const move = (ev: PointerEvent) => update(ev.clientX)
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    },
    [onChange],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2
    if (e.key === 'ArrowLeft') onChange(clamp(split - step, 0, 100))
    else if (e.key === 'ArrowRight') onChange(clamp(split + step, 0, 100))
    else if (e.key === 'Home') onChange(0)
    else if (e.key === 'End') onChange(100)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      ref={ref}
      data-handle=""
      role="slider"
      tabIndex={0}
      aria-label={tr('আগে-পরে ভাগ')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split)}
      aria-valuetext={tr('{pct}% পর্যন্ত পূর্বের ঘর', { pct: toBanglaNumber(Math.round(split)) })}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="absolute top-0 bottom-0 z-10 w-10 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
      style={{ left: `${split}%` }}
    >
      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]" />
      <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand-700 text-white shadow-lg [div:focus-visible>&]:ring-4 [div:focus-visible>&]:ring-brand-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M9 6 4 12l5 6M15 6l5 6-5 6" />
        </svg>
      </div>
    </div>
  )
}

function ModeButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded px-2.5 py-1 transition disabled:opacity-40 ${active ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  )
}

export function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-base font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
    >
      {children}
    </button>
  )
}
