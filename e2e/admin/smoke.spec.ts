import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { PLAIN_ADMIN } from '../support/rest-data'

// The admin-rest reset gives every e2e/admin spec the draft "demo" project and both admin roles
// (e2e/support/rest-data.ts).

for (const account of [MOCK_ADMIN, PLAIN_ADMIN]) {
  test(`${account.email} logs in and sees the draft demo project among the projects`, async ({ page }) => {
    await loginAs(page, account, '/admin/projects')
    await expect(page.getByText('ডেমো প্রকল্প').first()).toBeVisible()
  })
}

test('a visitor gets "not found" for the draft demo project', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByText('ডেমো প্রকল্প')).toHaveCount(0)
  await expect(page.getByText(/পাওয়া যায়নি/).first()).toBeVisible()
})
