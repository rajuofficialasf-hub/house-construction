import { t } from '@/i18n'
import { useEffect, useRef, type TouchEvent } from 'react'
import { SafeImage } from './SafeImage'

export interface LightboxImage {
  /** বড় ছবির URL (?v= সহ) */
  src: string | null
  alt: string
  caption?: string
}

interface Props {
  image: LightboxImage | null
  onClose: () => void
}

/**
 * বড় ছবির মোডাল। Esc বা ব্যাকড্রপে ক্লিকে বন্ধ। খোলা থাকলে body স্ক্রল বন্ধ, ফোকাস ক্লোজ বাটনে।
 * বড় ছবি শুধু এখানে লোড হয় (টেবিলে নয়) — ব্যান্ডউইথ বাঁচাতে।
 */
export function Lightbox({ image, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!image) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [image, onClose])

  // টাচ: নিচে/উপরে ৮০px+ সোয়াইপ করলে বন্ধ (মোবাইল গ্যালারির মতো)
  const touchY = useRef<number | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    touchY.current = e.touches[0].clientY
  }
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchY.current
    touchY.current = null
    if (start !== null && Math.abs(e.changedTouches[0].clientY - start) > 80) onClose()
  }

  if (!image) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-8"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={t('বন্ধ করুন')}
        className="absolute top-3 right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="h-6 w-6">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <figure className="flex max-h-full max-w-5xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <SafeImage
          src={image.src}
          alt={image.alt}
          loading="eager"
          className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl"
          placeholderClassName="h-64 w-64 rounded-lg"
        />
        {image.caption && (
          <figcaption className="mt-3 max-w-full truncate rounded-full bg-white/10 px-4 py-1.5 text-center text-sm text-white">
            {image.caption}
          </figcaption>
        )}
      </figure>
    </div>
  )
}
