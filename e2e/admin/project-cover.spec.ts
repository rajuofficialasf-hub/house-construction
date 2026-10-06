import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { PNG_1X1 } from '../support/data'
import { DEMO, toast } from '../support/projects'
import { PLAIN_ADMIN } from '../support/rest-data'

// The cover photo on the general tab (CoverUpload.tsx). Any admin may upload; only the main admin may delete.

const cover = { name: 'cover.png', mimeType: 'image/png', buffer: PNG_1X1 }
const coverImage = `${DEMO.name} — কভার ছবি`

test('the main admin uploads a cover, sees it, and deletes it', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  await expect(page.getByText('কভার নেই')).toBeVisible()
  await page.getByLabel('কভার ছবি দিন').setInputFiles(cover)
  await expect(toast(page, 'কভার ছবি আপলোড হয়েছে')).toBeVisible()
  // The exact name: SafeImage renames a picture that failed to load.
  const img = page.getByRole('img', { name: coverImage, exact: true })
  await img.scrollIntoViewIfNeeded()
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByText('কভার নেই')).toHaveCount(0)

  await page.getByRole('button', { name: 'কভার মুছুন' }).click()
  await page.getByRole('dialog', { name: 'কভার ছবি মুছবেন?' }).getByRole('button', { name: 'মুছুন', exact: true }).click()
  await expect(toast(page, 'কভার ছবি মুছে ফেলা হয়েছে')).toBeVisible()
  await expect(page.getByRole('img', { name: coverImage, exact: true })).toHaveCount(0)
  await expect(page.getByText('কভার নেই')).toBeVisible()
})

test('a plain admin may upload a cover but gets no delete control', async ({ page }) => {
  await loginAs(page, PLAIN_ADMIN, DEMO.settings)
  await page.getByLabel('কভার ছবি দিন').setInputFiles(cover)
  await expect(toast(page, 'কভার ছবি আপলোড হয়েছে')).toBeVisible()
  await expect(page.getByRole('img', { name: coverImage, exact: true })).toBeVisible()
  await expect(page.getByText('কভার বদলান', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'কভার মুছুন' })).toHaveCount(0)
})
