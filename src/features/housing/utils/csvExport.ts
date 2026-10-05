/**
 * CSV তৈরি ও ডাউনলোড (UTF-8 BOM সহ, যাতে Excel/Google Sheet বাংলা ঠিক পড়ে)।
 * **ফর্মুলা-সুরক্ষা (M-ধাপ ১০):** যে লেখার সেল = + - @, ট্যাব বা লাইন-ব্রেক দিয়ে শুরু, তার আগে ' বসে — Excel এ খুললে
 * ফর্মুলা চলে না (CSV injection)। সংখ্যা (JS number) সেলে বসে না, তাই −৫ বা টাকা যেমন আছে তেমন। ইম্পোর্টে
 * importParse এই ' সরিয়ে দেয় (stripFormulaGuard), তাই এক্সপোর্ট → ইম্পোর্ট ঠিক ঘুরে আসে।
 */

const FORMULA_START = /^[=+\-@\t\r\n]/

/** লেখার সেলের ফর্মুলা-সুরক্ষা: "=1+1" → "'=1+1" */
export function guardFormula(s: string): string {
  return FORMULA_START.test(s) ? `'${s}` : s
}

/** ইম্পোর্টে উল্টো: "'=1+1" → "=1+1" (শুধু তখনই, যখন ' এর পরে ফর্মুলার অক্ষর — "'আলী" অপরিবর্তিত) */
export function stripFormulaGuard(s: string): string {
  return /^'[=+\-@\t\r\n]/.test(s) ? s.slice(1) : s
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v) : guardFormula(String(v))
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
