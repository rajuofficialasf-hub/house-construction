import { t } from '@/i18n'
import { useState, type ImgHTMLAttributes } from 'react'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  /** null/খালি হলে প্লেসহোল্ডার */
  src: string | null | undefined
  alt: string
  /** প্লেসহোল্ডারের ক্লাস (ছবির বদলে দেখানো বক্স) */
  placeholderClassName?: string
}

/**
 * ছবি না থাকলে বা লোড ব্যর্থ হলে প্লেসহোল্ডার দেখায়। ডিফল্টে lazy-load ও async decode।
 * src বদলালে আগের ব্যর্থতা ভুলে যায়।
 */
export function SafeImage({ src, alt, className, placeholderClassName, loading = 'lazy', ...rest }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = !!src && failedSrc === src

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={failed ? t('{alt} (লোড হয়নি)', { alt }) : t('{alt} (ছবি নেই)', { alt })}
        title={failed ? t('ছবি লোড হয়নি') : t('ছবি নেই')}
        className={[
          'inline-flex items-center justify-center bg-slate-100 text-slate-400',
          placeholderClassName ?? className ?? '',
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="h-1/2 w-1/2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m21 16-5-5-7 7" strokeLinecap="round" strokeLinejoin="round" />
          {failed && <path d="M4 4l16 16" strokeLinecap="round" className="text-red-400" />}
        </svg>
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => setFailedSrc(src)}
      {...rest}
    />
  )
}
