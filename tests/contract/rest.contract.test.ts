import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, test, vi } from 'vitest'
import { createApp } from '../../server/src/app.js'
import { hashPassword } from '../../server/src/auth/password.js'
import { createLogger } from '../../server/src/logger.js'
import { appDb, insertAdmin, ownerDb, resetTestData } from '../../server/test/support/db.js'
import { TEST_ORIGIN as SITE } from '../../server/test/support/session.js'
import { createRestAuthProvider, createRestHousingApi } from '../../src/features/housing/backend/rest'
import { runHousingApiContract } from './housingApiContract'
import { cookieJarFetch } from './cookieJarFetch'
import type { ContractHarness } from './harness'

// The full contract through the REST adapter against the real Express app on the local housing_test
// database, reset to server/db/seed/dev.sql plus one admin before every test. The server/test/support
// helpers refuse any database that isn't local and named *_test. Node's fetch is wrapped to keep the
// session cookie and send the site's Origin, as a browser does.
// Run with `npm run test:contract:rest` (migrates housing_test, sets REST_CONTRACT=1); skipped otherwise.

const enabled = process.env.REST_CONTRACT === '1'
const seedFile = fileURLToPath(new URL('../../server/db/seed/dev.sql', import.meta.url))

// The server has no photo routes until C5, so these photo tests fail for now.
// TODO: docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md - C5 adds the photo routes; remove these then
const KNOWN_GAPS = [
  'changeSerial carries photos to the new serial path',
  'uploadPhoto sets the serial-based urls and the timestamp; deletePhoto clears them and is idempotent',
  'an over-size photo is too large; an unknown record is not found',
  // It uploads a photo; 'create, update and delete are logged newest first…' covers the log through the adapter meanwhile.
  'every write is logged with before and after values, newest first, and filterable',
]
const ADMIN = { email: 'contract-admin@example.org', password: 'contract admin password' }

if (!enabled) {
  describe('REST backend (express + housing_test)', () => {
    test.skip('set REST_CONTRACT=1 or run npm run test:contract:rest', () => {})
  })
} else {
  const sql = appDb()
  const owner = ownerDb()
  let server: Server
  let baseUrl = ''
  let passwordHash = ''
  const jar = cookieJarFetch(SITE)

  beforeAll(async () => {
    vi.stubGlobal('fetch', jar.fetch)
    passwordHash = await hashPassword(ADMIN.password)
    const app = createApp({
      sql,
      logger: createLogger('silent'),
      trustProxy: 0,
      allowedOrigins: [SITE],
      cookieSecure: false,
      // The suite sends far more reads a minute than one visitor; the limit itself is tested in server/test.
      readRateLimit: { windowMs: 60_000, limit: 100_000 },
    })
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    server?.close()
    await Promise.all([sql.end(), owner.end()])
  })

  async function makeRest(): Promise<ContractHarness> {
    await resetTestData(owner)
    await owner.file(seedFile)
    await insertAdmin(owner, { email: ADMIN.email, passwordHash })
    jar.clear()
    return { api: createRestHousingApi(baseUrl), auth: createRestAuthProvider(baseUrl), admin: ADMIN }
  }

  runHousingApiContract('REST backend (express + housing_test)', makeRest, {
    writes: true,
    seeded: true,
    nonAdminAccounts: false,
    knownGaps: KNOWN_GAPS,
  })
}
