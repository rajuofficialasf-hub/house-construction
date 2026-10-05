import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'

test('delete asks for confirmation: cancel keeps the record, confirm removes it and the serial stays used', async ({ page }) => {
  await loginAsAdmin(page)
  const row = () => page.getByRole('row', { name: /মরিয়ম খাতুন 12/ })
  await row().getByRole('button', { name: 'ডিলেট' }).click()
  const dialog = page.getByRole('dialog', { name: 'আপনি কি নিশ্চিত?' })
  await expect(dialog).toContainText('সিরিয়াল পুনরায় ব্যবহার হবে না')
  await dialog.getByRole('button', { name: 'বাতিল' }).click()
  await expect(row()).toBeVisible()

  await row().getByRole('button', { name: 'ডিলেট' }).click()
  await dialog.getByRole('button', { name: 'হ্যাঁ, মুছুন' }).click()
  await expect(row()).toHaveCount(0)

  // serial 12 was the highest: the next serial is still 13, so the freed number 12 is not handed out again
  await page.goto('/housing/admin/semi-pucca/new')
  await expect(page.getByText('স্বয়ংক্রিয় (পরবর্তী: ১৩)')).toBeVisible()
})
