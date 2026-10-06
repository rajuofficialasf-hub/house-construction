import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { DEMO, addStatCard, asVisitor, publish } from '../support/projects'

// The "পরিসংখ্যান" tab (StatsTab.tsx, StatCardPicker.tsx). The demo records' amounts are
// 25000 + 30000 + 20000 + 35000 + 15000 (one record has none) = 125000 (demo-project.sql).
const TOTAL = '৳ ১,২৫,০০০'

test('a sum card on the money field shows the seeded total, in the preview and on the public page', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  await addStatCard(page, 'যোগফল', 'অনুদান')
  await expect(page.getByRole('listitem').filter({ hasText: 'Σ অনুদান' })).toBeVisible()
  await expect(page.getByText(TOTAL, { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('textbox', { name: 'লেবেল (বাংলা)' })).toHaveValue('মোট অনুদান')

  await publish(page)
  await asVisitor(browser, baseURL, async (visitor) => {
    await visitor.goto(DEMO.publicPath)
    const stats = visitor.getByRole('region', { name: 'পরিসংখ্যান' })
    await expect(stats.getByText('মোট অনুদান', { exact: true })).toBeVisible()
    await expect(stats.getByLabel(`মোট অনুদান: ${TOTAL}`)).toHaveText(TOTAL)
  })
})

test('a sum card offers only public number and money fields', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, `${DEMO.settings}?tab=stats`)
  await page.getByRole('radio', { name: /^যোগফল/ }).check()
  // amount (money) and family_size (number); not the category field or the private phone.
  await expect(page.getByRole('combobox', { name: 'ফিল্ড', exact: true }).getByRole('option')).toHaveText(['অনুদান', 'পরিবারের সদস্য'])
})
