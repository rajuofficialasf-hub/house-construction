// Runs the backend-contract suite through the REST adapter against the Express server on the local
// housing_test database. Needs the compose database (`docker compose up -d db`). Migrates housing_test
// first; the test itself resets and seeds the data before every test.
import { spawnSync } from 'node:child_process'

const TEST_OWNER_URL =
  process.env.TEST_DATABASE_MIGRATION_URL ??
  'postgres://housing_owner:housing_owner_local@127.0.0.1:5432/housing_test?sslmode=disable'

const migrate = spawnSync('npm', ['--prefix', 'server', 'run', 'db:migrate'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_MIGRATION_URL: TEST_OWNER_URL },
})
if (migrate.status !== 0) {
  console.error('[contract:rest] could not migrate housing_test; is the database up? (docker compose up -d db)')
  process.exit(1)
}

const r = spawnSync('npx', ['vitest', 'run', 'tests/contract/rest.contract.test.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, REST_CONTRACT: '1' },
})
process.exit(r.status ?? 1)
