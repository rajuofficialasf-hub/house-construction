import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit (src/**/*.test.ts) and backend-contract (tests/**/*.test.ts) tests.
// Browser flow specs live in e2e/ and run under Playwright (playwright.config.ts).
// VITE_-prefixed variables from .env.local are loaded automatically (live read-only contract runner).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
