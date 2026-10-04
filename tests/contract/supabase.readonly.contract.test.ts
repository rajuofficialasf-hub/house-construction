import { createClient } from '@supabase/supabase-js'
import { describe, test } from 'vitest'
import { createSupabaseAuthProvider, createSupabaseHousingApi, createSupabaseImageStorage } from '../../src/features/housing/backend/supabase'
import { runHousingApiContract } from './housingApiContract'
import type { ContractHarness } from './harness'

// লাইভ Supabase এ শুধু পড়ার চুক্তি। কোনো লেখা কখনো যায় না (সিরিয়াল কাউন্টার কমে না, তাই একটি create ও স্থায়ী সিরিয়াল পুড়িয়ে দেয়)।
// credentials: VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY (.env.local)। না থাকলে স্কিপ।
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

const READ_RPCS = /\/rest\/v1\/rpc\/(housing_stats|housing_years|housing_next_serial|housing_current_admin)(\?|$)/

/** লেখার সম্ভাবনা থাকা যেকোনো অনুরোধ আটকে দেয়: শুধু GET/HEAD এবং উপরের পড়ার RPC অনুমোদিত */
const readOnlyFetch: typeof fetch = async (input, init) => {
  const req = new Request(input, init)
  const method = req.method.toUpperCase()
  const isRead = method === 'GET' || method === 'HEAD' || (method === 'POST' && READ_RPCS.test(req.url))
  if (!isRead) throw new Error(`LIVE WRITE BLOCKED: ${method} ${req.url}`)
  return fetch(input, init)
}

function makeLive(): ContractHarness {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: readOnlyFetch } })
  const getClient = () => client
  return {
    api: createSupabaseHousingApi(getClient, createSupabaseImageStorage(getClient)),
    auth: createSupabaseAuthProvider(getClient),
  }
}

if (url && key) {
  runHousingApiContract('live supabase (read-only)', makeLive, { writes: false })
} else {
  describe('live supabase (read-only)', () => {
    test.skip('skipped: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set', () => {})
  })
}
