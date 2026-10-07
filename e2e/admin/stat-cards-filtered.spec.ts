import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { bnInt } from '../support/bn'
import { DEMO, addStatCard, inFreshContext } from '../support/projects'
import { columnTexts, dataRows, filteredBanner, listTotal, statTotal, waitForList } from '../support/public'

// The list page's stat cards follow its filters on the server (main 87c7241's filtered stats;
// docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, P8b, U50).

test('as a visitor, a year filter makes the count card count the filtered records, and clearing restores the total', async ({ browser, baseURL }) => {
  await inFreshContext(browser, baseURL, async (page) => {
    await page.goto('/housing/semi-pucca')
    await waitForList(page)
    const total = await statTotal(page)
    await expect(filteredBanner(page)).toHaveCount(0)
    const year = (await columnTexts(page, 1))[0]!
    await page.getByRole('combobox', { name: 'সাল', exact: true }).selectOption({ label: year })
    await expect(filteredBanner(page)).toBeVisible()
    await expect.poll(async () => (await columnTexts(page, 1)).every((y) => y === year)).toBe(true)
    expect(await statTotal(page)).toBe(await listTotal(page))
    expect(await listTotal(page)).toBeLessThan(total)
    await page.getByRole('button', { name: 'ফিল্টার মুছুন' }).click()
    await expect(filteredBanner(page)).toHaveCount(0)
    expect(await statTotal(page)).toBe(total)
  })
})

test('as the main admin, a category filter on the demo preview makes the sum card add up the listed amounts', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  await addStatCard(page, 'যোগফল', 'অনুদান')
  await page.goto(DEMO.publicPath)
  await waitForList(page)
  await page.getByRole('combobox', { name: 'পেশা', exact: true }).selectOption({ value: 'দর্জি' })
  await expect(filteredBanner(page)).toBeVisible()
  await expect.poll(async () => dataRows(page).count()).toBe(3)
  // The amount column holds "৳ …" or "—"; the seeded tailors' amounts are 25000 + 20000 (one has none).
  const header = await page.locator('table thead th').allTextContents()
  const amountCol = header.findIndex((h) => h.trim() === 'অনুদান')
  const listed = (await columnTexts(page, amountCol)).map((t) => (t.includes('৳') ? bnInt(t) : 0)).reduce((a, b) => a + b, 0)
  const card = page.getByRole('region', { name: 'পরিসংখ্যান' }).getByLabel(/^মোট অনুদান: /)
  await expect(card).toHaveText('৳ ৪৫,০০০')
  expect(listed).toBe(45000)
})
