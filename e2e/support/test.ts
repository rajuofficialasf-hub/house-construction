import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

/**
 * লাইভ read-only স্পেকের জন্য test: Supabase এর দিকে যাওয়া যেকোনো লেখার সম্ভাবনাময় অনুরোধ ব্রাউজার স্তরেই আটকে দেয়
 * (শুধু GET/HEAD এবং পড়ার RPC অনুমোদিত), তাই ভবিষ্যতের কোনো স্পেক ভুল করে লাইভে লিখতে পারবে না।
 * মক ব্যাকএন্ডে (public-mock) এই পাথে কোনো অনুরোধ যায় না, তাই কিছুই বদলায় না।
 */
const SUPABASE_API = /\/(rest|auth|storage)\/v1\//
const READ_RPCS = /\/rest\/v1\/rpc\/(housing_stats|housing_years|housing_next_serial|housing_current_admin)(\?|$)/

export const test = base.extend<{ liveWriteGuard: void }>({
  liveWriteGuard: [
    async ({ page }, use) => {
      await page.route(SUPABASE_API, (route) => {
        const req = route.request()
        const m = req.method().toUpperCase()
        const isRead = m === 'GET' || m === 'HEAD' || (m === 'POST' && READ_RPCS.test(req.url())) || m === 'OPTIONS'
        if (isRead) return route.continue()
        throw new Error(`LIVE WRITE BLOCKED: ${m} ${req.url()}`)
      })
      await use()
    },
    { auto: true },
  ],
})
