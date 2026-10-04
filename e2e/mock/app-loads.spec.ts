import { test, expect } from '@playwright/test'

test('mock app serves the housing landing route', async ({ page }) => {
  await page.goto('/housing')
  await expect(page.locator('#root')).not.toBeEmpty()
})
