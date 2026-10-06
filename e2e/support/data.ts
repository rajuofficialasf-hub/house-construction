import type { Page } from '@playwright/test'
import { BD_GEO } from '../../src/features/geo/data/bdGeo'

export const GEO = {
  division: BD_GEO[0].name,
  district: BD_GEO[0].districts[0].name,
  upazila: BD_GEO[0].districts[0].upazilas[0].name,
}

/** মক স্টোরকে seed অবস্থায় ফেরায় (প্রতিটি টেস্ট নতুন ব্রাউজার কনটেক্সটে চলে, তাই সাধারণত দরকার হয় না) */
export async function resetMock(page: Page) {
  await page.evaluate(() => (window as unknown as { __housingMock: { reset: () => void } }).__housingMock.reset())
}

/** ১×১ বৈধ PNG — ছবি আপলোড টেস্টের জন্য (ক্লায়েন্ট ক্যানভাসে WebP করে) */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export const uniqueName = (prefix = 'টেস্ট') => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
