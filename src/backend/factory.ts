/**
 * অ্যাডাপ্টার ফ্যাক্টরি।
 * env ভ্যারিয়েবল VITE_HOUSING_BACKEND ('supabase' | 'rest' | 'mock' — mock শুধু dev/test) দেখে কোন অ্যাডাপ্টার চলবে তা ঠিক করে।
 * UI কোড শুধু getHousingApi / getProjectsApi / getAuthProvider / getImageStorage ব্যবহার করবে।
 */
import type { AuthProvider } from './interfaces/authProvider'
import type { HousingApi } from './interfaces/housingApi'
import type { ImageStorage } from './interfaces/imageStorage'
import type { ProjectsApi } from './interfaces/projectsApi'
import type { AdminUsersApi } from './interfaces/adminUsersApi'
import { HousingApiError } from './interfaces/types'
import {
  createSupabaseAdminUsersApi,
  createSupabaseAuthProvider,
  createSupabaseHousingApi,
  createSupabaseImageStorage,
  createSupabaseProjectsApi,
} from './supabase'
import { getSupabase } from './supabase/client'
import { createRestAdminUsersApi, createRestAuthProvider, createRestHousingApi, createRestImageStorage, createRestProjectsApi } from './rest'

export type BackendKind = 'supabase' | 'rest' | 'mock'

const DEFAULT_BACKEND: BackendKind = 'rest'

export function getBackendKind(): BackendKind {
  const raw = (import.meta.env.VITE_HOUSING_BACKEND ?? '').trim().toLowerCase()
  if (raw === 'supabase' || raw === 'rest') return raw
  // 'mock' (ইন-মেমরি, টেস্টের জন্য) শুধু dev/test এ; প্রোডাকশন বিল্ডে উপেক্ষিত হয়ে ডিফল্টে ফেরে
  if (raw === 'mock' && import.meta.env.DEV) return raw
  if (raw !== '' && import.meta.env.DEV) {
    console.warn(
      `[housing] VITE_HOUSING_BACKEND="${raw}" অচেনা; ডিফল্ট "${DEFAULT_BACKEND}" ব্যবহার হচ্ছে`,
    )
  }
  return DEFAULT_BACKEND
}

function restBaseUrl(): string {
  const url = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (!url && import.meta.env.DEV) {
    console.warn('[housing] VITE_API_BASE_URL সেট নেই; REST অ্যাডাপ্টার কাজ করবে না')
  }
  return url.replace(/\/+$/, '')
}

interface Backend {
  housingApi: HousingApi
  projectsApi: ProjectsApi
  authProvider: AuthProvider
  imageStorage: ImageStorage
  adminUsersApi: AdminUsersApi
}

let cached: Backend | null = null

/**
 * মক ব্যাকএন্ড lazy লোড হয় (dynamic import) — import.meta.env.DEV গার্ডের কারণে প্রোডাকশন বিল্ডে এই ফাংশন ও মক কোড বাদ পড়ে।
 * UI সবসময় async মেথড ডাকে, তাই প্রথম কলে মডিউল লোড হওয়া পর্যন্ত অপেক্ষা যথেষ্ট।
 */
function buildMockBackend(): Backend {
  const load = () => import('./mock').then((m) => m.getMockBackend())
  const lazy = <T extends object>(pick: (b: Awaited<ReturnType<typeof load>>) => T) =>
    new Proxy({} as T, {
      // 'then' undefined: কেউ প্রক্সিটাকে await করলে সেটি thenable মনে হয়ে ঝুলে যেত
      get: (_t, prop: string) => prop === 'then' ? undefined : (...args: unknown[]) => load().then((b) => (pick(b) as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args)),
    })
  const housingApi = lazy((b) => b.housingApi)
  const projectsApi = lazy((b) => b.projectsApi)
  const authProvider: AuthProvider = {
    login: (email, password) => load().then((b) => b.authProvider.login(email, password)),
    logout: () => load().then((b) => b.authProvider.logout()),
    currentUser: () => load().then((b) => b.authProvider.currentUser()),
    isAdmin: () => load().then((b) => b.authProvider.isAdmin()),
    onAuthChange(callback) {
      let off = () => {}
      let cancelled = false
      void load().then((b) => {
        if (!cancelled) off = b.authProvider.onAuthChange(callback)
      })
      return () => {
        cancelled = true
        off()
      }
    },
  }
  const imageStorage: ImageStorage = {
    upload: (file, target) => load().then((b) => b.imageStorage.upload(file, target)),
    delete: (paths) => load().then((b) => b.imageStorage.delete(paths)),
    move: (from, to) => load().then((b) => b.imageStorage.move(from, to)),
    publicUrl: () => {
      throw new Error('mock ImageStorage.publicUrl: সিঙ্ক্রোনাস কল সমর্থিত নয়')
    },
    pathFromUrl: () => null,
  }
  // ইউজার-ব্যবস্থাপনা (পর্ব চ) মকে নেই — প্যারিটি a8e2154 এ স্থির, REST অ্যাডাপ্টারের মতোই NOT_IMPLEMENTED
  const notInMock = async (): Promise<never> => {
    throw new HousingApiError('NOT_IMPLEMENTED', 'মক ব্যাকএন্ডে ইউজার-ব্যবস্থাপনা নেই')
  }
  const adminUsersApi: AdminUsersApi = { list: notInMock, save: notInMock }
  return { housingApi, projectsApi, authProvider, imageStorage, adminUsersApi }
}

function buildBackend(): Backend {
  const kind = getBackendKind()
  if (kind === 'mock' && import.meta.env.DEV) return buildMockBackend()
  if (kind === 'rest') {
    const base = restBaseUrl()
    const projectsApi = createRestProjectsApi(base)
    const authProvider = createRestAuthProvider(base)
    // এক এডমিনের চলমান (খসড়াসহ) তালিকা যেন পরের এডমিনের সঙ্গে ভাগ না হয়; ব্যাকএন্ড ক্যাশ হয়, তাই সাবস্ক্রিপশন একবারই
    authProvider.onAuthChange(() => projectsApi.clearInFlight())
    return {
      housingApi: createRestHousingApi(base),
      projectsApi,
      authProvider,
      imageStorage: createRestImageStorage(base),
      adminUsersApi: createRestAdminUsersApi(base),
    }
  }
  // lazy: env না থাকলে মেথড কলে CONFIG_ERROR, ইমপোর্ট/রেন্ডারে ক্র্যাশ নয়
  const imageStorage = createSupabaseImageStorage(getSupabase)
  // একটিই ProjectsApi: রেকর্ডের adapter একই ক্যাশ ও পুরনো-ডাটাবেস অবস্থা ব্যবহার করে
  const projectsApi = createSupabaseProjectsApi(getSupabase)
  return {
    housingApi: createSupabaseHousingApi(getSupabase, imageStorage, { projects: projectsApi }),
    projectsApi,
    authProvider: createSupabaseAuthProvider(getSupabase),
    imageStorage,
    adminUsersApi: createSupabaseAdminUsersApi(getSupabase),
  }
}

function backend(): Backend {
  if (!cached) cached = buildBackend()
  return cached
}

export function getHousingApi(): HousingApi {
  return backend().housingApi
}

export function getProjectsApi(): ProjectsApi {
  return backend().projectsApi
}

export function getAuthProvider(): AuthProvider {
  return backend().authProvider
}

export function getImageStorage(): ImageStorage {
  return backend().imageStorage
}

/** ইউজার-ব্যবস্থাপনা (শুধু মূল এডমিন; পর্ব চ) */
export function getAdminUsersApi(): AdminUsersApi {
  return backend().adminUsersApi
}
