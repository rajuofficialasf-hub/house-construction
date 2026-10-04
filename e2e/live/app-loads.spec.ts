import { test, expect } from '@playwright/test'

test('live app serves the housing landing route (read-only)', async ({ page }) => {
  await page.goto('/housing')
  await expect(page.locator('#root')).not.toBeEmpty()
})
