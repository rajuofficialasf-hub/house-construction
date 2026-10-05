// Test database URLs. Defaults match compose.yaml's local values; the guard refuses any
// non-local host so a test run can never touch a shared or real database (TS-03).
const DEFAULTS = {
  TEST_DATABASE_URL: 'postgres://housing_app:housing_app_local@127.0.0.1:5432/housing_test',
  TEST_DATABASE_MIGRATION_URL: 'postgres://housing_owner:housing_owner_local@127.0.0.1:5432/housing_test',
} as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function localUrl(name: keyof typeof DEFAULTS): string {
  const url = process.env[name] ?? DEFAULTS[name];
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(`${name} must point at a local database, got host "${hostname}"`);
  }
  return url;
}

export const testAppUrl = localUrl('TEST_DATABASE_URL');
export const testOwnerUrl = localUrl('TEST_DATABASE_MIGRATION_URL');
