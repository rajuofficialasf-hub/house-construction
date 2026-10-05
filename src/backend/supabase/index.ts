/**
 * Supabase অ্যাডাপ্টার (টেস্ট ব্যাকএন্ড)।
 * Supabase-নির্দিষ্ট সবকিছু (client, RPC, RLS-নির্ভর query, Storage bucket) শুধু এই ফোল্ডারে।
 * সংশ্লিষ্ট SQL: supabase/sql/*.sql · পুরনো ডাটাবেসে চলার নিয়ম: ./legacy.ts
 *
 * সব ফ্যাক্টরি একটি `GetClient` (() => SupabaseClient) নেয়:
 *   ব্রাউজার → factory.ts এ getSupabase (anon key);
 *   Node স্ক্রিপ্ট → service_role client (scripts/migrate-photos.mjs), options.trustedServer = true।
 */
export { createSupabaseHousingApi, type SupabaseHousingApiOptions } from './housingApi'
export { createSupabaseProjectsApi, type SupabaseProjectsApiOptions } from './projectsApi'
export { createSupabaseAuthProvider } from './authProvider'
export { createSupabaseImageStorage } from './imageStorage'
export { STORAGE_BUCKET, TABLE, type GetClient } from './client'
