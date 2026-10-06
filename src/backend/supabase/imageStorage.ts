import type { ImageStorage } from '../interfaces/imageStorage'
import { photoPath } from '../../features/housing/utils/imagePath'
import { PHOTO_SPEC } from '../../features/housing/utils/photoSpec'
import { STORAGE_BUCKET, type GetClient } from './client'
import { mapSupabaseError } from './errors'

/** পাবলিক URL এর যে অংশের পরে স্টোরেজ পাথ থাকে */
const PUBLIC_PREFIX = `/storage/v1/object/public/${STORAGE_BUCKET}/`

/**
 * Supabase Storage অ্যাডাপ্টার। bucket `housing-photos` (public read, admin write — supabase/sql/05_storage.sql)।
 * পাথ সিরিয়াল-ভিত্তিক (utils/imagePath.ts › photoPath), সবসময় WebP; একই পাথে upsert = ওভাররাইট।
 */
export function createSupabaseImageStorage(getClient: GetClient): ImageStorage {
  const bucket = () => getClient().storage.from(STORAGE_BUCKET)

  const publicUrl = (path: string): string => bucket().getPublicUrl(path).data.publicUrl

  return {
    async upload(file, target) {
      const path = photoPath(target.project_type, target.serial_no, target.kind, target.variant)
      const opts = { contentType: PHOTO_SPEC.mime, cacheControl: '86400' }
      // আগে নতুন ফাইল হিসেবে (প্রকল্পের ইউজারও পারেন); ফাইল আগেই থাকলে তবেই ওভাররাইট — সেটি শুধু মূল এডমিন
      // (SQL ১৪ এর Storage পলিসি; ইউজারের ক্ষেত্রে বাংলা "অনুমতি নেই")। পর্ব চ, M-ধাপ ১৮।
      let { error } = await bucket().upload(path, file, { ...opts, upsert: false })
      if (error && isAlreadyExists(error)) {
        ;({ error } = await bucket().upload(path, file, { ...opts, upsert: true }))
        if (error) throw mapSupabaseError(error, 'ছবি আপলোড ব্যর্থ হয়েছে')
      } else if (error) {
        throw mapSupabaseError(error, 'ছবি আপলোড ব্যর্থ হয়েছে')
      }
      return { path, url: publicUrl(path) }
    },

    async delete(paths) {
      if (paths.length === 0) return
      const { error } = await bucket().remove(paths)
      if (error) throw mapSupabaseError(error, 'ছবি মুছতে সমস্যা হয়েছে')
    },

    async move(fromPath, toPath) {
      const { error } = await bucket().move(fromPath, toPath)
      if (error) throw mapSupabaseError(error, 'ছবি সরাতে সমস্যা হয়েছে')
      return { path: toPath, url: publicUrl(toPath) }
    },

    publicUrl,

    pathFromUrl(url) {
      const idx = url.indexOf(PUBLIC_PREFIX)
      if (idx === -1) return null
      const rest = url.slice(idx + PUBLIC_PREFIX.length)
      return decodeURIComponent(rest.split('?')[0])
    },
  }
}

/** Storage এর "ফাইল আগেই আছে" (statusCode 409 / "already exists" / Duplicate) */
function isAlreadyExists(err: unknown): boolean {
  const e = (err ?? {}) as { statusCode?: string | number; message?: string; error?: string }
  return String(e.statusCode ?? '') === '409' || /already exists|duplicate/i.test(`${e.message ?? ''} ${e.error ?? ''}`)
}
