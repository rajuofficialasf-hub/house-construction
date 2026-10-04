import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../support/auth'
import { dataRows } from '../support/public'

test('admin CSV export downloads a UTF-8 file with a row per listed record', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(dataRows(page)).toHaveCount(12)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'সিরিয়াল সহ এক্সপোর্ট (CSV)' }).click()])
  expect(download.suggestedFilename()).toMatch(/^housing-semi-pucca-\d{4}-\d{2}-\d{2}\.csv$/)
  const text = fs.readFileSync((await download.path())!, 'utf-8')
  expect(text.startsWith('﻿')).toBe(true)
  const lines = text.replace(/^﻿/, '').trim().split('\r\n')
  expect(lines.length).toBe(1 + 12)
  expect(lines[1]).toContain('রহিমা খাতুন 1')
})
