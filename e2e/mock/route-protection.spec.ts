import { expect, test } from '../support/backend'
import { fillLogin, loginAsAdmin, MOCK_ADMIN } from '../support/auth'

const ADMIN_ROUTES = [
  '/housing/admin/semi-pucca',
  '/housing/admin/tin',
  '/housing/admin/semi-pucca/new',
  '/housing/admin/semi-pucca/1/edit',
  '/housing/admin/import',
  '/housing/admin/photos',
  '/housing/admin/activity',
]

test.describe('admin route protection', () => {
  for (const route of ADMIN_ROUTES) {
    test(`logged out, ${route} redirects to login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/admin\/login/)
    })
  }

  test('after login the user returns to the admin page they asked for', async ({ page }) => {
    await page.goto('/housing/admin/activity')
    await expect(page).toHaveURL(/\/admin\/login/)
    await fillLogin(page, MOCK_ADMIN.email, MOCK_ADMIN.password)
    await expect(page).toHaveURL(/\/admin\/activity$/)
  })

  test('a server error on the session check offers a retry instead of the login page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'admin-rest', 'only the REST backend asks the server for the session')
    await loginAsAdmin(page, '')
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"INTERNAL_ERROR","message":"x"}}' }),
    )
    await page.goto('/housing/admin/activity')
    await expect(page.getByRole('alert')).toContainText('সার্ভারে সংযোগ করা যায়নি।')
    await expect(page).toHaveURL(/\/admin\/activity$/)
    await page.goto('/housing/admin/login')
    await expect(page.getByRole('button', { name: 'লগইন' })).toBeVisible()

    await page.goto('/housing/admin/activity')
    await page.unroute('**/api/v1/auth/me')
    await page.getByRole('button', { name: 'আবার চেষ্টা করুন' }).click()
    await expect(page.getByRole('button', { name: 'লগআউট' })).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/activity$/)
  })

  test('public pages stay open without a session', async ({ page }) => {
    await page.goto('/housing/tin')
    await expect(page).toHaveURL(/\/housing\/tin$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
