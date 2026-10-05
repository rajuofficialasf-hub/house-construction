import { assertLocalDatabaseUrl } from '../../scripts/local-db.js';

// Test database URLs. Defaults match compose.yaml's local values; the guard refuses any
// non-local host so a test run can never touch a shared or real database (TS-03).
const DEFAULTS = {
  TEST_DATABASE_URL: 'postgres://housing_app:housing_app_local@127.0.0.1:5432/housing_test?sslmode=disable',
  TEST_DATABASE_MIGRATION_URL: 'postgres://housing_owner:housing_owner_local@127.0.0.1:5432/housing_test?sslmode=disable',
} as const;

// The suite drops and rebuilds the schema, so it also insists on a database named *_test.
function localUrl(name: keyof typeof DEFAULTS): string {
  const url = assertLocalDatabaseUrl(name, process.env[name] ?? DEFAULTS[name]);
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(`${name} must name a test database (ending in _test), got "${database}"`);
  }
  return url;
}

export const testAppUrl = localUrl('TEST_DATABASE_URL');
export const testOwnerUrl = localUrl('TEST_DATABASE_MIGRATION_URL');
