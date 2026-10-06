#!/usr/bin/env node
/**
 * মানচিত্র ডাটা তৈরি: GADM 4.1 (level 3 = উপজেলা) → বাংলা নাম যুক্ত → সরলীকৃত TopoJSON → public/geo/bd-upazilas.json
 *
 * চালানো:  npm run build-map -- --in path/to/gadm41_BGD_3.json
 *   (উৎস: https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_BGD_3.json — GADM লাইসেন্স: একাডেমিক/অবাণিজ্যিক ব্যবহার ফ্রি;
 *    বাণিজ্যিক ব্যবহারে https://gadm.org/license.html দেখুন)
 *
 * নাম মেলানো: GADM এর ইংরেজি NAME_2/NAME_3 → data/bdGeo.ts এর `en` নামের সাথে; বানান-ভিন্নতার জন্য phonetic-fold + Levenshtein ≤ 2
 * (শুধু সেই জেলার উপজেলার মধ্যে)। সিটি-কর্পোরেশন থানা (ঢাকা/চট্টগ্রাম/খুলনা মেট্রো) আমাদের তালিকায় নেই → up = null (ম্যাপে ধূসর)।
 * ফলাফল properties: { id, dv, ds, up, en } — dv/ds/up বাংলা (NFC), ডাটাবেসের মানের সাথে সরাসরি মেলে।
 */
import fs from 'node:fs'
import path from 'node:path'
import mapshaper from 'mapshaper'
import { BD_GEO } from '../src/features/geo/data/bdGeo.ts'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : [])).filter((x) => x.length))
const input = args.in
if (!input || !fs.existsSync(input)) {
  console.error('ত্রুটি: --in <gadm41_BGD_3.json> দিন')
  process.exit(1)
}
const OUT = path.resolve('public/geo/bd-upazilas.json')
const SIMPLIFY = args.simplify ?? '12%'

// ---------------------------------------------------------------- নাম মেলানো
const fold = (s) =>
  String(s)
    .toLowerCase()
    .replace(/upazila|upazilla|paurashava|thana|city|corporation|ind\.?area/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/ph/g, 'f')
    .replace(/(.)\1+/g, '$1') // ডাবল অক্ষর
    .replace(/[aou]/g, 'a') // স্বরধ্বনি a/o/u এক
    .replace(/[ie]/g, 'i')
    .replace(/y/g, 'i')
    .replace(/w/g, 'b')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')

function lev(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

/** candidates: [{key, item}] → সেরা মিল (exact fold, নইলে lev ≤ maxD ও অনন্য সেরা) */
function best(names, candidates, maxD = 2) {
  const keys = names.map(fold).filter(Boolean)
  for (const k of keys) {
    const exact = candidates.find((c) => c.key === k)
    if (exact) return { item: exact.item, how: 'exact' }
  }
  let scored = []
  for (const c of candidates) {
    const d = Math.min(...keys.map((k) => lev(k, c.key)))
    scored.push({ c, d })
  }
  scored.sort((a, b) => a.d - b.d)
  if (scored.length && scored[0].d <= maxD && (scored.length === 1 || scored[1].d > scored[0].d)) {
    return { item: scored[0].c.item, how: `fuzzy(d=${scored[0].d})` }
  }
  return null
}

// জেলার ইংরেজি নামের পুরনো/নতুন বানান (GADM → bdGeo)
const DIST_ALIAS_RAW = { comilla: 'cumilla', chittagong: 'chattogram', barisal: 'barishal', jessore: 'jashore', bogra: 'bogura', nawabganj: 'chapainawabganj', maulvibazar: 'moulvibazar', jhalokati: 'jhalakathi', brahamanbaria: 'brahmanbaria' }
const DIST_ALIAS = Object.fromEntries(Object.entries(DIST_ALIAS_RAW).map(([k, v]) => [fold(k), v]))
/** জানা ভুল fuzzy-মিল আটকাতে: "জেলা/GADM-নাম" → null (মেলাবে না) বা সঠিক bdGeo ইংরেজি নাম */
const MANUAL = {
  'Dhaka/Adabor': null, // ঢাকা মেট্রো থানা — দোহার নয়
  'Chittagong/Patenga': null, // চট্টগ্রাম মেট্রো থানা — পটিয়া নয়
  'Rajbari/Goalandaghat': 'Goalanda',
  'Pirojpur/Nesarabad(Swarupkati)': 'Nesarabad',
  'Barisal/BarisalSadar(Kotwali)': 'Barisal Sadar',
  'Noakhali/NoakhaliSadar(Sudharam)': 'Noakhali Sadar',
  'Rangamati/Kawkhali(Betbunia)': 'Kawkhali',
}
const districts = BD_GEO.flatMap((v) => v.districts.map((d) => ({ dv: v.name, dvEn: v.en, ds: d.name, dsEn: d.en, ups: d.upazilas })))
const distCands = districts.map((d) => ({ key: fold(d.dsEn), item: d }))

const gadm = JSON.parse(fs.readFileSync(input, 'utf8'))
const report = { exact: 0, fuzzy: [], unmatchedUp: [], unmatchedDs: new Set() }

for (const f of gadm.features) {
  const p = f.properties
  const dsRaw = String(p.NAME_2)
  const dsNames = [DIST_ALIAS[fold(dsRaw)] ?? dsRaw, dsRaw]
  const dm = best(dsNames, distCands, 2)
  let dv = null, ds = null, up = null
  if (dm) {
    dv = dm.item.dv
    ds = dm.item.ds
    const manualKey = `${p.NAME_2}/${p.NAME_3}`
    const cands = dm.item.ups.map((u) => ({ key: fold(u.en), item: u }))
    let upNames = [p.NAME_3, ...String(p.NAME_3).split(/[()]/).filter(Boolean), ...(p.VARNAME_3 && p.VARNAME_3 !== 'NA' ? String(p.VARNAME_3).split('|') : [])]
    let um
    if (manualKey in MANUAL) {
      const target = MANUAL[manualKey]
      um = target ? best([target], cands, 0) : null
      if (target && !um) console.warn(`MANUAL লক্ষ্য পাওয়া যায়নি: ${manualKey} → ${target}`)
    } else {
      um = best(upNames, cands, 2)
    }
    if (um) {
      up = um.item.name
      if (um.how === 'exact') report.exact++
      else report.fuzzy.push(`${p.NAME_2}/${p.NAME_3} → ${ds}/${up} [${um.how}]`)
    } else {
      report.unmatchedUp.push(`${p.NAME_2}/${p.NAME_3}`)
    }
  } else {
    report.unmatchedDs.add(dsRaw)
  }
  f.properties = { id: p.GID_3, dv, ds, up, en: p.NAME_3 }
}

// ---------------------------------------------------------------- সরলীকরণ + TopoJSON
const out = await mapshaper.applyCommands(
  `-i in.json -simplify ${SIMPLIFY} keep-shapes -clean -o out.json format=topojson quantization=10000 id-field=id`,
  { 'in.json': JSON.stringify(gadm) },
)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
const buf = out['out.json']
fs.writeFileSync(OUT, buf)
const kb = (buf.length / 1024).toFixed(0)

// ---------------------------------------------------------------- রিপোর্ট
console.log(`ফিচার: ${gadm.features.length} | হুবহু মিল: ${report.exact} | fuzzy মিল: ${report.fuzzy.length} | না-মেলা উপজেলা: ${report.unmatchedUp.length} | না-মেলা জেলা: ${[...report.unmatchedDs].join(', ') || 'নেই'}`)
console.log(`আউটপুট: ${OUT} (${kb} KB, simplify ${SIMPLIFY})`)
console.log('\n--- fuzzy মিল (পর্যালোচনা করুন) ---')
console.log(report.fuzzy.join('\n'))
console.log('\n--- না-মেলা উপজেলা (ম্যাপে ধূসর; মূলত সিটি-কর্পোরেশন থানা) ---')
console.log(report.unmatchedUp.join(', '))
