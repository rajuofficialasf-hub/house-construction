import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { testAppUrl } from './server/test/support/env'

// Two projects, two dev servers:
//   live — VITE_HOUSING_BACKEND=supabase, read-only public flows (e2e/live). Needs VITE_SUPABASE_URL and
//          VITE_SUPABASE_ANON_KEY (in .env.local or the environment); otherwise the project is not registered.
//   mock — VITE_HOUSING_BACKEND=mock, in-memory backend, admin and write flows (e2e/mock).
//   public-mock — the same read-only public specs as live (e2e/live), run against the mock backend. No credentials
//          needed; it keeps the public specs honest while live credentials are unavailable.
//   public-rest — the same public specs against the Express API (VITE_HOUSING_BACKEND=rest). Registered only when
//          E2E_REST_API_URL is set (npm run test:e2e:rest). The API must be running with the dev seed, and its
//          ALLOWED_ORIGINS must include http://localhost:5185 (compose.yaml does).
//   admin-rest — the admin specs (e2e/mock) against an API this config starts on housing_test, reset to the mock seed
//          before each test (e2e/support/backend.ts). Registered only when E2E_ADMIN_REST=1 (npm run
//          test:e2e:rest-admin). Don't run it alongside the server tests or the REST contract run: all three reset
//          housing_test.
// Dedicated ports (not the ones `npm run dev` / `dev:mock` use) and no server reuse: a stray dev server on the same port
// could otherwise answer for the wrong backend and make a run pass against the wrong data (or reach the live project).
const LIVE_PORT = 5183
const MOCK_PORT = 5184
const REST_PORT = 5185
const ADMIN_REST_PORT = 5186
const ADMIN_REST_API_PORT = 3002
const restApiUrl = process.env.E2E_REST_API_URL?.trim()
const adminRest = process.env.E2E_ADMIN_REST === '1'

const hasLiveEnv =
  (!!process.env.VITE_SUPABASE_URL && !!process.env.VITE_SUPABASE_ANON_KEY) ||
  (fs.existsSync('.env.local') &&
    /VITE_SUPABASE_URL=\S/.test(fs.readFileSync('.env.local', 'utf8')) &&
    /VITE_SUPABASE_ANON_KEY=\S/.test(fs.readFileSync('.env.local', 'utf8')))

if (!hasLiveEnv) {
  console.warn('[playwright] live project skipped: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set')
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'mock',
      testDir: './e2e/mock',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${MOCK_PORT}` },
    },
    {
      name: 'public-mock',
      testDir: './e2e/live',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${MOCK_PORT}` },
    },
    ...(hasLiveEnv
      ? [
          {
            name: 'live',
            testDir: './e2e/live',
            use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${LIVE_PORT}` },
          },
        ]
      : []),
    ...(restApiUrl
      ? [
          {
            name: 'public-rest',
            testDir: './e2e/live',
            use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${REST_PORT}` },
          },
        ]
      : []),
    ...(adminRest
      ? [
          {
            name: 'admin-rest',
            testDir: './e2e/mock',
            // The server has no photo routes until C5 (docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md).
            testIgnore: ['photo-*.spec.ts'],
            use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ADMIN_REST_PORT}` },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `npx vite --port ${MOCK_PORT} --strictPort`,
      url: `http://localhost:${MOCK_PORT}`,
      reuseExistingServer: false,
      env: { VITE_HOUSING_BACKEND: 'mock' },
    },
    ...(hasLiveEnv
      ? [
          {
            command: `npx vite --port ${LIVE_PORT} --strictPort`,
            url: `http://localhost:${LIVE_PORT}`,
            reuseExistingServer: false,
            env: { VITE_HOUSING_BACKEND: 'supabase' },
          },
        ]
      : []),
    ...(restApiUrl
      ? [
          {
            command: `npx vite --port ${REST_PORT} --strictPort`,
            url: `http://localhost:${REST_PORT}`,
            reuseExistingServer: false,
            env: { VITE_HOUSING_BACKEND: 'rest', VITE_API_BASE_URL: restApiUrl },
          },
        ]
      : []),
    ...(adminRest
      ? [
          {
            command: 'npx tsx server/src/server.ts',
            url: `http://localhost:${ADMIN_REST_API_PORT}/api/v1/readyz`,
            reuseExistingServer: false,
            env: {
              DATABASE_URL: testAppUrl,
              PORT: String(ADMIN_REST_API_PORT),
              ALLOWED_ORIGINS: `http://localhost:${ADMIN_REST_PORT}`,
              COOKIE_SECURE: 'false',
              LOG_LEVEL: 'warn',
            },
          },
          {
            command: `npx vite --port ${ADMIN_REST_PORT} --strictPort`,
            url: `http://localhost:${ADMIN_REST_PORT}`,
            reuseExistingServer: false,
            env: { VITE_HOUSING_BACKEND: 'rest', VITE_API_BASE_URL: `http://localhost:${ADMIN_REST_API_PORT}` },
          },
        ]
      : []),
  ],
})
