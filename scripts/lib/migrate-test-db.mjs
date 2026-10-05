// Migrates the local housing_test database (owner URL from TEST_DATABASE_MIGRATION_URL, else the
// compose default) before a run against the real server. Exits the process when it can't.
import { spawnSync } from 'node:child_process'

const TEST_OWNER_URL =
  process.env.TEST_DATABASE_MIGRATION_URL ??
  'postgres://housing_owner:housing_owner_local@127.0.0.1:5432/housing_test?sslmode=disable'

/** @param {string} tag the calling script's name, for the error message */
export function migrateTestDb(tag) {
  const migrate = spawnSync('npm', ['--prefix', 'server', 'run', 'db:migrate'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_MIGRATION_URL: TEST_OWNER_URL },
  })
  if (migrate.status !== 0) {
    console.error(`[${tag}] could not migrate housing_test; is the database up? (docker compose up -d db)`)
    process.exit(1)
  }
}
