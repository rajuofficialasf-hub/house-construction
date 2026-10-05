/**
 * ঢিলা তুলনা ও কাছাকাছি বানান (পর্ব ২) — ভূগোলের নাম মেলানো (features/housing/utils/geoMatch.ts) আর
 * ক্যাটাগরির বানান-ভিন্নতা খোঁজা (যেমন "গাভী" ও "গাভি") দুই জায়গাতেই।
 */

/** NFC + trim (geo.ts এর nfc এর সমান — এখানে আলাদা, যাতে lib কোনো ফিচারের উপর নির্ভর না করে) */
function nfc(s: string | null | undefined): string {
  return (s ?? '').trim().normalize('NFC')
}

export interface LooseKeyOptions {
  /** তুলনার আগে মুছে ফেলার শব্দ (যেমন ভূগোলে "জেলা", "উপজেলা") — g ফ্ল্যাগসহ */
  stripWords?: RegExp
}

/**
 * ঢিলা তুলনার key: বানান-ভিন্নতা মুছে ফেলা — ছোট হাতের অক্ষর, অদৃশ্য অক্ষর/ফাঁকা/যতিচিহ্ন বাদ,
 * ণ/ন, ী/ি, ূ/ু, ঈ/ই, ঊ/উ, শ/ষ/স, ড়/র, ঢ়/ঢ, য়/য, ঙ্গ/ং, ৎ/ত এক করা।
 */
export function looseKey(raw: string, opts: LooseKeyOptions = {}): string {
  let s = nfc(raw).toLowerCase()
  if (opts.stripWords) s = s.replace(opts.stripWords, '')
  s = s
    .replace(/[​-‍﻿]/g, '') // ZWSP/ZWNJ/ZWJ/BOM
    .replace(/[\s.,\-_()/'"“”‘’।]+/g, '')
    .replace(/ণ/g, 'ন')
    .replace(/ী/g, 'ি')
    .replace(/ূ/g, 'ু')
    .replace(/ঈ/g, 'ই')
    .replace(/ঊ/g, 'উ')
    .replace(/[শষ]/g, 'স')
    .replace(/ড়/g, 'র') // ড় → র
    .replace(/ঢ়/g, 'ঢ') // ঢ় → ঢ
    .replace(/য়/g, 'য') // য় → য
    .replace(/ঙ্গ/g, 'ং')
    .replace(/ৎ/g, 'ত')
  return s
}

/** দুই লেখার সম্পাদনা-দূরত্ব (অক্ষর যোগ/বাদ/বদল) */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}

export interface NearDuplicate {
  a: string
  b: string
  /** ঢিলা key এর দূরত্ব: ০ = শুধু বানান-রীতির পার্থক্য (ী/ি, শ/স …) */
  distance: number
}

/**
 * মানের তালিকায় কাছাকাছি বানানের জোড়া (ক্যাটাগরি একীকরণের পরামর্শ, M-ধাপ ৭/১১):
 * ঢিলা key এক হলে সবসময়; key এর দূরত্ব ১ হলে যখন ছোট লেখাটি ≥ ৪ অক্ষর; দূরত্ব ২ হলে যখন ≥ ৮ অক্ষর —
 * যাতে "গরু" আর "গরুর" এর মতো ছোট আলাদা শব্দ ভুলে না মেলে। হুবহু এক মান (NFC + ফাঁকা এক করে) একবারই গোনা হয়।
 */
export function nearDuplicates(values: readonly string[], opts: LooseKeyOptions = {}): NearDuplicate[] {
  const distinct = [...new Set(values.map((v) => nfc(v).replace(/\s+/g, ' ')).filter(Boolean))]
  const keys = distinct.map((v) => looseKey(v, opts))
  const out: NearDuplicate[] = []
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      const d = levenshtein(keys[i], keys[j])
      const short = Math.min(keys[i].length, keys[j].length)
      if (d === 0 || (d === 1 && short >= 4) || (d === 2 && short >= 8)) {
        out.push({ a: distinct[i], b: distinct[j], distance: d })
      }
    }
  }
  return out.sort((x, y) => x.distance - y.distance || x.a.localeCompare(y.a, 'bn'))
}
