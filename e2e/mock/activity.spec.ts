import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'

test('the activity view lists login and later writes newest first, and filters by action', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/semi-pucca/2/edit')
  await page.getByRole('textbox', { name: 'বিস্তারিত ঠিকানা' }).fill('ঠিকানা বদল')
  await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click()
  await expect(page).toHaveURL(/\/housing\/admin\/semi-pucca$/)
  await page.getByRole('row', { name: /জমিলা আক্তার 3/ }).getByRole('button', { name: 'ডিলেট' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'হ্যাঁ, মুছুন' }).click()
  await expect(page.getByRole('row', { name: /জমিলা আক্তার 3/ })).toHaveCount(0)

  await page.goto('/housing/admin/activity')
  const items = page.getByRole('listitem').filter({ hasText: 'admin@example.test' })
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('রেকর্ড মুছে ফেলা')
  await expect(items.nth(1)).toContainText('রেকর্ড সম্পাদনা')
  await expect(items.nth(2)).toContainText('লগইন')

  await page.getByRole('combobox').first().selectOption({ label: 'রেকর্ড মুছে ফেলা' })
  await expect(page.getByRole('listitem').filter({ hasText: 'admin@example.test' })).toHaveCount(1)
})
