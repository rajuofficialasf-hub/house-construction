import { createMockBackend } from '../../src/backend/mock'
import { MOCK_ADMIN, MOCK_NON_ADMIN } from '../../src/backend/mock/fixtures'
import { runHousingApiContract } from './housingApiContract'
import type { ContractHarness } from './harness'

function makeMock(): ContractHarness {
  const b = createMockBackend()
  return {
    api: b.housingApi,
    auth: b.authProvider,
    admin: { email: MOCK_ADMIN.email, password: MOCK_ADMIN.password },
    nonAdmin: { email: MOCK_NON_ADMIN.email, password: MOCK_NON_ADMIN.password },
    forceNonAdminSession: () =>
      b.store.setSession({ user: { id: MOCK_NON_ADMIN.id, email: MOCK_NON_ADMIN.email, name: MOCK_NON_ADMIN.name, role: 'admin' }, isAdmin: false }),
  }
}

runHousingApiContract('mock backend', makeMock, { writes: true, seeded: true })
