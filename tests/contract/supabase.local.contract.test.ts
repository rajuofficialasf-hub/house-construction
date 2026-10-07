import { describe, test } from 'vitest'
import {
  createStandaloneClient,
  createSupabaseAuthProvider,
  createSupabaseHousingApi,
  createSupabaseImageStorage,
  createSupabaseProjectsApi,
} from '../../src/backend/supabase'
import { runHousingApiContract } from './housingApiContract'
import { runProjectsApiContract } from './projectsApiContract'
import type { ContractHarness, Credentials } from './harness'

// পূর্ণ চুক্তি-স্যুট (লেখাসহ) লোকাল Supabase স্ট্যাকে: লাইভ প্রজেক্ট যে SQL থেকে তৈরি (supabase/sql, config.toml › db.seed), সেই একই SQL।
// উদ্দেশ্য: মকে এনকোড করা নিয়মগুলো (সিরিয়াল, RLS, বাল্ক, একটিভিটি লগ) আসল Supabase আচরণের সাথে মেলানো।
// চালান: npm run test:contract:supabase-local (স্ট্যাক চালু করে, DB রিসেট করে, env দেয়)। env না থাকলে স্কিপ।
const url = (process.env.LOCAL_SUPABASE_URL ?? '').trim()
const anonKey = (process.env.LOCAL_SUPABASE_ANON_KEY ?? '').trim()
const serviceKey = (process.env.LOCAL_SUPABASE_SERVICE_KEY ?? '').trim()

const ADMIN: Credentials = { email: 'contract-admin@local.test', password: 'contract-admin-pass' }
const NON_ADMIN: Credentials = { email: 'contract-viewer@local.test', password: 'contract-viewer-pass' }
const PLAIN_ADMIN: Credentials = { email: 'contract-plain-admin@local.test', password: 'contract-plain-admin-pass' }

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
    // Deletes are for the main admin only (10b_project_guards.sql), and the contract deletes records and photos.
    const plainId = await ensureUser(service, PLAIN_ADMIN)
    const { error } = await service.from('housing_admins').upsert([
      { user_id: adminId, email: ADMIN.email, role: 'main_admin' },
      { user_id: plainId, email: PLAIN_ADMIN.email, role: 'admin' },
    ])
    if (error) throw error
  })()
  return accounts
}

async function makeLocal(): Promise<ContractHarness> {
  await ensureAccounts()
  const client = createStandaloneClient(url, anonKey)
  const getClient = () => client
  const projects = createSupabaseProjectsApi(getClient)
  return {
    api: createSupabaseHousingApi(getClient, createSupabaseImageStorage(getClient), { projects }),
    projects,
    auth: createSupabaseAuthProvider(getClient),
    admin: ADMIN,
    plainAdmin: PLAIN_ADMIN,
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
  'more than 500 rows is too large',
]

// Differences decided for the own server, each listed for the contract rewrite in P9
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).
const PROJECT_KNOWN_GAPS = [
  // The Supabase adapter caches the project list (CACHE_MS) across a logout, so a visitor briefly sees the
  // admin's copy; RLS itself hides the field. The REST adapter keeps no cache.
  'publishing shows the project to visitors without its private field; unpublishing hides it again',
  // The server names the clashing field in details.field (P4 decisions, "Duplicate keys are 409 with the field").
  'a taken URL names the slug field',
  // The server deletes an unused project's fields with it (P4 decisions, user-decided); Supabase's FK refuses.
  'a project that never held a record can be deleted, with its fields',
  // The server answers a guard refusal 400 (P4 decisions, HC400); Supabase raises 23503, which its adapter maps to 500.
  "a field that holds values can't be deleted",
  // The server's bulk insert moves private keys out of extra (P3 decisions, 0014); Supabase's refuses them.
  'a bulk import routes private keys to the private values',
  // The server answers a visitor's next serial for a draft with null (P3 decisions); the Supabase adapter
  // counts the records the visitor can see, none, and answers 1.
  "years and the next serial follow the project's records; a visitor gets no next serial for a draft",
  // supabase/sql/15_filtered_stats.sql isn't loaded: it needs supabase/sql/14_project_users.sql, which is
  // past the a8e2154 parity target, so the adapter falls back to totals with filtered: false
  // (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, P8b decisions).
  "stats with the list's filters count what the list shows",
]

if (url && anonKey && serviceKey) {
  assertLocal(url)
  runHousingApiContract('local supabase', makeLocal, { writes: true, seeded: true, knownGaps: KNOWN_GAPS })
  runProjectsApiContract('local supabase', makeLocal, { writes: true, knownGaps: PROJECT_KNOWN_GAPS })
} else {
  describe('local supabase', () => {
    test.skip('skipped: run with npm run test:contract:supabase-local', () => {})
  })
}
