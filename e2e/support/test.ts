import { test as base, expect } from '@playwright/test'

export { expect }

/**
 * লাইভ read-only স্পেকের জন্য test: Supabase এর দিকে যাওয়া যেকোনো লেখার সম্ভাবনাময় অনুরোধ ব্রাউজার স্তরেই আটকে দেয়
 * (শুধু GET/HEAD এবং পড়ার RPC অনুমোদিত), তাই ভবিষ্যতের কোনো স্পেক ভুল করে লাইভে লিখতে পারবে না।
 * মক ব্যাকএন্ডে (public-mock) এই পাথে কোনো অনুরোধ যায় না, তাই কিছুই বদলায় না।
 */
const SUPABASE_API = /\/(rest|auth|storage)\/v1\//
const READ_RPCS = /\/rest\/v1\/rpc\/(housing_stats|housing_years|housing_next_serial|housing_current_admin)(\?|$)/

/**
 * edge-rest প্রজেক্টে (nginx এর আসল হেডার ও CSP সহ, playwright.config.ts) পেজের যেকোনো CSP লঙ্ঘন টেস্ট ফেল করায়,
 * যাতে CSP অ্যাপের কিছু আটকালে তা স্টেজিংয়ের আগেই ধরা পড়ে। ব্যতিক্রম শুধু ডেভ সিডের ছবির প্লেসহোল্ডার
 * (https://example.com/photos/…): আসল ছবির URL সবসময় সাইটের নিজের origin এ (PUBLIC_API_URL/api/v1/photos/…)।
 */
const SEED_PHOTO_ORIGIN = 'https://example.com/'

export const test = base.extend<{ liveWriteGuard: void; cspGuard: void }>({
  cspGuard: [
    async ({ page }, use, testInfo) => {
      if (testInfo.project.name !== 'edge-rest') return use()
      const violations: string[] = []
      await page.exposeFunction('__reportCspViolation', (directive: string, blocked: string) => {
        if (directive.startsWith('img-src') && blocked.startsWith(SEED_PHOTO_ORIGIN)) return
        violations.push(`${directive} blocked ${blocked || '(inline)'}`)
      })
      await page.addInitScript(() => {
        const report = (window as unknown as { __reportCspViolation: (d: string, b: string) => void }).__reportCspViolation
        document.addEventListener('securitypolicyviolation', (e) => report(e.effectiveDirective, e.blockedURI))
      })
      await use()
      expect(violations, 'CSP violations').toEqual([])
    },
    { auto: true },
  ],

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
