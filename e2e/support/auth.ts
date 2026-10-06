import { expect, type Page } from '@playwright/test'
import { MOCK_ADMIN, MOCK_NON_ADMIN } from '../../src/backend/mock/fixtures'

export { MOCK_ADMIN, MOCK_NON_ADMIN }

/** লগইন পেইজে ফর্ম পূরণ করে সাবমিট (লগইনে সরাসরি আসা বা রিডাইরেক্ট — দুই অবস্থায় কাজ করে) */
export async function fillLogin(page: Page, email: string, password: string) {
  await page.getByPlaceholder('admin@example.org').fill(email)
  await page.locator('input[type=password]').fill(password)
  await page.getByRole('button', { name: 'লগইন' }).click()
}

export async function loginAsAdmin(page: Page, to = '/housing/admin/semi-pucca') {
  await page.goto('/housing/admin/login')
  await fillLogin(page, MOCK_ADMIN.email, MOCK_ADMIN.password)
  await expect(page.getByRole('button', { name: 'লগআউট' })).toBeVisible()
  if (to) await page.goto(to)
}
