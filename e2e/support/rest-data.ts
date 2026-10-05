import { hashPassword } from '../../server/src/auth/password'
import { insertAdmin, ownerDb, resetTestData } from '../../server/test/support/db'
import { MOCK_ADMIN, seedRecords } from '../../src/features/housing/backend/mock/fixtures'

/**
 * Puts the admin-rest project's database (housing_test, behind the API that playwright.config.ts
 * starts) into the same state the mock backend starts in: the mock fixture records and the mock
 * admin, with an empty activity log. The server/test/support helpers refuse any database that
 * isn't local and named *_test.
 */

let owner: ReturnType<typeof ownerDb> | undefined
// argon2 takes tens of milliseconds, so the admin's hash is made once per worker.
let adminHash: Promise<string> | undefined

export async function resetRestData(): Promise<void> {
  owner ??= ownerDb()
  adminHash ??= hashPassword(MOCK_ADMIN.password)
  await resetTestData(owner)
  // Same ids, serials and names as the mock seed, so the specs find the same rows. The photo URLs
  // point at the mock dev server's placeholder route, which only the mock backend serves.
  const rows = seedRecords().map((record) => ({
    ...record,
    prev_photo_url: null,
    prev_thumb_url: null,
    current_photo_url: null,
    current_thumb_url: null,
    photo_updated_at: null,
  }))
  // Explicit serials raise each project's counter past the largest, as the mock store does.
  await owner`insert into public.housing_beneficiaries ${owner(rows)}`
  await owner`truncate public.housing_activity_log`
  await insertAdmin(owner, { email: MOCK_ADMIN.email, name: MOCK_ADMIN.name, passwordHash: await adminHash })
}
