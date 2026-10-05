/**
 * ইউনিয়নের তালিকা (M-ধাপ ৯, পরিকল্পনা §৫.১২) — data/bd-unions.json (scripts/build-unions.mjs এর ফল, ~৫৩ KB gzip)।
 * **শুধু lazy `import()`** দিয়ে আসে, তাই মূল বান্ডলে কখনো ঢোকে না; প্রথম দরকারে একবার নামে, তারপর মডিউলে থাকে।
 * ইউনিয়নের নাম দেশে একাধিকবার আছে (৩২৭টি নাম), তাই সবসময় জেলা → উপজেলা → ইউনিয়ন পুরো পথে খোঁজা হয়।
 * ৫টি উপজেলার তালিকা নেই (অনুমান করে বানানো হয়নি) — সেখানে শুধু নিজে লেখা।
 */
import { useSyncExternalStore } from 'react'
import { getLang, gn } from '@/i18n'
import { nfc } from './geo'

/** [বাংলা নাম (NFC, ডাটাবেসে এটিই), ইংরেজি নাম] */
export type UnionPair = readonly [bn: string, en: string]
export interface UnionData {
  v: number
  source: string
  /** জেলা → উপজেলা → ইউনিয়ন (বাংলা ক্রমে) */
  d: Record<string, Record<string, readonly UnionPair[]>>
}

/** পৌরসভার চিপ ও ইংরেজি নামে এই শব্দ (ডাটার অংশ — ভাষা বদলালেও ডাটাবেসে বাংলাই থাকে) */
export const POURASHAVA_BN = 'পৌরসভা'

let data: UnionData | null = null
let failed = false
let pending: Promise<UnionData> | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** তালিকা নামানো (একবারই; ব্যর্থ হলে পরের ডাকে আবার চেষ্টা) */
export function loadUnions(): Promise<UnionData> {
  if (data) return Promise.resolve(data)
  pending ??= import('./data/bd-unions.json')
    .then((m) => {
      data = m.default as unknown as UnionData
      failed = false
      notify()
      return data
    })
    .catch((e: unknown) => {
      pending = null
      failed = true
      notify()
      throw e
    })
  return pending
}

/** নামানো থাকলে তালিকা, নইলে null (নামায় না) */
export function unionsIfLoaded(): UnionData | null {
  return data
}

interface UnionState {
  data: UnionData | null
  /** নামানো ব্যর্থ (অফলাইন?) — নিজে লেখা তবু চলে */
  failed: boolean
}
let snapshot: UnionState = { data: null, failed: false }
function getSnapshot(): UnionState {
  if (snapshot.data !== data || snapshot.failed !== failed) snapshot = { data, failed }
  return snapshot
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** কম্পোনেন্টে: প্রথম রেন্ডারে নামানো শুরু করে; নামলে আবার রেন্ডার। enabled=false হলে নামায় না। */
export function useUnionData(enabled = true): UnionState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (enabled && !data && !failed && !pending) void loadUnions().catch(() => {})
  return state
}

/** একটি উপজেলার ইউনিয়ন; তালিকা না থাকলে (বা উপজেলা অচেনা) খালি */
export function unionsOf(d: UnionData | null, district: string | null | undefined, upazila: string | null | undefined): readonly UnionPair[] {
  if (!d) return []
  return d.d[nfc(district)]?.[nfc(upazila)] ?? []
}

/** এই উপজেলার ইউনিয়ন-তালিকা আছে কি না (৫টিতে নেই) */
export function hasUnionList(d: UnionData | null, district: string | null | undefined, upazila: string | null | undefined): boolean {
  return unionsOf(d, district, upazila).length > 0
}

/**
 * ইউনিয়নের নাম দেখানো: ইংরেজি মোডে তালিকার ইংরেজি নাম (তালিকা নামানো থাকলে), নইলে যেমন আছে।
 * "<নাম> পৌরসভা" → "<ইংরেজি নাম> Municipality" (নামটি ইউনিয়ন বা উপজেলা হলে)।
 * যে পাতায় দেখানো হয় সেখানে useUnionData() ডাকুন, যাতে তালিকা নামে আর নামার পর আবার রেন্ডার হয়।
 */
export function gnUnion(district: string | null | undefined, upazila: string | null | undefined, union: string | null | undefined): string {
  const u = nfc(union)
  if (!u || getLang() !== 'en') return union ?? ''
  const list = unionsOf(data, district, upazila)
  const hit = list.find((x) => x[0] === u)
  if (hit) return hit[1]
  if (u.endsWith(` ${POURASHAVA_BN}`)) {
    const base = u.slice(0, -POURASHAVA_BN.length - 1).trim()
    const en = list.find((x) => x[0] === base)?.[1] ?? gn(base)
    if (en !== base) return `${en} Municipality`
  }
  return union ?? ''
}
