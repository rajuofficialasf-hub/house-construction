import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'

// Logins are created with the server's admin CLI, then given projects on this page.
test.describe('admin users page', () => {
  test('tells the main admin to create the login with the server CLI, and never mentions Supabase', async ({ page }) => {
    await loginAsAdmin(page, '/admin/users')
    const form = page.getByRole('form', { name: 'নতুন ইউজার যোগ' })
    await expect(form.getByText('npm --prefix server run admin -- create --email … --name …')).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText('Supabase')
  })
})
