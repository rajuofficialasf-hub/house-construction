import { t } from '@/i18n'
import { HousingApiError } from '../backend/interfaces/types'
import { isAcceptedMime, PHOTO_SPEC } from './photoSpec'

export interface ProcessedImage {
  /** পূর্ণ ছবি: সর্বোচ্চ ১৬০০px চওড়া, WebP ~৮০% */
  photo: Blob
  /** থাম্বনেইল: ৪০০px চওড়া, WebP */
  thumb: Blob
  width: number
  height: number
}

/**
 * ব্রাউজারে ক্লায়েন্ট-সাইড কম্প্রেশন (canvas)। EXIF orientation স্বয়ংক্রিয়ভাবে ঠিক হয় (imageOrientation: 'from-image')।
 * Node স্ক্রিপ্টে একই কাজ sharp দিয়ে হয় (scripts/migrate-photos.mjs), একই PHOTO_SPEC।
 */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (file.type && !isAcceptedMime(file.type)) {
    throw new HousingApiError('VALIDATION_ERROR', t('অগ্রহণযোগ্য ফাইল টাইপ: {type} (jpg/png/webp দিন)', { type: file.type }))
  }
  if (file.size > PHOTO_SPEC.maxInputBytes) {
    throw new HousingApiError('PAYLOAD_TOO_LARGE', t('ছবি ২৫ MB এর বেশি'))
  }
  const bitmap = await loadBitmap(file)
  try {
    const photo = await toWebp(bitmap, PHOTO_SPEC.maxWidth)
    const thumb = await toWebp(bitmap, PHOTO_SPEC.thumbWidth)
    const scale = Math.min(1, PHOTO_SPEC.maxWidth / bitmap.width)
    return {
      photo,
      thumb,
      width: Math.round(bitmap.width * scale),
      height: Math.round(bitmap.height * scale),
    }
  } finally {
    bitmap.close()
  }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    try {
      return await createImageBitmap(file)
    } catch {
      throw new HousingApiError('VALIDATION_ERROR', t('ছবিটি পড়া যায়নি (নষ্ট ফাইল বা অসমর্থিত ফরম্যাট)'))
    }
  }
}

function toWebp(bitmap: ImageBitmap, maxWidth: number): Promise<Blob> {
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new HousingApiError('INTERNAL_ERROR', t('canvas পাওয়া যায়নি'))
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === PHOTO_SPEC.mime) resolve(blob)
        else reject(new HousingApiError('INTERNAL_ERROR', t('এই ব্রাউজারে WebP তৈরি করা যায়নি')))
      },
      PHOTO_SPEC.mime,
      PHOTO_SPEC.quality / 100,
    )
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
