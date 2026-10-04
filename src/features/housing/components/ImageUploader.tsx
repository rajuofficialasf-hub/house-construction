import { t } from '@/i18n'
import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { toBanglaNumber } from '@/lib/banglaNumber'
import { formatBytes } from '../utils/imageProcessing'
import { isAcceptedMime, PHOTO_SPEC } from '../utils/photoSpec'
import { STATUS_CLASS, STATUS_LABEL, type UploadItem, type UploadStatus } from '../utils/uploadItems'

interface Props {
  items: UploadItem[]
  onAdd: (files: File[]) => void
  onRemove?: (id: string) => void
  multiple?: boolean
  disabled?: boolean
  /** ড্রপ-জোনের নিচের ইঙ্গিত */
  hint?: ReactNode
  /** false হলে শুধু ড্রপ-জোন; তালিকা parent নিজে দেখাবে (বাল্ক পেইজ) */
  showList?: boolean
}

/**
 * পুনর্ব্যবহারযোগ্য ছবি আপলোডার: ড্র্যাগ-ড্রপ / ক্লিক করে বাছাই, প্রিভিউ, অবস্থা ও প্রগ্রেস।
 * আপলোড নিজে করে না — parent ফাইল নিয়ে processImage → HousingApi.uploadPhoto চালায় এবং items এর status আপডেট করে
 * (items তৈরি/মুক্ত: utils/uploadItems.ts)। ধাপ ১১ এর এডমিন ফর্মে (একক ছবি) ও ধাপ ৭ এর বাল্ক পেইজে (অনেক ছবি) ব্যবহৃত।
 */
export function ImageUploader({ items, onAdd, onRemove, multiple = true, disabled = false, hint, showList = true }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const accept = PHOTO_SPEC.acceptMimes.join(',')

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || disabled) return
      const files = Array.from(list).filter((f) => !f.type || isAcceptedMime(f.type))
      if (files.length) onAdd(multiple ? files : files.slice(0, 1))
      if (inputRef.current) inputRef.current.value = ''
    },
    [onAdd, multiple, disabled],
  )

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
          disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60' : '',
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40',
        ].join(' ')}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 h-10 w-10 text-brand-600">
          <path d="M12 16V4m0 0-4 4m4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <p className="text-sm font-medium text-slate-800">
          {multiple ? t('ছবিগুলো এখানে টেনে ছাড়ুন বা ক্লিক করে বাছুন') : t('ছবি এখানে টেনে ছাড়ুন বা ক্লিক করে বাছুন')}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t('jpg / png / webp · আপলোডের আগে স্বয়ংক্রিয়ভাবে {px}px WebP এ কম্প্রেস হবে', { px: toBanglaNumber(PHOTO_SPEC.maxWidth) })}
        </p>
        {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {showList && items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
              <img src={it.previewUrl} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{it.file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(it.file.size)}</p>
                {(it.status === 'uploading' || it.status === 'processing') && (
                  <ProgressBar value={it.status === 'processing' ? undefined : (it.progress ?? 0)} />
                )}
                {it.message && <p className="mt-0.5 truncate text-xs text-slate-600">{it.message}</p>}
              </div>
              <StatusPill status={it.status} />
              {onRemove && it.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  aria-label={t('বাদ দিন')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StatusPill({ status }: { status: UploadStatus }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {t(STATUS_LABEL[status])}
    </span>
  )
}

/** value undefined → অনির্দিষ্ট (indeterminate) */
export function ProgressBar({ value, label }: { value?: number; label?: string }) {
  const pct = value === undefined ? undefined : Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div
        className={`h-full rounded-full bg-brand-600 transition-[width] duration-300 ${pct === undefined ? 'w-1/3 animate-pulse' : ''}`}
        style={pct === undefined ? undefined : { width: `${pct}%` }}
      />
    </div>
  )
}
