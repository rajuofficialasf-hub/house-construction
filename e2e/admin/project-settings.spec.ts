import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { DEMO, addStatCard, asVisitor, expectNotFound, publish, toast } from '../support/projects'

// /admin/projects/demo (ProjectSettingsPage.tsx) on the draft demo project.

test('a general-tab edit is saved and still there after a reload', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  await page.getByLabel('ছোট বর্ণনা (বাংলা)').fill('পরীক্ষার জন্য বদলানো বর্ণনা')
  await expect(page.getByText('সংরক্ষণ হয়নি এমন পরিবর্তন আছে')).toBeVisible()
  await page.getByRole('button', { name: 'সংরক্ষণ করুন', exact: true }).click()
  await expect(toast(page, 'সংরক্ষিত')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('ছোট বর্ণনা (বাংলা)')).toHaveValue('পরীক্ষার জন্য বদলানো বর্ণনা')
})

test('publishing waits for the checklist; once published a visitor sees the project', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  // The demo project has no stat card yet, so the checklist blocks publishing.
  await expect(page.getByText('✕ অন্তত একটি পরিসংখ্যান কার্ড লাগবে')).toBeVisible()
  await expect(page.getByRole('button', { name: 'প্রকাশ করুন', exact: true })).toBeDisabled()

  await addStatCard(page, 'গণনা')
  await expect(page.getByText('✕ অন্তত একটি পরিসংখ্যান কার্ড লাগবে')).toHaveCount(0)
  await publish(page)

  await asVisitor(browser, baseURL, async (visitor) => {
    await visitor.goto(DEMO.publicPath)
    await expect(visitor.getByRole('heading', { level: 1, name: DEMO.name })).toBeVisible()
  })
})

test('unpublishing asks for the project name; afterwards a visitor gets "not found"', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  await addStatCard(page, 'গণনা')
  await publish(page)

  await page.getByRole('button', { name: 'অপ্রকাশ করুন' }).click()
  const dialog = page.getByRole('dialog', { name: `«${DEMO.name}» অপ্রকাশ করবেন?` })
  await expect(dialog).toContainText('৬টি রেকর্ড')
  const confirm = dialog.getByRole('button', { name: 'অপ্রকাশ করুন' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(`নিশ্চিত করতে প্রকল্পের নাম লিখুন: ${DEMO.name}`).fill(DEMO.name)
  await confirm.click()
  await expect(toast(page, 'অপ্রকাশ করা হয়েছে')).toBeVisible()
  await expect(page.getByText('খসড়া', { exact: true })).toBeVisible()

  await asVisitor(browser, baseURL, (visitor) => expectNotFound(visitor, DEMO.publicPath))
})

test('a stale page cannot overwrite a newer save: it shows the conflict and reloads', async ({ page, context }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  const other = await context.newPage()
  await other.goto(DEMO.settings)
  await expect(other.getByLabel('বাংলা নাম')).toHaveValue(DEMO.name)

  await page.getByLabel('ছোট বর্ণনা (বাংলা)').fill('প্রথম পাতার বর্ণনা')
  await page.getByRole('button', { name: 'সংরক্ষণ করুন', exact: true }).click()
  await expect(toast(page, 'সংরক্ষিত')).toBeVisible()

  await other.getByLabel('ছোট বর্ণনা (বাংলা)').fill('দ্বিতীয় পাতার বর্ণনা')
  await other.getByRole('button', { name: 'সংরক্ষণ করুন', exact: true }).click()
  const conflict = other.getByRole('alert').filter({ hasText: 'অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন। আপনার পরিবর্তন সংরক্ষিত হয়নি' })
  await expect(conflict).toBeVisible()

  await conflict.getByRole('button', { name: 'নতুন অবস্থা আনুন' }).click()
  await expect(conflict).toHaveCount(0)
  await expect(other.getByLabel('ছোট বর্ণনা (বাংলা)')).toHaveValue('প্রথম পাতার বর্ণনা')
})
