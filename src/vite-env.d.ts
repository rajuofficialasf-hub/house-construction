/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** কোন অ্যাডাপ্টার চলবে: 'rest' | 'mock' (mock: শুধু dev/test) */
  readonly VITE_HOUSING_BACKEND?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
