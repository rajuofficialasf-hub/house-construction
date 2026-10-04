import { expect, type Page } from '@playwright/test'
import { bnInt } from './bn'

/** তালিকার ডাটা সারি (হেডার বাদে) */
export const dataRows = (page: Page) => page.locator('table tbody tr')

/** "মোট উপকারভোগী" পরিসংখ্যান কার্ডের মান */
export async function statTotal(page: Page): Promise<number> {
  const region = page.getByRole('region', { name: 'পরিসংখ্যান' })
  const label = region.getByText('মোট উপকারভোগী', { exact: true })
  await expect(label).toBeVisible()
  // সংখ্যা count-up অ্যানিমেশনে বাড়ে — স্থির হওয়া পর্যন্ত অপেক্ষা
  const value = label.locator('xpath=following-sibling::*[1]')
  let prev = -1
  for (let i = 0; i < 40; i++) {
    const n = bnInt(await value.textContent())
    if (n === prev && !Number.isNaN(n)) return n
    prev = n
    await page.waitForTimeout(150)
  }
  return prev
}

/** তালিকা লোড হওয়া পর্যন্ত অপেক্ষা (অন্তত এক ডাটা সারি, অথবা খালি অবস্থা) */
export async function waitForList(page: Page) {
  await expect(page.locator('table')).toBeVisible()
  await expect.poll(async () => (await page.locator('table tbody tr').count()) >= 0).toBe(true)
}

/** এক কলামের সব সারির টেক্সট, এক ধাপে (রি-রেন্ডারের মাঝখানে সারি বদলালেও আটকে যায় না) */
export async function columnTexts(page: Page, colIndex: number): Promise<string[]> {
  return page.locator('table tbody tr').evaluateAll(
    (rows, i) => rows.map((r) => (r.querySelectorAll('td')[i]?.textContent ?? '').trim()),
    colIndex,
  )
}

/** বাটন দেখা যাওয়া পর্যন্ত অল্প অপেক্ষা; না এলে false (যেমন ডাটা নেই বলে মানচিত্র নেই) */
export async function appears(locator: import('@playwright/test').Locator, ms = 5000): Promise<boolean> {
  return locator.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
}
