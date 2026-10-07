import { test as base, expect } from '@playwright/test'

export { expect }

/**
 * edge-rest প্রজেক্টে (nginx এর আসল হেডার ও CSP সহ, playwright.config.ts) পেজের যেকোনো CSP লঙ্ঘন টেস্ট ফেল করায়,
 * যাতে CSP অ্যাপের কিছু আটকালে তা স্টেজিংয়ের আগেই ধরা পড়ে। ব্যতিক্রম শুধু ডেভ সিডের ছবির প্লেসহোল্ডার
 * (https://example.com/photos/…): আসল ছবির URL সবসময় সাইটের নিজের origin এ (PUBLIC_API_URL/api/v1/photos/…)।
 */
const SEED_PHOTO_ORIGIN = 'https://example.com/'

export const test = base.extend<{ cspGuard: void }>({
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
})
