#!/usr/bin/env node
/**
 * geo-check (M-ধাপ ৯) — ইউনিয়নের ডাটা, মেলানো, ইংরেজি নাম, কম্বোবক্স (ব্রাউজারে) আর বিল্ডের chunk।
 *   ক. ডাটা: bd-unions.json এর সংখ্যা, পরিষ্কার (NFC/ফাঁকা/অদৃশ্য অক্ষর/ডুপ্লিকেট), bdGeo.ts এর সাথে join, মীরসরাই ১৬টি
 *   খ. মেলানো: matchUnion / resolveGeo এর ৪র্থ স্তর — "ইউনিয়ন/ইউপি/union/UP" বাদ, "পৌরসভা/ওয়ার্ড" বাদ নয়, উপজেলার ভেতরেই
 *   গ. gnUnion: ইংরেজি মোডে পুরো পথ ধরে ইংরেজি নাম, পৌরসভা → Municipality
 *   ঘ. ব্রাউজার: src/dev/geo-demo.html (dev সার্ভারে) — সাজেশন, নিজে লেখা, হলুদ সতর্কতা, পৌরসভা চিপ, কীবোর্ড, ইংরেজি, ফোন
 *   ঙ. বিল্ড: vite build — ইউনিয়নের ডাটা আলাদা chunk এ (শুধু lazy import), মূল বান্ডল বাড়েনি
 * চালানো (ঘ এর জন্য আগে npm run dev): npm run geo-check  [-- --base http://localhost:5173] [--no-ui] [--no-build]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { BD_GEO } from '../src/features/geo/data/bdGeo.ts'
import { matchUnion, resolveGeo } from '../src/features/geo/geoMatch.ts'
import { gnUnion, hasUnionList, loadUnions, unionsOf } from '../src/features/geo/unions.ts'
import { setCurrentLang } from '../src/i18n/core.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const bi = argv.indexOf('--base')
const BASE = (bi >= 0 ? argv[bi + 1] : 'http://localhost:5173').replace(/\/+$/, '')

let pass = 0
let fail = 0
const ok = (n, c, info = '') => {
  if (c) pass++
  else fail++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`)
}
const section = (s) => console.log(`\n— ${s}`)

// ---------------------------------------------------------------- ক. ডাটা
section('ক. ডাটা (bd-unions.json)')
const raw = fs.readFileSync(path.join(ROOT, 'src/features/geo/data/bd-unions.json'), 'utf8')
const data = await loadUnions()
const pairs = Object.entries(data.d).flatMap(([ds, ups]) => Object.entries(ups).flatMap(([up, list]) => list.map((x) => ({ ds, up, bn: x[0], en: x[1] }))))
const upCount = Object.values(data.d).reduce((n, ups) => n + Object.keys(ups).length, 0)
ok('৪,৫৩৭টি ইউনিয়ন (উৎসের ৪,৫৪০ − ৩টি ডুপ্লিকেট), ৪৮৯টি উপজেলায়', pairs.length === 4537 && upCount === 489, `${pairs.length} / ${upCount}`)
const geoKeys = new Set(BD_GEO.flatMap((v) => v.districts.flatMap((d) => d.upazilas.map((u) => `${d.name}|${u.name}`))))
ok('প্রতিটি জেলা/উপজেলা bdGeo.ts এ আছে (৪৯৪টির মধ্যে)', Object.entries(data.d).every(([ds, ups]) => Object.keys(ups).every((up) => geoKeys.has(`${ds}|${up}`))) && geoKeys.size === 494)
const missing = [...geoKeys].filter((k) => { const [ds, up] = k.split('|'); return !data.d[ds]?.[up] }).map((k) => k.split('|')[1]).sort()
ok('তালিকা নেই শুধু ৫টিতে: গুইমারা, নলডাঙ্গা, ঈদগাঁও, মধ্যনগর, ডাসার', missing.join(',') === ['ঈদগাঁও', 'গুইমারা', 'ডাসার', 'নলডাঙ্গা', 'মধ্যনগর'].sort().join(','), missing.join(', '))
ok('সব বাংলা নাম NFC, ফাঁকা/অদৃশ্য অক্ষর নেই', pairs.every((p) => p.bn === p.bn.normalize('NFC') && p.bn === p.bn.trim() && !/\s{2}|[\u200B\u200E\u200F\uFEFF]/.test(p.bn)))
ok('সব ইংরেজি নাম আছে, অঙ্ক নেই ("1nomohadevpur", "Maijchar9" ঠিক)', pairs.every((p) => p.en && !/\d/.test(p.en)) && pairs.some((p) => p.en === 'Mahadevpur' && p.ds === 'নওগাঁ') && pairs.some((p) => p.en === 'Maijchar'))
const dupWithin = Object.values(data.d).flatMap((ups) => Object.values(ups)).filter((l) => new Set(l.map((x) => x[0])).size !== l.length)
ok('একই উপজেলায় একই নাম দুবার নেই (আওয়াজপুর, তালিমপুর, ভজনপুর একবার)', dupWithin.length === 0 && unionsOf(data, 'ভোলা', 'চরফ্যাশন').filter((x) => x[0] === 'আওয়াজপুর').length === 1)
const mir = unionsOf(data, 'চট্টগ্রাম', 'মীরসরাই')
ok('মীরসরাই (চট্টগ্রাম): ১৬টি ইউনিয়ন', mir.length === 16, mir.map((x) => x[0]).join(', '))
const nat = new Map()
for (const p of pairs) nat.set(p.bn, (nat.get(p.bn) ?? 0) + 1)
const repeated = [...nat.values()].filter((n) => n > 1).length
// উৎসে ৩২৭টি (পরিকল্পনা §৫.১২); একই উপজেলার ৩টি ডুপ্লিকেট বাদে ৩২৪
ok('একই নাম দেশে একাধিকবার: ৩২৪টি নাম (উৎসে ৩২৭, ডুপ্লিকেট বাদে) — তাই পুরো পথ ধরে খোঁজা', repeated === 324, String(repeated))
const gz = zlib.gzipSync(raw).length
ok('আকার ≈ ৫৩ KB gzip (≤ ৬০ KB)', gz <= 60 * 1024, `${(gz / 1024).toFixed(1)} KB`)

// ---------------------------------------------------------------- খ. মেলানো
section('খ. মেলানো (matchUnion, resolveGeo)')
const mu = (s, ds = 'চট্টগ্রাম', up = 'মীরসরাই') => matchUnion(s, data, ds, up)
ok('"করেরহাট" হুবহু; শুরু/শেষের ফাঁকাও হুবহু', mu('করেরহাট').match === 'করেরহাট' && !mu('করেরহাট').corrected && mu(' করেরহাট  ').match === 'করেরহাট')
for (const s of ['করেরহাট ইউনিয়ন', 'করেরহাট ইউপি', 'Korerhat Union', 'korerhat UP', 'কড়েরহাট']) {
  const m = mu(s)
  ok(`"${s}" → করেরহাট (স্বয়ংক্রিয় সংশোধিত)`, m.match === 'করেরহাট' && m.corrected, JSON.stringify(m))
}
const pm = mu('মীরসরাই পৌরসভা')
ok('"মীরসরাই পৌরসভা" ইউনিয়ন "মীরসরাই" এর সাথে মেলে না (পৌরসভা শব্দ বাদ যায় না)', pm.match === null && pm.listed, JSON.stringify(pm))
const wm = mu('মীরসরাই ওয়ার্ড ৩')
ok('"মীরসরাই ওয়ার্ড ৩" মেলে না (ওয়ার্ড শব্দ বাদ যায় না)', wm.match === null)
ok('অন্য উপজেলার ইউনিয়ন ("সুবিল") মীরসরাইতে মেলে না', mu('সুবিল').match === null)
ok('কাছাকাছি বানানে পরামর্শ ("করেরহা" → করেরহাট)', mu('করেরহা').suggestions.includes('করেরহাট'), mu('করেরহা').suggestions.join(','))
const r0 = resolveGeo('চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই')
ok('resolveGeo: ইউনিয়ন না দিলে আগের মতো (union অংশ নেই)', r0.union === undefined && r0.upazila === 'মীরসরাই')
const r1 = resolveGeo('চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই', {}, { union: 'জোরারগঞ্জ ইউনিয়ন', unions: data })
ok('resolveGeo ৪র্থ স্তর: "জোরারগঞ্জ ইউনিয়ন" → জোরারগঞ্জ (corrected)', r1.union?.value === 'জোরারগঞ্জ' && r1.union.status === 'corrected', JSON.stringify(r1.union))
const r2 = resolveGeo('চট্টগ্রাম', 'Chattogram', 'Mirsharai', {}, { union: 'মীরসরাই পৌরসভা', unions: data })
ok('resolveGeo: জেলা/উপজেলা ইংরেজিতে, পৌরসভা → unlisted (লেখাটিই থাকে, ত্রুটি নয়)', r2.upazila === 'মীরসরাই' && r2.union?.value === 'মীরসরাই পৌরসভা' && r2.union.status === 'unlisted' && r2.unresolved.length === 0, JSON.stringify(r2.union))
const r3 = resolveGeo('চট্টগ্রাম', 'খাগড়াছড়ি', 'গুইমারা', {}, { union: 'হাফছড়ি', unions: data })
ok('resolveGeo: তালিকাহীন উপজেলা (গুইমারা) → no_list', r3.union?.status === 'no_list' && r3.union.value === 'হাফছড়ি' && !hasUnionList(data, 'খাগড়াছড়ি', 'গুইমারা'), JSON.stringify(r3.union))
ok('resolveGeo: খালি ইউনিয়ন → empty', resolveGeo('চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই', {}, { union: '  ', unions: data }).union?.status === 'empty')

// ---------------------------------------------------------------- গ. gnUnion
section('গ. ইংরেজি নাম (gnUnion)')
ok('বাংলা মোডে বাংলাই', gnUnion('চট্টগ্রাম', 'মীরসরাই', 'করেরহাট') === 'করেরহাট')
setCurrentLang('en')
ok('ইংরেজি মোডে: করেরহাট → Korerhat', gnUnion('চট্টগ্রাম', 'মীরসরাই', 'করেরহাট') === 'Korerhat')
ok('ইংরেজি মোডে: মীরসরাই পৌরসভা → Mirsharai Municipality', gnUnion('চট্টগ্রাম', 'মীরসরাই', 'মীরসরাই পৌরসভা') === 'Mirsharai Municipality', gnUnion('চট্টগ্রাম', 'মীরসরাই', 'মীরসরাই পৌরসভা'))
ok('ইংরেজি মোডে: তালিকায় নেই এমন নাম যেমন আছে', gnUnion('চট্টগ্রাম', 'মীরসরাই', 'অচেনা গ্রাম') === 'অচেনা গ্রাম')
// একই বাংলা নাম, ভিন্ন জায়গায় ভিন্ন ইংরেজি বানান → পুরো পথ ধরে
const twin = [...new Set(pairs.map((p) => p.bn))].map((bn) => pairs.filter((p) => p.bn === bn)).find((g) => new Set(g.map((p) => p.en)).size > 1)
ok(`একই নাম ভিন্ন পথে ভিন্ন ইংরেজি ("${twin?.[0].bn}": ${twin?.map((p) => p.en).join(' / ')})`, !!twin && twin.every((p) => gnUnion(p.ds, p.up, p.bn) === p.en))
setCurrentLang('bn')

// ---------------------------------------------------------------- ঘ. ব্রাউজার
if (!argv.includes('--no-ui')) {
  section(`ঘ. ব্রাউজার (${BASE}/src/dev/geo-demo.html)`)
  const { default: puppeteer } = await import('puppeteer-core')
  const BROWSER = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find((p) => fs.existsSync(p))
  if (!BROWSER) {
    ok('Chrome/Edge পাওয়া গেছে (CHROME_PATH)', false)
  } else {
    const b = await puppeteer.launch({ executablePath: BROWSER, headless: true })
    const page = async (width = 1024, mobile = false, lang = 'bn') => {
      const p = await b.newPage()
      await p.setViewport({ width, height: 900, isMobile: mobile, hasTouch: mobile })
      await p.evaluateOnNewDocument((l) => localStorage.setItem('asf_lang', l), lang)
      p.errors = []
      p.unionReqs = []
      p.on('pageerror', (e) => p.errors.push(e.message))
      p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text().slice(0, 200)))
      p.on('request', (r) => /bd-unions/.test(r.url()) && p.unionReqs.push(r.url()))
      await p.goto(`${BASE}/src/dev/geo-demo.html`, { waitUntil: 'networkidle0' })
      return p
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const state = (p) => p.evaluate(() => JSON.parse(document.querySelector('[data-testid="state"]').textContent))
    const pickGeo = async (p, dv, ds, up) => {
      await p.select('#f-division', dv)
      await p.select('#f-district', ds)
      await p.select('#f-upazila', up)
      await sleep(150)
    }
    const options = (p) => p.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim()))
    const typeUnion = async (p, s) => {
      const el = await p.$('#f-union')
      await el.focus()
      await p.keyboard.down('Control')
      await p.keyboard.press('KeyA')
      await p.keyboard.up('Control')
      await p.keyboard.press('Backspace')
      if (s) await el.type(s)
      await sleep(100)
    }
    const blur = async (p) => {
      await p.evaluate(() => document.activeElement?.blur())
      await sleep(150)
    }
    const text = (p) => p.evaluate(() => document.body.innerText)

    let p
    try {
      p = await page()
      ok('পাতা খোলার সময় ইউনিয়নের ডাটা নামে না (lazy)', p.unionReqs.length === 0, p.unionReqs.join(', '))
      ok('উপজেলা না বাছলে ইউনিয়নের ঘর বন্ধ ("আগে উপজেলা")', await p.$eval('#f-union', (e) => e.disabled && e.placeholder === 'আগে উপজেলা'))
      await pickGeo(p, 'চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই')
      await p.focus('#f-union')
      await p.waitForSelector('[role="option"]', { timeout: 10000 }).catch(() => {})
      const opts = await options(p)
      ok('মীরসরাই বাছলে ডাটা নামে, ফোকাসে ১৬টি সাজেশন', p.unionReqs.length >= 1 && opts.length === 16 && opts.includes('করেরহাট'), `${opts.length}: ${opts.slice(0, 4).join(', ')} …`)
      ok('"তালিকায় ১৬টি ইউনিয়ন" ও "+ মীরসরাই পৌরসভা" চিপ', (await text(p)).includes('তালিকায় ১৬টি ইউনিয়ন') && (await text(p)).includes('+ মীরসরাই পৌরসভা'))
      const sizes = await p.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => o.getBoundingClientRect().height))
      ok('প্রতিটি সাজেশন ≥ ৪৪px উঁচু (আঙুলে চাপা যায়)', sizes.every((h) => h >= 43.5), String(Math.min(...sizes)))
      await typeUnion(p, 'জোরার')
      ok('লেখার সাথে সাজেশন ছোট হয় ("জোরার" → জোরারগঞ্জ)', (await options(p)).join() === 'জোরারগঞ্জ', (await options(p)).join())
      await p.keyboard.press('ArrowDown')
      await p.keyboard.press('Enter')
      await sleep(100)
      ok('↓ + Enter → বাছাই (ফর্ম সাবমিট নয়)', (await state(p)).value.union_name === 'জোরারগঞ্জ' && (await p.$$('[role="option"]')).length === 0)
      await typeUnion(p, 'করেরহাট ইউনিয়ন')
      await blur(p)
      const s1 = await state(p)
      ok('"করেরহাট ইউনিয়ন" লিখে ঘর ছাড়লে তালিকার বানান "করেরহাট"', s1.value.union_name === 'করেরহাট' && s1.union.status === 'exact', JSON.stringify(s1.union))
      ok('তালিকার নামে কোনো হলুদ সতর্কতা নেই', !(await p.$('[role="status"]')))
      await typeUnion(p, 'মীরসরাই পৌরসভা')
      await blur(p)
      const warn = await p.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
      const s2 = await state(p)
      ok('"মীরসরাই পৌরসভা" লেখা যায় — হলুদ সতর্কতা, মান থাকে', s2.value.union_name === 'মীরসরাই পৌরসভা' && s2.union.status === 'unlisted' && warn.includes('তালিকায় নেই') && warn.includes('সংরক্ষণ আটকাবে না'), warn.slice(0, 80))
      await typeUnion(p, '')
      await blur(p)
      await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '+ মীরসরাই পৌরসভা')?.click())
      await sleep(100)
      ok('"পৌরসভা" চিপ চাপলে "মীরসরাই পৌরসভা"', (await state(p)).value.union_name === 'মীরসরাই পৌরসভা')
      await typeUnion(p, 'করেরহা')
      await blur(p)
      const near = await p.evaluate(() => [...document.querySelectorAll('[role="status"] button')].map((x) => x.textContent.trim()))
      ok('ভুল বানানে "কাছাকাছি:" পরামর্শ, চাপলে বসে', near.includes('করেরহাট'), near.join(','))
      await p.evaluate(() => [...document.querySelectorAll('[role="status"] button')].find((x) => x.textContent.trim() === 'করেরহাট')?.click())
      await sleep(100)
      ok('পরামর্শ চাপলে "করেরহাট"', (await state(p)).value.union_name === 'করেরহাট')
      await p.select('#f-upazila', 'সীতাকুণ্ড')
      await sleep(100)
      ok('উপজেলা বদলালে ইউনিয়ন খালি হয়', (await state(p)).value.union_name === '')
      await p.select('#f-district', 'খাগড়াছড়ি')
      await p.select('#f-upazila', 'গুইমারা')
      await sleep(150)
      ok('গুইমারা: "এই উপজেলার ইউনিয়ন-তালিকা নেই — নিজে লিখুন।", সাজেশন নেই', (await text(p)).includes('এই উপজেলার ইউনিয়ন-তালিকা নেই') && (await p.$$('[role="option"]')).length === 0)
      await typeUnion(p, 'হাফছড়ি')
      await blur(p)
      ok('গুইমারায় নিজে লেখা চলে, হলুদ সতর্কতা নেই', (await state(p)).value.union_name === 'হাফছড়ি' && !(await p.$('[role="status"]')))
      ok('কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
      await p.screenshot({ path: '.smoke/geo-demo.png', fullPage: true })
      await p.close()

      p = await page(1024, false, 'en')
      await pickGeo(p, 'চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই')
      await p.focus('#f-union')
      await p.waitForSelector('[role="option"]', { timeout: 10000 }).catch(() => {})
      const enOpts = await options(p)
      ok('ইংরেজি মোড: সাজেশনে ইংরেজি নাম আগে ("Korerhat (করেরহাট)")', enOpts.includes('Korerhat (করেরহাট)'), enOpts.slice(0, 3).join(', '))
      await typeUnion(p, 'korerhat')
      await blur(p)
      const s3 = await state(p)
      ok('ইংরেজিতে "korerhat" লিখলে ডাটায় বাংলা "করেরহাট", দেখায় "Korerhat"', s3.value.union_name === 'করেরহাট' && s3.shown === 'Korerhat' && (await text(p)).includes('→ Korerhat'), JSON.stringify(s3))
      ok('ইংরেজি মোড: চিপ "+ Mirsharai Municipality"', (await text(p)).includes('+ Mirsharai Municipality'))
      ok('ইংরেজি মোডে কোনো page error নেই', p.errors.length === 0, p.errors.join(' | '))
      await p.screenshot({ path: '.smoke/geo-demo-en.png', fullPage: true })
      await p.close()

      p = await page(390, true)
      await pickGeo(p, 'চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই')
      await p.focus('#f-union')
      await p.waitForSelector('[role="option"]', { timeout: 10000 }).catch(() => {})
      const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      ok('৩৯০px: অনুভূমিক ওভারফ্লো নেই, তালিকা খোলে', !over && (await options(p)).length === 16)
      await p.screenshot({ path: '.smoke/geo-demo-390.png' })
      await p.close()
    } catch (e) {
      ok(`ব্রাউজার-পরীক্ষা চলেছে (dev সার্ভার ${BASE} চালু?)`, false, e.message.slice(0, 160))
    }
    await b.close()
  }
}

// ---------------------------------------------------------------- ঙ. বিল্ড
// M-ধাপ ১০ থেকে রেকর্ড-ফর্ম (lazy এডমিন পাতা) ইউনিয়নের কম্বোবক্স ব্যবহার করে — তাই প্রোডাকশন বিল্ডেই যাচাই:
// ইউনিয়নের ডাটা নিজের chunk এ, শুধু lazy import() দিয়ে, মূল বান্ডলে কখনো নয়।
// M-ধাপ ১৩ থেকে পাবলিক তালিকা-পেইজও (মূল বান্ডলে) lazy import() করতে পারে — শুধু ডাটায় ইউনিয়ন থাকলে
// (ইউনিয়ন-ফিল্টার, বা ইংরেজিতে ইউনিয়নের নাম); ঘর নির্মাণে এখনো নামে না। তাই মূল বান্ডল থেকে lazy রেফারেন্স চলে।
if (!argv.includes('--no-build')) {
  section('ঙ. বিল্ড (vite build — .smoke/geo-build)')
  const { build } = await import('vite')
  const out = path.join(ROOT, '.smoke/geo-build')
  await build({ root: ROOT, logLevel: 'silent', build: { outDir: out, emptyOutDir: true } })
  const js = fs.readdirSync(path.join(out, 'assets')).filter((x) => x.endsWith('.js')).map((x) => path.join(out, 'assets', x))
  const src = (x) => fs.readFileSync(x, 'utf8')
  const indexJs = js.find((x) => /^index-[\w-]+\.js$/.test(path.basename(x)))
  const indexBytes = fs.statSync(indexJs).size
  const unionChunk = js.filter((x) => src(x).includes('করেরহাট'))
  const lazyRef = js.filter((x) => /import\(\s*[`"']\.\/bd-unions-/.test(src(x)))
  const staticRef = js.filter((x) => /(from|import)\s*[`"']\.\/bd-unions-/.test(src(x)))
  const ucGz = unionChunk[0] ? zlib.gzipSync(fs.readFileSync(unionChunk[0])).length : 0
  ok('ইউনিয়নের ডাটা একটিই আলাদা chunk এ (মূল বান্ডলে নয়)', unionChunk.length === 1 && unionChunk[0] !== indexJs && /^bd-unions-/.test(path.basename(unionChunk[0])), unionChunk.map((x) => path.basename(x)).join(', '))
  ok('ইউনিয়নের chunk শুধু lazy import() দিয়ে আসে (কোথাও স্থির import নয়)', lazyRef.length >= 1 && staticRef.length === 0, `${lazyRef.map((x) => path.basename(x)).join(', ')} → ${path.basename(unionChunk[0] ?? '')} (${(ucGz / 1024).toFixed(1)} KB gzip)`)
  // সর্বশেষ মাপা: M-ধাপ ১৩ এর বিল্ডে মূল বান্ডল ২৮২,৯৯৩ বাইট (Vite: 282.99 kB, gzip 86.18 kB) — M-ধাপ ১০ এ ছিল ২৭৩,০৯৬;
  // বৃদ্ধি জেনেরিক তালিকা-পেইজের (ক্যাটাগরি-চার্ট, ইউনিয়ন/ক্যাটাগরি ফিল্টার, কনফিগ-চালিত কলাম)। পরের ধাপে বদলালে হালনাগাদ করুন
  ok('মূল বান্ডল বাড়েনি (M-ধাপ ১৩: ২৮২,৯৯৩ বাইট)', indexBytes <= 282993, `${indexBytes} বাইট`)
}

console.log(`\nফল: PASS ${pass}, FAIL ${fail}`)
process.exit(fail ? 1 : 0)
