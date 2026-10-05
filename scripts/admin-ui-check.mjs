#!/usr/bin/env node
/**
 * admin-ui-check (পর্ব ২, M-ধাপ ৭) — এডমিন প্যানেলের UI পরীক্ষা আসল ব্রাউজারে, এডমিন লগইন ছাড়াই:
 *   - নকল "মূল এডমিন" সেশন (ব্রাউজারে নকল টোকেন; housing_current_admin এর উত্তর এখানেই)
 *   - পড়া (প্রকল্প, ফিল্ড, স্ট্যাট, ওভারভিউ) লাইভ থেকে anon হিসেবে — Node এ আনা, তাই খসড়া/গোপন কিছু আসে না
 *   - **সব লেখা এখানেই আটকানো** (প্রকল্প তৈরি/বদল/ক্রম — নকল উত্তর); অচেনা কোনো লেখা-অনুরোধ হলে 403 ও FAIL।
 *     লাইভ ডাটাবেসে কিছুই যায় না।
 * পরীক্ষা: ড্যাশবোর্ড, প্রকল্পের তালিকা ও অপ্রকাশের নিশ্চিতকরণ (বাতিল), উইজার্ড (slug নিয়ম, project_create এর ইনপুট),
 *          সেটিংস (গার্ড-ত্রুটি, CONFLICT), ফোনের ড্রয়ার (৪৪px)। স্ক্রিনশট .smoke/admin-*.png
 * চালানো (আগে অন্য টার্মিনালে npm run dev): npm run admin-ui-check  [-- --base http://localhost:5173]
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

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

async function handle(req) {
  const url = req.url()
  if (!url.startsWith(SB)) return req.continue()
  const u = new URL(url)
  const method = req.method()
  const respond = (status, body, headers = {}) =>
    req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  if (method === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  if (u.pathname.startsWith('/auth/v1/')) {
    if (u.pathname.endsWith('/user')) return respond(200, USER)
    if (u.pathname.endsWith('/logout')) return respond(204, '')
    return respond(200, SESSION)
  }
  if (u.pathname === '/rest/v1/rpc/housing_current_admin') return respond(200, [{ role: 'main_admin', email: USER.email }])
  if (u.pathname === '/rest/v1/housing_activity_log') return respond(200, [], { 'content-range': '*/0' })
  if (u.pathname === '/rest/v1/rpc/housing_log_event') return respond(200, 'null')

  const readRpc = ['projects_overview', 'project_stats', 'housing_stats', 'housing_years', 'housing_next_serial']
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
    if (created && method === 'GET' && u.pathname === '/rest/v1/projects') {
      const arr = JSON.parse(text)
      arr.push(created.project)
      text = JSON.stringify(arr)
    }
    if (created && method === 'GET' && u.pathname === '/rest/v1/project_fields') {
      const arr = JSON.parse(text)
      arr.push(...created.fields)
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
    return accept.includes('vnd.pgrst.object') ? respond(200, { key }) : respond(200, [{ key }])
  }
  if (u.pathname === '/rest/v1/rpc/projects_reorder') return respond(200, '3')
  blocked.push(`${method} ${u.pathname}`)
  return respond(403, { code: '42501', message: 'test: blocked write' })
}

const b = await puppeteer.launch({ executablePath: BROWSER, headless: true })
async function newPage(width = 1280, mobile = false) {
  const p = await b.newPage()
  await p.setViewport({ width, height: mobile ? 844 : 900, isMobile: mobile, hasTouch: mobile })
  await p.evaluateOnNewDocument(
    (k, s) => {
      localStorage.setItem(k, s)
      localStorage.setItem('asf_lang', 'bn')
    },
    `sb-${REF}-auth-token`,
    JSON.stringify(SESSION),
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
  ok('ড্যাশবোর্ড খোলে (নকল মূল এডমিন), প্রতিটি প্রকল্পের কার্ড', p.url().endsWith('/admin') && cards.join('|') === 'ঘর নির্মাণ প্রকল্প|সেমিপাকা ঘর নির্মাণ|টিনের ঘর নির্মাণ', cards.join('|'))
  const nums = await p.$$eval('article dd', (d) => d.map((x) => x.textContent.trim()))
  ok('ড্যাশবোর্ডের সংখ্যা: ঘর নির্মাণ ১০, সেমিপাকা ১০, টিন ০ রেকর্ড; টাকা "—"', nums[0] === '১০' && nums[3] === '১০' && nums[6] === '০' && nums[1] === '—', nums.join(' '))
  ok('প্রকাশিত সারাংশ: ২টি প্রকল্প · ১০ জন · ১টি জেলা', s.includes('প্রকাশিত: ২টি প্রকল্প · ১০ জন উপকারভোগী · ১টি জেলা'))
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
  ok('প্রকল্পের তালিকা: গ্রুপ, তারপর তার উপ-প্রকল্প', rows.join('|') === 'ঘর নির্মাণ প্রকল্প|সেমিপাকা ঘর নির্মাণ|টিনের ঘর নির্মাণ', rows.join('|'))
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
