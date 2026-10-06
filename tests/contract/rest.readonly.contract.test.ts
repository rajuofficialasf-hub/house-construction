import { afterAll, beforeAll, describe, test, vi } from 'vitest'
import { createRestAuthProvider, createRestHousingApi } from '../../src/backend/rest'
import { runHousingApiContract } from './housingApiContract'
import { createReadonlyFetch, readonlyOrigin } from './readonlyFetch'
import type { ContractHarness } from './harness'

// The read-only contract against a deployed site (staging or production, docs/operations/runbook.md
// section 19), or the local API: REST_READONLY_URL=https://<host> npm run test:contract:rest-readonly.
// No write method is ever called, and the fetch underneath refuses to send one anyway, so a mistake
// fails the test instead of changing real data. Never run from CI (TS-03).
const target = process.env.REST_READONLY_URL?.trim()

if (target) {
  const origin = readonlyOrigin(target)
  beforeAll(() => vi.stubGlobal('fetch', createReadonlyFetch(fetch)))
  afterAll(() => vi.unstubAllGlobals())
  const make = (): ContractHarness => ({ api: createRestHousingApi(origin), auth: createRestAuthProvider(origin) })
  runHousingApiContract(`REST read-only (${origin})`, make, { writes: false, seeded: true, writeProbes: false })
} else {
  describe('REST read-only', () => {
    test.skip('set REST_READONLY_URL, or run npm run test:contract:rest-readonly', () => {})
  })
}
