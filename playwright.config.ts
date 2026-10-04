import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Two projects, two dev servers:
//   live — VITE_HOUSING_BACKEND=supabase, read-only public flows (e2e/live). Needs VITE_SUPABASE_URL and
//          VITE_SUPABASE_ANON_KEY (in .env.local or the environment); otherwise the project is not registered.
//   mock — VITE_HOUSING_BACKEND=mock, in-memory backend, admin and write flows (e2e/mock).
//   public-mock — the same read-only public specs as live (e2e/live), run against the mock backend. No credentials
//          needed; it keeps the public specs honest while live credentials are unavailable.
// Dedicated ports (not the ones `npm run dev` / `dev:mock` use) and no server reuse: a stray dev server on the same port
// could otherwise answer for the wrong backend and make a run pass against the wrong data (or reach the live project).
const LIVE_PORT = 5183
const MOCK_PORT = 5184

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
  ],
})
