import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { GEO } from '../support/data'
import { asVisitor, DEMO, expectNotFound, toast } from '../support/projects'

// Bulk import (ImportPage.tsx) into the draft demo project, whose custom fields are অনুদান (money),
// পেশা (category; the seed already has «দর্জি») and the private ফোন (demo-project.sql). The column
// headers are the field labels, so the automatic guess maps every column.

const HEADERS = ['সাল', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম', 'বিভাগ', 'জেলা', 'উপজেলা', 'ঠিকানা', 'অনুদান', 'পেশা', 'ফোন']
const row = (name: string, amount: string, trade: string, phone: string) => ['2025', name, 'পিতা', GEO.division, GEO.district, GEO.upazila, 'ঠিকানা', amount, trade, phone]
// «দর্জী» is a near spelling of the seeded «দর্জি»; the review panel offers to bring it to the stored spelling.
const ROWS = [row('ইম্পোর্ট সেলাই', '12000', 'দর্জী', '01712345678'), row('ইম্পোর্ট মুদি', '8000', 'মুদি দোকান', '01812345678')]
const csv = Buffer.from('﻿' + [HEADERS, ...ROWS].map((r) => r.join(',')).join('\n') + '\n', 'utf-8')

test('a sheet with custom, category and private columns imports into demo; the admin sees the private value', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/import?project=demo')
  await expect(page.getByRole('combobox', { name: 'প্রকল্প' })).toHaveValue('demo')
  await page.locator('input[type=file]').setInputFiles({ name: 'demo.csv', mimeType: 'text/csv', buffer: csv })

  // Step 2: every custom column is guessed from its header (`x.<key>`), the private one included.
  for (const [header, key] of [
    ['অনুদান', 'amount'],
    ['পেশা', 'trade'],
    ['ফোন', 'phone'],
  ]) {
    await expect(page.getByRole('combobox', { name: `"${header}" কলামের ফিল্ড` })).toHaveValue(`x.${key}`)
  }
  await expect(page.getByText(/আবশ্যক ফিল্ড ম্যাপ হয়নি/)).toHaveCount(0)

  // Step 3: the category review pairs the sheet's «দর্জী» with the stored «দর্জি»; keep the stored one.
  await page.getByRole('button', { name: 'এক বানানে আনুন: «দর্জি»' }).click()
  await expect(page.getByText('«দর্জী» → «দর্জি»')).toBeVisible()

  await page.getByRole('button', { name: '২ টি সারি যোগ করুন' }).click()
  await expect(toast(page, '২ টি সারি যোগ হয়েছে')).toBeVisible()
  await expect(page.getByText('সফল: ২')).toBeVisible()

  // The records list: both rows, the fixed spelling, the amount; the seed's six end at serial 6.
  await page.goto('/admin/records/demo')
  const sewing = page.getByRole('row', { name: /ইম্পোর্ট সেলাই/ })
  await expect(sewing).toContainText('দর্জি')
  await expect(sewing).not.toContainText('দর্জী')
  await expect(sewing.getByRole('cell', { name: '৭', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /ইম্পোর্ট মুদি/ }).getByRole('cell', { name: '৮', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'পেশা' }).getByRole('option', { name: 'দর্জি (৪)' })).toBeAttached()

  // The edit form shows the private phone to the admin.
  await sewing.getByRole('link', { name: 'এডিট' }).click()
  await expect(page.getByLabel('ফোন')).toHaveValue('01712345678')
  await expect(page.getByLabel('অনুদান')).toHaveValue('12000')

  // The project is still a draft: a visitor can't see it at all.
  await asVisitor(browser, baseURL, (visitor) => expectNotFound(visitor, DEMO.publicPath))
})

test('a row with an invalid private phone is reported and never written; the valid row still imports', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/import?project=demo')
  await expect(page.getByRole('combobox', { name: 'প্রকল্প' })).toHaveValue('demo')
  const rows = [row('ভুল ফোনের সারি', '5000', 'মুদি দোকান', 'abc'), row('ঠিক ফোনের সারি', '6000', 'মুদি দোকান', '01912345678')]
  const file = Buffer.from('﻿' + [HEADERS, ...rows].map((r) => r.join(',')).join('\n') + '\n', 'utf-8')
  await page.locator('input[type=file]').setInputFiles({ name: 'demo.csv', mimeType: 'text/csv', buffer: file })

  await expect(page.getByText('«ফোন»: সঠিক মোবাইল নম্বর দিন')).toBeVisible()
  await page.getByRole('button', { name: '১ টি সারি যোগ করুন' }).click()
  await expect(toast(page, '১ টি সারি যোগ হয়েছে')).toBeVisible()
  await expect(page.getByText('ব্যর্থ/বাদ: ১')).toBeVisible()

  await page.goto('/admin/records/demo')
  await expect(page.getByRole('row', { name: /ঠিক ফোনের সারি/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /ভুল ফোনের সারি/ })).toHaveCount(0)
})
