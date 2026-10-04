import { expect, test } from '../support/test'

test('the landing page shows both projects and links into each list', async ({ page }) => {
  await page.goto('/housing')
  await expect(page.getByRole('heading', { name: 'ঘর নির্মাণ প্রকল্প', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'প্রকল্পসমূহ', level: 2 })).toBeVisible()
  const cards = page.locator('article')
  await expect(cards).toHaveCount(2)
  await page.getByRole('link', { name: 'সেমিপাকা ঘর নির্মাণ — আরো দেখুন' }).click()
  await expect(page).toHaveURL(/\/housing\/semi-pucca$/)
  await page.goBack()
  await page.getByRole('link', { name: 'টিনের ঘর নির্মাণ — আরো দেখুন' }).click()
  await expect(page).toHaveURL(/\/housing\/tin$/)
})

test('the project menu reaches both lists from the landing page', async ({ page }) => {
  await page.goto('/housing')
  await page.getByRole('navigation', { name: 'ঘর নির্মাণ প্রকল্প মেনু' }).getByRole('link', { name: 'টিনের ঘর নির্মাণ' }).click()
  await expect(page).toHaveURL(/\/housing\/tin$/)
  await expect(page.getByRole('heading', { name: 'টিনের ঘর নির্মাণ', level: 1 })).toBeVisible()
})
