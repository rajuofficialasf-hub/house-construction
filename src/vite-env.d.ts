/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** কোন অ্যাডাপ্টার চলবে: 'supabase' | 'rest' */
  readonly VITE_HOUSING_BACKEND?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
