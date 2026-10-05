import { fileURLToPath } from 'node:url'

// The admin-rest API that playwright.config.ts starts, and the folder its NAS storage driver writes
// to. The e2e reset (rest-data.ts) seeds photo files through the same folder and builds photo URLs
// from the same base, so both are defined only here.
export const ADMIN_REST_API_PORT = 3002
export const ADMIN_REST_API_URL = `http://localhost:${ADMIN_REST_API_PORT}`
export const E2E_STORAGE_ROOT = fileURLToPath(new URL('../../.storage/e2e', import.meta.url))
