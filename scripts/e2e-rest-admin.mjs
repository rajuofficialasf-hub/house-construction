// Runs the admin Playwright specs (e2e/mock) against the Express API on the local housing_test database
// (the admin-rest project in playwright.config.ts). Needs the compose database (`docker compose up -d db`).
// Migrates housing_test first; each test resets it to the mock seed. Don't run this alongside the server
// tests or `npm run test:contract:rest`: all three reset housing_test.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { migrateTestDb } from './lib/migrate-test-db.mjs'

migrateTestDb('e2e:rest-admin')
// Photos from earlier runs are unreferenced after the reset; start each run with an empty folder.
// The path matches E2E_STORAGE_ROOT in e2e/support/rest-env.ts.
rmSync(new URL('../.storage/e2e', import.meta.url), { recursive: true, force: true })

const r = spawnSync('npx', ['playwright', 'test', '--project=admin-rest', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, E2E_ADMIN_REST: '1' },
})
process.exit(r.status ?? 1)
