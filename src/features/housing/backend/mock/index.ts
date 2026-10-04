/**
 * মক ব্যাকএন্ড — শুধু dev ও টেস্টে (factory.ts এ dynamic import; প্রোডাকশন বিল্ডে থাকে না)।
 * VITE_HOUSING_BACKEND=mock npm run dev   → ব্রাউজারে ইন-মেমরি ব্যাকএন্ড (লগইন: fixtures.ts › MOCK_ADMIN)।
 */
import type { AuthProvider } from '../interfaces/authProvider'
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import { createMockAuthProvider } from './authProvider'
import { createMockHousingApi } from './housingApi'
import { createMockImageStorage } from './imageStorage'
import { MockStore, type MockStoreOptions } from './store'

export interface MockBackend {
  housingApi: HousingApi
  authProvider: AuthProvider
  imageStorage: ImageStorage
  store: MockStore
}

export function createMockBackend(opts: MockStoreOptions = {}): MockBackend {
  const store = new MockStore(opts)
  const imageStorage = createMockImageStorage(store)
  return { housingApi: createMockHousingApi(store, imageStorage), authProvider: createMockAuthProvider(store), imageStorage, store }
}

let app: MockBackend | null = null

/** অ্যাপের একমাত্র মক (ব্রাউজারে sessionStorage এ টেকে)। window.__housingMock.reset() দিয়ে seed এ ফেরা যায় */
export function getMockBackend(): MockBackend {
  if (!app) {
    app = createMockBackend({ persist: true })
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __housingMock: { reset: () => void } }).__housingMock = { reset: () => app!.store.reset() }
    }
  }
  return app
}

export { MOCK_ACCOUNTS, MOCK_ADMIN, MOCK_NON_ADMIN, SEED_COUNTS } from './fixtures'
