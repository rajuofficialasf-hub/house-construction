import type { Page } from '@playwright/test'
import { ADMIN_REST_API_URL } from './rest-env'

/**
 * Calls the admin-rest API from inside the page, with the signed-in session's cookie and the page's
 * own Origin, so a refusal can only come from the server's role check, never from the origin check.
 * A JSON body is sent when given. A 204 has no body.
 */
export function api(page: Page, path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as { data?: unknown; error?: { code: string; message: string } }) }
    },
    { url: `${ADMIN_REST_API_URL}/api/v1${path}`, method, body },
  )
}
