import { getImageStorage } from '@/backend'
import { photoSrc } from '@/features/housing/utils/imagePath'

/**
 * প্রকল্পের কভার ছবির URL (M-ধাপ ১৫): `cover_path` (স্টোরেজ পাথ `housing/_projects/{key}/cover.webp`) → পাবলিক URL,
 * ক্যাশ-ভাঙা ?v=প্রকল্পের updated_at (একই পাথে ওভাররাইট হয়)। পাথ নেই বা এই ব্যাকএন্ডে URL বানানো যায় না → null।
 */
export function coverSrc(coverPath: string | null | undefined, updatedAt: string | null | undefined): string | null {
  if (!coverPath) return null
  try {
    return photoSrc(getImageStorage().publicUrl(coverPath), updatedAt ?? null)
  } catch {
    return null
  }
}
