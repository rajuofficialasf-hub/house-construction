import { expect, test } from '../support/backend'
import { fillLogin, MOCK_ADMIN } from '../support/auth'

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
      await expect(page).toHaveURL(/\/housing\/admin\/login/)
    })
  }

  test('after login the user returns to the admin page they asked for', async ({ page }) => {
    await page.goto('/housing/admin/activity')
    await expect(page).toHaveURL(/\/housing\/admin\/login/)
    await fillLogin(page, MOCK_ADMIN.email, MOCK_ADMIN.password)
    await expect(page).toHaveURL(/\/housing\/admin\/activity$/)
  })

  test('public pages stay open without a session', async ({ page }) => {
    await page.goto('/housing/tin')
    await expect(page).toHaveURL(/\/housing\/tin$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
