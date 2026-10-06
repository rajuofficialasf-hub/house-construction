#!/usr/bin/env node
/**
 * baseline-check (পর্ব ২, M-ধাপ ১৬) — ঘর নির্মাণের লাইভ মান M-ধাপ ১ এর বেসলাইনের সাথে মেলানো, **শুধু পড়ে** (anon):
 *   - প্রতি প্রকল্পে রেকর্ড সংখ্যা, সর্বোচ্চ সিরিয়াল, ডাটা-ফিঙ্গারপ্রিন্ট — পরিকল্পনা §৬.৩ এর হুবহু হিসাব
 *     (পুরনো কলাম, UTC; `md5(string_agg(row(...)::text, E'\n' order by serial_no))`)
 *   - ছবিওয়ালা রেকর্ড (আগের/বর্তমান), `md5(housing_stats(null)::text)`
 * Postgres এর `row()::text` (record_out) আর `jsonb::text` এর লেখার নিয়ম এখানে হুবহু নকল করা — PGlite (আসল Postgres)
 * দিয়ে মিলিয়ে দেখা (docs/HOUSING_PROGRESS.md → M-ধাপ ১৬)। লেখা/সার্ভিস কী কিছুই লাগে না: শুধু .env.local এর
 * VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY পড়ে (অন্য কোনো লাইন নয়)।
 *
 * কাউন্টার, লগ ও স্কিমা-ফিঙ্গারপ্রিন্ট anon পড়তে পারে না — সেগুলোর জন্য SQL Editor এ checks/10_verify.sql।
 * বেসলাইনের পরে এডমিন প্যানেল থেকে ঘর নির্মাণে রেকর্ড যোগ/এডিট হয়ে থাকলে ❌ আসা স্বাভাবিক — তখন বেসলাইন নতুন করে নিন।
 * চালানো: npm run baseline-check
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

// M-ধাপ ১ এর লাইভ বেসলাইন (২০২৬-১০-০৫ ০৪:৩১ UTC) — supabase/sql/checks/10_verify.sql এর @@BASELINE এর সমান
const BASELINE = {
  records: { semi_pucca: { n: 10, max: 10, fp: '00d0caccb068e709ba485e5b620d065b' }, tin: { n: 0, max: null, fp: null } },
  photos: { prev: 1, current: 3 },
  stats_md5: 'a93bfa85500c86b0e79db9cd201c2776',
}
const COLS = ['id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'address', 'prev_photo_url', 'prev_thumb_url', 'current_photo_url', 'current_thumb_url', 'prev_photo_source', 'current_photo_source', 'photo_updated_at', 'created_at']
const TS = new Set(['photo_updated_at', 'created_at'])

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

/** timestamptz (PostgREST এর ISO) → `x at time zone 'UTC'` এর লেখা: "YYYY-MM-DD HH:MI:SS[.ffffff, শেষের ০ বাদ]" */
export function utcTimestampText(iso) {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/)
  if (!m) throw new Error('অচেনা সময়: ' + iso)
  const [, date, hh, mi, ss, frac = '', off = 'Z'] = m
  let t = Date.parse(`${date}T${hh}:${mi}:${ss}Z`)
  if (off !== 'Z') {
    const om = off.match(/^([+-])(\d{2}):?(\d{2})?$/)
    const mins = (Number(om[2]) * 60 + Number(om[3] ?? 0)) * (om[1] === '+' ? 1 : -1)
    t -= mins * 60_000
  }
  const d = new Date(t).toISOString() // YYYY-MM-DDTHH:MM:SS.000Z
  const f = frac.padEnd(6, '0').slice(0, 6).replace(/0+$/, '')
  return `${d.slice(0, 10)} ${d.slice(11, 19)}${f ? '.' + f : ''}`
}

/** record_out এর একটি ঘর: NULL → খালি; ফাঁকা লেখা বা " \ ( ) , ফাঁকা-অক্ষর থাকলে উদ্ধৃতি, ভেতরে " ও \ দ্বিগুণ */
export function recordField(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s === '' || /["\\(),\s]/.test(s)) return '"' + s.replace(/(["\\])/g, '$1$1') + '"'
  return s
}

export function rowText(r) {
  return '(' + COLS.map((c) => recordField(TS.has(c) && r[c] !== null ? utcTimestampText(r[c]) : r[c])).join(',') + ')'
}

/** jsonb::text — কী আগে বাইট-দৈর্ঘ্যে, তারপর বাইট-ক্রমে; ", " ও ": " বিভাজক */
export function jsonbText(v) {
  if (v === null) return 'null'
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  if (typeof v === 'string') return jsonString(v)
  if (Array.isArray(v)) return '[' + v.map(jsonbText).join(', ') + ']'
  const keys = Object.keys(v).sort((a, b) => {
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    return ba.length - bb.length || Buffer.compare(ba, bb)
  })
  return '{' + keys.map((k) => jsonString(k) + ': ' + jsonbText(v[k])).join(', ') + '}'
}
/** Postgres এর escape_json: " \ এবং নিয়ন্ত্রণ-অক্ষর (\b \f \n \r \t, বাকিগুলো \u00XX); বাংলা ইত্যাদি যেমন আছে */
function jsonString(s) {
  const esc = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' }
  let out = '"'
  for (const ch of s) {
    const code = ch.codePointAt(0)
    out += esc[ch] ?? (code < 0x20 ? '\\u' + code.toString(16).padStart(4, '0') : ch)
  }
  return out + '"'
}

export function fingerprint(rows) {
  const out = {}
  for (const pt of [...new Set(rows.map((r) => r.project_type))].sort()) {
    const rs = rows.filter((r) => r.project_type === pt).sort((a, b) => a.serial_no - b.serial_no)
    out[pt] = { n: rs.length, max: Math.max(...rs.map((r) => r.serial_no)), fp: md5(rs.map(rowText).join('\n')) }
  }
  return out
}

// ---------------------------------------------------------------- চালানো (import হলে নয়)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = Object.fromEntries(
    fs
      .readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  )
  const SB = env.VITE_SUPABASE_URL.replace(/\/+$/, '')
  const H = { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` }
  const rows = await fetch(`${SB}/rest/v1/housing_beneficiaries?select=${COLS.join(',')}&project_type=in.(semi_pucca,tin)&order=serial_no`, { headers: H }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`রেকর্ড পড়া যায়নি: ${r.status}`))))
  const stats = await fetch(`${SB}/rest/v1/rpc/housing_stats`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`housing_stats: ${r.status}`))))
  const fp = fingerprint(rows)

  let pass = 0
  let fail = 0
  const ok = (name, cond, info = '') => {
    if (cond) pass++
    else fail++
    console.log(`${cond ? 'মিলেছে ✅' : 'মেলেনি ❌'}  ${name}${info ? '  — ' + info : ''}`)
  }
  for (const [pt, b] of Object.entries(BASELINE.records)) {
    const g = fp[pt] ?? { n: 0, max: null, fp: null }
    ok(`${pt}: রেকর্ড ${b.n}, সর্বোচ্চ সিরিয়াল ${b.max ?? '—'}`, g.n === b.n && g.max === b.max, `এখন ${g.n}, ${g.max ?? '—'}`)
    if (b.fp) ok(`${pt}: ডাটা-ফিঙ্গারপ্রিন্ট`, g.fp === b.fp, g.fp ?? '—')
  }
  const prev = rows.filter((r) => r.prev_photo_url).length
  const cur = rows.filter((r) => r.current_photo_url).length
  ok(`ছবিওয়ালা রেকর্ড: আগের ${BASELINE.photos.prev}, বর্তমান ${BASELINE.photos.current}`, prev === BASELINE.photos.prev && cur === BASELINE.photos.current, `এখন ${prev}, ${cur}`)
  const sm = md5(jsonbText(stats))
  ok('housing_stats(null) এর md5', sm === BASELINE.stats_md5, sm)
  console.log(`\nফল: মিলেছে ${pass}, মেলেনি ${fail}${fail ? ' — বেসলাইনের পরে এডমিন থেকে ঘর নির্মাণে বদল হয়েছে কি না দেখুন; না হলে AI-কে জানান' : ' — ঘর নির্মাণের লাইভ মান অক্ষত'}`)
  process.exit(fail ? 1 : 0)
}
