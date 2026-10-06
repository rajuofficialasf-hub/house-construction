import { expect, test } from '../support/backend'
import { loginAsAdmin } from '../support/auth'
import { PNG_1X1 } from '../support/data'

const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1X1 })

test.describe('single record photos', () => {
  test('uploading a before photo to a record without one shows it in the list', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/semi-pucca/4/edit')
    await page.getByRole('group', { name: 'পূর্বের ঘর', exact: true }).locator('input[type=file]').setInputFiles(png('before.png'))
    await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click()
    await expect(page).toHaveURL(/\/admin\/records\/semi_pucca$/)
    const row = page.getByRole('row', { name: /মমতাজ বেগম 4/ })
    await expect(row).toBeVisible()
    await expect(row).not.toHaveAccessibleName(/পূর্বের ঘর \(ছবি নেই\)/)
    await expect(row).toHaveAccessibleName(/বর্তমান ঘর \(ছবি নেই\)/)
  })

  test('replacing an existing photo shows the new one', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/semi-pucca/1/edit')
    const before = await page.getByRole('img', { name: 'পূর্বের ঘর (বর্তমানে সংরক্ষিত)' }).getAttribute('src')
    await page.getByRole('group', { name: 'পূর্বের ঘর', exact: true }).locator('input[type=file]').setInputFiles(png('new-before.png'))
    await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click()
    await expect(page).toHaveURL(/\/admin\/records\/semi_pucca$/)
    await page.goto('/housing/admin/semi-pucca/1/edit')
    const after = await page.getByRole('img', { name: 'পূর্বের ঘর (বর্তমানে সংরক্ষিত)' }).getAttribute('src')
    // A new src: the mock overwrites in place with a new ?v=, the server gives the photo a new URL.
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)
  })

  test('deleting a saved photo removes it from the record', async ({ page }) => {
    await loginAsAdmin(page, '/housing/admin/semi-pucca/1/edit')
    const group = page.getByRole('group', { name: 'পূর্বের ঘর', exact: true })
    await group.getByRole('button', { name: 'এই ছবি মুছুন' }).click()
    await page.getByRole('dialog', { name: 'ছবি মুছবেন?' }).getByRole('button', { name: 'মুছুন' }).click()
    await expect(group.getByRole('img', { name: /বর্তমানে সংরক্ষিত/ })).toHaveCount(0)
    await page.goto('/housing/admin/semi-pucca')
    await expect(page.getByRole('row', { name: /রহিমা খাতুন 1/ })).toHaveAccessibleName(/পূর্বের ঘর \(ছবি নেই\)/)
  })
})
