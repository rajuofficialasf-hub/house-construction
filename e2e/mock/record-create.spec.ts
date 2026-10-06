import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'
import { GEO, uniqueName } from '../support/data'

test('creating a record with an automatic serial adds it to the admin list with the next serial', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/semi-pucca/new')
  await expect(page.getByText('স্বয়ংক্রিয় (পরবর্তী: ১৩)')).toBeVisible()
  const name = uniqueName()
  await page.getByRole('textbox', { name: 'উপকারভোগীর নাম *' }).fill(name)
  await page.getByRole('combobox', { name: 'বিভাগ *', exact: true }).selectOption({ label: GEO.division })
  await page.getByRole('combobox', { name: 'জেলা *', exact: true }).selectOption({ label: GEO.district })
  await page.getByRole('combobox', { name: 'উপজেলা *', exact: true }).selectOption({ label: GEO.upazila })
  await page.getByRole('button', { name: /যোগ করুন$/ }).click()
  await expect(page).toHaveURL(/\/admin\/records\/semi_pucca$/)
  const row = page.getByRole('row', { name })
  await expect(row).toBeVisible()
  await expect(row.getByRole('cell', { name: '১৩', exact: true }).first()).toBeVisible()
})

test('required fields block saving a record', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/semi-pucca/new')
  await page.getByRole('button', { name: /যোগ করুন$/ }).click()
  await expect(page).toHaveURL(/\/new$/)
})

test('a hand-entered serial is used as given', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/tin/new')
  await page.getByRole('radio', { name: 'হাতে দিন' }).check()
  const name = uniqueName()
  await page.getByRole('textbox', { name: 'সিরিয়াল', exact: true }).fill('50')
  await page.getByRole('textbox', { name: 'উপকারভোগীর নাম *' }).fill(name)
  await page.getByRole('combobox', { name: 'বিভাগ *', exact: true }).selectOption({ label: GEO.division })
  await page.getByRole('combobox', { name: 'জেলা *', exact: true }).selectOption({ label: GEO.district })
  await page.getByRole('combobox', { name: 'উপজেলা *', exact: true }).selectOption({ label: GEO.upazila })
  await page.getByRole('button', { name: /যোগ করুন$/ }).click()
  await expect(page).toHaveURL(/\/admin\/records\/tin$/)
  await expect(page.getByRole('row', { name }).getByRole('cell', { name: '৫০', exact: true }).first()).toBeVisible()
})
