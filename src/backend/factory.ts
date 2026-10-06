/**
 * অ্যাডাপ্টার ফ্যাক্টরি।
 * env ভ্যারিয়েবল VITE_HOUSING_BACKEND ('supabase' | 'rest') দেখে কোন অ্যাডাপ্টার চলবে তা ঠিক করে।
 * UI কোড শুধু getHousingApi / getProjectsApi / getAuthProvider / getImageStorage ব্যবহার করবে।
 */
import type { AuthProvider } from './interfaces/authProvider'
import type { HousingApi } from './interfaces/housingApi'
import type { ImageStorage } from './interfaces/imageStorage'
import type { ProjectsApi } from './interfaces/projectsApi'
import type { AdminUsersApi } from './interfaces/adminUsersApi'
import {
  createSupabaseAdminUsersApi,
  createSupabaseAuthProvider,
  createSupabaseHousingApi,
  createSupabaseImageStorage,
  createSupabaseProjectsApi,
} from './supabase'
import { getSupabase } from './supabase/client'
import { createRestAdminUsersApi, createRestAuthProvider, createRestHousingApi, createRestImageStorage, createRestProjectsApi } from './rest'

export type BackendKind = 'supabase' | 'rest'

const DEFAULT_BACKEND: BackendKind = 'supabase'

export function getBackendKind(): BackendKind {
  const raw = (import.meta.env.VITE_HOUSING_BACKEND ?? '').trim().toLowerCase()
  if (raw === 'supabase' || raw === 'rest') return raw
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

function buildBackend(): Backend {
  const kind = getBackendKind()
  if (kind === 'rest') {
    const base = restBaseUrl()
    return {
      housingApi: createRestHousingApi(base),
      projectsApi: createRestProjectsApi(base),
      authProvider: createRestAuthProvider(base),
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
