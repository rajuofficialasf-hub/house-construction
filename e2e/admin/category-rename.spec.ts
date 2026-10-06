import type { Page } from '@playwright/test'
import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { addStatCard, inFreshContext, DEMO, publish, toast } from '../support/projects'

// Category spelling unification on the records page (CategoryValuesPanel.tsx, useCategoryUsage.ts).
// The demo seed's পেশা has «দর্জি» on three records (demo-project.sql); one of them is first edited to
// the near spelling «দর্জী», and then both spellings are brought to «দর্জী».

/** On the demo records page: edits one «দর্জি» record to «দর্জী», then merges both spellings into «দর্জী». */
async function mergeIntoNearSpelling(page: Page) {
  await page.getByRole('row', { name: /নাজমা আক্তার/ }).getByRole('link', { name: 'এডিট' }).click()
  // The list stays on screen until the edit route has loaded, and it has its own পেশা filter.
  await expect(page.getByRole('heading', { name: 'সিরিয়াল নম্বর' })).toBeVisible()
  await page.getByLabel('পেশা').fill('দর্জী')
  await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click()
  await expect(page).toHaveURL(/\/admin\/records\/demo$/)

  await page.getByText('ক্যাটাগরির মান ও বানান').click()
  const pair = page.getByRole('listitem').filter({ hasText: '«দর্জি» (২) · «দর্জী» (১)' })
  await pair.getByRole('button', { name: 'এক বানানে আনুন' }).click()
  const dialog = page.getByRole('dialog', { name: 'এক বানানে আনবেন?' })
  // The spelling with more records is offered first; keep the other one instead.
  await expect(dialog.getByRole('radio', { name: /«দর্জি»/ })).toBeChecked()
  await dialog.getByRole('radio', { name: /«দর্জী»/ }).check()
  // The page logs the one-line summary after the rename; wait for it before leaving the page.
  const logged = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/activity')
  await dialog.getByRole('button', { name: 'হ্যাঁ, এক বানানে আনুন' }).click()
  await expect(toast(page, '২টি রেকর্ডে «দর্জি» → «দর্জী»')).toBeVisible()
  expect((await logged).ok()).toBe(true)
}

test('merging two spellings renames every record, updates the filter and counts, and logs one summary row', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/records/demo')
  await mergeIntoNearSpelling(page)

  // The counts in the panel and the list filter show only the new spelling.
  await expect(page.getByRole('listitem').filter({ hasText: /^দর্জী · ৩$/ })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: /^দর্জি ·/ })).toHaveCount(0)
  const filter = page.getByRole('combobox', { name: 'পেশা' })
  await expect(filter.getByRole('option', { name: 'দর্জী (৩)' })).toBeAttached()
  await expect(filter.getByRole('option', { name: /^দর্জি / })).toHaveCount(0)

  await filter.selectOption({ label: 'দর্জী (৩)' })
  await expect(page).toHaveURL(/f\.trade=/)
  for (const name of ['মোছাঃ সালেহা বেগম', 'রাবেয়া খাতুন', 'নাজমা আক্তার']) {
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('দর্জী')
  }
  await expect(page.getByRole('row', { name: /মোঃ কাশেম আলী/ })).toHaveCount(0)

  // The activity log has the summary row.
  await page.goto('/admin/activity')
  const entry = page.getByRole('listitem').filter({ hasText: 'ক্যাটাগরি এক বানানে' })
  await expect(entry).toHaveCount(1)
  await expect(entry).toContainText('পেশা: «দর্জি» → «দর্জী» · ২টি রেকর্ড')
})

test('once published, the public category filter (from the project stats) offers only the kept spelling', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/records/demo')
  await mergeIntoNearSpelling(page)
  await page.goto(DEMO.settings)
  await addStatCard(page, 'গণনা')
  await publish(page)

  await inFreshContext(browser, baseURL, async (visitor) => {
    await visitor.goto(DEMO.publicPath)
    const filter = visitor.getByRole('combobox', { name: 'পেশা' })
    await expect(filter.getByRole('option', { name: 'দর্জী (৩)' })).toBeAttached()
    await expect(filter.getByRole('option', { name: /^দর্জি / })).toHaveCount(0)
  })
})
