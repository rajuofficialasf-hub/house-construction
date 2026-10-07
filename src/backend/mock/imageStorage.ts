import type { ImageStorage } from './storage'
import { HousingApiError } from '../interfaces/types'
import { photoPath } from '@/features/housing/utils/imagePath'
import { MOCK_PHOTO_PREFIX } from './fixtures'
import { photoUrl, type MockStore } from './store'

/** ছবির বাইট রাখা হয় না — শুধু কোন পাথে ফাইল আছে তা; URL এ vite dev সার্ভার প্লেসহোল্ডার SVG দেয় */
export function createMockImageStorage(store: MockStore): ImageStorage {
  return {
    async upload(_file, target) {
      const path = photoPath(target.project_type, target.serial_no, target.kind, target.variant)
      store.files.add(path)
      return { path, url: photoUrl(path) }
    },
    async delete(paths) {
      for (const p of paths) store.files.delete(p)
    },
    async move(fromPath, toPath) {
      if (!store.files.has(fromPath)) throw new HousingApiError('NOT_FOUND', 'ছবি পাওয়া যায়নি')
      store.files.delete(fromPath)
      store.files.add(toPath)
      return { path: toPath, url: photoUrl(toPath) }
    },
    publicUrl: photoUrl,
    pathFromUrl(url) {
      const i = url.indexOf(MOCK_PHOTO_PREFIX)
      return i === -1 ? null : decodeURIComponent(url.slice(i + MOCK_PHOTO_PREFIX.length).split('?')[0])
    },
  }
}
