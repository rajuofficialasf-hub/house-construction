import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/backend'
import { api } from '../support/api'
import { loginAs, MOCK_ADMIN } from '../support/auth'
import { PLAIN_ADMIN, PROJECT_EDITOR } from '../support/rest-data'
import { ADMIN_REST_API_URL } from '../support/rest-env'
import { DEMO, createDraftProject, inFreshContext, publish, toast } from '../support/projects'

// The danger zone on /admin/projects/:key (ProjectSettingsPage.tsx, DeleteProjectDialog.tsx): the main
// admin deletes an empty, unpublished project after typing its name; everyone else gets no button and
// a 403 from the server (U3, docs/plans/2026-10-08-1105-feat-project-delete-plan.md).

const deleteButton = (page: Page) => page.getByRole('button', { name: 'প্রকল্প মুছুন' })
const deleteDialog = (page: Page, name: string) => page.getByRole('dialog', { name: `«${name}» মুছে ফেলবেন?` })
const confirmButton = (dialog: Locator) => dialog.getByRole('button', { name: 'মুছুন', exact: true })

/** Opens the dialog and types the name, so only the confirm click is left. */
async function openAndConfirmName(page: Page, name: string) {
  await deleteButton(page).click()
  const dialog = deleteDialog(page, name)
  await dialog.getByLabel(`নিশ্চিত করতে প্রকল্পের নাম লিখুন: ${name}`).fill(name)
  return dialog
}

test('the main admin deletes an empty draft after typing its exact name; the project is gone', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin')
  const key = await createDraftProject(page, 'দর্জি অনুদান', 'Tailoring Grant')
  await expect(page.getByRole('heading', { name: 'বিপজ্জনক অংশ' })).toBeVisible()

  await deleteButton(page).click()
  const dialog = deleteDialog(page, 'দর্জি অনুদান')
  await expect(dialog).toContainText('প্রকল্পটি, এর ফিল্ডগুলো আর কভার ছবি মুছে যাবে। এটি ফেরানো যায় না।')
  const confirm = confirmButton(dialog)
  await expect(confirm).toBeDisabled()
  const input = dialog.getByLabel('নিশ্চিত করতে প্রকল্পের নাম লিখুন: দর্জি অনুদান')
  await input.fill('দর্জি')
  await expect(confirm).toBeDisabled()
  await input.fill('দর্জি অনুদান')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(page).toHaveURL(/\/admin\/projects$/)
  await expect(toast(page, '«দর্জি অনুদান» মুছে ফেলা হয়েছে')).toBeVisible()
  // The list has rendered once another project's link is there; only then does "no link" mean anything.
  await expect(page.getByRole('link', { name: DEMO.name })).toBeVisible()
  await expect(page.getByRole('link', { name: 'দর্জি অনুদান' })).toHaveCount(0)
  expect((await api(page, `/projects/${key}`)).status).toBe(404)
})

test('a project with records and a group with sub-projects keep a disabled button that says why', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, DEMO.settings)
  await expect(deleteButton(page)).toBeDisabled()
  await expect(page.getByText('«ডেমো প্রকল্প» প্রকল্পে রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন')).toBeVisible()

  await page.goto('/admin/projects/housing')
  await expect(page.getByRole('heading', { level: 1, name: 'ঘর নির্মাণ প্রকল্প' })).toBeVisible()
  await expect(deleteButton(page)).toBeDisabled()
  await expect(page.getByText('«ঘর নির্মাণ প্রকল্প» গ্রুপে উপ-প্রকল্প আছে — আগে সেগুলো সরান')).toBeVisible()
})

test('a published project must be unpublished before it can be deleted', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin')
  await createDraftProject(page, 'সেলাই অনুদান', 'Sewing Grant')
  await expect(deleteButton(page)).toBeEnabled()

  await publish(page)
  await expect(deleteButton(page)).toBeDisabled()
  await expect(page.getByText('প্রকাশিত প্রকল্প মোছা যায় না — আগে অপ্রকাশ করুন')).toBeVisible()

  // No records and no sub-projects: unpublishing needs no confirmation.
  await page.getByRole('button', { name: 'অপ্রকাশ করুন', exact: true }).click()
  await expect(toast(page, 'অপ্রকাশ করা হয়েছে')).toBeVisible()
  await expect(deleteButton(page)).toBeEnabled()
})

test('a plain admin and a project user get no delete button, and their direct delete is refused by the role check', async ({ page, browser, baseURL }) => {
  await loginAs(page, PLAIN_ADMIN, DEMO.settings)
  await expect(page.getByRole('heading', { level: 1, name: DEMO.name })).toBeVisible()
  await expect(deleteButton(page)).toHaveCount(0)
  const refused = await api(page, '/projects/demo', 'DELETE')
  expect(refused.status).toBe(403)
  // requireMainAdmin's message, not the origin check's.
  expect(refused.body?.error?.message).toBe('শুধু মূল এডমিন মুছতে পারেন')
  expect((await api(page, '/projects/demo')).status).toBe(200)

  await inFreshContext(browser, baseURL, async (editor) => {
    await loginAs(editor, PROJECT_EDITOR, '/admin/projects/tin')
    await expect(editor.getByRole('heading', { level: 1, name: 'এই অংশ শুধু মূল এডমিনের' })).toBeVisible()
    await expect(deleteButton(editor)).toHaveCount(0)
    expect((await api(editor, '/projects/tin', 'DELETE')).status).toBe(403)
  })
})

test('a refusal the page could not foresee is shown inside the dialog, which stays open', async ({ page, browser, baseURL }) => {
  await loginAs(page, MOCK_ADMIN, '/admin')
  const key = await createDraftProject(page, 'ছাগল বিতরণ', 'Goat Distribution')
  const dialog = await openAndConfirmName(page, 'ছাগল বিতরণ')

  // Meanwhile another main-admin session adds a record, so this page's "no records" is stale and the
  // database guard (migration 0015), not the page, refuses the delete
  // (R5, docs/plans/2026-10-08-1105-feat-project-delete-plan.md).
  await inFreshContext(browser, baseURL, async (other) => {
    await loginAs(other, MOCK_ADMIN, '/admin')
    const created = await api(other, `/projects/${key}/records`, 'POST', {
      year: 2025,
      name: 'পরীক্ষার উপকারভোগী',
      division: 'ময়মনসিংহ',
      district: 'শেরপুর',
      upazila: 'নালিতাবাড়ী',
      extra: { category: 'ছাগল', amount: 5000 },
    })
    expect(created.status).toBe(201)
  })

  await confirmButton(dialog).click()
  await expect(dialog.getByRole('alert')).toHaveText('«ছাগল বিতরণ» প্রকল্পে রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/admin/projects/${key}$`))
  expect((await api(page, `/projects/${key}`)).status).toBe(200)
})

test('unsaved changes on the General tab block the delete button until they are saved', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin')
  await createDraftProject(page, 'রিকশা অনুদান', 'Rickshaw Grant')
  await expect(deleteButton(page)).toBeEnabled()

  await page.getByLabel('ছোট বর্ণনা (বাংলা)').fill('পরীক্ষার জন্য বদলানো বর্ণনা')
  await expect(deleteButton(page)).toBeDisabled()
  await expect(page.getByText('আগে পরিবর্তন সংরক্ষণ করুন')).toBeVisible()

  await page.getByRole('button', { name: 'সংরক্ষণ করুন', exact: true }).click()
  await expect(toast(page, 'সংরক্ষিত')).toBeVisible()
  await expect(deleteButton(page)).toBeEnabled()
})

test('while the delete request is in flight the dialog is locked, then the admin lands on the list', async ({ page }) => {
  await loginAs(page, MOCK_ADMIN, '/admin')
  const key = await createDraftProject(page, 'হাঁস অনুদান', 'Duck Grant')

  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`${ADMIN_REST_API_URL}/api/v1/projects/${key}`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue()
    await held
    return route.continue()
  })

  const dialog = await openAndConfirmName(page, 'হাঁস অনুদান')
  await confirmButton(dialog).click()
  await expect(dialog.getByRole('button', { name: 'অপেক্ষা করুন…' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'বাতিল' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()

  release()
  await expect(page).toHaveURL(/\/admin\/projects$/)
  await expect(toast(page, '«হাঁস অনুদান» মুছে ফেলা হয়েছে')).toBeVisible()
})
