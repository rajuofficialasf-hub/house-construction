#!/usr/bin/env node
/**
 * admin-ui-check (পর্ব ২, M-ধাপ ৭) — এডমিন প্যানেলের UI পরীক্ষা আসল ব্রাউজারে, এডমিন লগইন ছাড়াই:
 *   - নকল "মূল এডমিন" সেশন (ব্রাউজারে নকল টোকেন; housing_current_admin এর উত্তর এখানেই)
 *   - পড়া (প্রকল্প, ফিল্ড, স্ট্যাট, ওভারভিউ) লাইভ থেকে anon হিসেবে — Node এ আনা, তাই খসড়া/গোপন কিছু আসে না
 *   - **সব লেখা এখানেই আটকানো** (প্রকল্প তৈরি/বদল/ক্রম — নকল উত্তর); অচেনা কোনো লেখা-অনুরোধ হলে 403 ও FAIL।
 *     লাইভ ডাটাবেসে কিছুই যায় না।
 * পরীক্ষা: ড্যাশবোর্ড, প্রকল্পের তালিকা ও অপ্রকাশের নিশ্চিতকরণ (বাতিল), উইজার্ড (slug নিয়ম, project_create এর ইনপুট),
 *          সেটিংস (গার্ড-ত্রুটি, CONFLICT), ফিল্ড বিল্ডার ও পরিসংখ্যান কার্ড (M-ধাপ ৮; নকল project_field_usage = ৩২),
 *          ফোনের ড্রয়ার (৪৪px)। স্ক্রিনশট .smoke/admin-*.png
 * চালানো (আগে অন্য টার্মিনালে npm run dev): npm run admin-ui-check  [-- --base http://localhost:5173]
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'

// demo এর নকল ছবি (৮০০×৬০০ — ভিন্ন রং, আগে/পরে আলাদা চেনা যায়)
const DEMO_PNG = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#2f855a' } }).png().toBuffer()
const DEMO_PNG_PREV = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#9c4221' } }).png().toBuffer()

const argv = process.argv.slice(2)
const bi = argv.indexOf('--base')
const BASE = (bi >= 0 ? argv[bi + 1] : 'http://localhost:5173').replace(/\/+$/, '')
const BROWSER = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
  .filter(Boolean)
  .find((p) => fs.existsSync(p))
if (!BROWSER) {
  console.error('Chrome/Edge পাওয়া যায়নি — CHROME_PATH দিন')
  process.exit(1)
}
fs.mkdirSync('.smoke', { recursive: true })
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const SB = env.VITE_SUPABASE_URL.replace(/\/+$/, '')
const ANON = env.VITE_SUPABASE_ANON_KEY
const REF = new URL(SB).hostname.split('.')[0]
const now = Math.floor(Date.now() / 1000)
/** লাইভের প্রকাশিত প্রকল্প (anon) — প্রত্যাশা এখান থেকে, যাতে আপনি নতুন প্রকল্প প্রকাশ করলেও পরীক্ষা চলে */
const LIVE = await fetch(`${SB}/rest/v1/rpc/projects_overview`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }, body: '{}' }).then((r) => r.json())
const bnNum = (n) => Number(n).toLocaleString('en-IN').replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d])
/** ঘর নির্মাণের বাইরে লাইভে প্রকাশিত প্রকল্পের বাংলা নাম */
const OTHER_LIVE = LIVE.projects.filter((x) => !['housing', 'semi_pucca', 'tin'].includes(x.key)).map((x) => x.name_bn)
const HOUSING3 = 'ঘর নির্মাণ প্রকল্প|সেমিপাকা ঘর নির্মাণ|টিনের ঘর নির্মাণ'
const USER = { id: '00000000-0000-0000-0000-0000000000aa', email: 'ui-test@example.org', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const SESSION = { access_token: 'fake-token', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, user: USER }

let pass = 0
let fail = 0
const ok = (n, c, info = '') => {
  if (c) pass++
  else fail++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const writes = [] // যা আটকানো হয়েছে
const blocked = [] // অচেনা লেখা (থাকা উচিত নয়)
let created = null // নকল project_create এর ফল (তালিকায় খসড়া হিসেবে যোগ হয়)
let patchMode = 'ok' // 'ok' | 'guard' | 'conflict'
const addedFields = [] // নকল POST project_fields এর ফল
const usage = { category: 32 } // নকল project_field_usage: key → কতটি রেকর্ডে মান আছে
const allFields = () => [...(created?.fields ?? []), ...addedFields]
/** projects_overview এর উত্তরে যোগ করা নকল সারি (M-ধাপ ১৫ হোম পরীক্ষা) */
const overviewExtra = []

// ---- নকল রেকর্ড-ভাণ্ডার (M-ধাপ ১০): খসড়া demo প্রকল্পের রেকর্ড, গোপন মান, ক্যাটাগরির মান — সব এখানেই, লাইভে কিছু নয়
let adminRole = 'main_admin'
let adminExtra = {} // SQL ১৪ এর পর housing_current_admin এর বাড়তি ঘর (all_projects, projects) — {} = ১৪-এর আগের উত্তর
let usersMode = 'ok' // 'ok' | 'missing' (SQL ১৪ চালানো হয়নি → PGRST202)
const fakeUsers = [] // housing_admin_users এর নকল সারি (M-ধাপ ১৯)
const fakeLog = [] // housing_activity_log এর নকল সারি (একটিভিটি পাতার পরীক্ষা)
const logEvents = [] // housing_log_event (ক্লায়েন্ট-ইভেন্ট) এর body
const demoRecs = [] // housing_beneficiaries এর সারি (project_type = demo)
const demoPrivate = {} // record_id → data
const eqParam = (u, k) => u.searchParams.get(k)?.replace(/^eq\./, '')
function usageOf(key) {
  if (usage[key] !== undefined) return { count: usage[key], values: [] }
  const m = new Map()
  for (const r of demoRecs) if (r.extra?.[key] !== undefined) m.set(r.extra[key], (m.get(r.extra[key]) ?? 0) + 1)
  return { count: [...m.values()].reduce((a, b) => a + b, 0), values: [...m].map(([value, n]) => ({ value, n })) }
}
/** নকল project_stats('demo') — 11_project_rpcs.sql › project_stats এর শেপে, demoRecs থেকে (M-ধাপ ১৩) */
function demoStats(recs = demoRecs) {
  const demoRecs = recs
  const inc = (o, k, by = 1) => (o[k] = (o[k] ?? 0) + by)
  const s = { total: demoRecs.length, by_year: {}, by_division: {}, by_district: {}, by_upazila: {}, by_location: {}, by_union: {}, by_project: { demo: demoRecs.length }, fields: {} }
  const money = allFields().filter((f) => f.project_key === 'demo' && f.type === 'money' && f.visibility === 'public')
  const cats = allFields().filter((f) => f.project_key === 'demo' && f.type === 'category' && f.visibility === 'public')
  for (const r of demoRecs) {
    inc(s.by_year, r.year)
    inc(s.by_division, r.division)
    inc(s.by_district, r.district)
    inc(s.by_upazila, r.upazila)
    inc(s.by_location, `${r.district}|${r.upazila}`)
    if (r.union_name) inc(s.by_union, `${r.district}|${r.upazila}|${r.union_name}`)
  }
  for (const m of money) s.fields[m.key] = { type: 'money', sum: demoRecs.reduce((a, r) => a + (r.extra?.[m.key] ?? 0), 0), count: demoRecs.filter((r) => r.extra?.[m.key] !== undefined).length }
  for (const c of cats) {
    const by = {}
    for (const r of demoRecs) {
      const v = r.extra?.[c.key]
      if (v === undefined || v === '') continue
      by[v] ??= { n: 0, sums: {} }
      by[v].n++
      for (const m of money) inc(by[v].sums, m.key, r.extra?.[m.key] ?? 0)
    }
    s.fields[c.key] = { type: 'category', distinct: Object.keys(by).length, by_value: by }
  }
  s.distinct = { divisions: Object.keys(s.by_division).length, districts: Object.keys(s.by_district).length, upazilas: Object.keys(s.by_location).length, unions: Object.keys(s.by_union).length }
  return s
}
/**
 * নকল project_stats_filtered('demo', p_filters) — 15_filtered_stats.sql এর নিয়মে demoRecs ছেঁকে হালকা শেপ (M-ধাপ: ফিল্টার-স্ট্যাট)।
 * filteredMode = 'missing' হলে SQL ১৫ না-চালানো ডাটাবেসের মতো 404
 */
let filteredMode = 'ok'
const filteredCalls = []
function demoFilteredStats(fl) {
  const pub = allFields().filter((x) => x.project_key === 'demo' && x.visibility === 'public' && x.is_active !== false)
  const like = (v, q) => typeof v === 'string' && v.toLowerCase().includes(q.toLowerCase())
  const recs = demoRecs.filter((r) =>
    (fl.year === undefined || r.year === fl.year) &&
    (!fl.division || r.division === fl.division) && (!fl.district || r.district === fl.district) &&
    (!fl.upazila || r.upazila === fl.upazila) && (!fl.union_name || r.union_name === fl.union_name) &&
    Object.entries(fl.fields ?? {}).every(([k, v]) => !pub.some((x) => x.key === k && x.filterable) || r.extra?.[k] === v) &&
    (!fl.q || like(r.name, fl.q) || like(r.father_or_husband_name, fl.q) || like(r.address, fl.q) || pub.some((x) => x.searchable && like(r.extra?.[x.key], fl.q))))
  const st = demoStats(recs)
  for (const v of Object.values(st.fields)) delete v.by_value
  return { total: st.total, distinct: st.distinct, by_project: st.by_project, fields: st.fields, filtered: true }
}
/** demo এর অনুরোধ হলে নকল উত্তর দিয়ে true, নইলে undefined */
async function fakeRecords(u, method, req, respond0) {
  // উত্তর দিলে true (await এর পর respond এর Promise undefined হয় — তাই আলাদা চিহ্ন)
  const respond = (...a) => respond0(...a).then(() => true)
  // demo এর ছবি (স্টোরেজ) — নকল; ঘর নির্মাণের ছবিতে কখনো নয় (অচেনা লেখা হিসেবে আটকায়)
  if (u.pathname.startsWith('/storage/v1/object/housing-photos/housing/demo/') && (method === 'POST' || method === 'PUT')) {
    writes.push({ method, path: u.pathname, search: u.search, body: null })
    return respond(200, { Key: u.pathname.replace('/storage/v1/object/', ''), Id: 'fake' })
  }
  const body = req.postData() ? JSON.parse(req.postData()) : null
  const accept = req.headers()['accept'] ?? ''
  const one = accept.includes('vnd.pgrst.object')
  const send = (rows) => (one ? (rows[0] ? respond(200, rows[0]) : respond(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows', hint: null })) : respond(200, rows, { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' }))
  if (u.pathname === '/rest/v1/rpc/project_stats' && body?.p_key === 'demo') return respond(200, demoStats())
  if (u.pathname === '/rest/v1/rpc/project_stats_filtered' && body?.p_key === 'demo') {
    filteredCalls.push(body.p_filters)
    if (filteredMode === 'missing') return respond(404, { code: 'PGRST202', message: 'Could not find the function public.project_stats_filtered', details: null, hint: null })
    return respond(200, demoFilteredStats(body.p_filters ?? {}))
  }
  if (u.pathname === '/rest/v1/rpc/housing_next_serial' && body?.p_project_type === 'demo')return respond(200, String(demoRecs.reduce((m, r) => Math.max(m, r.serial_no), 0) + 1))
  if (u.pathname === '/rest/v1/rpc/project_field_rename_value' && body?.p_project === 'demo') {
    writes.push({ method, path: u.pathname, search: u.search, body })
    let n = 0
    for (const r of demoRecs) {
      if (r.extra?.[body.p_key] === body.p_from) {
        r.extra[body.p_key] = body.p_to
        n++
      }
    }
    return respond(200, String(n))
  }
  // বাল্ক আপডেট (সিরিয়াল ধরে) — 11_project_rpcs.sql › housing_bulk_update_by_serial এর নিয়মে: খালি = অপরিবর্তিত,
  // _clear = মোছা, extra এর গোপন key → beneficiary_private (মিশিয়ে)
  if (u.pathname === '/rest/v1/rpc/housing_bulk_update_by_serial' && body?.p_project_type === 'demo') {
    writes.push({ method, path: u.pathname, search: u.search, body })
    const adminKeys = allFields().filter((f) => f.project_key === 'demo' && f.visibility === 'admin').map((f) => f.key)
    let updated = 0
    const missing = []
    for (const row of body.p_rows) {
      const r = demoRecs.find((x) => x.serial_no === row.serial_no)
      if (!r) {
        missing.push(row.serial_no)
        continue
      }
      for (const k of ['year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'union_name', 'address', 'prev_photo_source', 'current_photo_source']) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') r[k] = row[k]
      }
      for (const c of row._clear ?? []) {
        if (c.startsWith('extra.')) delete r.extra[c.slice(6)]
        else r[c] = c.endsWith('_source') ? null : ''
      }
      for (const [k, v] of Object.entries(row.extra ?? {})) {
        if (v === null || v === '') continue
        if (adminKeys.includes(k)) demoPrivate[r.id] = { ...(demoPrivate[r.id] ?? {}), [k]: v }
        else r.extra[k] = v
      }
      updated++
    }
    return respond(200, { updated, missing })
  }
  if (u.pathname === '/rest/v1/beneficiary_private') {
    if (method === 'GET') {
      const id = eqParam(u, 'record_id')
      const inList = u.searchParams.get('record_id')?.match(/^in\.\((.*)\)$/)?.[1]?.split(',').map((s) => s.replace(/"/g, ''))
      const ids = inList ?? (id ? [id] : [])
      if (!ids.some((x) => demoRecs.some((r) => r.id === x))) return undefined
      return send(ids.filter((x) => demoPrivate[x]).map((x) => ({ record_id: x, data: demoPrivate[x] })))
    }
    if (method === 'POST' && demoRecs.some((r) => r.id === body?.record_id)) {
      writes.push({ method, path: u.pathname, search: u.search, body })
      demoPrivate[body.record_id] = body.data
      return send([{ record_id: body.record_id, data: body.data }])
    }
    return undefined
  }
  if (u.pathname !== '/rest/v1/housing_beneficiaries') return undefined
  const id = eqParam(u, 'id')
  const isDemo = eqParam(u, 'project_type') === 'demo' || (id && demoRecs.some((r) => r.id === id)) || body?.project_type === 'demo' || (Array.isArray(body) && body[0]?.project_type === 'demo')
  if (!isDemo) return undefined
  const ts = new Date().toISOString()
  const newRec = (row) => ({ id: `00000000-0000-0000-0000-0000000${String(demoRecs.length + 1).padStart(5, '0')}`, serial_no: row.serial_no ?? demoRecs.reduce((m, r) => Math.max(m, r.serial_no), 0) + 1, union_name: '', extra: {}, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts, ...row })
  // বাল্ক ইনসার্ট (array, return=minimal, count=exact): সিরিয়াল ডুপ্লিকেট হলে পুরো চাঙ্ক ব্যর্থ (ডাটাবেসের মতো)
  if (method === 'POST' && Array.isArray(body)) {
    writes.push({ method, path: u.pathname, search: u.search, body })
    const dup = body.find((row) => row.serial_no && demoRecs.some((r) => r.serial_no === row.serial_no))
    if (dup) return respond(409, { code: '23505', message: `duplicate key value violates unique constraint (serial ${dup.serial_no})`, details: null, hint: null })
    for (const row of body) demoRecs.push(newRec(row))
    return respond(201, '', { 'content-range': `*/${body.length}` })
  }
  if (method === 'GET') {
    let rows = demoRecs.filter((r) => !id || r.id === id)
    const sn = u.searchParams.get('serial_no')?.startsWith('eq.') ? eqParam(u, 'serial_no') : null
    const snIn = u.searchParams.get('serial_no')?.match(/^in\.\((.*)\)$/)?.[1]?.split(',')
    if (snIn) rows = rows.filter((r) => snIn.includes(String(r.serial_no)))
    if (sn) rows = rows.filter((r) => String(r.serial_no) === sn)
    for (const col of ['year', 'division', 'district', 'upazila', 'union_name']) {
      const v = u.searchParams.get(col)?.startsWith('eq.') ? eqParam(u, col) : null
      if (v !== null) rows = rows.filter((r) => String(r[col]) === v)
    }
    const cs = u.searchParams.get('extra')?.match(/^cs\.(.*)$/)?.[1]
    if (cs) {
      const want = JSON.parse(cs)
      rows = rows.filter((r) => Object.entries(want).every(([k, v]) => r.extra?.[k] === v))
    }
    // PostgREST এর order=year.desc,serial_no.asc (M-ধাপ ১৭) — না থাকলে সিরিয়াল ক্রম
    const orderBy = (u.searchParams.get('order') ?? 'serial_no.asc').split(',').map((x) => x.split('.'))
    rows = [...rows].sort((a, b) => {
      for (const [col, dir] of orderBy) {
        const d = a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0
        if (d) return dir === 'desc' ? -d : d
      }
      return 0
    })
    // পেজিনেশন (supabase-js range → offset/limit) — M-ধাপ ১৪: পাতা পেরিয়ে ←/→
    const off = Number(u.searchParams.get('offset') ?? 0)
    const lim = u.searchParams.get('limit')
    if (!one && lim !== null) {
      const total = rows.length
      const pageRows = rows.slice(off, off + Number(lim))
      return respond(200, pageRows, { 'content-range': pageRows.length ? `${off}-${off + pageRows.length - 1}/${total}` : `*/${total}` })
    }
    return send(rows)
  }
  writes.push({ method, path: u.pathname, search: u.search, body })
  if (method === 'POST') {
    const serial = body.serial_no ?? demoRecs.reduce((m, r) => Math.max(m, r.serial_no), 0) + 1
    const r = { id: `00000000-0000-0000-0000-00000000d${String(demoRecs.length + 1).padStart(3, '0')}`, serial_no: serial, union_name: '', extra: {}, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts, ...body }
    demoRecs.push(r)
    return send([r])
  }
  const r = demoRecs.find((x) => x.id === id)
  if (!r) return send([])
  if (method === 'PATCH') {
    Object.assign(r, body, { updated_at: ts })
    return send([r])
  }
  if (method === 'DELETE') {
    demoRecs.splice(demoRecs.indexOf(r), 1)
    return send([{ id }])
  }
  return undefined
}

async function handle(req) {
  const url = req.url()
  if (!url.startsWith(SB)) return req.continue()
  const u = new URL(url)
  const method = req.method()
  // কভার (M-ধাপ ১৫): demo এর কভার আপলোড/মোছা নকল; অন্য প্রকল্পের কভারে লেখা আটকায় (নিচে blocked)
  if (u.pathname === '/storage/v1/object/housing-photos/housing/_projects/demo/cover.webp' && (method === 'POST' || method === 'PUT')) {
    writes.push({ method, path: u.pathname, search: u.search, body: null, contentType: (req.headers()['content-type'] ?? '') + ' ' + (req.postData() ?? '').slice(0, 300) })
    return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: 'housing-photos/housing/_projects/demo/cover.webp', Id: 'fake' }) })
  }
  if (u.pathname === '/storage/v1/object/housing-photos' && method === 'DELETE') {
    const body = req.postData() ? JSON.parse(req.postData()) : null
    if (JSON.stringify(body?.prefixes) === JSON.stringify(['housing/_projects/demo/cover.webp'])) {
      writes.push({ method, path: u.pathname, search: u.search, body })
      return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ name: 'housing/_projects/demo/cover.webp' }]) })
    }
  }
  if (method === 'GET' && u.pathname === '/storage/v1/object/public/housing-photos/housing/_projects/demo/cover.webp') {
    return req.respond({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: DEMO_PNG_PREV })
  }
  // demo এর ছবি পড়া — নকল PNG (M-ধাপ ১৪; লাইভ স্টোরেজে demo এর ছবি নেই)
  if (method === 'GET' && u.pathname.startsWith('/storage/v1/object/public/housing-photos/housing/demo/')) {
    return req.respond({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: u.pathname.includes('/prev') ? DEMO_PNG_PREV : DEMO_PNG })
  }
  // বাকি পাবলিক ছবি (ঘর নির্মাণের থাম্ব) — সরাসরি লাইভ থেকে (বাইনারি; নিচের text-পড়ায় নষ্ট হতো)
  if (method === 'GET' && u.pathname.startsWith('/storage/v1/object/public/')) return req.continue()
  const respond = (status, body, headers = {}) =>
    req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  if (method === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  if (u.pathname.startsWith('/auth/v1/')) {
    if (u.pathname.endsWith('/user')) return respond(200, USER)
    if (u.pathname.endsWith('/logout')) return respond(204, '')
    return respond(200, SESSION)
  }
  if (u.pathname === '/rest/v1/rpc/housing_current_admin') return respond(200, [{ role: adminRole, email: USER.email, ...adminExtra }])
  if (await fakeRecords(u, method, req, respond)) return
  if (u.pathname === '/rest/v1/housing_activity_log') return respond(200, fakeLog, { 'content-range': fakeLog.length ? `0-${fakeLog.length - 1}/${fakeLog.length}` : '*/0' })
  if (u.pathname === '/rest/v1/rpc/housing_log_event') {
    logEvents.push(req.postData() ? JSON.parse(req.postData()) : null)
    return respond(200, 'null')
  }

  const readRpc = ['projects_overview', 'project_stats', 'project_stats_filtered', 'housing_stats', 'housing_years', 'housing_next_serial']
  const isRead = method === 'GET' || (method === 'POST' && readRpc.some((n) => u.pathname === `/rest/v1/rpc/${n}`))
  if (isRead) {
    // লাইভ থেকে anon হিসেবে আনা (নকল টোকেন বাদ), দরকারে নকল খসড়া যোগ
    const headers = { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }
    const prefer = req.headers()['prefer']
    if (prefer) headers.prefer = prefer
    const accept = req.headers()['accept']
    if (accept) headers.accept = accept
    const r = await fetch(url, { method, headers, body: method === 'POST' ? req.postData() : undefined })
    let text = await r.text()
    if (method === 'GET' && u.pathname === '/rest/v1/projects') {
      let arr = JSON.parse(text)
      if (created) arr.push({ ...created.project })
      // M-ধাপ ১৫: রেজিস্ট্রি এক কলে (select=*,project_fields(*)) — নকল ফিল্ড embed এ (কপিতে; created.project বদলায় না)
      if ((u.searchParams.get('select') ?? '').includes('project_fields')) {
        arr = arr.map((p) => ({ ...p, project_fields: [...(p.project_fields ?? []), ...allFields().filter((f) => f.project_key === p.key)] }))
      }
      text = JSON.stringify(arr)
    }
    if (u.pathname === '/rest/v1/rpc/projects_overview' && Array.isArray(r.ok ? JSON.parse(text).projects : null)) {
      const o = JSON.parse(text)
      o.projects.push(...overviewExtra)
      text = JSON.stringify(o)
    }
    if (method === 'GET' && u.pathname === '/rest/v1/project_fields') {
      const arr = JSON.parse(text)
      const pk = u.searchParams.get('project_key')?.replace(/^eq\./, '')
      arr.push(...allFields().filter((f) => !pk || f.project_key === pk))
      text = JSON.stringify(arr)
    }
    const h = {}
    const cr = r.headers.get('content-range')
    if (cr) h['content-range'] = cr
    return respond(r.status, text, h)
  }

  // ---- লেখা: সব এখানেই উত্তর (লাইভে যায় না)
  const body = req.postData() ? JSON.parse(req.postData()) : null
  writes.push({ method, path: u.pathname, search: u.search, body })
  if (u.pathname === '/rest/v1/rpc/project_create') {
    const p = body.p_project
    const ts = new Date().toISOString()
    created = {
      project: { summary_bn: '', summary_en: '', description_bn: '', description_en: '', cover_path: null, sort_order: 999, created_at: ts, updated_at: ts, ...p, is_published: false },
      fields: (body.p_fields ?? []).map((f, i) => ({ id: `00000000-0000-0000-0000-00000000010${i}`, project_key: p.key, label_en: '', help_bn: '', help_en: '', options: [], required: false, visibility: 'public', show_in_table: false, show_in_card: false, show_in_detail: true, filterable: false, searchable: false, fill_down: false, max_length: null, min_value: null, max_value: null, import_aliases: [], sort_order: (i + 1) * 10, is_active: true, created_at: ts, updated_at: ts, ...f })),
    }
    return respond(200, { key: p.key, fields: created.fields.length })
  }
  if (u.pathname === '/rest/v1/projects' && method === 'PATCH') {
    const accept = req.headers()['accept'] ?? ''
    if (patchMode === 'guard') return respond(400, { code: '23514', message: '1 টি রেকর্ডে আগের ছবি আছে — ছবি মোড "শুধু পরের ছবি"/"ছবি নেই" করা যাবে না', details: 'photo_mode', hint: null })
    if (patchMode === 'conflict') {
      return accept.includes('vnd.pgrst.object')
        ? respond(406, { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' })
        : respond(200, [])
    }
    const key = u.searchParams.get('key')?.replace(/^eq\./, '')
    // নকল খসড়ার বদল মনে রাখা (পরিসংখ্যান-ট্যাবের সংরক্ষণের পর নতুন করে আনলে দেখা যায়)
    if (created && key === created.project.key) Object.assign(created.project, body, { updated_at: new Date().toISOString() })
    return accept.includes('vnd.pgrst.object') ? respond(200, { key }) : respond(200, [{ key }])
  }
  if (u.pathname === '/rest/v1/rpc/projects_reorder') return respond(200, '3')
  // ---- ইউজার-ব্যবস্থাপনা (M-ধাপ ১৯): নকল RPC; usersMode = 'missing' হলে SQL ১৪ না-চালানো ডাটাবেসের মতো 404
  if (u.pathname === '/rest/v1/rpc/housing_admin_users' || u.pathname === '/rest/v1/rpc/housing_admin_user_save') {
    if (usersMode === 'missing') return respond(404, { code: 'PGRST202', message: 'Could not find the function', details: null, hint: null })
    if (u.pathname.endsWith('/housing_admin_users')) return respond(200, fakeUsers)
    const known = { 'new-user@example.org': '00000000-0000-0000-0000-0000000000c1', 'editor@example.org': '00000000-0000-0000-0000-0000000000c2' }
    const em = String(body.p_email).toLowerCase()
    if (!known[em]) return respond(400, { code: 'P0002', message: `«${body.p_email}» ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে Supabase → Authentication → Add user দিয়ে অ্যাকাউন্ট খুলুন`, details: 'email', hint: null })
    let row = fakeUsers.find((x) => x.email === em)
    const createdNow = !row
    if (!row) fakeUsers.push((row = { user_id: known[em], email: em, role: 'editor', created_at: new Date().toISOString(), last_sign_in_at: null }))
    Object.assign(row, { all_projects: body.p_all_projects, projects: body.p_projects, is_active: body.p_active })
    return respond(200, { user_id: row.user_id, email: em, created: createdNow })
  }
  // ---- ফিল্ড বিল্ডার (M-ধাপ ৮): নকল ফিল্ড-অবস্থা (created.fields + addedFields), GET এ ফেরত আসে
  if (u.pathname === '/rest/v1/rpc/project_field_usage') return respond(200, usageOf(body.p_key))
  if (u.pathname === '/rest/v1/rpc/project_fields_reorder') {
    body.p_ids.forEach((id, i) => { const f = allFields().find((x) => x.id === id); if (f) f.sort_order = (i + 1) * 10 })
    return respond(200, 'null')
  }
  if (u.pathname === '/rest/v1/project_fields') {
    const ts = new Date().toISOString()
    const id = u.searchParams.get('id')?.replace(/^eq\./, '')
    if (method === 'POST') {
      const f = { id: `00000000-0000-0000-0000-0000000002${String(addedFields.length).padStart(2, '0')}`, options: [], is_active: true, created_at: ts, updated_at: ts, ...body }
      addedFields.push(f)
      return respond(201, f)
    }
    const f = allFields().find((x) => x.id === id)
    if (!f) return respond(200, method === 'DELETE' ? [] : 'null')
    if (method === 'PATCH') {
      Object.assign(f, body, { updated_at: ts })
      return respond(200, f)
    }
    if (method === 'DELETE') {
      for (const arr of [created?.fields ?? [], addedFields]) { const i = arr.indexOf(f); if (i >= 0) arr.splice(i, 1) }
      return respond(200, [{ id }])
    }
  }
  blocked.push(`${method} ${u.pathname}`)
  return respond(403, { code: '42501', message: 'test: blocked write' })
}

const b = await puppeteer.launch({ executablePath: BROWSER, headless: true })
/** session = false: লগইন ছাড়া সাধারণ দর্শক (M-ধাপ ১৫ হোম) — একই ব্রাউজারের localStorage থেকে নকল টোকেন মোছে */
async function newPage(width = 1280, mobile = false, lang = 'bn', session = true) {
  const p = await b.newPage()
  await p.setViewport({ width, height: mobile ? 844 : 900, isMobile: mobile, hasTouch: mobile })
  await p.evaluateOnNewDocument(
    (k, s, l, on) => {
      if (on) localStorage.setItem(k, s)
      else localStorage.removeItem(k)
      localStorage.setItem('asf_lang', l)
    },
    `sb-${REF}-auth-token`,
    JSON.stringify(SESSION),
    lang,
    session,
  )
  await p.setRequestInterception(true)
  p.on('request', (r) => void handle(r).catch((e) => console.log('handler error', e.message)))
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && !/403|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)))
  p.errors = errors
  return p
}
/** ইনপুট খালি করা: Ctrl+A তারপর মুছুন (বাংলা লেখায় triple-click সব বাছে না) */
async function clearInput(p, el) {
  await el.focus()
  await p.keyboard.down('Control')
  await p.keyboard.press('KeyA')
  await p.keyboard.up('Control')
  await p.keyboard.press('Backspace')
}
const text = (p) => p.evaluate(() => document.body.innerText)
const settle = async (p) => {
  await p.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {})
  await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 15000 }).catch(() => {})
  await sleep(300)
}
const clickText = (p, sel, txt) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === x); el?.click(); return !!el }, sel, txt)
async function typeInto(p, labelText, value) {
  const id = await p.evaluate((lt) => [...document.querySelectorAll('label')].find((l) => l.textContent.replace('*', '').trim() === lt)?.htmlFor, labelText)
  if (!id) throw new Error('label not found: ' + labelText)

  const el = await p.$(`[id="${id}"]`)
  await clearInput(p, el)
  if (value) await el.type(value)
}

// ---------------------------------------------------------------- A. ড্যাশবোর্ড
{
  const p = await newPage()
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const s = await text(p)
  const cards = await p.$$eval('article h2', (h) => h.map((x) => x.textContent))
  ok('ড্যাশবোর্ড খোলে (নকল মূল এডমিন), প্রতিটি প্রকল্পের কার্ড (ঘর নির্মাণ আগে; লাইভের অন্য প্রকল্পও)', p.url().endsWith('/admin') && cards.slice(0, 3).join('|') === HOUSING3 && OTHER_LIVE.every((n) => cards.includes(n)), cards.join('|'))
  const nums = await p.$$eval('article dd', (d) => d.map((x) => x.textContent.trim()))
  ok('ড্যাশবোর্ডের সংখ্যা: ঘর নির্মাণ ১০, সেমিপাকা ১০, টিন ০ রেকর্ড; টাকা "—"', nums[0] === '১০' && nums[3] === '১০' && nums[6] === '০' && nums[1] === '—', nums.join(' '))
  const sumLine = `প্রকাশিত: ${bnNum(LIVE.global.projects)}টি প্রকল্প · ${bnNum(LIVE.global.total)} জন উপকারভোগী · ${bnNum(LIVE.global.districts)}টি জেলা`
  ok('প্রকাশিত সারাংশ = লাইভের ওভারভিউ: ' + sumLine, s.includes(sumLine), s.match(/প্রকাশিত:[^\n]*/)?.[0])
  ok('সাইডবারে মেনু ও "মূল এডমিন"', s.includes('ড্যাশবোর্ড') && s.includes('প্রকল্পসমূহ') && s.includes('মূল এডমিন') && s.includes('সেমিপাকা ঘর নির্মাণ'))
  await p.screenshot({ path: '.smoke/admin-dashboard.png', fullPage: true })
  ok('ড্যাশবোর্ডে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
}

// ---------------------------------------------------------------- B. প্রকল্পের তালিকা + অপ্রকাশের নিশ্চিতকরণ (বাতিল)
{
  const p = await newPage()
  await p.goto(BASE + '/admin/projects', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const rows = await p.$$eval('ul li a[href^="/admin/projects/"]', (a) => a.filter((x) => x.classList.contains('font-bold')).map((x) => x.textContent))
  ok('প্রকল্পের তালিকা: গ্রুপ, তারপর তার উপ-প্রকল্প (লাইভের অন্য প্রকল্পও আছে)', rows.slice(0, 3).join('|') === HOUSING3 && OTHER_LIVE.every((n) => rows.includes(n)), rows.join('|'))
  const before = writes.length
  await p.evaluate(() => [...[...document.querySelectorAll('ul.divide-y > li')][0].querySelectorAll('button')].find((x) => x.textContent.trim() === 'অপ্রকাশ করুন')?.click())
  await sleep(400)
  const dlg = await p.evaluate(() => document.querySelector('[role="dialog"]')?.innerText ?? null)
  ok('ঘর নির্মাণ "অপ্রকাশ করুন" → নিশ্চিতকরণ ডায়ালগ: ১০টি রেকর্ড ও লুকানো URL গুলো', !!dlg && dlg.includes('১০টি রেকর্ড') && dlg.includes('/housing') && dlg.includes('/housing/semi-pucca') && dlg.includes('/housing/tin'), dlg?.slice(0, 160))
  const disabled = () => p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent.trim() === 'অপ্রকাশ করুন')?.disabled)
  ok('নাম না লিখলে নিশ্চিত-বোতাম বন্ধ', (await disabled()) === true)
  const inp = await p.$('[role="dialog"] input')
  await inp.type('ভুল নাম')
  ok('ভুল নাম লিখলে বন্ধই থাকে', (await disabled()) === true)
  await clearInput(p, inp)
  await inp.type('ঘর নির্মাণ প্রকল্প')
  const typedVal = await p.evaluate(() => document.querySelector('[role="dialog"] input').value)
  ok('সঠিক নাম লিখলে চালু হয়', (await disabled()) === false, JSON.stringify(typedVal) + ' ' + [...typedVal].map((c) => c.codePointAt(0).toString(16)).join(' '))
  await p.screenshot({ path: '.smoke/admin-unpublish-dialog.png' })
  await clickText(p, '[role="dialog"] button', 'বাতিল')
  await sleep(300)
  ok('বাতিল চাপলে ডায়ালগ বন্ধ, কোনো লেখা-অনুরোধ যায়নি', !(await p.$('[role="dialog"]')) && writes.length === before, `লেখা ${writes.length - before}`)
  ok('প্রকল্প-তালিকায় কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
}

// ---------------------------------------------------------------- C. উইজার্ড
{
  const p = await newPage()
  await p.goto(BASE + '/admin/projects/new', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await typeInto(p, 'বাংলা নাম', 'পরীক্ষা প্রকল্প')
  await typeInto(p, 'ইংরেজি নাম', 'Demo')
  await sleep(200)
  const slugVal = async () => p.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('URL অংশ (slug)')) && document.getElementById([...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('URL অংশ (slug)')).htmlFor).value)
  const s1 = await text(p)
  ok('ইংরেজি নাম থেকে slug "demo", key "demo", প্রিফিক্স "demo", URL প্রিভিউ "/demo"', (await slugVal()) === 'demo' && s1.includes('স্থায়ী key: demo') && s1.includes('পেইজের ঠিকানা: /demo'), s1.match(/স্থায়ী key: \S+/)?.[0])
  ok('ছবির ফাইলের উদাহরণ "demo_0012.jpg" (শুধু-পরে)', s1.includes('demo_0012.jpg'))
  ok('উইজার্ডে আইকন-বাছাই নেই, শুধু "রং" (২০২৬-১০-০৭)', !(await p.$('[role="radiogroup"][aria-label="আইকন"]')) && !!(await p.$('[role="radiogroup"][aria-label="রং"]')) && !s1.includes('আইকন ও রং'))
  for (const [slug, want] of [['admin', 'সংরক্ষিত শব্দ'], ['src', 'সংরক্ষিত শব্দ'], ['housing', 'আগে থেকেই আছে'], ['123', 'শুধু সংখ্যা দিয়ে URL হয় না'], ['Bad Slug', 'শুধু ছোট ইংরেজি অক্ষর']]) {
    await typeInto(p, 'URL অংশ (slug)', slug)
    await sleep(150)
    const s = await text(p)
    ok(`slug "${slug}" → সাথে সাথে ত্রুটি (${want})`, s.includes(want))
  }
  await typeInto(p, 'URL অংশ (slug)', 'demo')
  await p.screenshot({ path: '.smoke/admin-wizard.png', fullPage: true })
  await clickText(p, 'button', 'খসড়া হিসেবে তৈরি করুন')
  await settle(p)
  const w = writes.find((x) => x.path === '/rest/v1/rpc/project_create')
  const pp = w?.body?.p_project ?? {}
  ok('project_create এর ইনপুট: key/slug demo, শুধু-পরে, ইউনিয়ন, প্রিফিক্স demo, খসড়া', pp.key === 'demo' && pp.slug === 'demo' && pp.photo_mode === 'after_only' && pp.geo_depth === 'union' && pp.file_prefix === 'demo' && !pp.is_published && pp.parent_key === null, JSON.stringify(pp).slice(0, 200))
  ok('টেমপ্লেটের ৩টি ফিল্ড (ক্যাটাগরি, উপকরণের নাম, টাকা) ও ৫টি কার্ড', (w?.body?.p_fields ?? []).map((f) => f.key).join(',') === 'category,item_name,amount' && pp.stat_cards?.length === 5)
  ok('তৈরির পর সেটিংস পেইজে যায় (/admin/projects/demo), "খসড়া" দেখায়', p.url().endsWith('/admin/projects/demo') && (await text(p)).includes('খসড়া'), p.url())
  ok('টেমপ্লেটে ক্যাটাগরি-চার্টের সেটিং নেই (চার্ট বাদ, ২০২৬-১০-০৬)', !('breakdown_field' in (pp.display ?? {})), JSON.stringify(pp.display))
  await p.goto(BASE + '/admin/projects/demo?tab=display', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const disp = await text(p)
  ok('সেটিংস → প্রদর্শন: মানচিত্র ও ঠিকানার কলাম আছে, "বিতরণ চার্টের ফিল্ড" নেই', disp.includes('মানচিত্র') && !disp.includes('বিতরণ চার্ট'), disp.match(/প্রদর্শন[\s\S]{0,200}/)?.[0]?.replace(/\s+/g, ' '))
  ok('উইজার্ডে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
}

// ---------------------------------------------------------------- D. সেটিংস: গার্ড-ত্রুটি (ছবি মোড) ও CONFLICT
{
  const p = await newPage()
  await p.goto(BASE + '/admin/projects/semi_pucca?tab=photos', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const slugDisabled = await p.goto(BASE + '/admin/projects/semi_pucca', { waitUntil: 'domcontentloaded' }).then(() => settle(p)).then(() => p.evaluate(() => document.getElementById([...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('URL অংশ (slug)')).htmlFor).disabled))
  ok('প্রকাশিত semi_pucca: slug ঘর নিষ্ক্রিয়, ব্যাখ্যাসহ', slugDisabled === true && (await text(p)).includes('প্রকাশিত প্রকল্পের URL বদলানো যায় না'))
  await clickText(p, '[role="tab"]', 'ছবি')
  await sleep(200)
  const sel = await p.evaluate(() => document.getElementById([...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('ছবি মোড')).htmlFor).id)
  await p.select(`[id="${sel}"]`, 'after_only')
  patchMode = 'guard'
  const before = writes.length
  await clickText(p, 'button', 'সংরক্ষণ করুন')
  await settle(p)
  const patch = writes.slice(before).find((x) => x.method === 'PATCH')
  ok('সংরক্ষণে শুধু বদলানো কলাম আর updated_at মেলানো (PATCH ?updated_at=eq.…)', !!patch && Object.keys(patch.body).join(',') === 'photo_mode' && /updated_at=eq\./.test(decodeURIComponent(patch.search)), patch && `${JSON.stringify(patch.body)} ${decodeURIComponent(patch.search).slice(0, 80)}`)
  ok('ডাটাবেস-গার্ডের বাংলা বার্তা সংখ্যাসহ দেখায়', (await text(p)).includes('১ টি রেকর্ডে আগের ছবি আছে') || (await text(p)).includes('1 টি রেকর্ডে আগের ছবি আছে'))
  await p.screenshot({ path: '.smoke/admin-settings-guard.png', fullPage: true })

  patchMode = 'conflict'
  await p.goto(BASE + '/admin/projects/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await typeInto(p, 'ইংরেজি নাম', 'Demo (tab 2)')
  await clickText(p, 'button', 'সংরক্ষণ করুন')
  await settle(p)
  ok('দুই ট্যাব: অন্য কেউ আগে বদলালে CONFLICT বার্তা ও "নতুন অবস্থা আনুন"', (await text(p)).includes('অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন') && (await text(p)).includes('নতুন অবস্থা আনুন'))
  const chk = await text(p)
  ok('খসড়া demo: আটকানোর মতো কিছু নেই (টেমপ্লেটে দুই ভাষার নাম/লেবেল ও কার্ড আছে); অসংরক্ষিত পরিবর্তন থাকায় প্রকাশ-বোতাম বন্ধ', !chk.includes('✕') && (await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'প্রকাশ করুন')?.disabled)) === true /* অসংরক্ষিত পরিবর্তন থাকায় বন্ধ */)
  await p.screenshot({ path: '.smoke/admin-settings-conflict.png', fullPage: true })
  ok('সেটিংসে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  patchMode = 'ok'
  await p.close()
}

// ---------------------------------------------------------------- F. ফিল্ড বিল্ডার (M-ধাপ ৮) — খসড়া demo
const dlgText = (p) => p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join('\n'))
/** ড্রয়ারের চেকবক্স (লেবেলের লেখা দিয়ে) */
const box = (p, txt, click = false) =>
  p.evaluate((x, c) => {
    const l = [...document.querySelectorAll('[role="dialog"] label')].find((e) => e.textContent.includes(x))
    const i = l?.querySelector('input')
    if (i && c) i.click()
    return i ? { disabled: i.disabled, checked: i.checked, text: l.textContent } : null
  }, txt, click)
/** ফিল্ডের সারিতে বোতাম চাপা (সারির লেবেল দিয়ে) */
const rowClick = (p, label, btn) =>
  p.evaluate((l, b) => {
    const li = [...document.querySelectorAll('main li')].find((e) => e.querySelector('p')?.textContent.startsWith(l))
    const el = li && [...li.querySelectorAll('button')].find((e) => e.textContent.trim() === b)
    el?.click()
    return !!el
  }, label, btn)
const inputByLabel = (p, lt) => p.evaluate((x) => { const l = [...document.querySelectorAll('label')].find((e) => e.textContent.replace('*', '').trim() === x); const el = l && document.getElementById(l.htmlFor); return el ? { value: el.value, disabled: el.disabled, id: el.id } : null }, lt)
async function addField(p, labelBn, tableOn) {
  await clickText(p, 'button', '+ ফিল্ড যোগ করুন')
  await sleep(200)
  await typeInto(p, 'লেবেল (বাংলা)', labelBn)
  if (tableOn) await box(p, 'টেবিলে (ডেস্কটপ)', true)
  const before = writes.length
  await clickText(p, '[role="dialog"] button', 'ফিল্ড যোগ করুন')
  await settle(p)
  return writes.slice(before).find((w) => w.method === 'POST' && w.path === '/rest/v1/project_fields')
}
{
  const p = await newPage()
  await p.goto(BASE + '/admin/projects/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await clickText(p, '[role="tab"]', 'ফিল্ড')
  await sleep(300)
  const s0 = await text(p)
  ok('ফিল্ড ট্যাব: আগে সিস্টেম ফিল্ড 🔒, তারপর টেমপ্লেটের ৩টি কাস্টম ফিল্ড', s0.includes('সিস্টেম ফিল্ড') && s0.indexOf('সিস্টেম ফিল্ড') < s0.indexOf('কাস্টম ফিল্ড') && ['উপকরণের ক্যাটাগরি', 'উপকরণের নাম/বিবরণ', 'টাকা'].every((x) => s0.includes(x)))
  const statusSel = await p.evaluate(() => [...document.querySelectorAll('select[aria-label$=" — অবস্থা"]')].map((s) => `${s.getAttribute('aria-label')}:${[...s.options].map((o) => o.value).join('/')}`))
  ok('সাল/নাম/বিভাগ-জেলা-উপজেলা স্থির আবশ্যক (বাছাই নেই); ইউনিয়নে "বন্ধ" নেই', statusSel.length === 3 && statusSel.some((x) => /ইউনিয়ন/.test(x) && x.endsWith(':required/optional')) && !statusSel.some((x) => /^(সাল|নাম|বিভাগ|জেলা|উপজেলা|অনুদানের সাল) —/.test(x)), statusSel.join(' | '))

  // নতুন ফিল্ড: বাংলা লেবেল → key; গোপন-সতর্কতা; মোবাইল → শুধু-এডমিন
  await clickText(p, 'button', '+ ফিল্ড যোগ করুন')
  await sleep(200)
  await typeInto(p, 'লেবেল (বাংলা)', 'উপকরণের নাম')
  ok('শুধু বাংলা লেবেল "উপকরণের নাম" → key "upokoroner_nam" (বৈধ)', (await inputByLabel(p, 'key'))?.value === 'upokoroner_nam', (await inputByLabel(p, 'key'))?.value)
  ok('ড্রয়ারে ফর্ম/টেবিল/মোবাইল-কার্ডের প্রিভিউ ও কলাম-গণনা', /কলাম: [০-৯]+\/৯/.test(await text(p)), (await text(p)).match(/কলাম: \S+/)?.[0])
  await typeInto(p, 'লেবেল (বাংলা)', 'মোবাইল নম্বর')
  ok('লেবেলে "মোবাইল" → লাল সতর্কতা "শুধু-এডমিন করুন"', (await dlgText(p)).includes('এটি গোপন তথ্য মনে হচ্ছে'))
  await p.select(`[id="${(await inputByLabel(p, 'ধরন')).id}"]`, 'phone')
  await sleep(150)
  const vis = await p.evaluate(() => [...document.querySelectorAll('input[name="vis"]')].map((i) => `${i.checked ? 'x' : '-'}${i.disabled ? 'd' : ''}`).join(','))
  const tbl = await box(p, 'টেবিলে (ডেস্কটপ)')
  ok('ধরন "মোবাইল নম্বর" → শুধু-এডমিন বাধ্যতামূলক (পাবলিক বাছাই বন্ধ), টেবিলে দেখানো বন্ধ', vis === '-d,xd' && tbl?.disabled === true && (await dlgText(p)).includes('মোবাইল নম্বর সবসময় শুধু-এডমিন'), `${vis} table=${JSON.stringify(tbl?.disabled)}`)
  const typeOpts = await p.evaluate((id) => [...document.getElementById(id).options].map((o) => o.textContent), (await inputByLabel(p, 'ধরন')).id)
  ok('ধরনের তালিকায় "ক্যাটাগরি (শীটের লেখা থেকে)"', typeOpts.some((o) => o.includes('ক্যাটাগরি')), typeOpts.join(', '))
  await clickText(p, '[role="dialog"] button', 'বাতিল')
  await sleep(200)

  // ৯-কলামের সীমা: অনুদান টেমপ্লেটে ৭ → দুটি টেবিল-ফিল্ড যোগে ৯ → তৃতীয়টিতে "টেবিলে" বন্ধ
  const w1 = await addField(p, 'নোট', true)
  ok('নতুন ফিল্ড সংরক্ষণ → project_fields এ POST (পাবলিক, টেবিলে, project_key=demo)', !!w1 && w1.body.project_key === 'demo' && w1.body.show_in_table === true && w1.body.visibility === 'public' && /^[a-z][a-z0-9_]*$/.test(w1.body.key), w1 && JSON.stringify(w1.body).slice(0, 160))
  const w2 = await addField(p, 'মন্তব্য', true)
  ok('দ্বিতীয় টেবিল-ফিল্ডও যোগ হয় (এখন ৯/৯ কলাম)', !!w2 && w2.body.show_in_table === true && (await text(p)).includes('মন্তব্য'))
  await clickText(p, 'button', '+ ফিল্ড যোগ করুন')
  await sleep(200)
  const full = await box(p, 'টেবিলে (ডেস্কটপ)')
  ok('১০ম টেবিল-কলাম চালু করা যায় না ("টেবিলে সর্বোচ্চ ৯টি কলাম — এখন ৯/৯")', full?.disabled === true && full.text.includes('টেবিলে সর্বোচ্চ ৯টি কলাম — এখন ৯/৯'), full?.text)
  await clickText(p, '[role="dialog"] button', 'বাতিল')
  await sleep(200)

  // ডাটা থাকা ফিল্ড (নকল usage = ৩২): সম্পাদনায় key/ধরন বন্ধ; মোছায় আর্কাইভের পরামর্শ
  await rowClick(p, 'উপকরণের ক্যাটাগরি', 'সম্পাদনা')
  await settle(p)
  const lockedKey = await inputByLabel(p, 'key')
  const lockedType = await inputByLabel(p, 'ধরন')
  ok('৩২টি রেকর্ডে মান আছে → ধরন ও key বদলানো যায় না', lockedKey?.disabled === true && lockedType?.disabled === true && (await dlgText(p)).includes('৩২টি রেকর্ডে মান আছে — key, ধরন ও পাবলিক/গোপন বদলানো যায় না'), `${lockedKey?.disabled} ${lockedType?.disabled}`)
  await clickText(p, '[role="dialog"] button', 'বাতিল')
  await sleep(200)
  let before = writes.length
  await rowClick(p, 'উপকরণের ক্যাটাগরি', 'মুছুন')
  await settle(p)
  ok('ডাটা থাকা ফিল্ড মুছতে চাইলে: "৩২টি রেকর্ডে মান আছে — মোছা যাবে না, আর্কাইভ করুন"', (await dlgText(p)).includes('৩২টি রেকর্ডে মান আছে — মোছা যাবে না, আর্কাইভ করুন'), (await dlgText(p)).slice(0, 120))
  await clickText(p, '[role="dialog"] button', 'আর্কাইভ করুন')
  await settle(p)
  const arch = writes.slice(before).filter((w) => w.path === '/rest/v1/project_fields')
  ok('"আর্কাইভ করুন" → শুধু is_active=false এর PATCH (DELETE নয়); সারিতে "আর্কাইভ" ব্যাজ', arch.length === 1 && arch[0].method === 'PATCH' && JSON.stringify(arch[0].body) === '{"is_active":false}' && (await text(p)).includes('ফেরত আনুন'), arch.map((w) => `${w.method} ${JSON.stringify(w.body)}`).join(' '))
  before = writes.length
  await rowClick(p, 'নোট', 'মুছুন')
  await settle(p)
  const dlg2 = await dlgText(p)
  await clickText(p, '[role="dialog"] button', 'মুছুন')
  await settle(p)
  const del = writes.slice(before).find((w) => w.method === 'DELETE')
  ok('ডাটা নেই এমন ফিল্ড: "মুছে ফেলবেন?" → DELETE', dlg2.includes('মুছে ফেলবেন?') && !!del && del.path === '/rest/v1/project_fields' && !(await text(p)).match(/^নোট/m), dlg2.slice(0, 80))
  before = writes.length
  await p.evaluate(() => [...document.querySelectorAll('main li button[aria-label="নিচে সরান"]')][0]?.click())
  await settle(p)
  const ro = writes.slice(before).find((w) => w.path === '/rest/v1/rpc/project_fields_reorder')
  ok('↓ → project_fields_reorder (সব id, নতুন ক্রমে)', !!ro && ro.body.p_project === 'demo' && ro.body.p_ids.length === allFields().filter((f) => f.project_key === 'demo').length, ro && JSON.stringify(ro.body).slice(0, 120))
  await p.screenshot({ path: '.smoke/admin-fields.png', fullPage: true })
  ok('ফিল্ড ট্যাবে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))

  // ---------------------------------------------------------------- G. পরিসংখ্যান কার্ড বিল্ডার
  await clickText(p, '[role="tab"]', 'পরিসংখ্যান')
  await settle(p)
  const s1 = await text(p)
  const prev = s1.slice(s1.indexOf('প্রিভিউ (আসল সংখ্যা)'), s1.indexOf('প্রিভিউ (আসল সংখ্যা)') + 400)
  ok('প্রিভিউতে "মোট টাকা" ও "মোট ক্যাটাগরি" কার্ড', prev.includes('মোট টাকা') && prev.includes('মোট ক্যাটাগরি') && prev.includes('মোট উপকারভোগী'), prev.replace(/\n/g, ' ').slice(0, 160))
  ok('কার্ড-গণনা "মোট ৫/৮ · হোমে ৩/৩"', s1.includes('মোট ৫/৮ · হোমে ৩/৩'))
  const homes = await p.evaluate(() => [...document.querySelectorAll('main li label')].filter((l) => l.textContent.includes('হোম পেইজের কার্ডে দেখান')).map((l) => { const i = l.querySelector('input'); return `${i.checked ? 'x' : '-'}${i.disabled ? 'd' : ''}` }).join(','))
  ok('হোমে ৩টি থাকলে বাকি কার্ডের "হোমে দেখান" বন্ধ', homes === 'x,x,x,-d,-d', homes)
  await p.evaluate(() => [...document.querySelectorAll('input[name="card-kind"]')].find((i) => i.closest('label').textContent.includes('যোগফল'))?.click())
  await sleep(150)
  await clickText(p, 'button', '+ কার্ড যোগ করুন')
  await sleep(200)
  const last = await p.evaluate(() => { const li = [...document.querySelectorAll('main li')].filter((l) => l.textContent.includes('হোম পেইজের কার্ডে দেখান')).pop(); return [...li.querySelectorAll('input:not([type])')].map((i) => i.value).join('|') })
  ok('যোগফল-কার্ড (টাকা) → নিজে লেবেল "মোট টাকা" / "Total Amount"', /^মোট টাকা\|Total /i.test(last) && (await text(p)).includes('মোট ৬/৮ · হোমে ৩/৩'), last)
  before = writes.length
  await clickText(p, 'button', 'কার্ড সংরক্ষণ করুন')
  await settle(p)
  const sp = writes.slice(before).find((w) => w.method === 'PATCH' && w.path === '/rest/v1/projects')
  ok('সংরক্ষণ → শুধু stat_cards এর PATCH (৬টি কার্ড, updated_at মেলানো)', !!sp && Object.keys(sp.body).join(',') === 'stat_cards' && sp.body.stat_cards.length === 6 && /updated_at=eq\./.test(decodeURIComponent(sp.search)), sp && JSON.stringify(sp.body).slice(0, 140))
  await p.screenshot({ path: '.smoke/admin-stats.png', fullPage: true })
  ok('পরিসংখ্যান ট্যাবে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
}

// ---------------------------------------------------------------- H. ঘর নির্মাণের রেকর্ড-পাতা ও ফর্ম — স্ক্রিনশট (M-ধাপ ১০: আগের সাথে মেলানো)
for (const [w, mobile] of [[1280, false], [390, true]]) {
  const p = await newPage(w, mobile)
  for (const [path, name] of [['/admin/records/semi_pucca', 'list'], ['/admin/records/semi_pucca/new', 'new'], ['/admin/records/semi_pucca/1/edit', 'edit']]) {
    await p.goto(BASE + path, { waitUntil: 'domcontentloaded' })
    await settle(p)
    await p.screenshot({ path: `.smoke/admin-rec-semi-${name}-${w}.png`, fullPage: true })
  }
  ok(`ঘর নির্মাণের রেকর্ড-পাতা/ফর্ম (${w}px) — কোনো page error নেই`, p.errors.length === 0, p.errors.join(' | '))
  await p.close()
}

// ---------------------------------------------------------------- I. পরীক্ষা প্রকল্পে রেকর্ড: CRUD, টাকা, গোপন, ক্যাটাগরি, এক্সপোর্ট (M-ধাপ ১০)
{
  // F-এ ক্যাটাগরি আর্কাইভ হয়েছিল আর ৩২টি নকল মান ছিল — এখানে আসল (নকল-ভাণ্ডারের) অবস্থায় ফেরা; সাথে একটি গোপন মোবাইল-ফিল্ড
  delete usage.category
  const cat = allFields().find((f) => f.project_key === 'demo' && f.key === 'category')
  if (cat) cat.is_active = true
  const ts = new Date().toISOString()
  addedFields.push({ id: '00000000-0000-0000-0000-0000000003a1', project_key: 'demo', key: 'mobile', type: 'phone', label_bn: 'মোবাইল নম্বর', label_en: 'Mobile number', help_bn: '', help_en: '', options: [], required: false, visibility: 'admin', show_in_table: false, show_in_card: false, show_in_detail: true, filterable: false, searchable: false, fill_down: false, max_length: null, min_value: null, max_value: null, import_aliases: [], sort_order: 90, is_active: true, created_at: ts, updated_at: ts })

  const p = await newPage()
  const cdp = await p.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
  // ডাউনলোড ধরা: Blob এর লেখা ও ফাইলের নাম
  await p.evaluateOnNewDocument(() => {
    window.__downloads = []
    const orig = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (b) => {
      const entry = { name: '', text: null }
      window.__downloads.push(entry)
      b.text().then((t) => (entry.text = t))
      // Blob.text() BOM বাদ দিয়ে পড়ে — তাই প্রথম ৩ বাইট আলাদা
      b.arrayBuffer().then((buf) => (entry.bom = [...new Uint8Array(buf.slice(0, 3))].join(',')))
      const url = orig(b)
      setTimeout(() => {
        const a = [...document.querySelectorAll('a[download]')].find((x) => x.href === url)
        if (a) entry.name = a.download
      }, 0)
      return url
    }
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      const d = window.__downloads.at(-1)
      if (d && this.download) d.name = this.download
      if (!this.download) click.call(this)
    }
  })
  const fieldId = (label) => p.evaluate((x) => [...document.querySelectorAll('label')].find((l) => l.textContent.replace('*', '').trim() === x)?.htmlFor, label)
  const fill = async (label, value) => {
    const id = await fieldId(label)
    if (!id) throw new Error('label not found: ' + label)
    const el = await p.$(`[id="${id}"]`)
    await clearInput(p, el)
    if (value) await el.type(value)
  }
  const fillRecord = async (name, amount, category, mobile) => {
    await fill('উপকারভোগীর নাম', name)
    await p.select('#f-division', 'চট্টগ্রাম')
    await p.select('#f-district', 'চট্টগ্রাম')
    await p.select('#f-upazila', 'মীরসরাই')
    await fill('টাকা', amount)
    await fill('উপকরণের ক্যাটাগরি', category)
    if (mobile) await fill('মোবাইল নম্বর', mobile)
  }

  await p.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  let s = await text(p)
  ok('খসড়া demo এর রেকর্ড-পাতা খোলে ("খসড়া" চিহ্ন, সাইডবারে "পরীক্ষা প্রকল্প (খসড়া)"), এখনো রেকর্ড নেই', s.includes('পরীক্ষা প্রকল্প — রেকর্ড') && s.includes('পরীক্ষা প্রকল্প (খসড়া)') && s.includes('এখনো কোনো রেকর্ড নেই'), s.slice(0, 120))

  await p.goto(BASE + '/admin/records/demo/new', { waitUntil: 'domcontentloaded' })
  await settle(p)
  s = await text(p)
  const legends = await p.evaluate(() => [...document.querySelectorAll('fieldset legend')].map((l) => l.textContent.trim()))
  ok('নতুন ফর্ম: "অনুদানের সাল", ইউনিয়ন, "প্রকল্পের তথ্য" (ক্যাটাগরি, উপকরণের নাম, টাকা), "🔒 শুধু এডমিন তথ্য" (মোবাইল)', s.includes('অনুদানের সাল *') && !!(await p.$('#f-union')) && s.includes('প্রকল্পের তথ্য') && s.includes('উপকরণের ক্যাটাগরি *') && s.includes('উপকরণের নাম/বিবরণ') && s.includes('🔒 শুধু এডমিন তথ্য') && s.includes('মোবাইল নম্বর'))
  ok('ছবির ঘর ছবি মোড অনুযায়ী: শুধু একটি, লেবেল "উপকরণসহ ছবি"; পূর্বের ছবির লিঙ্কের ঘর নেই', legends.join('|') === 'উপকরণসহ ছবি' && !(await p.$('#f-prev-src')) && !!(await p.$('#f-cur-src')), legends.join('|'))
  const amountId = await fieldId('টাকা')
  ok('টাকার ঘর: inputMode="numeric"', (await p.$eval(`[id="${amountId}"]`, (e) => e.inputMode)) === 'numeric')

  // রেকর্ড ১: "১,২০,০০০", গোপন মোবাইল, নাম "=1+1" (এক্সপোর্টে ফর্মুলা-সুরক্ষা দেখতে)
  await fillRecord('=1+1', '১,২০,০০০', 'গাভী', '০১৭১১০০০০০০')
  await p.focus('#f-union')
  await p.waitForSelector('[role="option"]', { timeout: 10000 }).catch(() => {})
  await p.evaluate(() => [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === 'করেরহাট')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  await sleep(100)
  const preview = await p.evaluate((id) => document.getElementById(id).parentElement.textContent, amountId)
  ok('"১,২০,০০০" লিখলে পাশে "৳ ১,২০,০০০"', preview.includes('৳ ১,২০,০০০'), preview)
  let before = writes.length
  await clickText(p, 'button', 'পরীক্ষা প্রকল্প — যোগ করুন')
  await settle(p)
  const post1 = writes.slice(before).find((w) => w.method === 'POST' && w.path === '/rest/v1/housing_beneficiaries')
  const priv1 = writes.slice(before).find((w) => w.path === '/rest/v1/beneficiary_private')
  ok('তৈরি: extra = {category, amount: 120000}, union_name "করেরহাট", মোবাইল extra তে নেই', !!post1 && post1.body.extra?.amount === 120000 && post1.body.extra?.category === 'গাভী' && post1.body.union_name === 'করেরহাট' && !('mobile' in (post1.body.extra ?? {})), post1 && JSON.stringify(post1.body).slice(0, 220))
  ok('গোপন মান আলাদা জায়গায় (beneficiary_private) — {"mobile":"01711000000"}', !!priv1 && JSON.stringify(priv1.body.data) === '{"mobile":"01711000000"}', priv1 && JSON.stringify(priv1.body))
  ok('সংরক্ষণের পর তালিকায় ফেরে', p.url().endsWith('/admin/records/demo'), p.url())

  // রেকর্ড ২: "১২০০০০/-", বানান "গাভি" (কাছাকাছি)
  await p.goto(BASE + '/admin/records/demo/new', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const dl = await p.evaluate(() => [...document.querySelectorAll('datalist option')].map((o) => o.value))
  ok('ক্যাটাগরির ঘরে আগে ব্যবহৃত মানের সাজেশন ("গাভী")', dl.includes('গাভী'), dl.join(','))
  await fillRecord('রহিমা খাতুন', '১২০০০০/-', 'গাভি', '')
  before = writes.length
  await clickText(p, 'button', 'পরীক্ষা প্রকল্প — যোগ করুন')
  await settle(p)
  const post2 = writes.slice(before).find((w) => w.method === 'POST' && w.path === '/rest/v1/housing_beneficiaries')
  ok('"১২০০০০/-" → 120000; গোপন মান খালি হলে beneficiary_private এ কিছু যায় না', post2?.body.extra?.amount === 120000 && !writes.slice(before).some((w) => w.path === '/rest/v1/beneficiary_private'), post2 && JSON.stringify(post2.body.extra))

  // ভুল টাকা: ফর্মেই আটকায়
  await p.goto(BASE + '/admin/records/demo/new', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await fillRecord('করিম', 'এক লাখ', 'ছাগল', '')
  before = writes.length
  await clickText(p, 'button', 'পরীক্ষা প্রকল্প — যোগ করুন')
  await sleep(300)
  ok('ভুল টাকা ("এক লাখ") → ঘরের নিচে "শুধু সংখ্যা দিন", কোনো লেখা-অনুরোধ নয়', (await text(p)).includes('শুধু সংখ্যা দিন') && writes.length === before)

  // তালিকা: টাকার কলাম ও পাতার মোট; গোপন মান নেই
  await p.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  s = await text(p)
  const heads = await p.evaluate(() => [...document.querySelectorAll('thead th')].map((x) => x.textContent.trim()))
  ok('তালিকা: কলাম কনফিগ থেকে (… ঠিকানা, উপকরণের ক্যাটাগরি, টাকা, মন্তব্য, ছবি …)', heads.includes('উপকরণের ক্যাটাগরি') && heads.includes('টাকা') && heads.includes('মন্তব্য') && heads.includes('ছবি') && !heads.includes('মোবাইল নম্বর'), heads.join('|') || s.slice(s.indexOf('পরীক্ষা প্রকল্প — রেকর্ড'), s.indexOf('পরীক্ষা প্রকল্প — রেকর্ড') + 700).replace(/\n/g, ' ⏎ '))
  ok('টাকার কলামে "এই পাতার মোট ৳ ২,৪০,০০০"; ঠিকানায় ইউনিয়ন', s.includes('এই পাতার মোট') && s.includes('৳ ২,৪০,০০০') && s.includes('করেরহাট, মীরসরাই'), s.match(/এই পাতার মোট[^\n]*/)?.[0])
  ok('গোপন মোবাইল নম্বর তালিকায় কোথাও নেই', !s.includes('01711000000') && !s.includes('০১৭১১০০০০০০'))

  // ক্যাটাগরি ফিল্টার
  await p.select('#ff-category', 'গাভী')
  await settle(p)
  ok('ক্যাটাগরি ফিল্টার "গাভী" → ১টি রেকর্ড, URL এ f.category', (await p.$$('tbody tr')).length === 1 && decodeURIComponent(p.url()).includes('f.category=গাভী'), decodeURIComponent(p.url()))
  await p.select('#ff-category', '')
  await settle(p)

  // ক্যাটাগরির বানান একীকরণ
  await p.evaluate(() => document.querySelector('details summary')?.click())
  await sleep(200)
  s = await text(p)
  ok('"ক্যাটাগরির মান ও বানান": গাভী · ১, গাভি · ১, কাছাকাছি বানান পাশাপাশি', s.includes('কাছাকাছি বানান') && /«গাভী» \(১\) · «গাভি» \(১\)|«গাভি» \(১\) · «গাভী» \(১\)/.test(s))
  await clickText(p, 'details button', 'এক বানানে আনুন')
  await sleep(200)
  ok('"এক বানানে আনুন" → নিশ্চিতকরণ (কোন বানান থাকবে)', (await dlgText(p)).includes('কোন বানান থাকবে'))
  before = writes.length
  await clickText(p, '[role="dialog"] button', 'হ্যাঁ, এক বানানে আনুন')
  await settle(p)
  const ren = writes.slice(before).find((w) => w.path === '/rest/v1/rpc/project_field_rename_value')
  ok('project_field_rename_value (demo, category) ডাকা হয়; পরে একটিই বানান', !!ren && ren.body.p_project === 'demo' && ren.body.p_key === 'category' && new Set(demoRecs.map((r) => r.extra.category)).size === 1, ren && JSON.stringify(ren.body))

  // এডিট: গোপন মান আসে; বদল না হলে beneficiary_private এ যায় না
  await p.goto(BASE + '/admin/records/demo/1/edit', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const mobileVal = await p.evaluate(async () => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === 'মোবাইল নম্বর')
    return l ? document.getElementById(l.htmlFor).value : null
  })
  ok('এডিট: গোপন মোবাইল নম্বর ফর্মে আসে; টাকা "120000"', mobileVal === '01711000000' && (await p.$eval(`[id="${amountId}"]`, (e) => e.value)) === '120000', String(mobileVal))
  await fill('টাকা', '১,৫০,০০০')
  before = writes.length
  await clickText(p, 'button', 'সংরক্ষণ করুন')
  await settle(p)
  const patch1 = writes.slice(before).find((w) => w.method === 'PATCH' && w.path === '/rest/v1/housing_beneficiaries')
  ok('এডিট সংরক্ষণ: extra এ নতুন টাকা 150000, ক্যাটাগরি অক্ষত; গোপন মান না বদলালে পাঠানো হয় না', patch1?.body.extra?.amount === 150000 && !!patch1.body.extra.category && !writes.slice(before).some((w) => w.path === '/rest/v1/beneficiary_private'), patch1 && JSON.stringify(patch1.body.extra))

  // এক্সপোর্ট: গোপন ফিল্ড আছে → জিজ্ঞাসা
  await p.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await clickText(p, 'button', 'সিরিয়াল সহ এক্সপোর্ট (CSV)')
  await sleep(200)
  ok('গোপন ফিল্ড থাকায় এক্সপোর্টের আগে জিজ্ঞাসা (ডিফল্ট: গোপন ছাড়া)', (await dlgText(p)).includes('গোপন কলামসহ এক্সপোর্ট করবেন?') && (await p.evaluate(() => document.querySelector('input[name="export-private"]')?.checked)) === true)
  await clickText(p, '[role="dialog"] button', 'এক্সপোর্ট করুন')
  await settle(p)
  await sleep(300)
  let d = await p.evaluate(() => window.__downloads.at(-1))
  const lines = (d?.text ?? '').split('\r\n')
  ok('CSV: UTF-8 BOM, হেডার বাংলা লেবেলে (সিরিয়াল, অনুদানের সাল, …, উপকরণের ক্যাটাগরি, টাকা)', d?.bom === '239,187,191' && lines[0].startsWith('সিরিয়াল,অনুদানের সাল,উপকারভোগীর নাম') && lines[0].includes('ইউনিয়ন/পৌরসভা') && lines[0].includes('উপকরণের ক্যাটাগরি') && lines[0].includes(',টাকা'), lines[0]?.slice(0, 160))
  ok('গোপন ছাড়া: মোবাইলের কলাম ও মান নেই; ফাইলের নাম demo-YYYY-MM-DD.csv', !lines[0].includes('মোবাইল') && !d.text.includes('01711000000') && /^demo-\d{4}-\d{2}-\d{2}\.csv$/.test(d.name), d?.name)
  ok('"=1+1" নামের আগে \' (Excel এ ফর্মুলা চলে না); টাকা সাধারণ সংখ্যা 150000', lines[1]?.includes(",'=1+1,") && lines[1].includes(',150000,'), lines[1]?.slice(0, 160))
  await clickText(p, 'button', 'সিরিয়াল সহ এক্সপোর্ট (CSV)')
  await sleep(200)
  await p.evaluate(() => [...document.querySelectorAll('input[name="export-private"]')][1]?.click())
  before = writes.length
  await clickText(p, '[role="dialog"] button', 'এক্সপোর্ট করুন')
  await settle(p)
  await sleep(300)
  d = await p.evaluate(() => window.__downloads.at(-1))
  ok('গোপনসহ: "মোবাইল নম্বর" কলাম ও মান, ফাইলের নামে "-private"', d?.text?.split('\r\n')[0].includes('মোবাইল নম্বর') && d.text.includes('01711000000') && /-private\.csv$/.test(d.name), d?.name)
  const logged = writes.slice(before).find((w) => w.path === '/rest/v1/rpc/housing_log_event')
  ok('এক্সপোর্ট লগে যায় (records_export, মান নয়)', !logged || (JSON.stringify(logged.body).includes('records_export') && !JSON.stringify(logged.body).includes('01711000000')), logged && JSON.stringify(logged.body).slice(0, 120))
  await p.screenshot({ path: '.smoke/admin-records-demo.png', fullPage: true })

  // বাল্ক ডিলেট (মূল এডমিন)
  await p.evaluate(() => document.querySelector('thead input[type="checkbox"]')?.click())
  await sleep(100)
  await clickText(p, 'button', 'নির্বাচিতগুলো মুছুন')
  await sleep(200)
  before = writes.length
  await clickText(p, '[role="dialog"] button', 'হ্যাঁ, সব মুছুন')
  await settle(p)
  ok('বাল্ক ডিলেট (মূল এডমিন): ২টি DELETE, তালিকা খালি', writes.slice(before).filter((w) => w.method === 'DELETE' && w.path === '/rest/v1/housing_beneficiaries').length === 2 && (await text(p)).includes('এখনো কোনো রেকর্ড নেই'))
  ok('রেকর্ড-পাতা/ফর্মে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()

  // সাধারণ এডমিন: মোছার বোতাম নেই
  adminRole = 'admin'
  demoRecs.push({ ...JSON.parse(JSON.stringify(post2?.body ?? {})), id: '00000000-0000-0000-0000-00000000d999', serial_no: 7, union_name: '', extra: { amount: 1, category: 'ছাগল' }, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts, project_type: 'demo', year: 2025, name: 'ক', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার', father_or_husband_name: '', address: '' })
  const q = await newPage()
  await q.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(q)
  await q.evaluate(() => document.querySelector('thead input[type="checkbox"]')?.click())
  await sleep(100)
  const btns = await q.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()))
  ok('সাধারণ এডমিন: "ডিলেট" ও "নির্বাচিতগুলো মুছুন" নেই, "এডিট" আছে', !btns.includes('ডিলেট') && !btns.includes('নির্বাচিতগুলো মুছুন') && (await text(q)).includes('এডিট'), btns.filter((b) => /মুছুন|ডিলেট/.test(b)).join(','))
  await q.close()
  adminRole = 'main_admin'
  demoRecs.length = 0

  // ফোন: রেকর্ড-কার্ডে কাস্টম ফিল্ড ও পাতার মোট
  demoRecs.push({ id: '00000000-0000-0000-0000-00000000d998', serial_no: 8, union_name: 'করেরহাট', extra: { amount: 25000, category: 'গাভী', item_name: 'দুগ্ধবতী গাভী' }, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts, project_type: 'demo', year: 2025, name: 'রহিমা', division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila: 'মীরসরাই', father_or_husband_name: '', address: '' })
  const m = await newPage(390, true)
  await m.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(m)
  const ms = await text(m)
  const over = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  ok('৩৯০px: কার্ডে "উপকরণের ক্যাটাগরি: গাভী", "টাকা: ৳ ২৫,০০০", পাতার মোট; ওভারফ্লো নেই', ms.includes('উপকরণের ক্যাটাগরি: গাভী') && ms.includes('টাকা: ৳ ২৫,০০০') && ms.includes('এই পাতার মোট') && !over, ms.slice(0, 200))
  await m.screenshot({ path: '.smoke/admin-records-demo-390.png', fullPage: true })
  await m.close()
  demoRecs.length = 0
}

// ---------------------------------------------------------------- J. ঘর নির্মাণের ইম্পোর্ট-প্রিভিউ — স্ক্রিনশট (M-ধাপ ১১: আগের সাথে মেলানো; কিছু চালানো হয় না)
const SEMI_CSV = [
  'ক্রমিক,সাল,উপকারভোগীর নাম,পিতা/স্বামীর নাম,বিভাগ,জেলা,উপজেলা,গ্রাম/ঠিকানা,পূর্বের ঘরের ছবি (লিঙ্ক),বর্তমান ঘরের ছবি (লিঙ্ক)',
  '101,২০২৪,রহিম উদ্দিন,করিম উদ্দিন,চট্টগ্রাম,চট্টগ্রাম,মীরসরাই,করেরহাট,https://sp/1,',
  '102,,জোসনা বেগম,আব্দুল বারিক,,,,ভবানী,,https://sp/2',
  '103,২০২৪,সাজেদা আক্তার,সিরাজুল ইসলাম,চট্টগ্রাম,চট্রগ্রাম,মিরসরাই,ধুম,,',
  '104,২০২৪,রহিম উদ্দিন,করিম উদ্দিন,চট্টগ্রাম,চট্টগ্রাম,মীরসরাই,,,',
  '105,২০২৪,আনোয়ার,হাসান,চট্টগ্রাম,চট্টগ্রাম,মীরশ্বরাই,,,',
  ',৩০২৪,,,ঢাকা,গাজীপুর,,,,',
].join('\r\n')
fs.writeFileSync('.smoke/import-semi.csv', '﻿' + SEMI_CSV + '\r\n')
for (const [w, mobile] of [[1280, false], [390, true]]) {
  const p = await newPage(w, mobile)
  await p.goto(BASE + '/admin/import?project=semi_pucca', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const input = await p.$('#imp-file')
  await input.uploadFile('.smoke/import-semi.csv')
  await settle(p)
  await p.screenshot({ path: `.smoke/admin-import-semi-${w}.png`, fullPage: true })
  ok(`ঘর নির্মাণের ইম্পোর্ট-প্রিভিউ (${w}px) — ৬ সারি, কোনো page error নেই`, (await text(p)).includes('মোট ৬') && p.errors.length === 0, p.errors.join(' | ') || (await text(p)).match(/মোট \S+/)?.[0])
  await p.close()
}

// ---------------------------------------------------------------- K. জেনেরিক ইম্পোর্ট — পরীক্ষা প্রকল্প (M-ধাপ ১১; সব লেখা নকল-ভাণ্ডারে)
{
  demoRecs.length = 0
  for (const k of Object.keys(demoPrivate)) delete demoPrivate[k]
  // ২৫ সারি: শীটের শিরোনাম বিকল্প নামে ("ক্যাটাগরি", "টাকার পরিমাণ", "উপকরণ"), সাল/ঠিকানা একবার লিখে নিচে খালি (ফিল-ডাউন)
  const head = 'সাল,উপকারভোগীর নাম,পিতা/স্বামীর নাম,বিভাগ,জেলা,উপজেলা,ইউনিয়ন,ক্যাটাগরি,উপকরণ,টাকার পরিমাণ,মোবাইল নম্বর'
  const cats = ['গাভী', 'গাভি', 'ছাগল', 'সেলাই মেশিন', 'গাভী']
  const body25 = Array.from({ length: 25 }, (_, i) => {
    const first = i === 0
    const amount = i === 3 ? 'এক লাখ' : i % 2 ? '১,২০,০০০' : '১২০০০০/-'
    const union = i === 4 ? 'মীরসরাই পৌরসভা' : i === 5 ? 'করেরহাট ইউনিয়ন' : 'করেরহাট'
    // কমা থাকা ঘর (যেমন "১,২০,০০০") CSV তে উদ্ধৃতিতে
    return [first ? '২০২৫' : '', `উপকারভোগী ${i + 1}`, `পিতা ${i + 1}`, first ? 'চট্টগ্রাম' : '', first ? 'চট্টগ্রাম' : '', first ? 'মীরসরাই' : '', union, cats[i % 5], i % 3 ? 'দুগ্ধবতী' : '', amount, i === 1 ? '০১৭১১০০০০০১' : ''].map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')
  })
  fs.writeFileSync('.smoke/import-demo.csv', '﻿' + [head, ...body25].join('\r\n') + '\r\n')

  const p = await newPage()
  const cdp = await p.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
  await p.evaluateOnNewDocument(() => {
    window.__downloads = []
    const orig = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (b) => {
      const entry = { name: '', text: null }
      window.__downloads.push(entry)
      b.text().then((t) => (entry.text = t))
      return orig(b)
    }
    HTMLAnchorElement.prototype.click = function () {
      const d = window.__downloads.at(-1)
      if (d && this.download) d.name = this.download
    }
  })
  const mapOf = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('select[aria-label$="কলামের ফিল্ড"]')].map((s) => [s.getAttribute('aria-label').replace(/^"|" কলামের ফিল্ড$/g, ''), s.value])))
  const upload = async (file) => {
    const input = await p.$('#imp-file')
    await input.uploadFile(file)
    await settle(p)
  }
  await p.goto(BASE + '/admin/import?project=demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  ok('ইম্পোর্টের প্রকল্প-তালিকা রেজিস্ট্রি থেকে (খসড়া "পরীক্ষা প্রকল্প" সহ)', (await p.$eval('#imp-project', (s) => [...s.options].map((o) => o.textContent).join('|'))).includes('পরীক্ষা প্রকল্প (খসড়া)') && (await p.$eval('#imp-project', (s) => s.value)) === 'demo')
  await upload('.smoke/import-demo.csv')
  const m = await mapOf()
  ok('কলাম নিজে মেলে: বিকল্প নামে ক্যাটাগরি/উপকরণ/টাকা, ইউনিয়ন, গোপন মোবাইল', m['ক্যাটাগরি'] === 'x.category' && m['উপকরণ'] === 'x.item_name' && m['টাকার পরিমাণ'] === 'x.amount' && m['ইউনিয়ন'] === 'union_name' && m['মোবাইল নম্বর'] === 'x.mobile' && m['সাল'] === 'year', JSON.stringify(m))
  let s = await text(p)
  ok('প্রিভিউ: মোট ২৫, ভুল ১ (টাকা "এক লাখ"), ফিল-ডাউনে সাল/বিভাগ/জেলা/উপজেলা ভরা (২৪ × ৪ = ৯৬)', s.includes('মোট ২৫') && s.includes('ভুল ১ (বাদ যাবে)') && s.includes('«টাকা»: শুধু সংখ্যা দিন') && /৯৬ টি ঘর ভরা হয়েছে/.test(s), s.match(/\S+ টি ঘর ভরা হয়েছে/)?.[0])
  const badCell = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].some((tr) => tr.className.includes('bg-red-50') && [...tr.querySelectorAll('span')].some((x) => x.className.includes('bg-red-100') && x.textContent === 'এক লাখ')))
  ok('ভুল টাকার ঘর লাল চিহ্নিত', badCell)
  const moneyHits = (s.match(/৳\s১,২০,০০০/g) ?? []).length
  const row2 = await p.evaluate(() => document.querySelector('tbody tr')?.innerText.replace(/\s+/g, ' ') ?? '')
  ok('টাকা পার্স: "১,২০,০০০" ও "১২০০০০/-" → ৳ ১,২০,০০০', moneyHits >= 20, `${moneyHits} · ${row2}`)
  ok('ইউনিয়ন: "করেরহাট ইউনিয়ন" → তালিকার বানান; "মীরসরাই পৌরসভা" ঐচ্ছিক (হলুদ) প্যানেলে', s.includes('ইউনিয়নের বানান তালিকা অনুযায়ী: "করেরহাট"') && s.includes('ইউনিয়ন তালিকায় নেই (১ টি)') && s.includes('"মীরসরাই পৌরসভা"'))
  const totalBefore = Number((s.match(/মোট ক্যাটাগরি \(ইম্পোর্টের পর\): (\S+)/)?.[1] ?? '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)))
  ok('ক্যাটাগরির মান: শীটের মান ও সারির সংখ্যা, "গাভী"/"গাভি" পাশাপাশি', s.includes('ক্যাটাগরির মান (ঐচ্ছিক যাচাই — ইম্পোর্ট আটকায় না)') && s.includes('কাছাকাছি বানান') && totalBefore === 4, String(totalBefore))
  await clickText(p, 'button', 'এক বানানে আনুন: «গাভী»')
  await sleep(200)
  s = await text(p)
  const totalAfter = Number((s.match(/মোট ক্যাটাগরি \(ইম্পোর্টের পর\): (\S+)/)?.[1] ?? '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)))
  ok('"এক বানানে আনুন" → "মোট ক্যাটাগরি" এক কমে (৪ → ৩), «গাভি» → «গাভী»', totalAfter === 3 && s.includes('«গাভি» → «গাভী»'), `${totalBefore} → ${totalAfter}`)
  await p.screenshot({ path: '.smoke/admin-import-demo.png', fullPage: true })
  let before = writes.length
  await clickText(p, 'button', '২৪ টি সারি যোগ করুন')
  await settle(p)
  const ins = writes.slice(before).filter((w) => w.method === 'POST' && w.path === '/rest/v1/housing_beneficiaries')
  const priv = writes.slice(before).find((w) => w.path === '/rest/v1/rpc/housing_bulk_update_by_serial')
  const cats2 = new Set(demoRecs.map((r) => r.extra.category))
  const btnTexts = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => `${b.textContent.trim()}${b.disabled ? '[x]' : ''}`).filter((x) => /সারি/.test(x)).join(' | '))
  const summary = ((await text(p)).match(/সারসংক্ষেপ[\s\S]{0,300}/)?.[0] ?? '').replace(/\n/g, ' ⏎ ')
  ok('ইম্পোর্ট: ২৪টি রেকর্ড; ক্যাটাগরি শীটের মতোই (এক-বানানসহ), টাকা সংখ্যায়, ইউনিয়ন', ins.length === 1 && demoRecs.length === 24 && [...cats2].sort().join(',') === ['গাভী', 'ছাগল', 'সেলাই মেশিন'].sort().join(',') && demoRecs.every((r) => r.extra.amount === 120000) && demoRecs.find((r) => r.name === 'উপকারভোগী 6')?.union_name === 'করেরহাট' && demoRecs.find((r) => r.name === 'উপকারভোগী 5')?.union_name === 'মীরসরাই পৌরসভা', `${demoRecs.length} ${[...cats2].join("/")} · ${btnTexts} · ${summary}`)
  ok('গোপন মোবাইল আলাদা পাঠানো (সিরিয়াল ধরে), রেকর্ডের extra তে নেই', !!priv && priv.body.p_rows.length === 1 && priv.body.p_rows[0].extra.mobile === '01711000001' && !demoRecs.some((r) => 'mobile' in r.extra) && Object.values(demoPrivate).some((d) => d.mobile === '01711000001'), priv && JSON.stringify(priv.body.p_rows))
  s = await text(p)
  ok('সারসংক্ষেপ: সফল ২৪, ব্যর্থ/বাদ ১', s.includes('সফল: ২৪') && s.includes('ব্যর্থ/বাদ: ১'))
  await clickText(p, 'button', 'ব্যর্থদের তালিকা CSV ডাউনলোড')
  await sleep(300)
  const failed = await p.evaluate(() => window.__downloads.at(-1))
  ok('ব্যর্থ সারির CSV (সারি ৫, কারণসহ)', /^import-failed-demo\.csv$/.test(failed?.name ?? '') && failed.text.includes('শুধু সংখ্যা দিন') && failed.text.split('\r\n')[1]?.startsWith('5,'), failed?.name)

  // আপডেট মোড: শুধু টাকা কলাম, একটি সারিতে (মুছুন)
  const serials = demoRecs.map((r) => r.serial_no).sort((a, b) => a - b)
  const [s1, s2, s3] = serials
  const name2 = demoRecs.find((r) => r.serial_no === s2).name
  fs.writeFileSync('.smoke/import-demo-update.csv', '﻿' + ['সিরিয়াল,টাকা,উপকরণের নাম/বিবরণ', `${s1},২,০০,০০০,`.replace('২,০০,০০০', '"২,০০,০০০"'), `${s2},,(মুছুন)`, `${s3},(মুছুন),`, '9999,৫০০,'].join('\r\n') + '\r\n')
  await p.goto(BASE + '/admin/import?project=demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await p.evaluate(() => [...document.querySelectorAll('input[name="mode"]')][1].click())
  await sleep(100)
  s = await text(p)
  ok('আপডেট মোডে নিয়মের ছোট ব্যাখ্যা (শুধু সিরিয়াল আবশ্যক, খালি = অপরিবর্তিত, (মুছুন))', s.includes('"সিরিয়াল ধরে আপডেট" এর নিয়ম') && s.includes('খালি ঘর = অপরিবর্তিত') && s.includes('ঘরে লিখুন (মুছুন)'))
  await upload('.smoke/import-demo-update.csv')
  s = await text(p)
  ok('আপডেট: সাল/নাম/ঠিকানা ম্যাপ না থাকলেও চলে; আবশ্যক টাকা "(মুছুন)" → ভুল', !s.includes('আবশ্যক ফিল্ড ম্যাপ হয়নি') && s.includes('«টাকা» আবশ্যক — মোছা যায় না') && s.includes('ভুল ১ (বাদ যাবে)'))
  ok('আপডেটে ফিল-ডাউনের বিকল্প নেই (খালি = অপরিবর্তিত)', !s.includes('ঘরে উপরের সারির মান ধরুন'))
  const before2 = JSON.parse(JSON.stringify(demoRecs))
  before = writes.length
  await clickText(p, 'button', '৩ টি সারি আপডেট করুন')
  await settle(p)
  const up = writes.slice(before).find((w) => w.path === '/rest/v1/rpc/housing_bulk_update_by_serial')
  const rowsSent = up?.body.p_rows ?? []
  ok('পাঠানো হয় শুধু ম্যাপ করা ও খালি নয় এমন ঘর: {serial, extra.amount} · {serial, _clear: [extra.item_name]} · ৯৯৯৯ (মেলেনি)', JSON.stringify(rowsSent) === JSON.stringify([{ serial_no: s1, extra: { amount: 200000 } }, { serial_no: s2, _clear: ['extra.item_name'] }, { serial_no: 9999, extra: { amount: 500 } }]), JSON.stringify(rowsSent))
  const r1 = demoRecs.find((r) => r.serial_no === s1)
  const r2 = demoRecs.find((r) => r.serial_no === s2)
  const b1 = before2.find((r) => r.serial_no === s1)
  ok('আপডেটের পর: শুধু টাকা বদলায়, নাম/ক্যাটাগরি/ইউনিয়ন অক্ষত; "(মুছুন)" দেওয়া মানটিই মোছে', r1.extra.amount === 200000 && r1.name === b1.name && r1.extra.category === b1.extra.category && r1.union_name === b1.union_name && !('item_name' in r2.extra) && r2.name === name2 && r2.extra.amount === 120000)
  s = await text(p)
  ok('সিরিয়াল ৯৯৯৯ মেলেনি → "সিরিয়াল মিলেনি" তালিকায়', s.includes('সিরিয়াল মিলেনি (আপডেট হয়নি): ১'))

  // এক্সপোর্ট → আবার ইম্পোর্ট: সব শিরোনাম নিজে মেলে
  await p.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await clickText(p, 'button', 'সিরিয়াল সহ এক্সপোর্ট (CSV)')
  await sleep(200)
  await clickText(p, '[role="dialog"] button', 'এক্সপোর্ট করুন')
  await settle(p)
  await sleep(300)
  const exp = await p.evaluate(() => window.__downloads.at(-1))
  fs.writeFileSync('.smoke/import-demo-export.csv', '﻿' + exp.text)
  await p.goto(BASE + '/admin/import?project=demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await upload('.smoke/import-demo-export.csv')
  const em = await mapOf()
  const unmapped = Object.entries(em).filter(([, v]) => !v).map(([h]) => h)
  const infoCols = ['উপকরণসহ ছবি (সিস্টেম URL)', 'ছবি আপডেট', 'রেকর্ড আইডি']
  ok('এক্সপোর্ট করা CSV আবার দিলে সব শিরোনাম নিজে মেলে (শুধু তথ্য-কলাম উপেক্ষা, জানিয়ে)', unmapped.sort().join('|') === infoCols.sort().join('|') && (await text(p)).includes('এক্সপোর্টের তথ্য-কলাম উপেক্ষা করা হলো'), `${Object.keys(em).length} কলাম; না-মেলা: ${unmapped.join(', ')}`)
  ok('এক্সপোর্ট→ইম্পোর্ট: টাকা/ক্যাটাগরি/ইউনিয়ন ঠিক পড়ে (ভুল ০)', (await text(p)).includes('ভুল') === false || !(await text(p)).includes('(বাদ যাবে)'), (await text(p)).match(/ভুল \S+ \(বাদ যাবে\)/)?.[0])
  ok('ইম্পোর্ট-পাতায় কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
  demoRecs.length = 0
}

// ---------------------------------------------------------------- L. ছবি বাল্ক — যেকোনো প্রকল্প (M-ধাপ ১২)
{
  const ts = new Date().toISOString()
  const rec = (serial, name, extra = {}) => ({ id: `00000000-0000-0000-0000-00000000e${String(serial).padStart(3, '0')}`, project_type: 'demo', serial_no: serial, year: 2025, name, father_or_husband_name: '', division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila: 'মীরসরাই', union_name: '', address: '', extra: { category: 'গাভী', amount: 1 }, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts, ...extra })
  demoRecs.length = 0
  demoRecs.push(rec(1, 'রহিমা'), rec(2, 'করিম'))
  // ১×১ PNG (ব্রাউজারে কম্প্রেস করা যায়) — নাম .jpg হলেও চলে
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  fs.mkdirSync('.smoke/photos', { recursive: true })
  const files = ['demo_0001.jpg', 'demo_0002_prev.jpg', 'semi_0001_prev.jpg', 'xyz_0001.jpg'].map((n) => {
    fs.writeFileSync(`.smoke/photos/${n}`, png)
    return `.smoke/photos/${n}`
  })
  const p = await newPage()
  await p.goto(BASE + '/admin/photos?project=demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  let s = await text(p)
  ok('ছবি বাল্ক: প্রকল্প রেজিস্ট্রি থেকে (খসড়া demo), উদাহরণ "demo_0001.jpg", শুধু-পরের নোট', (await p.$eval('#bulk-project', (x) => x.value)) === 'demo' && s.includes('demo_0001.jpg') && s.includes('এই প্রকল্পে শুধু পরের ছবি ("উপকরণসহ ছবি")'), s.match(/ফাইলনাম:[^\n]*/)?.[0])
  const input = await p.$('input[type="file"]')
  await input.uploadFile(...files)
  await settle(p)
  s = await text(p)
  const rowText = (name) => p.evaluate((n) => [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(n))?.innerText.replace(/\s+/g, ' ') ?? '', name)
  ok('"demo_0001.jpg" (আগে/পরে নেই) → শুধু-পরে প্রকল্পে পরের ছবি "উপকরণসহ ছবি", রেকর্ড "রহিমা"', (await rowText('demo_0001.jpg')).includes('উপকরণসহ ছবি') && (await rowText('demo_0001.jpg')).includes('রহিমা'), await rowText('demo_0001.jpg'))
  ok('শুধু-পরে প্রকল্পে "_prev" ফাইল লাল: "এই প্রকল্পে শুধু পরের ছবি — "_prev" ফাইল চলবে না"', (await rowText('demo_0002_prev.jpg')).includes('"_prev" ফাইল চলবে না') && (await p.evaluate(() => [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('demo_0002_prev.jpg')).className.includes('bg-red-50'))), await rowText('demo_0002_prev.jpg'))
  ok('"semi_0001_prev.jpg" → সেমিপাকা #১, আগের ছবি আছে → "ওভাররাইট হবে" ব্যাজ', (await rowText('semi_0001_prev.jpg')).includes('ওভাররাইট হবে') && s.includes('ওভাররাইট হবে ১'), await rowText('semi_0001_prev.jpg'))
  ok('অচেনা প্রিফিক্স "xyz_0001.jpg" → ফাইলনাম বোঝা যায়নি; গণনা: মিলেছে ২, ভুল ঘর ১', (await rowText('xyz_0001.jpg')).includes('ফাইলনাম বোঝা যায়নি') && s.includes('মিলেছে ২') && s.includes('ভুল ছবির ঘর ১'))
  let before = writes.length
  await clickText(p, 'button', 'নিশ্চিত: ২টি আপলোড (১টি ওভাররাইট)')
  await sleep(200)
  const dlg = await dlgText(p)
  ok('ওভাররাইট থাকলে আপলোডের আগে নিশ্চিতকরণ (কোনটি ওভাররাইট হবে তা দেখায়)', dlg.includes('১টি ছবি ওভাররাইট হবে') && dlg.includes('সেমিপাকা ঘর নির্মাণ · সিরিয়াল ১'), dlg.slice(0, 160))
  await clickText(p, '[role="dialog"] button', 'বাতিল')
  await sleep(200)
  ok('"বাতিল" → কিছুই আপলোড হয় না (ঘর নির্মাণের ছবি অক্ষত)', writes.length === before && !(await p.$('[role="dialog"]')) && (await text(p)).includes('নিশ্চিত: ২টি আপলোড'))
  // ঘর নির্মাণের ফাইল বাদ দিয়ে শুধু demo আপলোড (নকল স্টোরেজে)
  await p.evaluate(() => [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('semi_0001_prev.jpg'))?.querySelector('button[aria-label="তালিকা থেকে বাদ দিন"]')?.click())
  await sleep(200)
  before = writes.length
  const ev0 = logEvents.length
  await clickText(p, 'button', '১টি ছবি আপলোড করুন')
  await p.waitForFunction(() => document.body.innerText.includes('সফল ১'), { timeout: 20000 }).catch(() => {})
  await settle(p)
  const w = writes.slice(before)
  ok('শুধু demo #১ এর পরের ছবি আপলোড: স্টোরেজ housing/demo/0001/current(_thumb).webp, রেকর্ডে url; ঘর নির্মাণে কোনো লেখা নয়', w.filter((x) => x.path.startsWith('/storage/v1/object/housing-photos/housing/demo/0001/current')).length === 2 && !w.some((x) => x.path.includes('semi_pucca')) && demoRecs[0].current_photo_url?.includes('/housing/demo/0001/current.webp'), w.map((x) => `${x.method} ${x.path}`).join(', '))
  const ev = logEvents.slice(ev0).filter((x) => x?.p_action === 'photo_bulk_run')
  ok('photo_bulk_run লগ প্রকল্প ধরে আলাদা (demo: সফল ১)', ev.length === 1 && ev[0].p_project_type === 'demo' && ev[0].p_details?.done === 1, JSON.stringify(ev))
  await p.screenshot({ path: '.smoke/admin-photos-demo.png', fullPage: true })
  ok('ছবি বাল্ক পাতায় কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
  demoRecs.length = 0
}

// ---------------------------------------------------------------- M. একটিভিটি লগ — ফিল্ডের লেবেল, টাকা, কনফিগ-বদল (M-ধাপ ১২)
{
  const at = new Date().toISOString()
  const base = { actor_id: null, actor_email: 'ui-test@example.org', at, record_id: null, serial_no: null, record_name: null }
  fakeLog.push(
    { ...base, id: 9, action: 'update', project_type: 'demo', record_id: '00000000-0000-0000-0000-00000000e001', serial_no: 1, record_name: 'রহিমা', details: { changes: { 'extra.amount': { old: 50000, new: 60000 }, 'extra.category': { old: 'গাভি', new: 'গরু' }, 'extra.zzz_unknown': { old: 'ক', new: 'খ' }, union_name: { old: '', new: 'করেরহাট' } }, photo_kinds: [] } },
    { ...base, id: 8, action: 'category_merge', project_type: 'demo', details: { field: 'category', from: 'গাভি', to: 'গরু', records: 3 } },
    { ...base, id: 7, action: 'field_update', project_type: 'demo', record_name: 'টাকা', details: { field_key: 'amount', changes: { show_in_table: { old: false, new: true }, label_en: { old: '', new: 'Amount' } } } },
    { ...base, id: 6, action: 'project_update', project_type: 'demo', record_name: 'পরীক্ষা প্রকল্প', details: { changes: { photo_mode: { old: 'before_after', new: 'after_only' }, stat_cards: { old: [], new: [{}] } } } },
    { ...base, id: 5, action: 'private_update', project_type: 'demo', record_id: '00000000-0000-0000-0000-00000000e001', serial_no: 1, record_name: 'রহিমা', details: { fields: ['mobile'], masked: true } },
    { ...base, id: 4, action: 'photo_bulk_run', project_type: 'demo', details: { rows: 2, done: 1, failed: 0, overwrite: 0 } },
  )
  const p = await newPage()
  await p.goto(BASE + '/admin/activity', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const s = await text(p)
  ok('লগে টাকার বদল: "টাকা: ৳ ৫০,০০০ → ৳ ৬০,০০০"', /টাকা:\s*৳\s৫০,০০০\s*→\s*৳\s৬০,০০০/.test(s), s.match(/টাকা:[^\n]{0,40}/)?.[0])
  ok('ফিল্ডের লেবেল সংজ্ঞা থেকে ("উপকরণের ক্যাটাগরি: গাভি → গরু", "ইউনিয়ন/পৌরসভা"); অচেনা হলে কাঁচা key', s.includes('উপকরণের ক্যাটাগরি: গাভি → গরু') && s.includes('ইউনিয়ন/পৌরসভা: — → করেরহাট') && s.includes('extra.zzz_unknown: ক → খ'))
  ok('ক্যাটাগরির এক-বানান লগে: «গাভি» → «গরু» · ৩টি রেকর্ড', s.includes('«গাভি» → «গরু» · ৩টি রেকর্ড'))
  ok('ফিল্ডের সেটিং-বদল: «টাকা» · টেবিলে: না → হ্যাঁ, লিংক সেটিংসে', s.includes('ফিল্ড «টাকা»') && s.includes('টেবিলে: না → হ্যাঁ') && !!(await p.$('a[href="/admin/projects/demo?tab=fields"]')))
  ok('প্রকল্পের সেটিং-বদল: ছবি মোড আগে-পরে → শুধু পরে; স্ট্যাট কার্ড (বদলেছে)', s.includes('ছবি মোড: আগে-পরে → শুধু পরে') && s.includes('স্ট্যাট কার্ড: (বদলেছে) → (বদলেছে)'))
  ok('গোপন মান: শুধু ফিল্ডের নাম ("🔒 মোবাইল নম্বর"), মান নয়', s.includes('🔒 মোবাইল নম্বর') && s.includes('মান লগে রাখা হয় না'))
  ok('রেকর্ডের লিংক /admin/records/demo/1/edit', !!(await p.$('a[href="/admin/records/demo/1/edit"]')))
  const opts = await p.evaluate(() => [...document.querySelectorAll('select[aria-label="প্রকল্প"] option')].map((o) => o.textContent))
  ok('প্রকল্প ফিল্টার ডাটাবেসের তালিকা থেকে (গ্রুপ, তার উপ-প্রকল্প, খসড়া demo)', opts.includes('ঘর নির্মাণ প্রকল্প') && opts.includes('↳ সেমিপাকা ঘর নির্মাণ') && opts.includes('পরীক্ষা প্রকল্প (খসড়া)'), opts.join(' | '))
  await p.screenshot({ path: '.smoke/admin-activity.png', fullPage: true })
  ok('লগ-পাতায় কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()
  fakeLog.length = 0
}

// ---------------------------------------------------------------- N. পাবলিক তালিকা — খসড়া demo (M-ধাপ ১৩): ঘর নির্মাণের একই পেইজ, অনুদান-ধরন
{
  const ts = new Date().toISOString()
  const rec = (serial, name, category, amount, upazila, union_name) => ({ id: `00000000-0000-0000-0000-00000000f${String(serial).padStart(3, '0')}`, project_type: 'demo', serial_no: serial, year: serial % 2 ? 2025 : 2024, name, father_or_husband_name: '', division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila, union_name, address: '', extra: { category, item_name: '', amount }, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts })
  demoRecs.length = 0
  demoRecs.push(
    rec(1, 'রহিমা', 'গাভী', 60000, 'মীরসরাই', 'করেরহাট'),
    rec(2, 'করিম', 'গাভী', 55000, 'মীরসরাই', 'ধুম'),
    rec(3, 'সালমা', 'গাভী', 65000, 'সীতাকুন্ড', 'বাড়বকুন্ড'),
    rec(4, 'জামাল', 'ছাগল', 20000, 'মীরসরাই', 'করেরহাট'),
    rec(5, 'আমেনা', 'ছাগল', 18000, 'সীতাকুন্ড', ''),
    rec(6, 'হাসান', 'সেলাই মেশিন', 12000, 'মীরসরাই', 'করেরহাট'),
    rec(7, 'রাশেদ', 'রিকশা', 45000, 'মীরসরাই', 'ধুম'),
    rec(8, 'ফাতেমা', 'হাঁস-মুরগি', 15000, 'সীতাকুন্ড', 'বাড়বকুন্ড'),
    rec(9, 'নূর', 'নৌকা', 80000, 'মীরসরাই', 'করেরহাট'),
    rec(10, 'সুমি', 'দোকান', 30000, 'মীরসরাই', 'ধুম'),
  )
  const total = demoRecs.reduce((a, r) => a + r.extra.amount, 0)
  const ascii = (s) => (s ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '')
  const params = (p) => Object.fromEntries(new URL(p.url()).searchParams)
  const rows = (p) => p.evaluate(() => document.querySelectorAll('table tbody tr').length)
  const selectByLabel = async (p, label, value) => {
    const id = await p.evaluate((x) => [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === x)?.htmlFor, label)
    if (!id) throw new Error('select not found: ' + label)
    await p.select(`[id="${id}"]`, value)
    await settle(p)
  }
  const optionsOf = (p, label) => p.evaluate((x) => { const l = [...document.querySelectorAll('label')].find((e) => e.textContent.trim() === x); const el = l && document.getElementById(l.htmlFor); return el ? { opts: [...el.options].map((o) => o.textContent), disabled: el.disabled } : null }, label)

  const p = await newPage(1280)
  const calls = []
  p.on('request', (r) => {
    const u = new URL(r.url())
    if (r.url().startsWith(SB) && r.method() !== 'OPTIONS' && u.pathname.startsWith('/rest/v1/')) calls.push(`${r.method()} ${u.pathname} ${u.search}${r.postData() ?? ''}`)
  })
  await p.goto(BASE + '/demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await sleep(1500) // count-up শেষ হোক
  let s = await text(p)
  ok('/demo (খসড়া, এডমিন প্রিভিউ): নাম ও খসড়া-ব্যানার; গ্রুপ নয় তাই সাব-নেভ নেই', s.includes('পরীক্ষা প্রকল্প') && s.includes('খসড়া') && !s.includes('সেমিপাকা ঘর নির্মাণ'))
  const moneyTxt = s.match(/মোট টাকা\s+([^\n]+)/)?.[1]
  ok('স্ট্যাট কার্ড: মোট টাকা ৳ (সব রেকর্ডের যোগফল), মোট ক্যাটাগরি ৭, মোট উপকারভোগী ১০', moneyTxt?.includes('৳') && Number(ascii(moneyTxt)) === total && /মোট ক্যাটাগরি\s+৭/.test(s) && /মোট উপকারভোগী\s+১০/.test(s), `${moneyTxt} (চাই ${total})`)
  // ক্যাটাগরি-চার্ট ব্যবহারকারীর সিদ্ধান্তে বাদ (২০২৬-১০-০৬)
  ok('ক্যাটাগরি-চার্ট নেই ("… অনুযায়ী" অংশ বা "আরো দেখুন (n)" নেই)', !(await p.$('section[aria-label$="অনুযায়ী"]')) && !/অনুযায়ী\n|আরো দেখুন \(/.test(s))
  const headers = await p.evaluate(() => [...document.querySelectorAll('table thead th')].map((th) => th.innerText.trim()))
  // M-ধাপ ১৭: ডিফল্ট ক্রম — নতুন সাল আগে, একই সালে সিরিয়াল (বিজোড় সিরিয়াল ২০২৫, জোড় ২০২৪)
  const order1 = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((tr) => tr.children[2]?.innerText.trim()))
  const wantOrder = [...demoRecs].sort((a, b) => b.year - a.year || a.serial_no - b.serial_no).map((r) => r.name)
  ok('ডিফল্ট ক্রম: নতুন সাল আগে (২০২৫ → ২০২৪), একই সালে সিরিয়াল ক্রমে', order1.join(',') === wantOrder.join(','), order1.join(', '))
  const lastList = calls.filter((c) => c.includes('housing_beneficiaries')).at(-1) ?? ''
  ok('তালিকার অনুরোধে order=year.desc,serial_no.asc', decodeURIComponent(lastList).includes('order=year.desc,serial_no.asc'), decodeURIComponent(lastList).slice(0, 160))
  ok('টেবিলের কলাম কনফিগ থেকে: অনুদানের সাল, ঠিকানা (মেলানো), ক্যাটাগরি, টাকা, উপকরণসহ ছবি', ['অনুদানের সাল', 'ঠিকানা', 'উপকরণের ক্যাটাগরি', 'টাকা', 'উপকরণসহ ছবি'].every((h) => headers.includes(h)), headers.join(' | '))
  ok('ঠিকানায় ইউনিয়ন (ডাটায় ইউনিয়ন আছে); টাকার ঘরে ৳', (await p.evaluate(() => document.querySelector('table tbody')?.innerText ?? '')).includes('করেরহাট') && (await p.evaluate(() => document.querySelector('table tbody')?.innerText ?? '')).includes('৳'))
  ok('মানচিত্র-প্যানেলের শিরোনামে প্রকল্পের একক ("উপকারভোগী কোথায় কোথায়")', s.includes('উপকারভোগী কোথায় কোথায়'), s.match(/[^\n]*কোথায় কোথায়[^\n]*/)?.[0])
  const kinds = [...new Set(calls.map((c) => c.split(' ').slice(0, 2).join(' ')).filter((c) => !/\/projects$|\/project_fields$|housing_current_admin/.test(c)))]
  ok('API কল শুধু ২ ধরনের: list (housing_beneficiaries) আর project_stats — আলাদা years/stats কল নেই', kinds.sort().join(',') === 'GET /rest/v1/housing_beneficiaries,POST /rest/v1/rpc/project_stats', kinds.join(', '))
  ok('একই অনুরোধ একবারই (StrictMode এর দ্বিগুণ বাদে): list ১, stats ১', new Set(calls.filter((c) => c.includes('housing_beneficiaries'))).size === 1 && new Set(calls.filter((c) => c.includes('project_stats'))).size === 1, calls.filter((c) => /housing_beneficiaries|project_stats/.test(c)).map((c) => c.slice(0, 90)).join(' || '))

  // ক্যাটাগরি-ড্রপডাউন → ?f_category=
  const catOpts = await optionsOf(p, 'উপকরণের ক্যাটাগরি')
  ok('ক্যাটাগরি-ড্রপডাউনে ডাটার ৭টি মান', catOpts?.opts.length === 8, JSON.stringify(catOpts?.opts))
  await selectByLabel(p, 'উপকরণের ক্যাটাগরি', 'ছাগল')
  ok('ড্রপডাউনে "ছাগল" → ?f_category=ছাগল, তালিকায় ২ জন', params(p).f_category === 'ছাগল' && (await rows(p)) === 2, `${JSON.stringify(params(p))} rows=${await rows(p)}`)
  // ফিল্টার অনুযায়ী পরিসংখ্যান (SQL ১৫): কার্ড বদলায়, ওপরে ছোট লেখা; ড্রপডাউনের বিকল্প মোট থেকেই
  await sleep(1500)
  s = await text(p)
  const goat = demoRecs.filter((r) => r.extra?.category === 'ছাগল')
  const goatSum = goat.reduce((a, r) => a + (r.extra?.amount ?? 0), 0)
  const moneyF = s.match(/মোট টাকা\s+([^\n]+)/)?.[1]
  ok('ফিল্টার "ছাগল" → কার্ড: মোট উপকারভোগী ২, মোট টাকা = ছাগলের যোগফল, মোট ক্যাটাগরি ১; "পরিসংখ্যান: বাছাই করা ফিল্টার অনুযায়ী"', /মোট উপকারভোগী\s+২/.test(s) && Number(ascii(moneyF ?? '')) === goatSum && /মোট ক্যাটাগরি\s+১(?!\d|[০-৯])/.test(s) && s.includes('পরিসংখ্যান: বাছাই করা ফিল্টার অনুযায়ী'), `${moneyF} (চাই ${goatSum})`)
  ok('RPC project_stats_filtered এ p_filters = {fields:{category:"ছাগল"}} (তালিকার একই ফিল্টার)', JSON.stringify(filteredCalls.at(-1)) === JSON.stringify({ fields: { category: 'ছাগল' } }), JSON.stringify(filteredCalls.at(-1)))
  ok('ফিল্টার দিলেও ক্যাটাগরি-ড্রপডাউনে সব ৭টি মান (মোট stats থেকে)', (await optionsOf(p, 'উপকরণের ক্যাটাগরি'))?.opts.length === 8)
  await selectByLabel(p, 'উপকরণের ক্যাটাগরি', '')
  ok('"সব" বাছলে ফিল্টার ওঠে (১০ জন)', !('f_category' in params(p)) && (await rows(p)) === 10)
  await sleep(1500)
  s = await text(p)
  ok('ফিল্টার উঠলে কার্ড আবার মোট (১০), "ফিল্টার অনুযায়ী" লেখা নেই', /মোট উপকারভোগী\s+১০/.test(s) && !s.includes('বাছাই করা ফিল্টার অনুযায়ী'))

  // ইউনিয়ন ফিল্টার: উপজেলা না বাছা পর্যন্ত বন্ধ; বিকল্প by_union থেকে
  let un = await optionsOf(p, 'ইউনিয়ন/পৌরসভা')
  ok('ইউনিয়ন-ড্রপডাউন আছে (ডাটায় ইউনিয়ন আছে), উপজেলা ছাড়া বন্ধ', un?.disabled === true, JSON.stringify(un))
  await selectByLabel(p, 'বিভাগ', 'চট্টগ্রাম')
  await selectByLabel(p, 'জেলা', 'চট্টগ্রাম')
  await selectByLabel(p, 'উপজেলা', 'মীরসরাই')
  un = await optionsOf(p, 'ইউনিয়ন/পৌরসভা')
  ok('মীরসরাই বাছলে ইউনিয়নের বিকল্প শুধু ডাটার: করেরহাট, ধুম', un?.disabled === false && un.opts.slice(1).sort().join(',') === ['করেরহাট', 'ধুম'].sort().join(','), JSON.stringify(un))
  await selectByLabel(p, 'ইউনিয়ন/পৌরসভা', 'করেরহাট')
  const wantU = demoRecs.filter((r) => r.union_name === 'করেরহাট').length
  ok(`ইউনিয়ন "করেরহাট" → ?union=করেরহাট, ${wantU} জন`, params(p).union === 'করেরহাট' && params(p).upazila === 'মীরসরাই' && (await rows(p)) === wantU, `${JSON.stringify(params(p))} rows=${await rows(p)}`)
  await selectByLabel(p, 'উপকরণের ক্যাটাগরি', 'গাভী')
  ok('ইউনিয়ন + উপকরণের ক্যাটাগরি "গাভী" একসাথে → ১ জন (রহিমা)', params(p).f_category === 'গাভী' && (await rows(p)) === 1 && (await p.evaluate(() => document.querySelector('table tbody').innerText)).includes('রহিমা'))
  await sleep(1500)
  ok('কার্ডও একই: মোট উপকারভোগী ১, উপজেলা ১ (বিভাগ+জেলা+উপজেলা+ইউনিয়ন+ক্যাটাগরি)', /মোট উপকারভোগী\s+১(?![০-৯])/.test(await text(p)) && JSON.stringify(filteredCalls.at(-1)) === JSON.stringify({ division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila: 'মীরসরাই', union_name: 'করেরহাট', fields: { category: 'গাভী' } }), JSON.stringify(filteredCalls.at(-1)))
  const lw = calls.filter((c) => c.includes('housing_beneficiaries')).at(-1) ?? ''
  ok('তালিকার অনুরোধে union_name=eq. আর extra=cs.{"category":"গাভী"}', decodeURIComponent(lw).includes('union_name=eq.করেরহাট') && decodeURIComponent(lw).includes('extra=cs.{"category":"গাভী"}'), decodeURIComponent(lw).slice(0, 200))
  await selectByLabel(p, 'উপজেলা', 'সীতাকুন্ড')
  ok('উপজেলা বদলালে ইউনিয়ন খালি হয়', !('union' in params(p)) && params(p).upazila === 'সীতাকুন্ড', JSON.stringify(params(p)))
  await p.screenshot({ path: '.smoke/list-demo-1280.png', fullPage: true })
  ok('/demo তালিকায় কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()

  // SQL ১৫ না থাকলে: ফিল্টার দিলেও কার্ড মোট দেখায় (আগের আচরণ), লেখা নেই, পাতা ভাঙে না
  filteredMode = 'missing'
  const pm = await newPage()
  await pm.goto(BASE + '/demo?f_category=' + encodeURIComponent('ছাগল'), { waitUntil: 'domcontentloaded' })
  await settle(pm)
  await sleep(1500)
  const sm = await text(pm)
  ok('SQL ১৫ না থাকলে: ফিল্টারে তালিকা ২ জন, কার্ড মোট ১০ (আগের মতো), "ফিল্টার অনুযায়ী" লেখা নেই, page error নেই', /মোট উপকারভোগী\s+১০/.test(sm) && !sm.includes('বাছাই করা ফিল্টার অনুযায়ী') && (await rows(pm)) === 2 && pm.errors.length === 0, pm.errors.join(' | '))
  await pm.close()
  filteredMode = 'ok'

  // ১০২৪px, দুই ভাষায়: অনুভূমিক স্ক্রল নেই
  for (const lang of ['bn', 'en']) {
    const q = await newPage(1024, false, lang)
    await q.goto(BASE + '/demo', { waitUntil: 'domcontentloaded' })
    await settle(q)
    await sleep(1200)
    const over = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, table: (() => { const t = document.querySelector('table'); const w = t?.parentElement; return w ? w.scrollWidth - w.clientWidth : 0 })() }))
    const qs = await text(q)
    const words = lang === 'en' ? ['Total amount', 'Total categories', 'Item category', 'Amount', 'Korerhat, Mirsharai'] : ['মোট টাকা', 'উপকরণের ক্যাটাগরি', 'করেরহাট, মীরসরাই']
    ok(`১০২৪px (${lang}): পেইজ ও টেবিলে অনুভূমিক স্ক্রল নেই; লেখা ঠিক ভাষায়`, over.sw <= over.w + 1 && over.table <= 1 && words.every((x) => qs.includes(x)), `${JSON.stringify(over)} ${words.filter((x) => !qs.includes(x)).join(',')}`)
    await q.screenshot({ path: `.smoke/list-demo-1024-${lang}.png`, fullPage: true })
    ok(`১০২৪px (${lang}): কোনো page error নেই`, q.errors.length === 0, q.errors.join(' | '))
    await q.close()
  }

  // ফোন: কার্ড, শুধু-পরের ছবি পূর্ণ-চওড়া ৪:৩
  const m = await newPage(390, true)
  await m.goto(BASE + '/demo', { waitUntil: 'domcontentloaded' })
  await settle(m)
  const card = await m.evaluate(() => {
    const li = document.querySelector('ul.lg\\:hidden > li')
    const ph = li?.querySelector('[class*="aspect-[4/3]"]')
    const a = li?.getBoundingClientRect()
    const b = ph?.getBoundingClientRect()
    return li ? { li: a.width, w: b?.width ?? 0, h: b?.height ?? 0, text: li.innerText.replace(/\s+/g, ' ') } : null
  })
  ok('৩৯০px: কার্ডে একটিই ছবি, পূর্ণ-চওড়া ৪:৩; কার্ডে ক্যাটাগরি ও টাকা (৳)', !!card && card.w >= card.li - 40 && Math.abs(card.w / card.h - 4 / 3) < 0.05 && card.text.includes('উপকরণের ক্যাটাগরি:') && card.text.includes('৳'), JSON.stringify(card)?.slice(0, 220))
  ok('৩৯০px: অনুভূমিক ওভারফ্লো নেই', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
  await m.screenshot({ path: '.smoke/list-demo-390.png', fullPage: true })
  await m.close()

  // M-ধাপ ১৭: বিস্তারিতের ←/→ আর এডমিন তালিকাও একই ক্রমে
  const sorted = [...demoRecs].sort((a, b) => b.year - a.year || a.serial_no - b.serial_no)
  const dn = await newPage(1280)
  await dn.goto(BASE + `/demo/${sorted[0].serial_no}`, { waitUntil: 'domcontentloaded' })
  await settle(dn)
  await dn.keyboard.press('ArrowRight')
  const nextOk = await dn.waitForFunction((s) => location.pathname === s, { timeout: 10000 }, `/demo/${sorted[1].serial_no}`).then(() => true).catch(() => false)
  const at = sorted.findIndex((r) => r.year !== sorted[0].year) // প্রথম পুরনো-সালের রেকর্ড
  await dn.goto(BASE + `/demo/${sorted[at - 1].serial_no}`, { waitUntil: 'domcontentloaded' })
  await settle(dn)
  await dn.keyboard.press('ArrowRight')
  const crossOk = await dn.waitForFunction((s) => location.pathname === s, { timeout: 10000 }, `/demo/${sorted[at].serial_no}`).then(() => true).catch(() => false)
  ok(`বিস্তারিতে → তালিকার ক্রমে: #${sorted[0].serial_no} → #${sorted[1].serial_no}; সালের সীমা পেরিয়ে #${sorted[at - 1].serial_no} (${sorted[at - 1].year}) → #${sorted[at].serial_no} (${sorted[at].year})`, nextOk && crossOk, new URL(dn.url()).pathname)
  await dn.goto(BASE + '/admin/records/demo', { waitUntil: 'domcontentloaded' })
  await settle(dn)
  const adminRows = await dn.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((tr) => tr.innerText))
  const adminOrder = adminRows.map((t) => sorted.find((r) => t.includes(r.name))?.serial_no)
  ok('এডমিন রেকর্ড-তালিকাও নতুন সাল আগে, একই সালে সিরিয়াল ক্রমে', adminOrder.join(',') === sorted.map((r) => r.serial_no).join(','), adminOrder.join(','))
  ok('ক্রম-পরীক্ষায় page error নেই', dn.errors.length === 0, dn.errors.join(' | '))
  await dn.close()
  demoRecs.length = 0
}

// ---------------------------------------------------------------- O. বিস্তারিত মডাল — ছবি মোড ও কাস্টম ফিল্ড (M-ধাপ ১৪)
{
  const ts = new Date('2026-10-06T00:00:00Z').toISOString()
  const photo = (serial, kind) => `${SB}/storage/v1/object/public/housing-photos/housing/demo/${String(serial).padStart(4, '0')}/${kind}.webp`
  const cats = ['গাভী', 'ছাগল', 'সেলাই মেশিন']
  demoRecs.length = 0
  for (let i = 1; i <= 55; i++) {
    demoRecs.push({ id: `00000000-0000-0000-0000-0000000g${String(i).padStart(4, '0')}`, project_type: 'demo', serial_no: i, year: 2025, name: i === 1 ? 'রহিমা' : `উপকারভোগী ${i}`, father_or_husband_name: '', division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila: 'মীরসরাই', union_name: i === 1 ? 'করেরহাট' : '', address: i === 1 ? 'গ্রাম: পূর্ব জোয়ার' : '', extra: { category: cats[i % 3], item_name: i === 1 ? 'দেশি গাভী (২ বছর)' : '', amount: 60000 + i }, prev_photo_url: i === 2 ? photo(i, 'prev') : null, prev_thumb_url: null, current_photo_url: i === 4 ? null : photo(i, 'current'), current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: ts, created_at: ts, updated_at: ts })
  }
  const dlg = (p) => p.evaluate(() => document.querySelector('[role="dialog"][aria-modal="true"]')?.innerText ?? '')
  const pathQ = (p) => { const u = new URL(p.url()); return u.pathname + u.search }
  const waitPath = (p, re) => p.waitForFunction((s) => new RegExp(s).test(location.pathname + location.search), { timeout: 10000 }, re.source).then(() => true).catch(() => false)

  const p = await newPage(1280)
  await p.goto(BASE + '/demo/1', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await p.waitForFunction(() => document.querySelector('[data-photo-viewer] img:not([aria-hidden])')?.naturalWidth > 0, { timeout: 10000 }).catch(() => {})
  let s = await dlg(p)
  const v = await p.evaluate(() => {
    const el = document.querySelector('[data-photo-viewer]')
    const img = el?.querySelector('img:not([aria-hidden])')
    return { viewer: !!el, slider: !!document.querySelector('[role="dialog"] [role="slider"]'), modeBtns: [...document.querySelectorAll('[role="dialog"] button')].some((b) => /স্লাইডার|পাশাপাশি/.test(b.textContent)), loaded: (img?.naturalWidth ?? 0) > 0, alt: img?.alt }
  })
  ok('শুধু-পরে প্রকল্প: একক ছবি (PhotoViewer), ছবি লোড; স্লাইডার/পাশাপাশি নেই', v.viewer && v.loaded && !v.slider && !v.modeBtns, JSON.stringify(v))
  ok('"তুলনা সম্ভব নয়" কোথাও নেই; টুলবারে প্রকল্পের লেবেল "উপকরণসহ ছবি"', !s.includes('তুলনা সম্ভব নয়') && s.includes('উপকরণসহ ছবি') && v.alt === 'রহিমা — উপকরণসহ ছবি')
  const hl = await p.evaluate(() => document.querySelector('[data-highlight]')?.innerText.replace(/\s+/g, ' ') ?? '')
  ok('হাইলাইট কার্ড উপরে: "উপকরণের ক্যাটাগরি: ছাগল" আর "টাকা: ৳ ৬০,০০১"', hl.includes('উপকরণের ক্যাটাগরি ছাগল') && hl.includes('টাকা ৳ ৬০,০০১'), hl)
  const dts = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] dl dt')].map((d) => d.textContent + '=' + d.nextElementSibling?.textContent))
  ok('ঘরগুলো ক্রমে: সিরিয়াল, অনুদানের সাল, নাম, …, ইউনিয়ন (মান আছে), উপকরণের নাম, ঠিকানা শেষে; টাকা/ক্যাটাগরি দ্বিতীয়বার নয়', dts[0] === 'সিরিয়াল নম্বর=১' && dts[1] === 'অনুদানের সাল=২০২৫' && dts.includes('ইউনিয়ন/পৌরসভা=করেরহাট') && dts.includes('উপকরণের নাম/বিবরণ=দেশি গাভী (২ বছর)') && dts.at(-1) === 'বিস্তারিত ঠিকানা=গ্রাম: পূর্ব জোয়ার' && !dts.some((d) => d.startsWith('টাকা=') || d.startsWith('উপকরণের ক্যাটাগরি=')), dts.join(' | '))
  // জুম
  const zoomTxt = () => p.evaluate(() => document.querySelector('[data-photo-viewer] [aria-live]')?.textContent)
  await p.click('[data-photo-viewer] button[aria-label="বড় করুন"]')
  await sleep(150)
  const z1 = await zoomTxt()
  const fr = await p.evaluate(() => { const r = document.querySelector('[data-photo-viewer] .cursor-grab, [data-photo-viewer] .cursor-zoom-in')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })
  await p.click('[data-photo-viewer] button[aria-label="রিসেট"]')
  await sleep(100)
  await p.mouse.click(fr.x, fr.y, { count: 2 })
  await sleep(150)
  const z2 = await zoomTxt()
  await p.mouse.move(fr.x, fr.y)
  await p.mouse.wheel({ deltaY: 200 })
  await sleep(150)
  const z3 = await zoomTxt()
  ok('জুম: "+" → ১২৫%, ডাবল-ক্লিক → ২৫০%, হুইল নিচে → ছোট', z1 === '১২৫%' && z2 === '২৫০%' && z3 !== '২৫০%', `${z1} ${z2} ${z3}`)
  await p.click('[data-photo-viewer] button[aria-label="রিসেট"]')
  // ফুলস্ক্রিন
  await p.click('[data-photo-viewer] button[aria-label="ফুলস্ক্রিন"]')
  await sleep(400)
  const fs1 = await p.evaluate(() => ({ on: !!document.fullscreenElement?.hasAttribute('data-photo-viewer'), btn: !!document.querySelector('[data-photo-viewer] button[aria-label="ফুলস্ক্রিন বন্ধ"]') }))
  await p.keyboard.press('ArrowRight') // ফুলস্ক্রিনে ← → মডালকে সরায় না
  await sleep(200)
  const stay = pathQ(p)
  await p.evaluate(() => document.exitFullscreen().catch(() => {}))
  await sleep(300)
  ok('ফুলস্ক্রিন চালু হয় (একক ছবির ফ্রেম), বাটন "ফুলস্ক্রিন বন্ধ"; তখন → চাপলে রেকর্ড বদলায় না', fs1.on && fs1.btn && stay === '/demo/1', `${JSON.stringify(fs1)} ${stay}`)
  // ← → , পাতা পেরিয়ে
  await p.keyboard.press('ArrowRight')
  const r2 = await waitPath(p, /^\/demo\/2$/)
  await settle(p)
  s = await dlg(p)
  ok('→ চাপলে /demo/2; সেখানে শুধু-পরে প্রকল্পে আগের ছবি থাকলেও একক বর্তমান ছবিই', r2 && !(await p.$('[role="dialog"] [role="slider"]')) && !s.includes('তুলনা সম্ভব নয়'), pathQ(p))
  await p.goto(BASE + '/demo/50', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await p.keyboard.press('ArrowRight')
  const r51 = await waitPath(p, /^\/demo\/51\?page=2$/)
  await settle(p)
  const pos = await p.evaluate(() => document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent)
  ok('পাতার শেষে → : পরের পাতা এনে /demo/51?page=2 ("৫৫ টির মধ্যে ৫১")', r51 && pos === '৫৫ টির মধ্যে ৫১', `${pathQ(p)} ${pos}`)
  await p.keyboard.press('ArrowLeft')
  const r50 = await waitPath(p, /^\/demo\/50$/)
  ok('← চাপলে আগের পাতায় ফেরে (/demo/50, page প্যারামিটার নেই)', r50, pathQ(p))
  await p.goto(BASE + '/demo/4', { waitUntil: 'domcontentloaded' })
  await settle(p)
  ok('ছবি না থাকলে: "এই উপকারভোগীর কোনো ছবি নেই।" (তুলনার কথা নয়)', (await dlg(p)).includes('এই উপকারভোগীর কোনো ছবি নেই।') && !(await dlg(p)).includes('তুলনা'))
  await p.screenshot({ path: '.smoke/detail-demo-1280.png' })
  ok('বিস্তারিতে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()

  // ইংরেজি: লেবেল ইংরেজিতে, ক্যাটাগরি/নাম শীটে যেমন (বাংলা)
  const e = await newPage(1280, false, 'en')
  await e.goto(BASE + '/demo/1', { waitUntil: 'domcontentloaded' })
  await settle(e)
  await sleep(500)
  const ehl = await e.evaluate(() => document.querySelector('[data-highlight]')?.innerText.replace(/\s+/g, ' ') ?? '')
  const edt = await e.evaluate(() => [...document.querySelectorAll('[role="dialog"] dl dt')].map((d) => d.textContent + '=' + d.nextElementSibling?.textContent))
  const es = await dlg(e)
  ok('EN: "Item category ছাগল" (মান বাংলায়, যেমন শীটে), "Amount ৳60,001"; নাম "রহিমা" বাংলায়', ehl.includes('Item category ছাগল') && /Amount ৳\s?60,001/.test(ehl) && edt.includes('Beneficiary name=রহিমা'), `${ehl} | ${edt.slice(0, 3).join(' | ')}`)
  ok('EN: বাকি লেবেল ইংরেজিতে — Grant year, Union/Municipality=Korerhat, Item name / description, Detailed address, "Photo with the item"', edt.includes('Grant year=2025') && edt.includes('Union/Municipality=Korerhat') && edt.some((d) => d.startsWith('Item name / description=')) && edt.some((d) => d.startsWith('Detailed address=')) && es.includes('Photo with the item'), edt.join(' | '))
  await e.screenshot({ path: '.smoke/detail-demo-en.png' })
  await e.close()

  // ফোন
  const m = await newPage(390, true)
  await m.goto(BASE + '/demo/1', { waitUntil: 'domcontentloaded' })
  await settle(m)
  const mv = await m.evaluate(() => {
    const d = document.querySelector('[role="dialog"] > div')?.getBoundingClientRect()
    const f = document.querySelector('[data-photo-viewer]')?.getBoundingClientRect()
    return { dw: d?.width, fw: f?.width, fh: f?.height, over: document.documentElement.scrollWidth > window.innerWidth + 1 }
  })
  ok('৩৯০px: একক ছবি মডালের পুরো চওড়ায় (প্যাডিং বাদে), যথেষ্ট উঁচু; ওভারফ্লো নেই', mv.fw >= mv.dw - 30 && mv.fh >= 220 && !mv.over, JSON.stringify(mv))
  await m.screenshot({ path: '.smoke/detail-demo-390.png' })
  await m.close()

  // আগে-পরে প্রকল্পে নিজের লেবেল ("মেরামতের আগে/পরে"), আর ছবিহীন প্রকল্প
  Object.assign(created.project, { photo_mode: 'before_after', prev_label_bn: 'মেরামতের আগে', prev_label_en: 'Before repair', current_label_bn: 'মেরামতের পরে', current_label_en: 'After repair' })
  const q = await newPage(1280)
  await q.goto(BASE + '/demo/2', { waitUntil: 'domcontentloaded' })
  await settle(q)
  const badges = await q.evaluate(() => [...document.querySelectorAll('[data-compare] span.pointer-events-none')].map((x) => x.textContent))
  ok('আগে-পরে প্রকল্প: স্লাইডার, ব্যাজে প্রকল্পের লেবেল "মেরামতের আগে"/"মেরামতের পরে"', !!(await q.$('[role="dialog"] [role="slider"]')) && badges.join(',') === 'মেরামতের আগে,মেরামতের পরে', badges.join(','))
  await q.goto(BASE + '/demo/3', { waitUntil: 'domcontentloaded' })
  await settle(q)
  ok('আগে-পরে প্রকল্পে একটি ছবি নেই → "«মেরামতের আগে» ছবি নেই — তুলনা সম্ভব নয়…" (শুধু আগে-পরে প্রকল্পেই)', (await dlg(q)).includes('«মেরামতের আগে» ছবি নেই — তুলনা সম্ভব নয়'))
  created.project.photo_mode = 'none'
  await q.goto(BASE + '/demo/1', { waitUntil: 'domcontentloaded' })
  await settle(q)
  ok('ছবিহীন প্রকল্প: ছবির অংশই নেই, হাইলাইট কার্ড সবার উপরে', !(await q.$('[role="dialog"] [data-compare]')) && !!(await q.$('[role="dialog"] [data-highlight]')))
  Object.assign(created.project, { photo_mode: 'after_only', prev_label_bn: '', prev_label_en: '', current_label_bn: 'উপকরণসহ ছবি', current_label_en: 'Photo with the item' })
  ok('আগে-পরে/ছবিহীন পরীক্ষায় page error নেই', q.errors.length === 0, q.errors.join(' | '))
  await q.close()

  // ঘর নির্মাণ: স্লাইডার আগের মতো, আগের ৮টি ঘর, হাইলাইট নেই (লাইভ পড়া)
  const h = await newPage(1280)
  await h.goto(BASE + '/housing/semi-pucca', { waitUntil: 'domcontentloaded' })
  await settle(h)
  await h.evaluate(() => document.querySelector('table a[href^="/housing/semi-pucca/"]')?.click())
  await settle(h)
  await sleep(300)
  const hb = await h.evaluate(() => ({ slider: !!document.querySelector('[role="dialog"] [role="slider"]'), badges: [...document.querySelectorAll('[data-compare] span.pointer-events-none')].map((x) => x.textContent), dts: [...document.querySelectorAll('[role="dialog"] dl dt')].map((d) => d.textContent), hl: !!document.querySelector('[data-highlight]'), viewer: !!document.querySelector('[data-photo-viewer]') }))
  ok('ঘর নির্মাণ: স্লাইডার, ব্যাজ "পূর্বের"/"বর্তমান", আগের ৮টি ঘর একই ক্রমে, হাইলাইট/একক ছবি নেই', hb.slider && hb.badges.join(',') === 'পূর্বের,বর্তমান' && hb.dts.join(',') === 'সিরিয়াল নম্বর,সাল,উপকারভোগীর নাম,পিতা/স্বামীর নাম,বিভাগ,জেলা,উপজেলা,বিস্তারিত ঠিকানা' && !hb.hl && !hb.viewer, JSON.stringify(hb))
  await h.close()
  demoRecs.length = 0
}

// ---------------------------------------------------------------- P. হোম পেইজ ও কভার ছবি (M-ধাপ ১৫)
{
  // লাইভ ওভারভিউ (anon) — হিরোর সংখ্যা মেলাতে
  const live = await fetch(`${SB}/rest/v1/rpc/projects_overview`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }, body: '{}' }).then((r) => r.json())
  const statsOf = (total) => ({ total, by_year: {}, by_division: {}, by_district: {}, by_upazila: {}, by_location: {}, by_project: {}, by_union: {}, distinct: { divisions: 1, districts: 3, upazilas: 5, unions: 0 }, fields: { amount: { type: 'money', sum: 1250000, count: total }, category: { type: 'category', distinct: 4 } } })
  const base = { parent_key: null, is_group: false, summary_bn: 'আত্মনির্ভর হতে গাভী, ছাগল, সেলাই মেশিন ইত্যাদি উপকরণ সহায়তা।', summary_en: 'Cows, goats, sewing machines and more to become self-reliant.', unit_bn: 'উপকারভোগী', unit_en: 'beneficiaries', photo_mode: 'after_only', cover_path: null, sort_order: 50, show_on_home: true, featured: null, without_photo: null, is_published: true, icon: 'cow', accent: 'teal' }
  const grantCards = [
    { id: 'total', kind: 'count', label_bn: 'মোট উপকারভোগী', label_en: 'Total beneficiaries', icon: 'users', home: true },
    { id: 'money', kind: 'sum', field: 'amount', label_bn: 'মোট টাকা', label_en: 'Total amount', icon: 'coins', home: true, format: 'money' },
    { id: 'cats', kind: 'distinct', field: 'category', label_bn: 'মোট ক্যাটাগরি', label_en: 'Total categories', icon: 'tags', home: true },
    { id: 'districts', kind: 'geo', level: 'district', label_bn: 'জেলা কভার', label_en: 'Districts covered', icon: 'pin' },
  ]
  overviewExtra.push(
    { ...base, key: 'sr_test', slug: 'sr-test', name_bn: 'স্বাবলম্বী (পরীক্ষা)', name_en: 'Self-reliance (test)', stat_cards: grantCards, stats: statsOf(25) },
    { ...base, key: 'draft_test', slug: 'draft-test', name_bn: 'খসড়া প্রকল্প (দেখা যাবে না)', name_en: 'Draft (hidden)', is_published: false, stat_cards: grantCards, stats: statsOf(1) },
    { ...base, key: 'nohome_test', slug: 'nohome-test', name_bn: 'হোমে বন্ধ (দেখা যাবে না)', name_en: 'Not on home', show_on_home: false, stat_cards: grantCards, stats: statsOf(1) },
  )

  const p = await newPage(1280, false, 'bn', false)
  const calls = new Set()
  p.on('request', (r) => {
    const u = new URL(r.url())
    if (r.url().startsWith(SB) && r.method() !== 'OPTIONS' && u.pathname.startsWith('/rest/v1/')) calls.add(`${r.method()} ${u.pathname}${u.search} ${r.postData() ?? ''}`)
  })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await sleep(1500) // count-up
  const cards = await p.evaluate(() => [...document.querySelectorAll('[data-project-card]')].map((c) => ({ key: c.getAttribute('data-project-card'), text: c.innerText.replace(/\s+/g, ' '), img: c.querySelector('img')?.getAttribute('src') ?? null, fallback: !!c.querySelector('[data-cover-fallback]'), fallbackText: c.querySelector('[data-cover-fallback]')?.textContent.trim() ?? '', svgs: c.querySelectorAll('[data-cover-fallback] svg, .ring-4 svg').length, chips: [...c.querySelectorAll(':scope ul a')].map((a) => a.textContent), href: [...c.querySelectorAll('a')].at(-1)?.getAttribute('href') })))
  ok('হোম: কার্ড শুধু শীর্ষ-স্তরের প্রকাশিত ও "হোমে" চালু প্রকল্প — ঘর নির্মাণ (গ্রুপ) ও স্বাবলম্বী; খসড়া/হোমে-বন্ধ নেই, উপ-প্রকল্প আলাদা কার্ড নয়', cards.map((c) => c.key).sort().join(',') === [...LIVE.projects.filter((x) => !x.parent_key && x.is_published && x.show_on_home).map((x) => x.key), 'sr_test'].sort().join(',') && !cards.some((c) => ['draft_test', 'nohome_test', 'semi_pucca', 'tin'].includes(c.key)), cards.map((c) => c.key).join(','))
  const h = cards.find((c) => c.key === 'housing')
  ok('গ্রুপ-কার্ড: উপ-প্রকল্পের চিপ (সেমিপাকা · টিন), "মোট ঘর নির্মাণ"/"মোট জেলা কভার"/"মোট উপজেলা কভার", সর্বশেষ রেকর্ডের থাম্ব (কভার নেই)', h && h.chips.join('|') === 'সেমিপাকা ঘর নির্মাণ|টিনের ঘর নির্মাণ' && h.text.includes('মোট ঘর নির্মাণ') && h.text.includes('মোট জেলা কভার') && h.text.includes('মোট উপজেলা কভার') && /current_thumb\.webp/.test(h.img ?? '') && h.href === '/housing', JSON.stringify(h)?.slice(0, 300))
  const s = cards.find((c) => c.key === 'sr_test')
  ok('একক কার্ড: কভার/ছবি না থাকলে রঙের গ্রেডিয়েন্টে প্রকল্পের নাম (আইকন নেই — ২০২৬-১০-০৭); "মোট টাকা ৳ ১২,৫০,০০০", "মোট ক্যাটাগরি ৪"; home নয় এমন কার্ড (জেলা) নেই', s && s.fallback && !s.img && s.fallbackText === 'স্বাবলম্বী (পরীক্ষা)' && s.svgs === 0 && s.text.includes('৳ ১২,৫০,০০০ মোট টাকা') && s.text.includes('৪ মোট ক্যাটাগরি') && !s.text.includes('জেলা কভার') && s.text.includes('প্রকল্প দেখুন'), s?.text)
  const hero = await p.evaluate(() => [...document.querySelectorAll('section dl dd')].slice(0, 3).map((d) => d.textContent))
  const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d])
  ok('হিরো: আস-সুন্নাহ ফাউন্ডেশন — "আমাদের কার্যক্রমসমূহ"; মোট প্রকল্প/উপকারভোগী/জেলা = ওভারভিউর global', (await text(p)).includes('আমাদের কার্যক্রমসমূহ') && hero.join(',') === [live.global.projects, live.global.total, live.global.districts].map(bn).join(','), `${hero.join(',')} ↔ ${JSON.stringify(live.global)}`)
  const dataCalls = [...calls].map((c) => c.split(' ')[1].split('?')[0].replace('/rest/v1/', ''))
  ok('হোমে API কল ২টি: রেজিস্ট্রি (projects + ফিল্ড embed, এক কলে) আর projects_overview', calls.size === 2 && dataCalls.sort().join(',') === 'projects,rpc/projects_overview' && [...calls].some((c) => decodeURIComponent(c).includes('project_fields(*)')), [...calls].map((c) => c.slice(0, 90)).join(' || '))
  const cols = async (q) => q.evaluate(() => getComputedStyle(document.querySelector('[data-project-card]').closest('ul')).gridTemplateColumns.split(' ').length)
  ok('১২৮০px এ ৩ কলাম (xl)', (await cols(p)) === 3, String(await cols(p)))
  await p.screenshot({ path: '.smoke/home-1280.png', fullPage: true })
  ok('হোমে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()

  for (const [w, want, lang] of [[360, 1, 'bn'], [768, 2, 'en'], [1024, 2, 'bn']]) {
    const q = await newPage(w, w < 768, lang, false)
    await q.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await settle(q)
    await sleep(800)
    const over = await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    const c = await cols(q)
    const t2 = await text(q)
    const words = lang === 'en' ? ['Our activities', 'View project', 'Total amount'] : ['আমাদের কার্যক্রমসমূহ', 'প্রকল্প দেখুন']
    ok(`${w}px (${lang}): অনুভূমিক ওভারফ্লো নেই, ${want} কলাম, লেখা ঠিক ভাষায়`, !over && c === want && words.every((x) => t2.includes(x)), `over=${over} cols=${c} ${words.filter((x) => !t2.includes(x)).join(',')}`)
    await q.screenshot({ path: `.smoke/home-${w}-${lang}.png`, fullPage: true })
    await q.close()
  }
  overviewExtra.length = 0

  // কভার ছবি — সেটিংসে (demo এর লেখা নকল)
  const cv = await newPage(1280)
  await cv.goto(BASE + '/admin/projects/demo', { waitUntil: 'domcontentloaded' })
  await settle(cv)
  ok('সেটিংসে "কভার ছবি" অংশ; কভার নেই → রঙের পটভূমি ও "কভার নেই"', (await cv.evaluate(() => document.querySelector('[data-cover-upload]')?.innerText ?? '')).includes('কভার নেই'))
  const coverFile = '.smoke/photos/cover-test.png'
  fs.mkdirSync('.smoke/photos', { recursive: true })
  fs.writeFileSync(coverFile, await sharp({ create: { width: 1200, height: 675, channels: 3, background: '#2c7a7b' } }).png().toBuffer())
  let before = writes.length
  await (await cv.$('[data-cover-upload] input[type="file"]')).uploadFile(coverFile)
  await cv.waitForFunction(() => document.querySelector('[data-cover-upload] img')?.getAttribute('src')?.includes('/housing/_projects/demo/cover.webp?v='), { timeout: 20000 }).catch(() => {})
  await settle(cv)
  let w = writes.slice(before)
  const up = w.find((x) => x.path === '/storage/v1/object/housing-photos/housing/_projects/demo/cover.webp')
  const patch = w.find((x) => x.method === 'PATCH' && x.path === '/rest/v1/projects')
  ok('আপলোড: housing/_projects/demo/cover.webp এ (multipart; WebP না হলে অ্যাডাপ্টারই আটকায়), তারপর projects.cover_path; প্রিভিউতে নতুন কভার (?v=)', !!up && (up.contentType ?? '').startsWith('multipart/form-data') && patch?.body?.cover_path === 'housing/_projects/demo/cover.webp' && /cover\.webp\?v=/.test((await cv.evaluate(() => document.querySelector('[data-cover-upload] img')?.getAttribute('src'))) ?? ''), w.map((x) => `${x.method} ${x.path} ${x.contentType ?? ''} ${JSON.stringify(x.body)?.slice(0, 60)}`).join(' | '))
  before = writes.length
  await clickText(cv, '[data-cover-upload] button', 'কভার মুছুন')
  await sleep(200)
  await clickText(cv, '[role="dialog"] button', 'মুছুন')
  await settle(cv)
  w = writes.slice(before)
  ok('মূল এডমিন: "কভার মুছুন" → নিশ্চিতকরণ → ফাইল মোছা + cover_path null; আবার "কভার নেই"', w.some((x) => x.method === 'DELETE' && x.path === '/storage/v1/object/housing-photos') && w.some((x) => x.method === 'PATCH' && x.body?.cover_path === null) && (await cv.evaluate(() => document.querySelector('[data-cover-upload]')?.innerText ?? '')).includes('কভার নেই'), w.map((x) => `${x.method} ${x.path}`).join(' | '))
  ok('কভার পরীক্ষায় page error নেই', cv.errors.length === 0, cv.errors.join(' | '))
  await cv.close()
  adminRole = 'admin'
  created.project.cover_path = 'housing/_projects/demo/cover.webp'
  const cv2 = await newPage(1280)
  await cv2.goto(BASE + '/admin/projects/demo', { waitUntil: 'domcontentloaded' })
  await settle(cv2)
  const ct = await cv2.evaluate(() => document.querySelector('[data-cover-upload]')?.innerText ?? '')
  ok('সাধারণ এডমিন: "কভার বদলান" আছে, "কভার মুছুন" নেই', ct.includes('কভার বদলান') && !ct.includes('কভার মুছুন'), ct.slice(0, 160))
  await cv2.close()
  created.project.cover_path = null
  adminRole = 'main_admin'
}

// ---------------------------------------------------------------- Q. প্রকল্পের ইউজার ও ইউজার-পাতা (পর্ব চ, M-ধাপ ১৯) — সব নকল
{
  const ts = new Date().toISOString()
  const demoName = created.project.name_bn
  const rec = (serial, name, extra = {}) => ({ id: `00000000-0000-0000-0000-00000000f${String(serial).padStart(3, '0')}`, project_type: 'demo', serial_no: serial, year: 2025, name, father_or_husband_name: `পিতা ${serial}`, division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila: 'মীরসরাই', union_name: '', address: '', extra: { category: 'গাভী', amount: 1, item_name: 'দুগ্ধবতী' }, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: ts, updated_at: ts, ...extra })
  demoRecs.length = 0
  demoRecs.push(rec(1, 'রহিমা', { current_photo_url: `${SB}/storage/v1/object/public/housing-photos/housing/demo/0001/current.webp`, current_thumb_url: `${SB}/storage/v1/object/public/housing-photos/housing/demo/0001/current_thumb.webp`, photo_updated_at: ts }), rec(2, 'করিম'))

  // --- প্রকল্পের ইউজার (editor, শুধু demo)
  adminRole = 'editor'
  adminExtra = { all_projects: false, projects: ['demo'] }
  const p = await newPage()
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const nav = await p.evaluate(() => document.querySelector('nav[aria-label="এডমিন মেনু"]')?.innerText ?? '')
  const navHrefs = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="এডমিন মেনু"] a')].map((a) => a.getAttribute('href')))
  ok('প্রকল্পের ইউজার: মেনুতে "প্রকল্পসমূহ" ও "ইউজার" নেই; রেকর্ডে শুধু নিজের প্রকল্প; ভূমিকা "প্রকল্পের ইউজার"', !nav.includes('প্রকল্পসমূহ') && !navHrefs.includes('/admin/users') && navHrefs.includes('/admin/records/demo') && !navHrefs.some((h) => /\/admin\/records\/(semi_pucca|tin)/.test(h)) && (await text(p)).includes('প্রকল্পের ইউজার'), navHrefs.join(' '))
  let s = await text(p)
  const dashHrefs = await p.evaluate(() => [...document.querySelectorAll('main a')].map((a) => a.getAttribute('href')))
  ok('ড্যাশবোর্ড: "নতুন প্রকল্প"/সেটিংস লিংক নেই, অন্য প্রকল্পের রেকর্ড-লিংক নেই', !s.includes('নতুন প্রকল্প') && !dashHrefs.some((h) => h?.startsWith('/admin/projects')) && !dashHrefs.some((h) => /\/admin\/records\/(semi_pucca|tin)/.test(h ?? '')), dashHrefs.join(' '))
  for (const path of ['/admin/projects', '/admin/projects/demo', '/admin/users']) {
    await p.goto(BASE + path, { waitUntil: 'domcontentloaded' })
    await settle(p)
    s = await text(p)
    ok(`${path} → "এই অংশ শুধু মূল এডমিনের" বার্তা (পাতা খোলে না)`, s.includes('এই অংশ শুধু মূল এডমিনের') && !s.includes('নতুন ইউজার যোগ') && !s.includes('প্রকল্পের ক্রম'))
  }
  await p.goto(BASE + '/admin/records/semi_pucca', { waitUntil: 'domcontentloaded' })
  await settle(p)
  ok('অন্য প্রকল্পের রেকর্ড-পাতা (semi_pucca) → ৪০৪', /৪০৪|পাওয়া যায়নি/.test(await text(p)), (await text(p)).slice(0, 120))

  // রেকর্ড এডিট: সিরিয়াল-বোতাম নেই, থাকা ছবি লক, আগের মান ফাঁকা করা যায় না
  await p.goto(BASE + '/admin/records/demo/1/edit', { waitUntil: 'domcontentloaded' })
  await settle(p)
  s = await text(p)
  const delPhoto = await p.evaluate(() => [...document.querySelectorAll('button')].some((b) => /ছবি মুছুন/.test(b.textContent)))
  ok('এডিট: "সিরিয়াল বদলান…" নেই, লেখা "সিরিয়াল বদলাতে পারেন শুধু মূল এডমিন"; থাকা ছবি লক (মোছার বোতাম নেই)', !s.includes('সিরিয়াল বদলান…') && s.includes('লক করা — সিরিয়াল বদলাতে পারেন শুধু মূল এডমিন') && s.includes('ছবি আগে থেকেই আছে — বদলাতে বা মুছতে পারেন শুধু মূল এডমিন') && !delPhoto, s.match(/লক করা[^\n]*/)?.[0])
  const father = await p.evaluateHandle(() => [...document.querySelectorAll('input')].find((i) => i.value === 'পিতা 1' || i.value === 'পিতা ১') ?? null)
  let before = writes.length
  if (father.asElement()) {
    await clearInput(p, father.asElement())
    await clickText(p, 'button', 'সংরক্ষণ করুন')
    await sleep(400)
  }
  s = await text(p)
  ok('ভরা ঘর ফাঁকা করে সংরক্ষণ → "আগের মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন", কিছু পাঠানো হয় না', !!father.asElement() && s.includes('আগের মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন') && writes.length === before)

  // ইম্পোর্ট: "(মুছুন)" → ভুল সারি
  fs.writeFileSync('.smoke/import-editor.csv', '﻿' + ['সিরিয়াল,উপকরণের নাম/বিবরণ', '1,(মুছুন)', '2,নতুন বিবরণ'].join('\r\n') + '\r\n')
  await p.goto(BASE + '/admin/import?project=demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const impOpts = await p.$eval('#imp-project', (x) => [...x.options].map((o) => o.value))
  await p.evaluate(() => [...document.querySelectorAll('input[name="mode"]')][1].click())
  await sleep(100)
  s = await text(p)
  ok('ইম্পোর্ট: প্রকল্প-তালিকায় শুধু demo; আপডেট-নিয়মে "মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন"', impOpts.join() === 'demo' && s.includes('মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন'), impOpts.join())
  await (await p.$('#imp-file')).uploadFile('.smoke/import-editor.csv')
  await settle(p)
  s = await text(p)
  ok('ইম্পোর্ট: "(মুছুন)" সারি → ভুল ("মুছতে পারেন শুধু মূল এডমিন"), বাকিটা চলে', s.includes('মুছতে পারেন শুধু মূল এডমিন — "(মুছুন)" সরান') && s.includes('ভুল ১ (বাদ যাবে)'), s.match(/মুছতে[^\n]*/)?.[0])

  // ছবি বাল্ক: থাকা ছবিতে ওভাররাইট আটকানো; নতুন ছবি চলে
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  fs.mkdirSync('.smoke/photos/editor', { recursive: true })
  const files = ['demo_0001.jpg', 'demo_0002.jpg'].map((n) => {
    fs.writeFileSync(`.smoke/photos/editor/${n}`, png)
    return `.smoke/photos/editor/${n}`
  })
  await p.goto(BASE + '/admin/photos?project=demo', { waitUntil: 'domcontentloaded' })
  await settle(p)
  await (await p.$('input[type="file"]')).uploadFile(...files)
  await settle(p)
  s = await text(p)
  const row1 = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('demo_0001.jpg'))?.innerText.replace(/\s+/g, ' ') ?? '')
  const btn = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).find((x) => /আপলোড/.test(x)) ?? '')
  ok('ছবি বাল্ক: থাকা ছবি (#১) → "বদলাতে পারেন শুধু মূল এডমিন", গণনায় "ছবি আছে, বদলানো যাবে না ১"; ওভাররাইট নেই, বোতাম "১টি ছবি আপলোড করুন"', row1.includes('বদলাতে পারেন শুধু মূল এডমিন') && s.includes('ছবি আছে, বদলানো যাবে না ১') && s.includes('মিলেছে ১') && !s.includes('ওভাররাইট হবে') && btn === '১টি ছবি আপলোড করুন', `${row1} · ${btn}`)
  before = writes.length
  await clickText(p, 'button', '১টি ছবি আপলোড করুন')
  await p.waitForFunction(() => document.body.innerText.includes('সফল ১'), { timeout: 20000 }).catch(() => {})
  await settle(p)
  const w = writes.slice(before).map((x) => x.path)
  ok('আপলোড: শুধু #২ (নতুন ছবি); #১ এর ছবিতে কোনো লেখা নয়', w.some((x) => x.includes('/housing/demo/0002/current')) && !w.some((x) => x.includes('/housing/demo/0001/')), w.join(', '))
  ok('প্রকল্পের ইউজারের পাতাগুলোতে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()

  // --- ১৪-এর আগের "admin" (all_projects ঘর নেই) — আগের মতোই সব প্রকল্প ও সেটিংস
  adminRole = 'admin'
  adminExtra = {}
  const a = await newPage()
  await a.goto(BASE + '/admin/projects', { waitUntil: 'domcontentloaded' })
  await settle(a)
  s = await text(a)
  const aHrefs = await a.evaluate(() => [...document.querySelectorAll('nav[aria-label="এডমিন মেনু"] a')].map((x) => x.getAttribute('href')))
  ok('১৪-এর আগের এডমিন: প্রকল্পসমূহ খোলে, সব প্রকল্পের রেকর্ড-লিংক, "ইউজার" নেই', !s.includes('এই অংশ শুধু মূল এডমিনের') && aHrefs.includes('/admin/projects') && aHrefs.includes('/admin/records/semi_pucca') && aHrefs.includes('/admin/records/demo') && !aHrefs.includes('/admin/users'), aHrefs.join(' '))
  await a.close()

  // --- মূল এডমিন: ইউজার-পাতা
  adminRole = 'main_admin'
  adminExtra = { all_projects: true, projects: [] }
  fakeUsers.length = 0
  fakeUsers.push(
    { user_id: USER.id, email: USER.email, role: 'main_admin', all_projects: true, is_active: true, projects: [], created_at: ts, last_sign_in_at: ts },
    { user_id: '00000000-0000-0000-0000-0000000000c2', email: 'editor@example.org', role: 'editor', all_projects: false, is_active: true, projects: ['housing'], created_at: ts, last_sign_in_at: null },
  )
  const m = await newPage()
  await m.goto(BASE + '/admin/users', { waitUntil: 'domcontentloaded' })
  await settle(m)
  s = await text(m)
  const mNav = await m.evaluate(() => [...document.querySelectorAll('nav[aria-label="এডমিন মেনু"] a')].map((x) => x.getAttribute('href')))
  ok('মূল এডমিন: মেনুতে "ইউজার"; তালিকায় ২ জন — মূল এডমিন "সব প্রকল্প", editor "ঘর নির্মাণ প্রকল্প"', mNav.includes('/admin/users') && s.includes('মোট ২ জন') && /editor@example\.org\s+প্রকল্পের ইউজার\s+ঘর নির্মাণ প্রকল্প/.test(s) && s.includes('নতুন ইউজার যোগ') && s.includes('Authentication → Users → Add user'), s.match(/editor@example[^\n]*/)?.[0])
  // গ্রুপ বাছলে উপ-প্রকল্প নিজে টিক ও বন্ধ
  await clickText(m, 'button', 'বদলান')
  await sleep(200)
  const semi = await m.evaluate(() => { const l = [...document.querySelectorAll('form label')].find((x) => x.textContent.includes('সেমিপাকা')); const i = l?.querySelector('input'); return i ? { checked: i.checked, disabled: i.disabled } : null })
  ok('এডিট-ফর্ম: ইমেইল বদলানো যায় না; গ্রুপ "ঘর নির্মাণ" বাছা → সেমিপাকা টিক ও বন্ধ', (await m.$eval('#user-email', (x) => x.readOnly && x.value)) === 'editor@example.org' && semi?.checked && semi?.disabled, JSON.stringify(semi))
  await clickText(m, 'button', 'বাতিল — নতুন ইউজার')
  await sleep(100)
  const tick = (n) => m.evaluate((x) => [...document.querySelectorAll('form label')].find((l) => l.textContent.includes(x))?.querySelector('input')?.click(), n)
  // অচেনা ইমেইল → বাংলা বার্তা
  await (await m.$('#user-email')).type('nobody@example.org')
  await tick(demoName)
  let wb = writes.length
  await clickText(m, 'button', 'সংরক্ষণ')
  await settle(m)
  s = await text(m)
  ok('অচেনা ইমেইল → "ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে Supabase → Authentication → Add user"', s.includes('ইমেইলে কোনো অ্যাকাউন্ট নেই') && writes.slice(wb).some((x) => x.path.endsWith('/housing_admin_user_save')))
  // প্রকল্প না বেছে → ক্লায়েন্টেই আটকায়
  await tick(demoName)
  await clearInput(m, await m.$('#user-email'))
  await (await m.$('#user-email')).type('new-user@example.org')
  wb = writes.length
  await clickText(m, 'button', 'সংরক্ষণ')
  await settle(m)
  s = await text(m)
  ok('প্রকল্প না বেছে সংরক্ষণ → "অন্তত একটি প্রকল্প বাছুন", কিছু পাঠানো হয় না', s.includes('অন্তত একটি প্রকল্প বাছুন') && !writes.slice(wb).some((x) => x.path.endsWith('/housing_admin_user_save')))
  await tick(demoName)
  wb = writes.length
  await clickText(m, 'button', 'সংরক্ষণ')
  await settle(m)
  s = await text(m)
  const sent = writes.slice(wb).find((x) => x.path.endsWith('/housing_admin_user_save'))?.body
  ok('নতুন ইউজার সংরক্ষণ → RPC এ {email, all_projects:false, projects:[demo], active:true}; "যোগ হয়েছে", তালিকায় ৩ জন', JSON.stringify(sent) === JSON.stringify({ p_email: 'new-user@example.org', p_all_projects: false, p_projects: ['demo'], p_active: true }) && s.includes('new-user@example.org যোগ হয়েছে') && s.includes('মোট ৩ জন'), JSON.stringify(sent))
  await m.screenshot({ path: '.smoke/admin-users.png', fullPage: true })
  ok('ইউজার-পাতায় কোনো page error নেই', m.errors.length === 0, m.errors.join(' | '))
  await m.close()

  // SQL ১৪ চালানো হয়নি → স্পষ্ট নির্দেশনা, ফর্ম নেই
  usersMode = 'missing'
  const mm = await newPage()
  await mm.goto(BASE + '/admin/users', { waitUntil: 'domcontentloaded' })
  await settle(mm)
  s = await text(mm)
  ok('SQL ১৪ না থাকলে: "আগে ডাটাবেসে SQL ১৪ চালাতে হবে (চেকলিস্ট সারি ৩৫…)", ফর্ম নেই', s.includes('SQL ১৪ চালাতে হবে') && s.includes('সারি ৩৫') && !s.includes('নতুন ইউজার যোগ'))
  await mm.close()
  usersMode = 'ok'
  adminExtra = {}
  demoRecs.length = 0
}

// ---------------------------------------------------------------- R. ফোনে (৩৯০px) প্রকল্পের ইউজার ও ইউজার-পাতা (M-ধাপ ২০)
{
  adminRole = 'editor'
  adminExtra = { all_projects: false, projects: ['demo'] }
  const p = await newPage(390, true)
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  await clickText(p, 'button', 'এডমিন মেনু')
  await sleep(300)
  const drawer = await p.evaluate(() => document.querySelector('[role="dialog"][aria-modal="true"]')?.innerText ?? '')
  const dHrefs = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] a')].map((a) => a.getAttribute('href')))
  ok('৩৯০px প্রকল্পের ইউজার: ওভারফ্লো নেই; ড্রয়ারে "প্রকল্পসমূহ"/"ইউজার" নেই, শুধু নিজের প্রকল্প, "প্রকল্পের ইউজার"', !over && drawer.includes('প্রকল্পের ইউজার') && !dHrefs.includes('/admin/projects') && !dHrefs.includes('/admin/users') && dHrefs.includes('/admin/records/demo') && !dHrefs.some((h) => /\/admin\/records\/(semi_pucca|tin)/.test(h)), dHrefs.join(' '))
  await p.goto(BASE + '/admin/projects', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const gateOver = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  const back = await p.evaluate(() => [...document.querySelectorAll('[role="alert"] a')].find((a) => a.textContent.includes('ড্যাশবোর্ডে ফিরুন'))?.getBoundingClientRect().height ?? 0)
  ok('৩৯০px: "এই অংশ শুধু মূল এডমিনের" বার্তা, ওভারফ্লো নেই, "ড্যাশবোর্ডে ফিরুন" ≥ ৪৪px', (await text(p)).includes('এই অংশ শুধু মূল এডমিনের') && !gateOver && back >= 43.5, String(back))
  ok('৩৯০px প্রকল্পের ইউজার: কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
  await p.close()

  adminRole = 'main_admin'
  adminExtra = { all_projects: true, projects: [] }
  const m = await newPage(390, true)
  await m.goto(BASE + '/admin/users', { waitUntil: 'domcontentloaded' })
  await settle(m)
  const pageOver = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  const s = await text(m)
  const btn = await m.evaluate(() => [...document.querySelectorAll('form button[type="submit"]')].map((b) => b.getBoundingClientRect().height)[0] ?? 0)
  ok('৩৯০px ইউজার-পাতা: পাতায় অনুভূমিক ওভারফ্লো নেই, তালিকা (কার্ড) ও ফর্ম দেখা যায়', !pageOver && s.includes('নতুন ইউজার যোগ') && s.includes('editor@example.org') && btn >= 40, String(btn))
  const edits = await m.evaluate(() => [...document.querySelectorAll('ul[aria-label="ইউজার"] button')].map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, right: r.right, vis: r.width > 0 } }))
  ok('৩৯০px: প্রতিটি editor-কার্ডে "বদলান" পর্দার ভেতরে, ≥ ৪৪px; টেবিল লুকানো', edits.length === 2 && edits.every((e) => e.vis && e.h >= 43.5 && e.right <= 390) && !(await m.evaluate(() => document.querySelector('table')?.getBoundingClientRect().width)), JSON.stringify(edits))
  await m.screenshot({ path: '.smoke/admin-users-390.png', fullPage: true })
  ok('৩৯০px ইউজার-পাতা: কোনো page error নেই', m.errors.length === 0, m.errors.join(' | '))
  await m.close()
  adminExtra = {}
}

// ---------------------------------------------------------------- E. ফোনে ড্রয়ার
{
  const p = await newPage(390, true)
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await settle(p)
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  await clickText(p, 'button', 'এডমিন মেনু')
  await sleep(300)
  const drawer = await p.evaluate(() => document.querySelector('[role="dialog"][aria-modal="true"]')?.innerText ?? null)
  ok('৩৯০px: অনুভূমিক ওভারফ্লো নেই; "এডমিন মেনু" ড্রয়ার খোলে', !over && !!drawer && drawer.includes('প্রকল্পসমূহ') && drawer.includes('লগআউট'))
  const small = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] a, [role="dialog"] button')].filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.textContent.trim()))
  ok('ড্রয়ারের সব লিংক/বোতাম ≥ ৪৪px উঁচু', small.length === 0, small.join(', '))
  await p.screenshot({ path: '.smoke/admin-drawer-390.png' })
  await p.close()
}

await b.close()
console.log(`\nআটকানো লেখা: ${writes.map((w) => `${w.method} ${w.path}`).join(', ') || '—'}`)
ok('অচেনা কোনো লেখা-অনুরোধ হয়নি (লাইভ ডাটাবেসে কিছু যায়নি)', blocked.length === 0, blocked.join(', '))
console.log(`\nফল: PASS ${pass}, FAIL ${fail}`)
process.exit(fail ? 1 : 0)
