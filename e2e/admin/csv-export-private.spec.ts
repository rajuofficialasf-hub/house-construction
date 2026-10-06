import fs from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'

// The records export (AdminRecordsPage.tsx, recordsCsv.ts) on the demo project, which has the private
// ফোন field: the page asks first, and only the private export carries the phone column and values.

async function exportCsv(page: Page, withPrivate: boolean) {
  await loginAs(page, MOCK_ADMIN, '/admin/records/demo')
  await page.getByRole('button', { name: 'সিরিয়াল সহ এক্সপোর্ট (CSV)' }).click()
  const dialog = page.getByRole('dialog', { name: 'গোপন কলামসহ এক্সপোর্ট করবেন?' })
  await expect(dialog.getByRole('radio', { name: 'গোপন কলাম ছাড়া (সাধারণ)' })).toBeChecked()
  if (withPrivate) await dialog.getByRole('radio', { name: /গোপন কলামসহ/ }).check()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'এক্সপোর্ট করুন' }).click()])
  const text = fs.readFileSync((await download.path())!, 'utf-8')
  expect(text.startsWith('﻿')).toBe(true)
  const lines = text.replace(/^﻿/, '').trim().split('\r\n')
  return { name: download.suggestedFilename(), header: lines[0].split(','), lines }
}

test('with private columns the file is named -private and carries the phone column and values', async ({ page }) => {
  const { name, header, lines } = await exportCsv(page, true)
  expect(name).toMatch(/^demo-\d{4}-\d{2}-\d{2}-private\.csv$/)
  expect(header).toContain('ফোন')
  expect(header).toEqual(expect.arrayContaining(['সিরিয়াল', 'অনুদান', 'পেশা']))
  expect(lines).toHaveLength(1 + 6)
  const phone = header.indexOf('ফোন')
  expect(lines[1].split(',')[phone]).toBe('01700000001')
  expect(lines[6].split(',')[phone]).toBe('01900000006')
})

test('without private columns the file has no phone column or value', async ({ page }) => {
  const { name, header, lines } = await exportCsv(page, false)
  expect(name).toMatch(/^demo-\d{4}-\d{2}-\d{2}\.csv$/)
  expect(header).not.toContain('ফোন')
  expect(header).toEqual(expect.arrayContaining(['সিরিয়াল', 'অনুদান', 'পেশা']))
  expect(lines).toHaveLength(1 + 6)
  expect(lines.join('\n')).not.toContain('01700000001')
})
