import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'
import { PNG_1X1 } from '../support/data'

const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1X1 })

test('bulk photo update matches files to serials, skips unknown serials, and updates the records', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/photos')
  await page.locator('input[type=file]').setInputFiles([png('semi_0004_prev.png'), png('semi_0004_current.png'), png('semi_9999_prev.png')])
  await expect(page.locator('main')).toContainText(/মিলেছে\s*২\s*রেকর্ড নেই\s*১/)
  await expect(page.getByRole('row', { name: /semi_9999_prev.png/ })).toContainText('এই সিরিয়ালের রেকর্ড নেই')
  await page.getByRole('button', { name: '২টি ছবি আপলোড করুন' }).click()
  await expect(page.getByRole('row', { name: /semi_0004_prev.png/ })).toContainText('সফল', { timeout: 15_000 })
  await page.goto('/housing/admin/semi-pucca')
  const row = page.getByRole('row', { name: /মমতাজ বেগম 4/ })
  await expect(row).not.toHaveAccessibleName(/ছবি নেই/)
})
