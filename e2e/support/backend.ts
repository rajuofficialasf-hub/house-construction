import { test as base } from '@playwright/test'
import { resetRestData } from './rest-data'

export { expect } from '@playwright/test'

/**
 * The test for the admin specs (e2e/mock). On the mock project every test already gets a fresh
 * in-memory store with its new browser context, so nothing happens. On admin-rest the server's
 * database outlives the browser, so it is reset to the same seed before each test.
 */
export const test = base.extend<{ backendReset: void }>({
  backendReset: [
    // Playwright reads fixture names from the first parameter's destructuring, so it must be a pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      if (testInfo.project.name === 'admin-rest') await resetRestData()
      await use()
    },
    { auto: true },
  ],
})
