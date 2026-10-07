import { expect, type Page } from '@playwright/test'
import { bnInt } from './bn'

/** তালিকার ডাটা সারি (হেডার বাদে) */
export const dataRows = (page: Page) => page.locator('table tbody tr')

/** "মোট উপকারভোগী" পরিসংখ্যান কার্ডের মান */
export async function statTotal(page: Page): Promise<number> {
  const region = page.getByRole('region', { name: 'পরিসংখ্যান' })
  const label = region.getByText('মোট উপকারভোগী', { exact: true })
  await expect(label).toBeVisible()
  const value = label.locator('xpath=following-sibling::*[1]')
  // সংখ্যা count-up অ্যানিমেশনে বাড়ে, আর ডাটা আসার আগে ০ দেখায় — তাই একই মান টানা কয়েকবার (≈১ সেকেন্ড) থাকলে তবেই স্থির ধরা হয়
  let prev = Number.NaN
  let same = 0
  for (let i = 0; i < 60; i++) {
    const n = bnInt(await value.textContent())
    same = n === prev ? same + 1 : 0
    if (same >= 6) return n
    prev = n
    await page.waitForTimeout(150)
  }
  return prev
}

/** The list's own total, from its pagination line ("মোট X টির মধ্যে Y–Z দেখানো হচ্ছে"); the page is paged at 50. */
export async function listTotal(page: Page): Promise<number> {
  const line = page.getByRole('navigation', { name: 'পেজিনেশন' }).getByText(/টির মধ্যে/)
  await expect(line).toBeVisible()
  return bnInt(await line.textContent())
}

/** The note the stat cards show when they count the filtered records (ProjectStatCards.tsx). */
export const filteredBanner = (page: Page) => page.getByRole('status').filter({ hasText: 'পরিসংখ্যান: বাছাই করা ফিল্টার অনুযায়ী' })

/** তালিকা লোড হওয়া পর্যন্ত অপেক্ষা (ডাটা সারি সহ টেবিল, অথবা খালি অবস্থার বার্তা) */
export async function waitForList(page: Page) {
  // the list page renders a table when there are records, or a status notice when there are none
  await expect(page.locator('table').or(page.locator('main [role=status]')).first()).toBeVisible()
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
