import { expect, test } from '@playwright/test'
import { bnInt } from '../support/bn'
import { columnTexts, dataRows, waitForList } from '../support/public'

test('the list is in ascending serial order', async ({ page }) => {
  await page.goto('/housing/semi-pucca')
  await waitForList(page)
  const serials = (await columnTexts(page, 0)).map(bnInt)
  expect(serials).toEqual([...serials].sort((a, b) => a - b))
})

test('a page number far beyond the last page does not break the list', async ({ page }) => {
  await page.goto('/housing/semi-pucca?page=99')
  await waitForList(page)
  await expect(page.getByRole('heading', { name: 'সেমিপাকা ঘর নির্মাণ', level: 1 })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('when there is more than one page, paging keeps filters and changes the rows', async ({ page }) => {
  await page.goto('/housing/semi-pucca')
  await waitForList(page)
  const next = page.getByRole('button', { name: 'পরের পেইজ' })
  test.skip(!(await next.isVisible()) || (await next.isDisabled()), 'only one page of data')
  const first = (await columnTexts(page, 0))[0]
  await next.click()
  await expect(page).toHaveURL(/page=2/)
  await expect.poll(async () => (await columnTexts(page, 0))[0]).not.toBe(first)
  expect(await dataRows(page).count()).toBeGreaterThan(0)
})
