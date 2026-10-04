/**
 * ছবির স্পেক — ব্রাউজার (utils/imageProcessing.ts) ও Node স্ক্রিপ্ট (scripts/migrate-photos.mjs) দুটোই এটি ব্যবহার করে,
 * যাতে দুই পথে তৈরি ছবি একই মানের হয়।
 */
export const PHOTO_SPEC = {
  /** পূর্ণ ছবি: সর্বোচ্চ প্রস্থ (px); ছোট ছবি বড় করা হয় না */
  maxWidth: 1600,
  /** থাম্বনেইল: প্রস্থ (px) */
  thumbWidth: 400,
  /** WebP মান (০–১০০) */
  quality: 80,
  /** আউটপুট ফরম্যাট — সবসময় WebP */
  mime: 'image/webp',
  ext: 'webp',
  /** আপলোডযোগ্য ইনপুট */
  acceptMimes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  /** ইনপুট ফাইলের সর্বোচ্চ আকার (byte) — কম্প্রেশনের আগে */
  maxInputBytes: 25 * 1024 * 1024,
} as const

export function isAcceptedMime(mime: string): boolean {
  return (PHOTO_SPEC.acceptMimes as readonly string[]).includes(mime)
}
