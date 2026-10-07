import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'
import { GEO, uniqueName } from '../support/data'

// The form checks these rules before sending (RecordForm validate + nfc), so a mistake shows at once;
// the server enforces the same rules again (docs/api/PROJECTS_API_CONTRACT.md §৫.১).

async function fillPlace(page: import('@playwright/test').Page) {
  await page.getByRole('combobox', { name: 'বিভাগ *', exact: true }).selectOption({ label: GEO.division })
  await page.getByRole('combobox', { name: 'জেলা *', exact: true }).selectOption({ label: GEO.district })
  await page.getByRole('combobox', { name: 'উপজেলা *', exact: true }).selectOption({ label: GEO.upazila })
}

test('the name field holds at most 200 characters, so a longer name cannot be entered', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/tin/new')
  const field = page.getByRole('textbox', { name: 'উপকারভোগীর নাম *' })
  await field.fill('ক'.repeat(201))
  await expect(field).toHaveValue('ক'.repeat(200))
})

test('a missing division is refused with a message', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/tin/new')
  await page.getByRole('textbox', { name: 'উপকারভোগীর নাম *' }).fill(uniqueName())
  await page.getByRole('button', { name: /যোগ করুন$/ }).click()
  await expect(page.getByText('বিভাগ বাছুন')).toBeVisible()
  await expect(page).toHaveURL(/\/new$/)
})

test('a hand-entered serial of 0 is refused with a message', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/tin/new')
  await page.getByRole('radio', { name: 'হাতে দিন' }).check()
  await page.getByRole('textbox', { name: 'সিরিয়াল', exact: true }).fill('0')
  await page.getByRole('textbox', { name: 'উপকারভোগীর নাম *' }).fill(uniqueName())
  await fillPlace(page)
  await page.getByRole('button', { name: /যোগ করুন$/ }).click()
  await expect(page.getByText('সিরিয়াল ১ বা তার বেশি পূর্ণসংখ্যা')).toBeVisible()
  await expect(page).toHaveURL(/\/new$/)
})

test('the name is saved trimmed and NFC-normalized', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/tin/new')
  // ড় as the single code point U+09DC; NFC stores it as ড + nukta
  const raw = `বাড়ি ${uniqueName()}`
  const stored = raw.normalize('NFC')
  await page.getByRole('textbox', { name: 'উপকারভোগীর নাম *' }).fill(`   ${raw}   `)
  await fillPlace(page)
  await page.getByRole('button', { name: /যোগ করুন$/ }).click()
  await expect(page).toHaveURL(/\/admin\/records\/tin$/)
  const cell = page.getByRole('cell', { name: stored, exact: true })
  await expect(cell).toBeVisible()
  expect(await cell.innerText()).toBe(stored)
})
