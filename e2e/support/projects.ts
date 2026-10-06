import { expect, type Browser, type Page } from '@playwright/test'

/** The draft "demo" project the admin-rest reset loads (server/db/seed/demo-project.sql). */
export const DEMO = { name: 'ডেমো প্রকল্প', settings: '/admin/projects/demo', publicPath: '/demo' }

/** Runs `fn` with a page in a fresh browser context: no session until `fn` logs in, so a visitor by default. */
export async function inFreshContext(browser: Browser, baseURL: string | undefined, fn: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL })
  try {
    await fn(await context.newPage())
  } finally {
    await context.close()
  }
}

/** A visitor sees the site's "not found" page at `path`. */
export async function expectNotFound(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'পেইজটি পাওয়া যায়নি' })).toBeVisible()
}

/** A success toast with this message (a status role takes no name from its content, so it is matched by text). */
export const toast = (page: Page, message: string) => page.getByRole('status').filter({ hasText: message })

/**
 * On a project's settings page: adds one stat card on the "পরিসংখ্যান" tab (`kind` is the picker's
 * Bangla kind label, `field` the label of the field a sum or category card counts) and saves the cards.
 */
export async function addStatCard(page: Page, kind: 'গণনা' | 'যোগফল', field?: string) {
  await page.getByRole('tab', { name: 'পরিসংখ্যান' }).click()
  await page.getByRole('radio', { name: new RegExp(`^${kind}`) }).check()
  if (field) await page.getByRole('combobox', { name: 'ফিল্ড', exact: true }).selectOption({ label: field })
  await page.getByRole('button', { name: 'কার্ড যোগ করুন' }).click()
  await page.getByRole('button', { name: 'কার্ড সংরক্ষণ করুন' }).click()
  await expect(toast(page, 'সংরক্ষিত')).toBeVisible()
}

/** On a draft project's settings page whose checklist has nothing blocking: publishes it. */
export async function publish(page: Page) {
  await page.getByRole('button', { name: 'প্রকাশ করুন', exact: true }).click()
  await expect(toast(page, 'প্রকাশ করা হয়েছে')).toBeVisible()
  await expect(page.getByText('প্রকাশিত', { exact: true })).toBeVisible()
}
