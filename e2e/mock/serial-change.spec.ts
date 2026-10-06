import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'

test.describe('change serial', () => {
  test('the confirm button stays disabled until a new serial is typed, and cancel changes nothing', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/semi-pucca/1/edit')
    await page.getByRole('button', { name: 'সিরিয়াল বদলান…' }).click()
    const dialog = page.getByRole('dialog', { name: 'সিরিয়াল নম্বর বদলাবেন?' })
    await expect(dialog.getByRole('button', { name: 'হ্যাঁ, সিরিয়াল বদলান' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'বাতিল' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('moving to a serial already in use is refused and neither record changes', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/semi-pucca/1/edit')
    await page.getByRole('button', { name: 'সিরিয়াল বদলান…' }).click()
    const dialog = page.getByRole('dialog', { name: 'সিরিয়াল নম্বর বদলাবেন?' })
    await dialog.getByRole('textbox', { name: 'নতুন সিরিয়াল' }).fill('2')
    await dialog.getByRole('button', { name: 'হ্যাঁ, সিরিয়াল বদলান' }).click()
    await expect(page.getByText('এই সিরিয়াল আগে থেকেই আছে')).toBeVisible()
    await page.goto('/housing/admin/semi-pucca')
    await expect(page.getByRole('row', { name: /রহিমা খাতুন 1/ }).getByRole('cell', { name: '১', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('row', { name: /সালমা বেগম 2/ }).getByRole('cell', { name: '২', exact: true }).first()).toBeVisible()
  })

  test('moving to a free serial renumbers the record and the old serial is not handed out again', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/semi-pucca/1/edit')
    await page.getByRole('button', { name: 'সিরিয়াল বদলান…' }).click()
    const dialog = page.getByRole('dialog', { name: 'সিরিয়াল নম্বর বদলাবেন?' })
    await dialog.getByRole('textbox', { name: 'নতুন সিরিয়াল' }).fill('40')
    await dialog.getByRole('button', { name: 'হ্যাঁ, সিরিয়াল বদলান' }).click()
    await expect(page).toHaveURL(/\/admin\/records\/semi_pucca\/40\/edit$/)
    await page.goto('/housing/admin/semi-pucca')
    const row = page.getByRole('row', { name: /রহিমা খাতুন 1/ })
    await expect(row.getByRole('cell', { name: '৪০', exact: true }).first()).toBeVisible()
    await page.goto('/housing/admin/semi-pucca/new')
    await expect(page.getByText('স্বয়ংক্রিয় (পরবর্তী: ৪১)')).toBeVisible()
  })
})
