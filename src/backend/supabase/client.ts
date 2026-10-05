/**
 * Supabase ক্লায়েন্ট।
 * - ব্রাউজার: getSupabase() — env থেকে anon (public) key; service_role key কখনো ফ্রন্টএন্ডে আসবে না।
 * - Node স্ক্রিপ্ট (scripts/migrate-photos.mjs): নিজে createClient(service_role) করে অ্যাডাপ্টারে `() => client` দেয়।
 * অ্যাডাপ্টারগুলো ক্লায়েন্ট lazily (`GetClient`) নেয়, যাতে env না থাকলেও ইমপোর্টে ক্র্যাশ না করে — মেথড কলে এরর দেয়।
 * এই ফোল্ডারের বাইরে কোথাও supabase-js import করা যাবে না।
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HousingApiError } from '../interfaces/types'

export type GetClient = () => SupabaseClient

export const STORAGE_BUCKET = 'housing-photos'
export const TABLE = 'housing_beneficiaries'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) {
    throw new HousingApiError(
      'CONFIG_ERROR',
      'VITE_SUPABASE_URL অথবা VITE_SUPABASE_ANON_KEY সেট নেই (.env.local দেখুন)',
    )
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}
