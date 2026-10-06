import { describe, test } from 'vitest'
import {
  createStandaloneClient,
  createSupabaseAuthProvider,
  createSupabaseHousingApi,
  createSupabaseImageStorage,
} from '../../src/backend/supabase'
import { runHousingApiContract } from './housingApiContract'
import type { ContractHarness, Credentials } from './harness'

// পূর্ণ চুক্তি-স্যুট (লেখাসহ) লোকাল Supabase স্ট্যাকে: লাইভ প্রজেক্ট যে SQL থেকে তৈরি (supabase/sql, config.toml › db.seed), সেই একই SQL।
// উদ্দেশ্য: মকে এনকোড করা নিয়মগুলো (সিরিয়াল, RLS, বাল্ক, একটিভিটি লগ) আসল Supabase আচরণের সাথে মেলানো।
// চালান: npm run test:contract:supabase-local (স্ট্যাক চালু করে, DB রিসেট করে, env দেয়)। env না থাকলে স্কিপ।
const url = (process.env.LOCAL_SUPABASE_URL ?? '').trim()
const anonKey = (process.env.LOCAL_SUPABASE_ANON_KEY ?? '').trim()
const serviceKey = (process.env.LOCAL_SUPABASE_SERVICE_KEY ?? '').trim()

const ADMIN: Credentials = { email: 'contract-admin@local.test', password: 'contract-admin-pass' }
const NON_ADMIN: Credentials = { email: 'contract-viewer@local.test', password: 'contract-viewer-pass' }

/** service key সাথে থাকে, তাই লোকাল ছাড়া অন্য কোনো হোস্টে কখনো চলবে না */
function assertLocal(u: string): void {
  const host = new URL(u).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`LOCAL_SUPABASE_URL must point at localhost, got ${host}`)
}

type Client = ReturnType<typeof createStandaloneClient>

async function ensureUser(service: Client, c: Credentials): Promise<string> {
  const created = await service.auth.admin.createUser({ email: c.email, password: c.password, email_confirm: true })
  if (created.data.user) return created.data.user.id
  const { data, error } = await service.auth.admin.listUsers()
  if (error) throw error
  const found = data.users.find((u) => u.email === c.email)
  if (!found) throw created.error ?? new Error(`could not create ${c.email}`)
  return found.id
}

let accounts: Promise<void> | undefined
/** এডমিন ও নন-এডমিন অ্যাকাউন্ট একবার তৈরি; নন-এডমিন housing_admins এ নেই (AE2) */
function ensureAccounts(): Promise<void> {
  accounts ??= (async () => {
    const service = createStandaloneClient(url, serviceKey)
    const adminId = await ensureUser(service, ADMIN)
    await ensureUser(service, NON_ADMIN)
    const { error } = await service.from('housing_admins').upsert({ user_id: adminId, email: ADMIN.email, role: 'admin' })
    if (error) throw error
  })()
  return accounts
}

async function makeLocal(): Promise<ContractHarness> {
  await ensureAccounts()
  const client = createStandaloneClient(url, anonKey)
  const getClient = () => client
  return {
    api: createSupabaseHousingApi(getClient, createSupabaseImageStorage(getClient)),
    auth: createSupabaseAuthProvider(getClient),
    admin: ADMIN,
    nonAdmin: NON_ADMIN,
    // অ্যাপের login() নন-এডমিনকে সাথে সাথে signOut করে, তাই সেশন সরাসরি Supabase দিয়ে বসানো হয়
    forceNonAdminSession: async () => {
      const { error } = await client.auth.signInWithPassword(NON_ADMIN)
      if (error) throw error
    },
  }
}

// Supabase-এ ব্যাকএন্ড এগুলো যাচাই করে না; আজ শুধু UI (RecordForm, ইম্পোর্ট উইজার্ড ২০০ করে ব্যাচ) রক্ষা করে।
// Express সার্ভারকে এগুলো পাস করতেই হবে (docs/testing/README.md › "Known gaps on Supabase")।
const KNOWN_GAPS = [
  'create rejects an over-long name, an empty division and serial 0',
  'text is trimmed and NFC-normalized on write and found by search in either form',
  'more than 500 rows is too large',
]

if (url && anonKey && serviceKey) {
  assertLocal(url)
  runHousingApiContract('local supabase', makeLocal, { writes: true, seeded: true, knownGaps: KNOWN_GAPS })
} else {
  describe('local supabase', () => {
    test.skip('skipped: run with npm run test:contract:supabase-local', () => {})
  })
}
