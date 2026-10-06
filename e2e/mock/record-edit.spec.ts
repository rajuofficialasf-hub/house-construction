import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'

test('editing the address of a record shows the change in the admin list and keeps the serial locked', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/semi-pucca/2/edit')
  await expect(page.getByText('লক করা — সাধারণ এডিটে বদলায় না')).toBeVisible()
  const address = `নতুন ঠিকানা ${Date.now()}`
  await page.getByRole('textbox', { name: 'বিস্তারিত ঠিকানা' }).fill(address)
  await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click()
  await expect(page).toHaveURL(/\/admin\/records\/semi_pucca$/)
  const row = page.getByRole('row', { name: /সালমা বেগম 2/ })
  await expect(row).toContainText(address)
  await expect(row.getByRole('cell', { name: '২', exact: true }).first()).toBeVisible()
})

test('an unknown serial shows a not-found state instead of a form', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/semi-pucca/999/edit')
  await expect(page.getByText('রেকর্ড পাওয়া যায়নি').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'সংরক্ষণ করুন' })).toHaveCount(0)
})
