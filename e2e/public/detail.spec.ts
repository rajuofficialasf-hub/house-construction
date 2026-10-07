import { expect, test } from '@playwright/test'
import { bnInt } from '../support/bn'
import { columnTexts, dataRows, waitForList } from '../support/public'

test.describe('record detail', () => {
  test('opening a record from the list shows a detail view that matches its row, and closing returns to the same list', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    test.skip((await dataRows(page).count()) === 0, 'no records')
    const row = dataRows(page).first()
    // The first column is the row's place in the list ("ক্রম"), not its serial: the default order is newest year
    // first, so the serial comes from the row's own detail link.
    const name = (await columnTexts(page, 2))[0]
    const link = row.getByRole('link', { name: 'বিস্তারিত' })
    const serial = Number((await link.getAttribute('href'))!.split('/').pop())
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/housing/semi-pucca/${serial}$`))
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText(name)
    const shownSerial = await dialog.getByText('সিরিয়াল নম্বর', { exact: true }).locator('xpath=following-sibling::*[1]').textContent()
    expect(bnInt(shownSerial ?? '')).toBe(serial)
    await page.getByRole('button', { name: 'বন্ধ করুন (Esc)' }).click()
    await expect(page).toHaveURL(/\/housing\/semi-pucca(\?.*)?$/)
    await expect(dialog).toHaveCount(0)
  })

  test('a filtered list stays filtered after opening and closing a record', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    test.skip((await dataRows(page).count()) === 0, 'no records')
    const division = (await columnTexts(page, 4))[0]
    await page.getByRole('combobox', { name: 'বিভাগ', exact: true }).selectOption({ label: division })
    await expect(page).toHaveURL(/division=/)
    await dataRows(page).first().getByRole('link', { name: 'বিস্তারিত' }).click()
    await page.getByRole('button', { name: 'বন্ধ করুন (Esc)' }).click()
    await expect(page).toHaveURL(/division=/)
  })

  test('a record with photos offers the slider and side-by-side compare views', async ({ page }) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    test.skip((await dataRows(page).count()) === 0, 'no records')
    // the first row that has both photos (the photo cells hold images, not the no-photo text)
    const withPhotos = dataRows(page).filter({ has: page.getByRole('img', { name: /পূর্বের ঘর$/ }) }).filter({ has: page.getByRole('img', { name: /বর্তমান ঘর$/ }) })
    test.skip((await withPhotos.count()) === 0, 'no record with both photos')
    await withPhotos.first().getByRole('link', { name: 'বিস্তারিত' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('img', { name: /পূর্বের ঘর$/ })).toBeVisible()
    await expect(dialog.getByRole('img', { name: /বর্তমান ঘর$/ })).toBeVisible()
    await dialog.getByRole('button', { name: 'পাশাপাশি দেখুন' }).click()
    await expect(dialog.getByRole('button', { name: 'পাশাপাশি দেখুন' })).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('button', { name: 'স্লাইডার দেখুন' }).click()
    await expect(dialog.getByRole('slider', { name: 'আগে-পরে ভাগ' })).toBeVisible()
  })

  test('an unknown serial does not crash the page', async ({ page }) => {
    await page.goto('/housing/semi-pucca/99999999')
    await expect(page.getByRole('heading', { name: 'সেমিপাকা ঘর নির্মাণ', level: 1 })).toBeVisible()
  })
})
