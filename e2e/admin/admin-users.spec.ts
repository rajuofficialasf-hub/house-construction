import type { Page } from '@playwright/test'
import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { PLAIN_ADMIN, PROJECT_EDITOR } from '../support/rest-data'
import { ADMIN_REST_API_URL } from '../support/rest-env'
import { inFreshContext } from '../support/projects'

// /admin/users and a project user's view on the REST backend (the P9b decisions in
// docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md). The reset gives the main
// admin, a plain admin and PROJECT_EDITOR, a project user with the tin project.

const TIN = 'টিনের ঘর নির্মাণ'
const SEMI = 'সেমিপাকা ঘর নির্মাণ'
const GATE = 'এই অংশ শুধু মূল এডমিনের'

/** Calls the API from inside the page, with the page's session and Origin. */
function api(page: Page, path: string, method: 'GET' | 'PATCH' | 'POST' = 'GET', body?: unknown) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, body: (await res.json()) as { data?: unknown; error?: { code: string; message: string } } }
    },
    { url: `${ADMIN_REST_API_URL}/api/v1${path}`, method, body },
  )
}

// Anchored: editor@example.test is also the end of project-editor@example.test.
const row = (page: Page, email: string) => page.getByRole('row', { name: new RegExp(`^${email.replace(/[.+]/g, '\\$&')}`) })
const nav = (page: Page) => page.getByRole('navigation', { name: 'এডমিন মেনু' })

/** Opens a login's row in the form. */
async function editUser(page: Page, email: string) {
  await row(page, email).getByRole('button', { name: 'বদলান' }).click()
  await expect(page.getByRole('heading', { name: 'ইউজার বদলান' })).toBeVisible()
}

async function save(page: Page, email: string) {
  await page.getByRole('button', { name: 'সংরক্ষণ', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `${email} এর তথ্য বদলানো হয়েছে` })).toBeVisible()
}

test('the main admin sees every login, with their own row read-only', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/users')
  await expect(row(page, MOCK_ADMIN.email)).toContainText('মূল এডমিন')
  await expect(row(page, MOCK_ADMIN.email).getByRole('button', { name: 'বদলান' })).toHaveCount(0)
  await expect(row(page, PLAIN_ADMIN.email)).toContainText('এডমিন')
  await expect(row(page, PLAIN_ADMIN.email)).toContainText('সব প্রকল্প')
  await expect(row(page, PROJECT_EDITOR.email)).toContainText('প্রকল্পের ইউজার')
  await expect(row(page, PROJECT_EDITOR.email)).toContainText(TIN)
})

test("the main admin moves the project user from tin to semi_pucca, and the user's next page follows", async ({ page, browser, baseURL }) => {
  await inFreshContext(browser, baseURL, async (editor) => {
    await loginAs(editor, PROJECT_EDITOR, '/admin')
    await expect(nav(editor).getByRole('link', { name: TIN })).toBeVisible()
    await expect(nav(editor).getByRole('link', { name: SEMI })).toHaveCount(0)

    await loginAs(page, MOCK_ADMIN, '/admin/users')
    await editUser(page, PROJECT_EDITOR.email)
    await page.getByRole('checkbox', { name: new RegExp(`^${TIN}`) }).uncheck()
    await page.getByRole('checkbox', { name: new RegExp(`^${SEMI}`) }).check()
    await save(page, PROJECT_EDITOR.email)
    await expect(row(page, PROJECT_EDITOR.email)).toContainText(SEMI)
    await expect(row(page, PROJECT_EDITOR.email)).not.toContainText(TIN)

    await editor.reload()
    await expect(nav(editor).getByRole('link', { name: SEMI })).toBeVisible()
    await expect(nav(editor).getByRole('link', { name: TIN })).toHaveCount(0)
  })
})

test('the main admin switches a login between admin and project user, and disables and re-enables one', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin/users')
  await editUser(page, PLAIN_ADMIN.email)
  await expect(page.getByRole('radio', { name: /^এডমিন/ })).toBeChecked()
  await expect(page.getByRole('group', { name: 'প্রকল্প' })).toHaveCount(0)
  await page.getByRole('radio', { name: /^প্রকল্পের ইউজার/ }).check()
  await page.getByRole('checkbox', { name: new RegExp(`^${TIN}`) }).check()
  await save(page, PLAIN_ADMIN.email)
  await expect(row(page, PLAIN_ADMIN.email)).toContainText('প্রকল্পের ইউজার')

  await editUser(page, PLAIN_ADMIN.email)
  await page.getByRole('radio', { name: /^এডমিন/ }).check()
  await expect(page.getByRole('group', { name: 'প্রকল্প' })).toHaveCount(0)
  await save(page, PLAIN_ADMIN.email)
  await expect(row(page, PLAIN_ADMIN.email)).toContainText('সব প্রকল্প')

  await editUser(page, PROJECT_EDITOR.email)
  await page.getByRole('checkbox', { name: /^চালু/ }).uncheck()
  await save(page, PROJECT_EDITOR.email)
  await expect(row(page, PROJECT_EDITOR.email)).toContainText('বন্ধ')
  await editUser(page, PROJECT_EDITOR.email)
  await page.getByRole('checkbox', { name: /^চালু/ }).check()
  await save(page, PROJECT_EDITOR.email)
  await expect(row(page, PROJECT_EDITOR.email)).toContainText('চালু')
})

test('a project user sees no settings, no users page and no delete', async ({ page }) => {
  await loginAs(page, PROJECT_EDITOR, '/admin/records/tin')
  // Rows are on screen, so the missing delete button is a real absence.
  await expect(page.getByRole('link', { name: 'এডিট' }).first()).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'প্রকল্পসমূহ' })).toHaveCount(0)
  await expect(nav(page).getByRole('link', { name: 'ইউজার' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ডিলেট' })).toHaveCount(0)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: GATE })).toBeVisible()
  await page.goto('/admin/projects')
  await expect(page.getByRole('heading', { name: GATE })).toBeVisible()
})

test("the server refuses a project user's write in another project, an emptied value and a serial change", async ({ page }) => {
  await loginAs(page, PROJECT_EDITOR, '/admin')
  const tinRows = (await api(page, '/projects/tin/records?page_size=1')).body.data as { id: string; serial_no: number }[]
  const semiRows = (await api(page, '/projects/semi_pucca/records?page_size=1')).body.data as { id: string }[]
  const own = tinRows[0]!
  const other = semiRows[0]!

  const outside = await api(page, `/records/${other.id}`, 'PATCH', { address: 'অন্য প্রকল্প' })
  expect(outside.status).toBe(403)
  expect(outside.body.error?.message).toBe('এই প্রকল্পে আপনার কাজের অনুমতি নেই')

  expect((await api(page, `/records/${own.id}`, 'PATCH', { address: 'নতুন ঠিকানা' })).status).toBe(200)
  const emptied = await api(page, `/records/${own.id}`, 'PATCH', { address: '' })
  expect(emptied.status).toBe(403)
  expect(emptied.body.error?.message).toBe('ভরা ঘর ফাঁকা করতে পারেন শুধু মূল এডমিন ও এডমিন')

  const serial = await api(page, `/records/${own.id}/serial`, 'POST', { serial_no: own.serial_no + 500 })
  expect(serial.status).toBe(403)
  expect(serial.body.error?.message).toBe('সিরিয়াল নম্বর বদলাতে পারেন শুধু মূল এডমিন ও এডমিন')
})

test('a plain admin is kept off /admin/users and keeps the settings', async ({ page }) => {
  await loginAs(page, PLAIN_ADMIN, '/admin/users')
  await expect(page.getByRole('heading', { name: GATE })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'ইউজার' })).toHaveCount(0)
  await expect(nav(page).getByRole('link', { name: 'প্রকল্পসমূহ' })).toBeVisible()
  expect((await api(page, '/admin/users')).status).toBe(403)
})
