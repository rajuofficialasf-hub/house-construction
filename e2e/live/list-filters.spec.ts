import { expect, test } from '@playwright/test'
import { columnTexts, dataRows, statTotal, waitForList } from '../support/public'

// ক্রম | সাল | নাম | পিতা/স্বামী | বিভাগ | জেলা | উপজেলা | ঠিকানা | ছবি | ছবি | বিস্তারিত
const COL = { year: 1, name: 2, division: 4, district: 5, upazila: 6 }

test.describe('list filters (relationships only, no fixed data)', () => {
  test('Covers AE3: a division filter keeps only that division, never grows the count, and clearing restores it', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    const total = await dataRows(page).count()
    test.skip(total === 0, 'no records to filter')
    const division = (await columnTexts(page, COL.division))[0]
    await page.getByRole('combobox', { name: 'বিভাগ', exact: true }).selectOption({ label: division })
    await expect(page).toHaveURL(/division=/)
    await expect.poll(async () => (await columnTexts(page, COL.division)).every((d) => d === division)).toBe(true)
    expect(await dataRows(page).count()).toBeLessThanOrEqual(total)
    await page.getByRole('button', { name: 'ফিল্টার মুছুন' }).click()
    await expect.poll(async () => dataRows(page).count()).toBe(total)
    await expect(page).not.toHaveURL(/division=/)
  })

  test('a year filter keeps only that year', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    test.skip((await dataRows(page).count()) === 0, 'no records to filter')
    const year = (await columnTexts(page, COL.year))[0]
    await page.getByRole('combobox', { name: 'সাল', exact: true }).selectOption({ label: year })
    await expect.poll(async () => (await columnTexts(page, COL.year)).every((y) => y === year)).toBe(true)
  })

  test('narrowing division then district then upazila keeps the choices consistent', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    test.skip((await dataRows(page).count()) === 0, 'no records to filter')
    const [division, district, upazila] = [(await columnTexts(page, COL.division))[0], (await columnTexts(page, COL.district))[0], (await columnTexts(page, COL.upazila))[0]]
    await page.getByRole('combobox', { name: 'বিভাগ', exact: true }).selectOption({ label: division })
    await page.getByRole('combobox', { name: 'জেলা', exact: true }).selectOption({ label: district })
    await page.getByRole('combobox', { name: 'উপজেলা', exact: true }).selectOption({ label: upazila })
    await expect.poll(async () => (await columnTexts(page, COL.upazila)).every((u) => u === upazila)).toBe(true)
    expect((await columnTexts(page, COL.district)).every((d) => d === district)).toBe(true)
  })

  test('search narrows the list to matching names and clearing restores it', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    const total = await dataRows(page).count()
    test.skip(total === 0, 'no records to search')
    const needle = (await columnTexts(page, COL.name))[0].slice(0, 3)
    await page.getByRole('searchbox', { name: 'উপকারভোগীর নাম' }).fill(needle)
    await expect(page).toHaveURL(/q=/)
    await expect.poll(async () => {
      const names = await columnTexts(page, COL.name)
      return names.length > 0 && names.every((n) => n.toLowerCase().includes(needle.toLowerCase()))
    }).toBe(true)
    await page.getByRole('button', { name: 'ফিল্টার মুছুন' }).click()
    await expect.poll(async () => dataRows(page).count()).toBe(total)
  })

  test('a search with no match shows an empty list without an error', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    await page.getByRole('searchbox', { name: 'উপকারভোগীর নাম' }).fill('zzzz-no-such-name-zzzz')
    await expect.poll(async () => dataRows(page).filter({ hasText: 'zzzz' }).count()).toBe(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('filters live in the URL: reloading keeps them and the stat total is unaffected', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    test.skip((await dataRows(page).count()) === 0, 'no records to filter')
    const total = await statTotal(page)
    const division = (await columnTexts(page, COL.division))[0]
    await page.getByRole('combobox', { name: 'বিভাগ', exact: true }).selectOption({ label: division })
    await expect(page).toHaveURL(/division=/)
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'বিভাগ', exact: true })).toHaveValue(division)
    expect(await statTotal(page)).toBe(total)
  })
})
