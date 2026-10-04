import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../support/auth'
import { GEO } from '../support/data'

const csv = (rows: string[][]) =>
  Buffer.from('﻿' + [['সাল', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম', 'বিভাগ', 'জেলা', 'উপজেলা', 'ঠিকানা'], ...rows].map((r) => r.join(',')).join('\n') + '\n', 'utf-8')

const row = (year: string, name: string) => [year, name, 'পিতা', GEO.division, GEO.district, GEO.upazila, 'ঠিকানা']

test.describe('bulk import: add new', () => {
  test('a valid sheet is previewed with automatic serials and imported', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/import')
    await page.locator('input[type=file]').setInputFiles({ name: 'rows.csv', mimeType: 'text/csv', buffer: csv([row('2025', 'ইম্পোর্ট এক'), row('2025', 'ইম্পোর্ট দুই')]) })
    await expect(page.getByRole('heading', { name: '২ কলাম ম্যাপিং' })).toBeVisible()
    await expect(page.getByText('পরবর্তী স্বয়ংক্রিয় সিরিয়াল: ১৩')).toBeVisible()
    await page.getByRole('button', { name: '২ টি সারি যোগ করুন' }).click()
    await expect(page.getByText(/সফল|সম্পন্ন|যোগ হয়েছে/).first()).toBeVisible({ timeout: 15_000 })
    await page.goto('/housing/admin/semi-pucca')
    await expect(page.getByRole('row', { name: /ইম্পোর্ট এক/ }).getByRole('cell', { name: '১৩', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('row', { name: /ইম্পোর্ট দুই/ }).getByRole('cell', { name: '১৪', exact: true }).first()).toBeVisible()
  })

  test('Covers AE4 (wizard level): an invalid row is reported and never written; the valid row still imports', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/import')
    await page.locator('input[type=file]').setInputFiles({ name: 'rows.csv', mimeType: 'text/csv', buffer: csv([row('1999', 'ত্রুটিপূর্ণ সারি'), row('2025', 'বৈধ সারি')]) })
    await expect(page.getByText(/সাল অবৈধ/).first()).toBeVisible()
    await page.getByRole('button', { name: '১ টি সারি যোগ করুন' }).click()
    await expect(page.getByText(/সফল|সম্পন্ন|যোগ হয়েছে/).first()).toBeVisible({ timeout: 15_000 })
    await page.goto('/housing/admin/semi-pucca')
    await expect(page.getByRole('row', { name: /বৈধ সারি/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /ত্রুটিপূর্ণ সারি/ })).toHaveCount(0)
  })

  test('a misspelled geography name is auto-corrected in the preview instead of failing', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/import')
    const r = ['2025', 'সংশোধিত', 'পিতা', GEO.division, `${GEO.district} জেলা`, GEO.upazila, 'ঠিকানা']
    await page.locator('input[type=file]').setInputFiles({ name: 'rows.csv', mimeType: 'text/csv', buffer: csv([r]) })
    await expect(page.getByRole('button', { name: '১ টি সারি যোগ করুন' })).toBeEnabled()
  })
})
