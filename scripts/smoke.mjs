#!/usr/bin/env node
/**
 * Smoke টেস্ট (M-ধাপ ১) — আসল ব্রাউজারে (ইনস্টল করা Chrome/Edge, puppeteer-core) সাইটের মূল পেইজগুলো
 * ফোন/ট্যাব/ডেস্কটপ প্রস্থে, বাংলা ও ইংরেজিতে খুলে দেখে:
 *   - অনুভূমিক ওভারফ্লো নেই (পেইজ পাশে স্ক্রল হয় না)
 *   - console error বা page error নেই
 *   - বৈধ URL এ "পেইজটি পাওয়া যায়নি" (404) বা লাল ত্রুটি-বক্স (ErrorBoundary) বা "লোড করা যায়নি" নেই
 *   - অবৈধ URL এ 404 পেইজ আসে
 *   - মানচিত্র খুলে অনেক জায়গায় ট্যাপ/ক্লিক করলে পেইজ ভাঙে না (২০২৬-১০-০১ এর বাগের রিগ্রেশন)
 *   - বৈধ ডিপ লিংকে এক মুহূর্তের জন্যও 404 লেখা আসে না (M-ধাপ ৬: রেজিস্ট্রি-চালিত রাউট)
 *   - পুরনো /housing/admin/* লিংক সঠিক নতুন ঠিকানায় যায় (slug → key; লগইন ছাড়া তাই শেষে /admin/login, ফেরার-পাথ যাচাই)
 * প্রতিটি পেইজের স্ক্রিনশট রাখে `.smoke/<label>/` এ (gitignored)।
 *
 * চালানো (আগে আরেকটি টার্মিনালে `npm run dev`):
 *   npm run smoke                         পুরো পরীক্ষা (প্রস্থ ৩৬০, ৩৯০, ৭৬৮, ১০২৪, ১২৮০ × বাংলা/ইংরেজি) → .smoke/latest/
 *   npm run smoke -- --baseline           বেসলাইন স্ক্রিনশট → .smoke/baseline/ (আগে থাকলে --force লাগবে)
 *   npm run smoke -- --quick              দ্রুত: শুধু ৩৯০ ও ১২৮০, শুধু বাংলা
 *   npm run smoke -- --base http://10.11.115.50:5173   অন্য ঠিকানা
 *   npm run smoke -- --widths 390,768 --langs en
 *   npm run smoke -- --legacy             পুরনো-ডাটাবেস মোড (M-ধাপ ৪): নিজেই আলাদা dev সার্ভার (পোর্ট ৫১৭৯) চালায়
 *                                         VITE_SIMULATE_LEGACY_DB=1 দিয়ে — adapter ভাবে SQL ১০–১২ নেই → .smoke/legacy/
 * প্রতিটি রানের শেষে "ব্যাকএন্ড-পথ" পরীক্ষা: সাধারণ মোডে project_stats চলে (housing_stats নয়);
 * --legacy তে উল্টো — projects/project_stats/projects_overview এ কোনো কলই যায় না, housing_stats চলে।
 * ব্রাউজার খোঁজে: CHROME_PATH (env) → Chrome → Edge (Windows/macOS/Linux এর সাধারণ পাথ)।
 * শুধু পড়ে/দেখে — কোনো ফর্ম জমা দেয় না, লগইন করে না, ডাটাবেসে কিছু লেখে না।
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'

// ---------------------------------------------------------------- আর্গুমেন্ট
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const QUICK = flag('quick')
const LEGACY = flag('legacy')
const LEGACY_PORT = 5179
const OWN_SERVER = LEGACY && !opt('base', null)
const BASE = opt('base', LEGACY ? `http://localhost:${LEGACY_PORT}` : 'http://localhost:5173').replace(/\/+$/, '')
const LABEL = flag('baseline') ? 'baseline' : opt('label', LEGACY ? 'legacy' : 'latest')
const WIDTHS = opt('widths', QUICK ? '390,1280' : '360,390,768,1024,1280').split(',').map(Number).filter(Boolean)
const LANGS = opt('langs', QUICK ? 'bn' : 'bn,en').split(',').filter((l) => l === 'bn' || l === 'en')
const MAP_WIDTHS = new Set([390, 1280])
const OUT = path.resolve('.smoke', LABEL)

if (LABEL === 'baseline' && fs.existsSync(OUT) && !flag('force')) {
  console.error(`বেসলাইন আগে থেকেই আছে: ${OUT}\nনতুন করে নিতে চাইলে: npm run smoke -- --baseline --force`)
  process.exit(1)
}

// ---------------------------------------------------------------- ব্রাউজার
function findBrowser() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean)
  return c.find((p) => fs.existsSync(p)) ?? null
}
const BROWSER = findBrowser()
if (!BROWSER) {
  console.error('ত্রুটি: Chrome বা Edge পাওয়া যায়নি। ইনস্টল করুন, অথবা CHROME_PATH env এ ব্রাউজারের পাথ দিন।')
  process.exit(1)
}

// ---------------------------------------------------------------- সার্ভার চালু আছে?
/** --legacy: নিজস্ব dev সার্ভার, পুরনো-ডাটাবেস সিমুলেশনসহ (শেষে বন্ধ হয়) */
let server = null
const stopServer = () => {
  if (server && !server.killed) server.kill()
}
if (OWN_SERVER) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(LEGACY_PORT), '--strictPort'], {
    env: { ...process.env, VITE_SIMULATE_LEGACY_DB: '1' },
    stdio: 'ignore',
  })
  process.on('exit', stopServer)
}
async function reachable(timeoutMs) {
  const until = Date.now() + timeoutMs
  do {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 3000)
      await fetch(BASE, { signal: ctl.signal })
      clearTimeout(t)
      return true
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  } while (Date.now() < until)
  return false
}
if (!(await reachable(OWN_SERVER ? 30000 : 6000))) {
  console.error(
    OWN_SERVER
      ? `ত্রুটি: পুরনো-ডাটাবেস মোডের dev সার্ভার (পোর্ট ${LEGACY_PORT}) চালু হয়নি — পোর্টটি অন্য কিছু ব্যবহার করছে কি?`
      : `ত্রুটি: ${BASE} খোলা যাচ্ছে না। আগে আরেকটি টার্মিনালে \`npm run dev\` চালান, তারপর আবার \`npm run smoke\`।`,
  )
  process.exit(1)
}

// ---------------------------------------------------------------- বিস্তারিত পেইজের জন্য একটি আসল সিরিয়াল
loadEnv('.env.local')
loadEnv('.env')
async function firstSerial(projectType) {
  const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (!url || !key) return null
  try {
    const r = await fetch(`${url}/rest/v1/housing_beneficiaries?select=serial_no,year&project_type=eq.${projectType}&order=serial_no&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
    const rows = r.ok ? await r.json() : []
    return rows[0] ?? null
  } catch {
    return null
  }
}
const semiFirst = await firstSerial('semi_pucca')
const semiSerial = semiFirst?.serial_no ?? null

/**
 * M-ধাপ ১৬: ঘর নির্মাণ ছাড়া বাকি **প্রকাশিত** প্রকল্প (anon যা দেখে — খসড়া নয়) নিজে থেকে তালিকায়:
 * একক/উপ-প্রকল্পের তালিকা-পাতা + প্রথম রেকর্ডের বিস্তারিত, গ্রুপের ল্যান্ডিং। যেমন /self-reliance, /skill-based-entrepreneur।
 * পুরনো-ডাটাবেস মোডে নয় (সেখানে শুধু ঘর নির্মাণ)।
 */
async function publishedProjectPages() {
  const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (LEGACY || !url || !key) return []
  try {
    const r = await fetch(`${url}/rest/v1/projects?select=key,slug,parent_key,is_group,is_published&is_published=eq.true&order=sort_order,key`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
    const all = r.ok ? await r.json() : []
    const pages = []
    for (const p of all) {
      if (['housing', 'semi_pucca', 'tin'].includes(p.key)) continue
      const parent = all.find((x) => x.key === p.parent_key)
      if (p.parent_key && !parent) continue // গ্রুপ অপ্রকাশিত — পাবলিক নয়
      const path = parent ? `/${parent.slug}/${p.slug}` : `/${p.slug}`
      if (p.is_group) {
        pages.push({ name: `group-${p.key}`, path, expect: 'ok' })
        continue
      }
      pages.push({ name: `list-${p.key}`, path, expect: 'ok' })
      const first = await firstSerial(p.key)
      if (first) pages.push({ name: `detail-${p.key}`, path: `${path}/${first.serial_no}`, expect: 'ok', viewportOnly: true, dialog: true })
    }
    return pages
  } catch {
    return []
  }
}
const extraPages = await publishedProjectPages()
if (extraPages.length) console.log(`প্রকাশিত অন্য প্রকল্প: ${extraPages.map((p) => p.path).join(', ')}`)

/** @type {{name:string, path:string, expect:'ok'|'notfound', viewportOnly?:boolean, dialog?:boolean, expectPath?:string, expectFrom?:string, widths?:number[]}[]} */
const PAGES = [
  { name: 'home', path: '/', expect: 'ok' },
  { name: 'housing', path: '/housing', expect: 'ok' },
  { name: 'housing-slash', path: '/housing/', expect: 'ok' },
  { name: 'list-semi', path: '/housing/semi-pucca', expect: 'ok' },
  { name: 'list-tin', path: '/housing/tin', expect: 'ok' },
  ...(semiSerial ? [{ name: 'detail-semi', path: `/housing/semi-pucca/${semiSerial}`, expect: 'ok', viewportOnly: true, dialog: true }] : []),
  ...(semiSerial ? [{ name: 'detail-semi-year', path: `/housing/semi-pucca/${semiSerial}?year=${semiFirst.year}`, expect: 'ok', viewportOnly: true, dialog: true }] : []),
  ...extraPages,
  { name: 'admin-login', path: '/admin/login', expect: 'ok', expectPath: '/admin/login' },
  // পুরনো এডমিন লিংক (M-ধাপ ৬): লগইন ছাড়া শেষে লগইন পেইজ; ফেরার-পাথ (state.from) = সঠিক নতুন ঠিকানা
  ...[
    ['/housing/admin/login', '/admin/login', undefined],
    ['/housing/admin', '/admin/login', '/admin'],
    ['/housing/admin/semi-pucca', '/admin/login', '/admin/records/semi_pucca'],
    ['/housing/admin/tin/3/edit?x=1', '/admin/login', '/admin/records/tin/3/edit?x=1'],
    ['/housing/admin/semi-pucca/new', '/admin/login', '/admin/records/semi_pucca/new'],
    ['/housing/admin/import', '/admin/login', '/admin/import'],
    ['/admin/records/semi_pucca', '/admin/login', '/admin/records/semi_pucca'],
  ].map(([from, to, back], i) => ({ name: `redirect-${i + 1}`, path: from, expect: 'ok', viewportOnly: true, expectPath: to, expectFrom: back, widths: [390, 1280] })),
  { name: 'not-found', path: '/smoke-check-no-such-page', expect: 'notfound' },
]

const NOT_FOUND_TEXT = ['পেইজটি পাওয়া যায়নি', 'Page not found']
const BOUNDARY_TEXT = ['কিছু একটা ভুল হয়েছে', 'Something went wrong']
const LOAD_ERROR_TEXT = ['লোড করা যায়নি', 'Could not load', 'সংযোগ কনফিগার করা হয়নি', 'not configured']

// ---------------------------------------------------------------- চালানো
fs.mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const started = Date.now()
/** পেইজগুলো ডাটাবেসের কোন টেবিল/RPC ডেকেছে (Supabase REST পাথ → সংখ্যা) */
const apiHits = new Map()

console.log(`Smoke${LEGACY ? ' (পুরনো-ডাটাবেস মোড)' : ''}: ${BASE} · প্রস্থ ${WIDTHS.join('/')} · ভাষা ${LANGS.join('/')} · স্ক্রিনশট → ${path.relative(process.cwd(), OUT)}`)
console.log(`ব্রাউজার: ${BROWSER}${semiSerial ? '' : '\n(বিস্তারিত পেইজ বাদ — .env.local নেই বা কোনো রেকর্ড নেই)'}\n`)

try {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const mobile = width < 1024
      const page = await browser.newPage()
      await page.setViewport({ width, height: mobile ? 844 : 900, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
      await page.evaluateOnNewDocument((l) => {
        try {
          localStorage.setItem('asf_lang', l)
        } catch {
          /* ignore */
        }
      }, lang)
      // ডিপ লিংকে ক্ষণিকের 404 ধরা: DOM এ কখনো 404 লেখা এলে চিহ্ন রাখে
      await page.evaluateOnNewDocument((texts) => {
        const check = () => {
          const s = document.body?.textContent ?? ''
          if (texts.some((x) => s.includes(x))) window.__saw404 = true
        }
        new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true })
      }, NOT_FOUND_TEXT)
      let errors = []
      /** এই পাতার আলাদা আলাদা ডাটা-কল (একই অনুরোধ দুবার — dev এর StrictMode — একবার গোনা) */
      let pageCalls = new Set()
      page.on('request', (r) => {
        const m = r.url().match(/\/rest\/v1\/((?:rpc\/)?[a-z_]+)/)
        if (m) apiHits.set(m[1], (apiHits.get(m[1]) ?? 0) + 1)
        if (m && r.method() !== 'OPTIONS') pageCalls.add(`${r.method()} ${r.url()} ${r.postData() ?? ''}`)
      })
      page.on('pageerror', (e) => errors.push(`page error: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 240)}`)
      })

      for (const pg of PAGES) {
        if (pg.widths && !pg.widths.includes(width)) continue
        errors = []
        pageCalls = new Set()
        const problems = []
        try {
          await page.goto(BASE + pg.path, { waitUntil: 'networkidle0', timeout: 45000 })
          await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 12000 }).catch(() => problems.push('লোড শেষ হয়নি (aria-busy ১২ সেকেন্ডেও আছে)'))
          await sleep(300)
          problems.push(...(await inspect(page, pg)))
          // M-ধাপ ১৫: হোমে ডাটা-কল ≤ ২ (রেজিস্ট্রি ১ + projects_overview ১); পুরনো ডাটাবেসে ফলব্যাক ≤ ৩ (housing_stats প্রতি প্রকল্পে)
          const maxCalls = LEGACY ? 3 : 2
          if (pg.name === 'home' && pageCalls.size > maxCalls) problems.push(`হোমে ${pageCalls.size}টি API কল (সর্বোচ্চ ${maxCalls}): ${[...pageCalls].map((c) => c.split('?')[0].replace(/^.*\/rest\/v1\//, '')).join(', ')}`)
        } catch (e) {
          problems.push(`খোলা যায়নি: ${e.message}`)
        }
        problems.push(...errors)
        const shot = path.join(OUT, `${lang}-${width}-${pg.name}.png`)
        await page.screenshot({ path: shot, fullPage: !pg.viewportOnly }).catch(() => {})
        record(lang, width, pg.name, problems)
      }

      if (MAP_WIDTHS.has(width)) {
        errors = []
        const problems = []
        try {
          problems.push(...(await mapCheck(page, mobile)))
        } catch (e) {
          problems.push(`মানচিত্র পরীক্ষা চালানো যায়নি: ${e.message}`)
        }
        problems.push(...errors)
        await page.screenshot({ path: path.join(OUT, `${lang}-${width}-map.png`) }).catch(() => {})
        record(lang, width, 'map-taps', problems)
      }
      await page.close()
    }
  }
  backendPathCheck()
} finally {
  await browser.close()
  stopServer()
}

// ---------------------------------------------------------------- রিপোর্ট
const failed = results.filter((r) => r.problems.length)
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), widths: WIDTHS, langs: LANGS, results }, null, 2))
console.log(`\nফল: PASS ${results.length - failed.length}, FAIL ${failed.length} · সময় ${Math.round((Date.now() - started) / 1000)} সেকেন্ড`)
console.log(`স্ক্রিনশট ও report.json: ${path.relative(process.cwd(), OUT)}`)
process.exit(failed.length ? 2 : 0)

// ================================================================ সহায়ক
/** কোন পথে ডাটা এসেছে তা প্রমাণ: সাধারণ মোডে নতুন RPC, --legacy তে শুধু পুরনোগুলো */
function backendPathCheck() {
  const n = (k) => apiHits.get(k) ?? 0
  const p = []
  const NEW = ['projects', 'project_fields', 'beneficiary_private', 'rpc/project_stats', 'rpc/projects_overview']
  if (LEGACY) {
    for (const k of NEW) if (n(k)) p.push(`পুরনো-ডাটাবেস মোডে "${k}" ডাকা হয়েছে (${n(k)} বার) — সিমুলেশন কাজ করছে না`)
    if (!n('rpc/housing_stats')) p.push('পুরনো-ডাটাবেস মোডে housing_stats একবারও ডাকা হয়নি — স্ট্যাট কোথা থেকে এল?')
  } else {
    if (!n('rpc/project_stats')) p.push('project_stats একবারও ডাকা হয়নি (SQL ১১ চালানো না থাকলে এটাই স্বাভাবিক — তখন --legacy এর মতো চলে)')
    if (n('rpc/housing_stats')) p.push(`housing_stats ডাকা হয়েছে (${n('rpc/housing_stats')} বার) — নতুন ডাটাবেসে ফলব্যাক চলছে কেন?`)
  }
  const summary = [...apiHits].sort().map(([k, v]) => `${k}×${v}`).join(', ')
  console.log(`\nডাটাবেসে যাওয়া কল: ${summary || '—'}`)
  record('all', 0, 'backend-path', p)
}

function record(lang, width, name, problems) {
  results.push({ lang, width, name, problems })
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${lang} ${String(width).padStart(4)}  ${name}${problems.length ? '\n      - ' + problems.join('\n      - ') : ''}`)
}

async function inspect(page, pg) {
  const s = await page.evaluate(
    (nf, eb, le) => {
      const text = document.body?.innerText ?? ''
      const alerts = [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent ?? '').join(' | ')
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        rootEmpty: !document.getElementById('root')?.children.length,
        notFound: nf.some((t) => text.includes(t)),
        boundary: eb.some((t) => alerts.includes(t)),
        loadError: le.find((t) => text.includes(t)) ?? null,
        dialog: !!document.querySelector('[role="dialog"]'),
        title: document.title,
        path: location.pathname,
        from: history.state?.usr?.from ?? null,
        saw404: !!window.__saw404,
      }
    },
    NOT_FOUND_TEXT,
    BOUNDARY_TEXT,
    LOAD_ERROR_TEXT,
  )
  const p = []
  if (s.rootEmpty) p.push('পেইজ সাদা (#root খালি)')
  if (s.scrollW > s.innerW + 1) p.push(`অনুভূমিক ওভারফ্লো: scrollWidth ${s.scrollW} > ${s.innerW}`)
  if (s.boundary) p.push('লাল ত্রুটি-বক্স (ErrorBoundary) দেখা যাচ্ছে')
  if (pg.expect === 'ok' && s.notFound) p.push('বৈধ URL এ 404 পেইজ')
  if (pg.expect === 'notfound' && !s.notFound) p.push('অবৈধ URL এ 404 পেইজ আসেনি')
  if (pg.expect === 'ok' && s.loadError) p.push(`ডাটা লোড ত্রুটি: "${s.loadError}"`)
  if (pg.dialog && !s.dialog) p.push('বিস্তারিত মডাল খোলেনি')
  if (pg.expect === 'ok' && s.saw404) p.push('ক্ষণিকের জন্য 404 লেখা দেখা গেছে (ডিপ লিংক)')
  if (pg.expectPath && s.path !== pg.expectPath) p.push(`ভুল ঠিকানা: ${s.path} (চাই ${pg.expectPath})`)
  if (pg.expectPath && (s.from ?? undefined) !== pg.expectFrom) p.push(`লগইনের পরে ফেরার-পাথ ${s.from} (চাই ${pg.expectFrom})`)
  if (!s.title || s.title === 'asf-website') p.push(`ট্যাবের শিরোনাম নেই: "${s.title}"`)
  return p
}

/** তালিকা পেইজে মানচিত্র খুলে এলোমেলো ২০টি ট্যাপ/ক্লিক (ফোনে touch) — পেইজ যেন না ভাঙে */
async function mapCheck(page, mobile) {
  const p = []
  await page.goto(BASE + '/housing/semi-pucca', { waitUntil: 'networkidle0', timeout: 45000 })
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-expanded="false"]')].find((x) => /মানচিত্র|map/i.test(x.textContent ?? ''))
    if (!b) return false
    b.click()
    return true
  })
  if (!opened) return ['মানচিত্র খোলার বাটন পাওয়া যায়নি']
  const drawn = await page
    .waitForFunction(() => document.querySelectorAll('svg[role="img"] path[data-id]').length >= 400, { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (!drawn) return ['মানচিত্র ২০ সেকেন্ডে আঁকা হয়নি']
  await page.evaluate(() => document.querySelector('svg[role="img"]')?.scrollIntoView({ block: 'center' }))
  await sleep(300)
  const box = await page.evaluate(() => {
    const r = document.querySelector('svg[role="img"]').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  for (let i = 0; i < 20; i++) {
    // নির্ধারিত ছড়ানো বিন্দু (প্রতিবার একই, যাতে ফল তুলনীয় থাকে)
    const x = box.x + box.w * (0.1 + ((i * 37) % 80) / 100)
    const y = box.y + box.h * (0.1 + ((i * 53) % 80) / 100)
    if (mobile) await page.touchscreen.tap(x, y)
    else await page.mouse.click(x, y)
    await sleep(120)
    const broken = await page.evaluate((eb) => {
      const alerts = [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent ?? '').join(' ')
      return !document.getElementById('root')?.children.length || eb.some((t) => alerts.includes(t))
    }, BOUNDARY_TEXT)
    if (broken) {
      p.push(`${i + 1} নম্বর ট্যাপে পেইজ ভেঙেছে`)
      break
    }
  }
  return p
}

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
