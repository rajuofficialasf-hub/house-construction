import type { Page } from '@playwright/test'
import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { DEMO, toast } from '../support/projects'
import { ADMIN_REST_API_URL } from '../support/rest-env'

// The "ফিল্ড" tab (FieldsTab.tsx, FieldEditorDrawer.tsx) on the demo project, whose fields are, in order,
// amount, family_size, trade and phone; its records already hold values for amount, family_size and trade.

const fieldsTab = `${DEMO.settings}?tab=fields`
/** A custom field's row, found by its key (shown next to the label). */
const fieldRow = (page: Page, key: string) => page.getByRole('listitem').filter({ hasText: new RegExp(`\\b${key}\\b`) })
/** All custom field rows, in their shown order. */
const customRows = (page: Page) => page.getByRole('listitem').filter({ hasText: /\b(amount|family_size|trade|phone)\b/ })

test('a new category field is added to the list', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, fieldsTab)
  await page.getByRole('button', { name: 'ফিল্ড যোগ করুন' }).click()
  const drawer = page.getByRole('dialog', { name: 'নতুন ফিল্ড' })
  await drawer.getByLabel('ধরন').selectOption({ label: 'ক্যাটাগরি (শীটের লেখা থেকে)' })
  await drawer.getByLabel('লেবেল (বাংলা)').fill('সহায়তার ধরন')
  await drawer.getByLabel('লেবেল (ইংরেজি)').fill('Support type')
  await expect(drawer.getByLabel('key', { exact: true })).toHaveValue('support_type')
  await drawer.getByRole('button', { name: 'ফিল্ড যোগ করুন' }).click()

  await expect(drawer).toHaveCount(0)
  await expect(toast(page, 'সংরক্ষিত')).toBeVisible()
  const row = fieldRow(page, 'support_type')
  await expect(row).toContainText('সহায়তার ধরন')
  await expect(row).toContainText('ক্যাটাগরি (শীটের লেখা থেকে)')
  await page.reload()
  await expect(fieldRow(page, 'support_type')).toBeVisible()
})

test('a field is archived and restored', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, fieldsTab)
  const row = fieldRow(page, 'family_size')
  await row.getByRole('button', { name: 'আর্কাইভ', exact: true }).click()
  await expect(toast(page, 'আর্কাইভ করা হয়েছে')).toBeVisible()
  await expect(row.getByText('আর্কাইভ', { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'আর্কাইভ', exact: true })).toHaveCount(0)

  await page.reload()
  await row.getByRole('button', { name: 'ফেরত আনুন' }).click()
  await expect(toast(page, 'ফেরত আনা হয়েছে')).toBeVisible()
  await expect(row.getByRole('button', { name: 'আর্কাইভ', exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'ফেরত আনুন' })).toHaveCount(0)
  // The button is now the only "আর্কাইভ" text in the row: the badge is gone.
  await expect(row.getByText('আর্কাইভ', { exact: true })).toHaveCount(1)
})

test('fields are reordered with the up and down buttons, and the order is kept', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, fieldsTab)
  await expect(customRows(page)).toHaveText([/amount/, /family_size/, /trade/, /phone/])

  await fieldRow(page, 'amount').getByRole('button', { name: 'নিচে সরান' }).click()
  await expect(toast(page, 'ক্রম বদলানো হয়েছে')).toBeVisible()
  await expect(customRows(page)).toHaveText([/family_size/, /amount/, /trade/, /phone/])

  await fieldRow(page, 'phone').getByRole('button', { name: 'উপরে সরান' }).click()
  await expect(customRows(page)).toHaveText([/family_size/, /amount/, /phone/, /trade/])
  await page.reload()
  await expect(customRows(page)).toHaveText([/family_size/, /amount/, /phone/, /trade/])
})

test('a field whose records hold values cannot change its key: the form locks it and the server refuses', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, fieldsTab)
  await fieldRow(page, 'trade').getByRole('button', { name: 'সম্পাদনা' }).click()
  const drawer = page.getByRole('dialog', { name: 'ফিল্ড সম্পাদনা' })
  await expect(drawer.getByText('৫টি রেকর্ডে মান আছে — key, ধরন ও পাবলিক/গোপন বদলানো যায় না।')).toBeVisible()
  await expect(drawer.getByLabel('key', { exact: true })).toBeDisabled()
  await expect(drawer.getByLabel('ধরন')).toBeDisabled()

  // The database guard stands behind the form: a direct request from this admin's session is refused.
  const refused = await page.evaluate(async (api) => {
    const list = await fetch(`${api}/api/v1/projects/demo/fields`, { credentials: 'include' })
    const fields = ((await list.json()) as { data: { id: string; key: string }[] }).data
    const trade = fields.find((f) => f.key === 'trade')
    const res = await fetch(`${api}/api/v1/fields/${trade?.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'occupation' }),
    })
    return { status: res.status, body: (await res.json()) as { error: { message: string } } }
  }, ADMIN_REST_API_URL)
  expect(refused.status).toBe(400)
  expect(refused.body.error.message).toBe('«পেশা» ফিল্ডের মান রেকর্ডে আছে — key বদলানো যায় না')

  await page.reload()
  await expect(fieldRow(page, 'trade')).toBeVisible()
  await expect(fieldRow(page, 'occupation')).toHaveCount(0)
})
