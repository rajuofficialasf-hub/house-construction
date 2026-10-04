import type { ImageStorage } from '../interfaces/imageStorage'
import { photoPath } from '../../utils/imagePath'
import { PHOTO_SPEC } from '../../utils/photoSpec'
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
      const { error } = await bucket().upload(path, file, {
        upsert: true,
        contentType: PHOTO_SPEC.mime,
        cacheControl: '86400',
      })
      if (error) throw mapSupabaseError(error, 'ছবি আপলোড ব্যর্থ হয়েছে')
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
