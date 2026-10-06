import { t as tr } from '@/i18n'
import { useEffect, useRef, useState } from 'react'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { Layer, ToolButton, ZoomFrame, type Transform } from '@/features/housing/components/PhotoCompare'

interface Props {
  src: string | null
  /** alt এর ভিত্তি, যেমন উপকারভোগীর নাম */
  alt: string
  /** ছবির লেবেল (প্রকল্পের, বর্তমান ভাষায়) — যেমন "উপকরণসহ ছবি" */
  label: string
  className?: string
  /** ফ্রেমের উচ্চতা/অনুপাতের ক্লাস (ফুলস্ক্রিনে নয়) */
  frameClassName?: string
}

const IDENTITY: Transform = { z: 1, tx: 0, ty: 0 }
const MIN_Z = 1
const MAX_Z = 6

/**
 * শুধু-পরের-ছবির প্রকল্পের একক ছবি (M-ধাপ ১৪) — কোনো স্লাইডার বা "তুলনা সম্ভব নয়" লেখা নেই।
 * জুম/প্যান/পিঞ্চ/ডাবল-ট্যাপ PhotoCompare এর ZoomFrame দিয়েই (একই আচরণ); −/+/রিসেট আর ফুলস্ক্রিন।
 * পেছনে একই ছবির ঝাপসা কপি — ভিন্ন অনুপাতের ছবিতেও ফ্রেম ভরা দেখায় (মূল ছবি object-contain, কাটা যায় না)।
 * data-compare: ভেতরের টাচ (প্যান/পিঞ্চ) বিস্তারিত মডালের সোয়াইপ-নেভিগেশন নয়।
 */
export function PhotoViewer({ src, alt, label, className = '', frameClassName = 'aspect-[4/3]' }: Props) {
  const [t, setT] = useState<Transform>(IDENTITY)
  const [isFs, setIsFs] = useState(false)
  const [shownSrc, setShownSrc] = useState(src)
  const rootRef = useRef<HTMLDivElement>(null)
  const fsSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled

  // অন্য রেকর্ডের ছবিতে গেলে জুম শুরু থেকে (রেন্ডারের সময়ই — effect এ setState নয়)
  if (shownSrc !== src) {
    setShownSrc(src)
    setT(IDENTITY)
  }

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
  // বাটনের জুম কেন্দ্রে (PhotoCompare এর মতো — প্যান শুরু থেকে)
  const zoomBy = (factor: number) => setT((cur) => ({ z: Math.min(MAX_Z, Math.max(MIN_Z, cur.z * factor)), tx: 0, ty: 0 }))

  return (
    <div
      ref={rootRef}
      data-compare=""
      data-photo-viewer=""
      className={[
        'flex flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm',
        isFs ? 'h-screen w-screen rounded-none border-0 bg-black' : 'bg-white',
        className,
      ].join(' ')}
    >
      {/* ---------- টুলবার ---------- */}
      <div className={`flex items-center justify-between gap-2 px-3 py-1.5 ${isFs ? 'bg-black/80 text-white' : 'bg-white'}`}>
        <p className={`min-w-0 truncate text-sm font-semibold ${isFs ? 'text-white' : 'text-slate-800'}`}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-500 align-middle" aria-hidden="true" />
          {label}
        </p>
        {src && (
          <div className="flex shrink-0 items-center gap-1">
            <ToolButton label={tr('ছোট করুন')} onClick={() => zoomBy(1 / 1.25)} disabled={t.z <= MIN_Z}>
              −
            </ToolButton>
            <span className={`w-12 text-center text-xs tabular-nums ${isFs ? 'text-white' : 'text-slate-600'}`} aria-live="polite">
              {toBanglaNumber(Math.round(t.z * 100))}%
            </span>
            <ToolButton label={tr('বড় করুন')} onClick={() => zoomBy(1.25)} disabled={t.z >= MAX_Z}>
              +
            </ToolButton>
            <ToolButton label={tr('রিসেট')} onClick={() => setT(IDENTITY)} disabled={t.z === 1 && t.tx === 0 && t.ty === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
              </svg>
            </ToolButton>
            {fsSupported && (
              <ToolButton label={isFs ? tr('ফুলস্ক্রিন বন্ধ') : tr('ফুলস্ক্রিন')} onClick={() => void toggleFullscreen()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  {isFs ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /> : <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />}
                </svg>
              </ToolButton>
            )}
          </div>
        )}
      </div>

      {/* ---------- ফ্রেম ---------- */}
      {src ? (
        <ZoomFrame t={t} onChange={setT} fill={isFs} frameClass={frameClassName}>
          {!isFs && <img src={src} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />}
          <Layer src={src} alt={alt + ' — ' + label} t={t} />
        </ZoomFrame>
      ) : (
        <div className={`flex items-center justify-center bg-slate-100 text-sm text-slate-500 ${isFs ? 'flex-1' : frameClassName}`}>{tr('এই উপকারভোগীর কোনো ছবি নেই।')}</div>
      )}
    </div>
  )
}
