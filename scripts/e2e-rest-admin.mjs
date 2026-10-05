// Runs the admin Playwright specs (e2e/mock) against the Express API on the local housing_test database
// (the admin-rest project in playwright.config.ts). Needs the compose database (`docker compose up -d db`).
// Migrates housing_test first; each test resets it to the mock seed. Don't run this alongside the server
// tests or `npm run test:contract:rest`: all three reset housing_test.
import { spawnSync } from 'node:child_process'

const TEST_OWNER_URL =
  process.env.TEST_DATABASE_MIGRATION_URL ??
  'postgres://housing_owner:housing_owner_local@127.0.0.1:5432/housing_test?sslmode=disable'

const migrate = spawnSync('npm', ['--prefix', 'server', 'run', 'db:migrate'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_MIGRATION_URL: TEST_OWNER_URL },
})
if (migrate.status !== 0) {
  console.error('[e2e:rest-admin] could not migrate housing_test; is the database up? (docker compose up -d db)')
  process.exit(1)
}

const r = spawnSync('npx', ['playwright', 'test', '--project=admin-rest', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, E2E_ADMIN_REST: '1' },
})
process.exit(r.status ?? 1)
