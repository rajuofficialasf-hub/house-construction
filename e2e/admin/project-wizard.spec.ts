import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { DEMO, asVisitor, expectNotFound, toast } from '../support/projects'

// /admin/projects/new (ProjectWizardPage.tsx): a new project starts as a draft.

const createButton = 'খসড়া হিসেবে তৈরি করুন'

test('a leaf project made from a template is a draft that visitors cannot see', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/projects/new')
  await page.getByRole('radio', { name: /^অনুদান\/উপকরণ ধরন/ }).check()
  await page.getByRole('radio', { name: /^একক প্রকল্প/ }).check()
  await page.getByLabel('বাংলা নাম').fill('দর্জি অনুদান')
  await page.getByLabel('ইংরেজি নাম').fill('Tailoring Grant')
  await expect(page.getByLabel('URL অংশ (slug)')).toHaveValue('tailoring-grant')
  await page.getByRole('button', { name: createButton }).click()

  await expect(toast(page, '«দর্জি অনুদান» খসড়া হিসেবে তৈরি হয়েছে')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/projects\/tailoring_grant$/)
  await expect(page.getByRole('heading', { level: 1, name: 'দর্জি অনুদান' })).toBeVisible()
  await expect(page.getByText('খসড়া', { exact: true })).toBeVisible()

  // Reachable again by its key, with the template's fields.
  await page.goto('/admin/projects/tailoring_grant?tab=fields')
  await expect(page.getByRole('heading', { level: 1, name: 'দর্জি অনুদান' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'item_name' })).toBeVisible()

  await asVisitor(browser, baseURL, (visitor) => expectNotFound(visitor, '/tailoring-grant'))
})

test('a URL another admin took in the meantime is refused with the duplicate-URL message', async ({ page, context }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/projects/new')
  await expect(page.getByRole('button', { name: createButton })).toBeEnabled()

  // Another tab gives the demo project the URL this form is about to use; the form's project list is now stale.
  const other = await context.newPage()
  await other.goto(DEMO.settings)
  await other.getByLabel('URL অংশ (slug)').fill('tailoring-grant')
  await other.getByRole('button', { name: 'সংরক্ষণ করুন', exact: true }).click()
  await expect(toast(other, 'সংরক্ষিত')).toBeVisible()

  await page.getByLabel('বাংলা নাম').fill('দর্জি অনুদান')
  await page.getByLabel('ইংরেজি নাম').fill('Tailoring Grant')
  await page.getByRole('button', { name: createButton }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'এই URL আগে থেকেই আছে — অন্যটি দিন' })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/projects\/new$/)
})
