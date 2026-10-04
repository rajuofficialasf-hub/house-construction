import { getLang } from '@/i18n'

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const

/**
 * সংখ্যা বা সংখ্যাযুক্ত স্ট্রিংকে বর্তমান ভাষার অঙ্কে রূপান্তর করে।
 * বাংলা মোডে: toBanglaNumber(1234) → "১২৩৪"; ইংরেজি মোডে ASCII অঙ্ক থাকে ("1234")।
 * null/undefined হলে খালি স্ট্রিং।
 */
export function toBanglaNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (getLang() === 'en') return s.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d as (typeof BANGLA_DIGITS)[number])))
  return s.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)])
}

/**
 * কমা-সহ সংখ্যা: বাংলা মোডে ভারতীয়/বাংলাদেশি রীতি (১,২৩,৪৫৬), ইংরেজি মোডে 1,23,456 নয় — 123,456।
 */
export function formatBanglaNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  if (getLang() === 'en') return new Intl.NumberFormat('en-US').format(value)
  return toBanglaNumber(new Intl.NumberFormat('en-IN').format(value))
}
