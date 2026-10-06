#!/usr/bin/env node
/**
 * ছবি যাচাই (M-ধাপ ১) — লগইন ছাড়া (anon key) প্রতিটি রেকর্ডের সংরক্ষিত ছবির URL সত্যিই খোলে কি না।
 * সাইট যেভাবে দেখায় ঠিক সেভাবে (`?v=` ক্যাশ-বাস্টিংসহ, utils/imagePath.ts → photoSrc) URL বানিয়ে HTTP HEAD পাঠায়;
 * HEAD সমর্থিত না হলে ১ বাইটের GET (Range) দিয়ে আবার দেখে। সবগুলো 200 (বা 206) হলে PASS।
 *
 * চালানো:  npm run photo-check            (.env.local থেকে VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY পড়ে)
 *          npm run photo-check -- --verbose   (প্রতিটি URL এর ফল দেখায়)
 * ডাটাবেস বা Storage এ কিছু বদলায় না — শুধু পড়ে। মাইগ্রেশনের আগে-পরে চালিয়ে প্রমাণ হয় যে ছবির লিংক অক্ষত।
 */
import fs from 'node:fs'

loadEnv('.env.local')
loadEnv('.env')
const URL_ = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const VERBOSE = process.argv.includes('--verbose')
if (!URL_ || !KEY) {
  console.error('ত্রুটি: .env.local এ VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY দিন')
  process.exit(1)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const COLS = ['prev_photo_url', 'prev_thumb_url', 'current_photo_url', 'current_thumb_url']

// ---------- সব রেকর্ড (পাতায় পাতায়) ----------
const records = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(
    `${URL_}/rest/v1/housing_beneficiaries?select=project_type,serial_no,photo_updated_at,${COLS.join(',')}&order=project_type,serial_no`,
    { headers: { ...H, range: `${from}-${from + 999}`, 'range-unit': 'items' } },
  )
  if (!r.ok) {
    console.error(`ত্রুটি: রেকর্ড পড়া যায়নি — HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    process.exit(1)
  }
  const page = await r.json()
  records.push(...page)
  if (page.length < 1000) break
}

/** utils/imagePath.ts → photoSrc এর হুবহু নকল (সাইট যে URL চায়) */
function photoSrc(url, photoUpdatedAt) {
  if (!url) return null
  if (!photoUpdatedAt) return url
  const v = encodeURIComponent(Date.parse(photoUpdatedAt) || photoUpdatedAt)
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

const jobs = []
for (const rec of records) {
  for (const col of COLS) {
    const src = photoSrc(rec[col], rec.photo_updated_at)
    if (src) jobs.push({ label: `${rec.project_type} #${rec.serial_no} ${col}`, project: rec.project_type, src })
  }
}

console.log(`প্রজেক্ট: ${URL_}`)
console.log(`রেকর্ড: ${records.length} টি · যাচাইয়ের মতো ছবির URL: ${jobs.length} টি\n`)

async function probe(src) {
  try {
    let r = await fetch(src, { method: 'HEAD' })
    if (r.status === 400 || r.status === 405 || r.status === 501) {
      r = await fetch(src, { headers: { range: 'bytes=0-0' } })
      await r.arrayBuffer().catch(() => {})
    }
    return { status: r.status, type: r.headers.get('content-type') ?? '' }
  } catch (e) {
    return { status: 0, type: '', error: String(e?.message ?? e) }
  }
}

// ---------- সীমিত সমান্তরালে যাচাই ----------
const results = new Array(jobs.length)
let next = 0
await Promise.all(
  Array.from({ length: Math.min(6, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++
      results[i] = { ...jobs[i], ...(await probe(jobs[i].src)) }
    }
  }),
)

let pass = 0
let fail = 0
const byProject = new Map()
for (const r of results) {
  const good = r.status === 200 || r.status === 206
  if (good) pass++
  else fail++
  const p = byProject.get(r.project) ?? { ok: 0, bad: 0 }
  if (good) p.ok++
  else p.bad++
  byProject.set(r.project, p)
  if (!good || VERBOSE) console.log(`${good ? 'PASS' : 'FAIL'}  ${r.label}  — HTTP ${r.status}${r.type ? ' ' + r.type : ''}${r.error ? ' ' + r.error : ''}${good ? '' : '\n      ' + r.src}`)
}

for (const [p, c] of byProject) console.log(`${p}: ঠিক ${c.ok} · সমস্যা ${c.bad}`)
console.log(`\nফল: PASS ${pass}, FAIL ${fail}${jobs.length === 0 ? ' (কোনো ছবি নেই)' : ''}`)
process.exit(fail ? 2 : 0)

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}
