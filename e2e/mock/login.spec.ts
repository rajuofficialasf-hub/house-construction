import { expect, test } from '../support/backend'
import { fillLogin, MOCK_ADMIN, MOCK_NON_ADMIN } from '../support/auth'

test.describe('admin login and logout', () => {
  test('admin logs in, lands on the records page, logs out, and admin pages are closed again', async ({ page }) => {
    await page.goto('/housing/admin/login')
    await fillLogin(page, MOCK_ADMIN.email, MOCK_ADMIN.password)
    await expect(page).toHaveURL(/\/housing\/admin\/semi-pucca$/)
    await expect(page.getByRole('heading', { name: /রেকর্ড/, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'লগআউট' }).click()
    await expect(page).toHaveURL(/\/housing$/)
    await page.goto('/housing/admin/semi-pucca')
    await expect(page).toHaveURL(/\/housing\/admin\/login/)
  })

  test('a wrong password shows the generic credentials message and stays on login', async ({ page }) => {
    await page.goto('/housing/admin/login')
    await fillLogin(page, MOCK_ADMIN.email, 'wrong-password')
    await expect(page.getByText('ইমেইল বা পাসওয়ার্ড সঠিক নয়')).toBeVisible()
    await expect(page).toHaveURL(/\/housing\/admin\/login/)
  })

  test('an account outside the admin list is told so and gets no admin access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'admin-rest', 'the server has only admin accounts (docs/api/API_CONTRACT.md §2)')
    await page.goto('/housing/admin/login')
    await fillLogin(page, MOCK_NON_ADMIN.email, MOCK_NON_ADMIN.password)
    await expect(page.getByText('এই অ্যাকাউন্ট এডমিন তালিকায় নেই')).toBeVisible()
    await page.goto('/housing/admin/semi-pucca')
    await expect(page).toHaveURL(/\/housing\/admin\/login/)
  })
})
