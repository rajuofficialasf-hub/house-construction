import type { PhotoKind, PhotoVariant, ProjectType } from '../backend/interfaces/types'
import { PHOTO_SPEC } from './photoSpec'

/** bucket এর ভেতরে মূল ফোল্ডার */
export const PHOTO_ROOT = 'housing'

/** সিরিয়াল ৪ অঙ্কে (৯৯৯৯ ছাড়ালে স্বাভাবিকভাবে বড়) */
export function padSerial(serialNo: number): string {
  return String(serialNo).padStart(4, '0')
}

/**
 * সিরিয়াল-ভিত্তিক স্টোরেজ পাথ (ধাপ ৭ নিয়ম):
 *   housing/{project_type}/{serial ৪ অঙ্ক}/prev.webp | prev_thumb.webp | current.webp | current_thumb.webp
 * photoPath('semi_pucca', 1, 'prev')          → "housing/semi_pucca/0001/prev.webp"
 * photoPath('tin', 12, 'current', 'thumb')    → "housing/tin/0012/current_thumb.webp"
 * একই সিরিয়ালের ছবি আপডেট = একই পাথে ওভাররাইট; ক্যাশ ভাঙে photo_updated_at (?v=) দিয়ে।
 */
export function photoPath(
  type: ProjectType,
  serialNo: number,
  kind: PhotoKind,
  variant: PhotoVariant = 'full',
): string {
  const suffix = variant === 'thumb' ? '_thumb' : ''
  return `${PHOTO_ROOT}/${type}/${padSerial(serialNo)}/${kind}${suffix}.${PHOTO_SPEC.ext}`
}

/** MIME টাইপ থেকে ফাইল এক্সটেনশন (jpg/png/webp); অচেনা হলে null */
export function extFromMime(mime: string): string | null {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

/** ছবির URL এ ক্যাশ-ভাঙা প্যারামিটার যোগ করে; url null হলে null */
export function photoSrc(url: string | null, photoUpdatedAt: string | null): string | null {
  if (!url) return null
  if (!photoUpdatedAt) return url
  const v = encodeURIComponent(Date.parse(photoUpdatedAt) || photoUpdatedAt)
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}
