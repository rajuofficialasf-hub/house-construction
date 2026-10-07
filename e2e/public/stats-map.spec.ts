import { expect, test } from '@playwright/test'
import { bnInts } from '../support/bn'
import { appears, dataRows, statTotal, waitForList } from '../support/public'

test('the stat total equals the number of listed records (single page) and the map button reports the same total', async ({ page }) => {
  await page.goto('/housing/semi-pucca')
  await waitForList(page)
  const total = await statTotal(page)
  if (total <= 50) await expect.poll(async () => dataRows(page).count()).toBe(total)
  const mapButton = page.getByRole('button', { name: /মানচিত্রে দেখুন/ })
  test.skip(!(await appears(mapButton)), 'no map when there is no data')
  const [upazilas, houses] = bnInts(await mapButton.textContent()).slice(-2)
  expect(houses).toBe(total)
  expect(upazilas).toBeLessThanOrEqual(total)
})

test('the map opens and can be closed without errors', async ({ page }) => {
  await page.goto('/housing/semi-pucca')
  await waitForList(page)
  const mapButton = page.getByRole('button', { name: /মানচিত্রে দেখুন/ })
  test.skip(!(await appears(mapButton)), 'no map when there is no data')
  await mapButton.click()
  const region = page.getByRole('region', { name: 'মানচিত্র' })
  await expect(region.getByRole('img', { name: /উপজেলা মানচিত্র/ })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await region.getByRole('button', { name: 'মানচিত্র লুকান' }).click()
  await expect(region).toHaveCount(0)
})

test('both projects show their own stat card totals', async ({ page }) => {
  for (const path of ['/housing/semi-pucca', '/housing/tin']) {
    await page.goto(path)
    await waitForList(page)
    const total = await statTotal(page)
    if (total <= 50) await expect.poll(async () => dataRows(page).count()).toBe(total)
  }
})
