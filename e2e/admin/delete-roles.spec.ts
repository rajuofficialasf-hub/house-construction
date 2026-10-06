import type { Page } from '@playwright/test'
import { expect, test } from '../support/backend'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { PLAIN_ADMIN } from '../support/rest-data'
import { ADMIN_REST_API_URL } from '../support/rest-env'

// AE1: only the main admin may delete. A plain admin gets no delete controls, and a direct request is
// refused by the server's role check. The request is sent from inside the page, with the browser's
// session and Origin, so the origin check passes and the refusal can only come from requireMainAdmin.

const NAME = 'মোঃ হাবিবুল্লাহ' // demo serial 6 (demo-project.sql)
const RECORDS = '/admin/records/demo'

/** Calls the API from inside the page, with the admin session's cookie. */
function api(page: Page, path: string, method: 'GET' | 'DELETE' = 'GET') {
  return page.evaluate(
    async ({ url, method }) => {
      const res = await fetch(url, { method, credentials: 'include' })
      return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as { data?: unknown; error?: { code: string; message: string } }) }
    },
    { url: `${ADMIN_REST_API_URL}/api/v1${path}`, method },
  )
}

/** The demo record's id, read through the admin's own session. */
async function recordId(page: Page): Promise<string> {
  const { body } = await api(page, '/projects/demo/records?page_size=50')
  const rows = (body?.data ?? []) as { id: string; name: string }[]
  const id = rows.find((r) => r.name === NAME)?.id
  expect(id).toBeTruthy()
  return id!
}

test('a plain admin sees no delete button and no bulk delete', async ({ page }) => {
  await loginAs(page, PLAIN_ADMIN, RECORDS)
  const row = page.getByRole('row', { name: new RegExp(NAME) })
  await expect(row.getByRole('link', { name: 'এডিট' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ডিলেট' })).toHaveCount(0)

  await row.getByRole('checkbox', { name: `${NAME} নির্বাচন` }).check()
  await expect(page.getByText('১ টি নির্বাচিত')).toBeVisible()
  await expect(page.getByRole('button', { name: 'নির্বাচন বাতিল' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'নির্বাচিতগুলো মুছুন' })).toHaveCount(0)
})

test('a plain admin\'s direct delete is refused by the role check; the main admin then deletes the record', async ({ page, browser, baseURL }) => {
  await loginAs(page, PLAIN_ADMIN, RECORDS)
  await expect(page.getByRole('row', { name: new RegExp(NAME) })).toBeVisible()
  const id = await recordId(page)

  const refused = await api(page, `/records/${id}`, 'DELETE')
  expect(refused.status).toBe(403)
  // requireMainAdmin's message, not the origin check's ("এই উৎস থেকে অনুরোধ গ্রহণযোগ্য নয়").
  expect(refused.body?.error?.message).toBe('শুধু মূল এডমিন মুছতে পারেন')
  expect((await api(page, `/records/${id}`)).status).toBe(200)
  await page.reload()
  await expect(page.getByRole('row', { name: new RegExp(NAME) })).toBeVisible()

  // The main admin, in a session of their own, deletes the same record through the page.
  const context = await browser.newContext({ baseURL })
  try {
    const main = await context.newPage()
    await loginAs(main, MOCK_ADMIN, RECORDS)
    const row = main.getByRole('row', { name: new RegExp(NAME) })
    await row.getByRole('button', { name: 'ডিলেট' }).click()
    await main.getByRole('dialog', { name: 'আপনি কি নিশ্চিত?' }).getByRole('button', { name: 'হ্যাঁ, মুছুন' }).click()
    await expect(row).toHaveCount(0)
    expect((await api(main, `/records/${id}`)).status).toBe(404)
  } finally {
    await context.close()
  }
})

test('the main admin sees the row delete button and the bulk delete', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, RECORDS)
  const row = page.getByRole('row', { name: new RegExp(NAME) })
  await expect(row.getByRole('button', { name: 'ডিলেট' })).toBeVisible()
  await row.getByRole('checkbox', { name: `${NAME} নির্বাচন` }).check()
  await page.getByRole('button', { name: 'নির্বাচিতগুলো মুছুন' }).click()
  // One record selected: the single-record confirmation.
  const dialog = page.getByRole('dialog', { name: 'আপনি কি নিশ্চিত?' })
  await expect(dialog).toContainText(`সিরিয়াল ৬ — ${NAME}`)
  await dialog.getByRole('button', { name: 'বাতিল' }).click()
  await expect(row).toBeVisible()
})
