import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../../server/src/auth/password'
import { createNasDriver } from '../../server/src/storage/drivers/nas'
import { insertAdmin, ownerDb, resetTestData } from '../../server/test/support/db'
import { MOCK_ADMIN, seedRecords } from '../../src/backend/mock/fixtures'
import { ADMIN_REST_API_URL, E2E_STORAGE_ROOT } from './rest-env'

/**
 * Puts the admin-rest project's database (housing_test, behind the API that playwright.config.ts
 * starts) into the state the mock backend starts in: the mock fixture records and the mock admin,
 * with an empty activity log. On top of that come the dev seed's draft "demo" project, with custom
 * and private fields, for the e2e/admin specs, and a plain admin, who may write but not delete
 * (AE1, docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md). The server/test/support helpers refuse any database that isn't local and named *_test.
 */

/** A plain admin (role admin), only on admin-rest; the mock backend has none. */
export const PLAIN_ADMIN = { email: 'editor@example.test', name: 'সাধারণ এডমিন', password: 'Editor#12345' }

const demoProjectFile = fileURLToPath(new URL('../../server/db/seed/demo-project.sql', import.meta.url))

let owner: ReturnType<typeof ownerDb> | undefined
// The same folder the admin-rest API stores photos in (playwright.config.ts).
const storage = createNasDriver({ STORAGE_ROOT: E2E_STORAGE_ROOT })
// A real 2×2 WebP: the API serves stored files as they are, and the browser has to be able to show them.
const TINY_WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAABQAQCdASoCAAIAAUAmJaQABYwAAP6igAA=', 'base64')

type Kind = 'prev' | 'current'
type Variant = 'photo' | 'thumb'

/** Stores one photo file for a record slot and returns its row, as the upload route would. */
async function seedPhotoFile(recordId: string, kind: Kind, variant: Variant) {
  const id = randomUUID()
  const key = `housing/${id}.webp`
  await storage.put(key, Readable.from([TINY_WEBP]), { contentType: 'image/webp' })
  const row = {
    id,
    record_id: recordId,
    kind,
    variant,
    storage_key: key,
    storage_driver: 'nas',
    content_type: 'image/webp',
    size_bytes: TINY_WEBP.length,
  }
  return { row, url: `${ADMIN_REST_API_URL}/api/v1/photos/${id}` }
}

// argon2 takes tens of milliseconds, so the admins' hashes are made once per worker.
let adminHash: Promise<string> | undefined
let plainHash: Promise<string> | undefined

export async function resetRestData(): Promise<void> {
  owner ??= ownerDb()
  adminHash ??= hashPassword(MOCK_ADMIN.password)
  plainHash ??= hashPassword(PLAIN_ADMIN.password)
  await resetTestData(owner)
  // Same ids, serials and names as the mock seed, so the specs find the same rows. Records that have
  // photos in the mock seed get real files in the API's storage instead of the mock placeholders.
  const seeds = seedRecords()
  const files: Awaited<ReturnType<typeof seedPhotoFile>>['row'][] = []
  const rows = await Promise.all(
    seeds.map(async (record) => {
      if (!record.prev_photo_url) return record
      const urls: Record<string, string> = {}
      for (const kind of ['prev', 'current'] as const) {
        for (const variant of ['photo', 'thumb'] as const) {
          const { row, url } = await seedPhotoFile(record.id, kind, variant)
          files.push(row)
          urls[`${kind}_${variant}_url`] = url
        }
      }
      return { ...record, ...urls }
    }),
  )
  // Explicit serials raise each project's counter past the largest, as the mock store does.
  await owner`insert into public.housing_beneficiaries ${owner(rows)}`
  if (files.length) await owner`insert into public.housing_files ${owner(files)}`
  await owner.file(demoProjectFile)
  await owner`truncate public.housing_activity_log`
  await insertAdmin(owner, { email: MOCK_ADMIN.email, name: MOCK_ADMIN.name, passwordHash: await adminHash, role: 'main_admin' })
  await insertAdmin(owner, { email: PLAIN_ADMIN.email, name: PLAIN_ADMIN.name, passwordHash: await plainHash, role: 'admin' })
}
