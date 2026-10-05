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

// TEMP: an S3 test bucket, only from the developer's own environment (never committed). Unset means the
// S3 contract tests are skipped; credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
const s3Bucket = process.env.TEST_S3_BUCKET?.trim();
const s3Region = process.env.TEST_S3_REGION?.trim();
export const testS3 =
  s3Bucket && s3Region
    ? {
        S3_BUCKET: s3Bucket,
        S3_REGION: s3Region,
        S3_ENDPOINT: process.env.TEST_S3_ENDPOINT?.trim() || undefined,
        S3_FORCE_PATH_STYLE: process.env.TEST_S3_FORCE_PATH_STYLE === 'true',
      }
    : undefined;
