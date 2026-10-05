#!/usr/bin/env node
/**
 * build-unions (M-ধাপ ৯, পরিকল্পনা §৫.১২) — ইউনিয়নের স্থির তালিকা তৈরি:
 *   উৎস nuhil/bangladesh-geocode (MIT) এর পিন করা কমিট → পরিষ্কার → bdGeo.ts এর জেলা/উপজেলার নামে join →
 *   src/features/geo/data/unionOverrides.json মেশানো → src/features/geo/data/bd-unions.json
 *
 * পরিষ্কার করা: সব নাম NFC; অদৃশ্য অক্ষর (U+200B/200E/200F/FEFF) আর বাড়তি ফাঁকা বাদ; একই উপজেলায় হুবহু একই
 * ইউনিয়ন দুবার থাকলে একটি; ২টি ভাঙা ইংরেজি নাম ঠিক (নিচে EN_FIXES)। কোনো উপজেলার ইউনিয়ন অনুমান করে যোগ হয় না।
 *
 * চালানো: npm run build-unions               → উৎস নামায় (node_modules/.cache এ), sha256 মিলিয়ে, ফাইল লেখে
 *         npm run build-unions -- --src DIR   → নামানো ছাড়া, DIR/unions.json, upazilas.json, districts.json থেকে
 *         npm run build-unions -- --check     → লেখে না; ডিস্কের ফাইল নতুন করে বানানোর সাথে না মিললে exit 1
 * Node 24 দরকার (bdGeo.ts সরাসরি import হয়)।
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { BD_GEO } from '../src/features/geo/data/bdGeo.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src/features/geo/data/bd-unions.json')
const OVERRIDES = path.join(ROOT, 'src/features/geo/data/unionOverrides.json')

const COMMIT = '5622f68bd07a98e076edcf8100bf0db6a75b9854' // রিপোর শেষ কমিট, ২০২৩-০৩-১৭ (bdGeo.ts এর একই উৎস)
const SOURCE = `nuhil/bangladesh-geocode@${COMMIT.slice(0, 7)} (MIT, © 2014 Nuhil Mehdy)`
const FILES = {
  unions: { path: 'unions/unions.json', sha256: 'a16404670a9def67c0ef058c3ade19c9f4cca4eef801c0253af8f678e96bcedc' },
  upazilas: { path: 'upazilas/upazilas.json', sha256: '336cc7c02e132c6d1146dafb1d41b6df66ab4791e100c04b62ea2d770e850026' },
  districts: { path: 'districts/districts.json', sha256: 'a66f4d81a1403c1aaa67dbe22b6f73e8e33c7bc287af06fb287e3a0937494b5f' },
}
/** উৎসের ভাঙা ইংরেজি নাম (id → [উৎসের মান, ঠিক মান]); উৎস বদলালে স্ক্রিপ্ট থামে */
const EN_FIXES = {
  1414: ['1nomohadevpur', 'Mahadevpur'], // মহাদেবপুর, নওগাঁ (সরকারি নাম "১ নং মহাদেবপুর")
  3177: ['Maijchar9', 'Maijchar'], // মাইজচর, কিশোরগঞ্জ
}

const argv = process.argv.slice(2)
const srcIdx = argv.indexOf('--src')
const CHECK = argv.includes('--check')
const die = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------- উৎস
async function loadSource() {
  const dir = srcIdx >= 0 ? path.resolve(argv[srcIdx + 1]) : path.join(ROOT, 'node_modules/.cache/bangladesh-geocode', COMMIT)
  fs.mkdirSync(dir, { recursive: true })
  const out = {}
  for (const [name, f] of Object.entries(FILES)) {
    const file = path.join(dir, path.basename(f.path))
    if (!fs.existsSync(file)) {
      if (srcIdx >= 0) die(`${file} নেই`)
      const url = `https://raw.githubusercontent.com/nuhil/bangladesh-geocode/${COMMIT}/${f.path}`
      console.log(`নামানো হচ্ছে: ${url}`)
      const r = await fetch(url)
      if (!r.ok) die(`${url} → HTTP ${r.status}`)
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
    }
    const buf = fs.readFileSync(file)
    const sha = crypto.createHash('sha256').update(buf).digest('hex')
    if (sha !== f.sha256) die(`${path.basename(file)} এর sha256 মিলছে না (${sha}) — উৎস বদলেছে; যাচাই করে FILES হালনাগাদ করুন`)
    out[name] = JSON.parse(buf.toString('utf8')).find((x) => x.type === 'table').data
  }
  return out
}

// ---------------------------------------------------------------- পরিষ্কার
const stats = { nfc: 0, trimmed: 0, invisible: 0, duplicates: [], enFixed: 0 }
/** count: শুধু ইউনিয়নের নাম গোনা হয় (জেলা/উপজেলার নামও একই নিয়মে পরিষ্কার হয়) */
function cleanBn(s, count = false) {
  const c = count ? stats : {}
  let v = s
  if (/[​‎‏﻿]/.test(v)) {
    c.invisible = (c.invisible ?? 0) + 1
    v = v.replace(/[​‎‏﻿]/g, '')
  }
  if (v !== v.normalize('NFC')) c.nfc = (c.nfc ?? 0) + 1
  v = v.normalize('NFC')
  if (v !== v.trim()) c.trimmed = (c.trimmed ?? 0) + 1
  return v.replace(/\s+/g, ' ').trim()
}
const cleanEn = (s) => s.replace(/\s+/g, ' ').trim()

// ---------------------------------------------------------------- তৈরি
function build(src, overrides) {
  const geo = new Map() // "জেলা|উপজেলা" → true (bdGeo)
  for (const dv of BD_GEO) for (const ds of dv.districts) for (const up of ds.upazilas) geo.set(`${ds.name}|${up.name}`, true)
  const districtById = new Map(src.districts.map((d) => [d.id, cleanBn(d.bn_name)]))
  const upazilaById = new Map()
  const unjoined = []
  for (const u of src.upazilas) {
    const district = districtById.get(u.district_id)
    const upazila = cleanBn(u.bn_name)
    if (!geo.has(`${district}|${upazila}`)) unjoined.push(`${district}|${upazila}`)
    upazilaById.set(u.id, { district, upazila })
  }
  if (unjoined.length) die(`bdGeo.ts এ মেলেনি এমন উপজেলা: ${unjoined.join(', ')}`)

  const d = {} // জেলা → উপজেলা → [[bn, en]]
  const list = (district, upazila) => ((d[district] ??= {})[upazila] ??= [])
  for (const u of src.unions) {
    const at = upazilaById.get(u.upazilla_id)
    if (!at) die(`ইউনিয়ন ${u.id} এর উপজেলা ${u.upazilla_id} নেই`)
    let en = cleanEn(u.name)
    const fix = EN_FIXES[u.id]
    if (fix) {
      if (en !== fix[0]) die(`EN_FIXES[${u.id}]: উৎসে এখন "${en}", আশা ছিল "${fix[0]}"`)
      en = fix[1]
      stats.enFixed++
    }
    const bn = cleanBn(u.bn_name, true)
    const arr = list(at.district, at.upazila)
    const same = arr.find((x) => x[0] === bn)
    if (same) {
      if (same[1] !== en) die(`${at.district}/${at.upazila}: "${bn}" দুবার, ভিন্ন ইংরেজি নামে (${same[1]} / ${en}) — হাতে দেখুন`)
      stats.duplicates.push(`${at.upazila}: ${bn}`)
      continue
    }
    arr.push([bn, en])
  }
  if (Object.keys(EN_FIXES).length !== stats.enFixed) die('EN_FIXES এর সব id উৎসে পাওয়া যায়নি')

  // ---- unionOverrides.json: add / rename / remove (জেলা ও উপজেলা bdGeo এর নামে)
  const where = (o, i, kind) => {
    const district = cleanBn(o.district ?? '')
    const upazila = cleanBn(o.upazila ?? '')
    if (!geo.has(`${district}|${upazila}`)) die(`unionOverrides.${kind}[${i}]: "${district}/${upazila}" bdGeo.ts এ নেই`)
    return list(district, upazila)
  }
  for (const [i, o] of (overrides.remove ?? []).entries()) {
    const arr = where(o, i, 'remove')
    const k = arr.findIndex((x) => x[0] === cleanBn(o.bn))
    if (k < 0) die(`unionOverrides.remove[${i}]: "${o.bn}" তালিকায় নেই`)
    arr.splice(k, 1)
  }
  for (const [i, o] of (overrides.rename ?? []).entries()) {
    const arr = where(o, i, 'rename')
    const x = arr.find((y) => y[0] === cleanBn(o.from))
    if (!x) die(`unionOverrides.rename[${i}]: "${o.from}" তালিকায় নেই`)
    x[0] = cleanBn(o.bn ?? x[0])
    x[1] = cleanEn(o.en ?? x[1])
  }
  for (const [i, o] of (overrides.add ?? []).entries()) {
    const arr = where(o, i, 'add')
    const bn = cleanBn(o.bn ?? '')
    if (!bn || !cleanEn(o.en ?? '')) die(`unionOverrides.add[${i}]: bn ও en দুটোই দিন`)
    if (arr.some((y) => y[0] === bn)) die(`unionOverrides.add[${i}]: "${bn}" আগে থেকেই আছে`)
    arr.push([bn, cleanEn(o.en)])
  }

  // ---- সাজানো (জেলা, উপজেলা, ইউনিয়ন — বাংলা ক্রমে), খালি তালিকা বাদ
  const coll = new Intl.Collator('bn')
  const sorted = {}
  for (const district of Object.keys(d).sort(coll.compare)) {
    for (const upazila of Object.keys(d[district]).sort(coll.compare)) {
      const arr = d[district][upazila]
      if (!arr.length) continue
      ;(sorted[district] ??= {})[upazila] = [...arr].sort((a, b) => coll.compare(a[0], b[0]))
    }
  }
  const allUpazilas = [...geo.keys()]
  const covered = allUpazilas.filter((k) => { const [ds, up] = k.split('|'); return sorted[ds]?.[up] })
  const missing = allUpazilas.filter((k) => !covered.includes(k))
  return { data: sorted, covered: covered.length, total: allUpazilas.length, missing }
}

/** এক লাইনে এক উপজেলা — git diff পড়া যায়, তবু ছোট */
function serialize(data) {
  const lines = [`{"v":1,"source":${JSON.stringify(SOURCE)},"d":{`]
  const ds = Object.keys(data)
  ds.forEach((district, i) => {
    lines.push(`${JSON.stringify(district)}:{`)
    const ups = Object.keys(data[district])
    ups.forEach((up, j) => lines.push(`${JSON.stringify(up)}:${JSON.stringify(data[district][up])}${j < ups.length - 1 ? ',' : ''}`))
    lines.push(`}${i < ds.length - 1 ? ',' : ''}`)
  })
  lines.push('}}')
  return lines.join('\n') + '\n'
}

const src = await loadSource()
const overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'))
const { data, covered, total, missing } = build(src, overrides)
const json = serialize(data)
const unions = Object.values(data).reduce((n, ups) => n + Object.values(ups).reduce((m, a) => m + a.length, 0), 0)

console.log(`উৎস: ${SOURCE} — ${src.unions.length}টি ইউনিয়ন, ${src.upazilas.length}টি উপজেলা`)
console.log(`পরিষ্কার: NFC নয় ${stats.nfc}, শুরু/শেষে ফাঁকা ${stats.trimmed}, অদৃশ্য অক্ষর ${stats.invisible}, ইংরেজি নাম ঠিক ${stats.enFixed}`)
console.log(`ডুপ্লিকেট বাদ (${stats.duplicates.length}): ${stats.duplicates.join(', ')}`)
const ov = (k) => (overrides[k] ?? []).length
console.log(`unionOverrides.json: যোগ ${ov('add')}, নাম বদল ${ov('rename')}, বাদ ${ov('remove')}`)
console.log(`ফল: ${unions}টি ইউনিয়ন, ${covered}/${total}টি উপজেলায়`)
console.log(`ইউনিয়ন-তালিকা নেই (${missing.length}): ${missing.map((k) => k.replace('|', '/')).join(', ')}`)
console.log(`আকার: ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB, gzip ${(zlib.gzipSync(json).length / 1024).toFixed(1)} KB`)

if (CHECK) {
  const disk = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
  if (disk !== json) die(`${path.relative(ROOT, OUT)} পুরনো — npm run build-unions চালান`)
  console.log(`✓ ${path.relative(ROOT, OUT)} হালনাগাদ`)
} else {
  fs.writeFileSync(OUT, json)
  console.log(`✓ লেখা হয়েছে: ${path.relative(ROOT, OUT)}`)
}
