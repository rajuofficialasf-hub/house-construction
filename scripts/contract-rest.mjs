// Runs the backend-contract suite through the REST adapter against the Express server on the local
// housing_test database. Needs the compose database (`docker compose up -d db`). Migrates housing_test
// first; the test itself resets and seeds the data before every test.
import { spawnSync } from 'node:child_process'
import { migrateTestDb } from './lib/migrate-test-db.mjs'

migrateTestDb('contract:rest')

const r = spawnSync('npx', ['vitest', 'run', 'tests/contract/rest.contract.test.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, REST_CONTRACT: '1' },
})
process.exit(r.status ?? 1)
