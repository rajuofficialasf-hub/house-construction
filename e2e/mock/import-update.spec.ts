import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../support/auth'
import { GEO } from '../support/data'

const csv = (rows: string[][]) =>
  Buffer.from('﻿' + [['সিরিয়াল', 'সাল', 'উপকারভোগীর নাম', 'বিভাগ', 'জেলা', 'উপজেলা'], ...rows].map((r) => r.join(',')).join('\n') + '\n', 'utf-8')

test('update-by-serial mode updates matching serials and reports unknown ones as missing', async ({ page }) => {
  await loginAsAdmin(page, '/housing/admin/import')
  await page.getByRole('radio', { name: 'সিরিয়াল ধরে আপডেট করুন' }).check()
  const geo = [GEO.division, GEO.district, GEO.upazila]
  await page.locator('input[type=file]').setInputFiles({
    name: 'upd.csv',
    mimeType: 'text/csv',
    buffer: csv([['1', '2025', 'আপডেটেড নাম', ...geo], ['999', '2025', 'অজানা সিরিয়াল', ...geo]]),
  })
  await page.getByRole('button', { name: /টি সারি/ }).click()
  await expect(page.getByText('সফল: ১')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('সিরিয়াল মিলেনি (আপডেট হয়নি): ১')).toBeVisible()
  await expect(page.getByText('সিরিয়াল ৯৯৯: রেকর্ড নেই')).toBeVisible()
  await page.goto('/housing/admin/semi-pucca')
  await expect(page.getByRole('row', { name: /আপডেটেড নাম/ }).getByRole('cell', { name: '১', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('row', { name: /অজানা সিরিয়াল/ })).toHaveCount(0)
})
