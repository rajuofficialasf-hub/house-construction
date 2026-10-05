import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { createApp } from '../../server/src/app.js'
import { createLogger } from '../../server/src/logger.js'
import { appDb, ownerDb, resetTestData } from '../../server/test/support/db.js'
import { createRestAuthProvider, createRestHousingApi } from '../../src/features/housing/backend/rest'
import { runHousingApiContract } from './housingApiContract'
import type { ContractHarness } from './harness'

// The read contract through the REST adapter against the real Express app on the local housing_test
// database, reset to server/db/seed/dev.sql before every test. The server/test/support helpers refuse
// any database that isn't local and named *_test.
// Run with `npm run test:contract:rest` (migrates housing_test, sets REST_CONTRACT=1); skipped otherwise.
// Writes arrive in C4 of docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md.

const enabled = process.env.REST_CONTRACT === '1'
const seedFile = fileURLToPath(new URL('../../server/db/seed/dev.sql', import.meta.url))

// The REST write methods are still NOT_IMPLEMENTED, so the unauthenticated-write check fails for now.
// TODO: docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md - C4 removes this gap
const KNOWN_GAPS = ['without a session every write is refused as unauthenticated, before anything is written']

if (!enabled) {
  describe('REST backend (express + housing_test)', () => {
    test.skip('set REST_CONTRACT=1 or run npm run test:contract:rest', () => {})
  })
} else {
  const sql = appDb()
  const owner = ownerDb()
  let server: Server
  let baseUrl = ''

  beforeAll(async () => {
    const app = createApp({
      sql,
      logger: createLogger('silent'),
      trustProxy: 0,
      allowedOrigins: ['http://localhost:5173'],
      cookieSecure: false,
      // The suite sends far more reads a minute than one visitor; the limit itself is tested in server/test.
      readRateLimit: { windowMs: 60_000, limit: 100_000 },
    })
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    server?.close()
    await Promise.all([sql.end(), owner.end()])
  })

  async function makeRest(): Promise<ContractHarness> {
    await resetTestData(owner)
    await owner.file(seedFile)
    return { api: createRestHousingApi(baseUrl), auth: createRestAuthProvider(baseUrl) }
  }

  runHousingApiContract('REST backend (express + housing_test)', makeRest, { writes: false, seeded: true, knownGaps: KNOWN_GAPS })
}
