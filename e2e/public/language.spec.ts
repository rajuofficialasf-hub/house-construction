import { expect, test } from '../support/test'

test('switching to English changes the page language, keeps the route, and survives a reload', async ({ page }) => {
  await page.goto('/housing/tin')
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn')
  const bnTitle = await page.getByRole('heading', { level: 1 }).textContent()
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveURL(/\/housing\/tin$/)
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(bnTitle ?? '')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
