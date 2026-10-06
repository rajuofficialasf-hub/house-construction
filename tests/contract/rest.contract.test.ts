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
import { createRestAuthProvider, createRestHousingApi } from '../../src/backend/rest'
import { runHousingApiContract } from './housingApiContract'
import { cookieJarFetch } from './cookieJarFetch'
import type { ContractHarness } from './harness'
import { TEST_PUBLIC_API_URL, testStorage } from '../../server/test/support/storage'

// The full contract through the REST adapter against the real Express app on the local housing_test
// database, reset to server/db/seed/dev.sql plus one admin before every test. The server/test/support
// helpers refuse any database that isn't local and named *_test. Node's fetch is wrapped to keep the
// session cookie and send the site's Origin, as a browser does.
// Run with `npm run test:contract:rest` (migrates housing_test, sets REST_CONTRACT=1); skipped otherwise.

const enabled = process.env.REST_CONTRACT === '1'
const seedFile = fileURLToPath(new URL('../../server/db/seed/dev.sql', import.meta.url))

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
  // Photos go to a NAS driver on a temp folder, removed after the run.
  const photos = testStorage()

  beforeAll(async () => {
    vi.stubGlobal('fetch', jar.fetch)
    passwordHash = await hashPassword(ADMIN.password)
    const app = createApp({
      sql,
      storage: photos.storage,
      publicApiUrl: TEST_PUBLIC_API_URL,
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
    await photos.cleanup()
  })

  async function makeRest(): Promise<ContractHarness> {
    await resetTestData(owner)
    await owner.file(seedFile)
    // The contract deletes records and photos, which only the main admin may do.
    await insertAdmin(owner, { email: ADMIN.email, passwordHash, role: 'main_admin' })
    jar.clear()
    return { api: createRestHousingApi(baseUrl), auth: createRestAuthProvider(baseUrl), admin: ADMIN }
  }

  runHousingApiContract('REST backend (express + housing_test)', makeRest, {
    writes: true,
    seeded: true,
    nonAdminAccounts: false,
    photoPaths: 'opaque',
    knownGaps: [
      // The project key is in the path (POST /projects/:key/records), so an unknown project is a missing
      // resource: 404 NOT_FOUND, the same answer as a hidden draft. The server's records-writes tests pin it.
      // (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P2 decisions")
      'create rejects an unknown project type as a validation error',
    ],
  })
}
