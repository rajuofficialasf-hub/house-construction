import { getLang } from '@/i18n'
import { formatBanglaNumber } from './banglaNumber'

/**
 * টাকা ও সংখ্যা (পর্ব ২, পরিকল্পনা §৫.৪ ও প্রশ্ন ৯-এর ডিফল্ট):
 * - টাকা সবসময় **পূর্ণসংখ্যা** (পয়সা নয়), ০ থেকে 1e10 (= **১০০০ কোটি**) — ব্যবহারকারীর সিদ্ধান্ত (২০২৬-১০-০৫, M-ধাপ ১১)।
 *   ডাটাবেসে একই সীমা supabase/sql/13_money_limit.sql চালানোর পর (তার আগে ডাটাবেস 1e11 পর্যন্ত নেয় — ক্লায়েন্ট বেশি কড়া, তাই নিরাপদ)।
 * - দেখানো: বাংলায় `৳ ১,২৩,৪৫৬` (লাখ-রীতিতে কমা), ইংরেজিতে `৳123,456`। লাখ/কোটি সংক্ষেপ নয়।
 */
export const MONEY_MAX = 10_000_000_000

/** ৳ সহ টাকা — বর্তমান ভাষার অঙ্ক ও কমা-রীতিতে; null/NaN হলে '' */
export function formatTaka(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const n = formatBanglaNumber(Math.round(value))
  return getLang() === 'en' ? `৳${n}` : `৳ ${n}`
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'

/** বাংলা অঙ্ক → ইংরেজি অঙ্ক (বাকি অক্ষর অপরিবর্তিত) */
export function asciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
}

/**
 * শীট বা ফর্মের লেখা থেকে সংখ্যা — বাংলা/ইংরেজি অঙ্ক, যেকোনো কমা-রীতি, ফাঁকা, আর টাকার চিহ্ন/শব্দ
 * (৳, টাকা, Tk, Tk., Taka, BDT, শেষে /- বা /=) গ্রহণ করে।
 *   "১০,০০০/-" → 10000 · "Tk 5,000" → 5000 · "১,২৩,৪৫৬.৫০" → 123456.5 · "" → null · "abc" → NaN
 * ফেরত: খালি হলে null, সংখ্যা না হলে NaN (কারণ বলার দায় ডাকনেওয়ালার), নইলে সংখ্যা।
 */
export function parseBanglaNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  let s = asciiDigits(raw.normalize('NFC')).trim()
  if (s === '') return null
  s = s
    .replace(/\s*\/[-=]\s*$/, '') // ১০,০০০/-
    .replace(/৳|টাকা|taka|tk\.?|bdt/gi, '') // "Tk5,000" এও (বাকি কোনো অক্ষর থাকলে নিচে NaN)
    .replace(/[,\s]/g, '')
  if (s === '') return NaN // শুধু "৳" বা "টাকা"
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN
  return Number(s)
}
