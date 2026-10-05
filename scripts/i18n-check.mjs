// i18n অভিধান পরীক্ষা: src/ এর সব বাংলা স্ট্রিং লিটারেল (UI লেখা) বনাম src/i18n/en.ts এর key।
// ব্যবহার: node scripts/i18n-check.mjs                 → অনুপস্থিত key, অব্যবহৃত key, মোড়ানো হয়নি এমন JSX টেক্সট (অনুপস্থিত থাকলে exit 1)
//         node scripts/i18n-check.mjs --json out.json  → অনুপস্থিত key গুলো {"বাংলা": ""} JSON skeleton হিসেবে লেখে
// Node 24 (type stripping) দরকার — en.ts সরাসরি import হয়।
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
// এই ফাইল/ফোল্ডারে বাংলা লিটারেল UI লেখা নয় (ম্যাচিং ডেটা, ভূগোল, ব্যাকএন্ড)
// src/backend: ব্যাকএন্ড স্তর (M-ধাপ ৪-এ features/housing/backend থেকে সরানো); fallbackProjects.ts এর নাম ডাটাবেসের লেখা (pick() দিয়ে দেখানো হয়)
const IGNORE = [/[\\/]src[\\/]backend[\\/]/, /geoMatch\.ts$/, /fuzzyMatch\.ts$/,/bdGeo\.ts$/, /[\\/]i18n[\\/]en\.ts$/, /\.d\.ts$/]
const BN = /[ঀ-৿]/

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !IGNORE.some((re) => re.test(p))) out.push(p)
  }
  return out
}

/** কমেন্ট বাদ দিয়ে '...' / "..." / `...` (ব্যাক-টিক শুধু ${} ছাড়া) লিটারেল তোলা */
function literals(code) {
  const res = []
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const c2 = code[i + 1]
    if (c === '/' && c2 === '/') {
      i = code.indexOf('\n', i)
      if (i < 0) break
      continue
    }
    if (c === '/' && c2 === '*') {
      const e = code.indexOf('*/', i + 2)
      i = e < 0 ? n : e + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      let s = ''
      let hasExpr = false
      while (j < n && code[j] !== c) {
        if (code[j] === '\\') {
          s += code[j + 1]
          j += 2
          continue
        }
        if (c === '`' && code[j] === '$' && code[j + 1] === '{') {
          hasExpr = true
          let d = 1
          j += 2
          while (j < n && d) {
            if (code[j] === '{') d++
            else if (code[j] === '}') d--
            j++
          }
          continue
        }
        if (c !== '`' && code[j] === '\n') break
        s += code[j++]
      }
      // শুধু বাংলা অঙ্ক (digit map) UI লেখা নয়
      if (!hasExpr && BN.test(s) && !/^[০-৯]+$/.test(s)) res.push(s)
      i = j + 1
      continue
    }
    i++
  }
  return res
}

/** JSX টেক্সট নোড যেগুলো এখনো {t('…')} এ মোড়ানো হয়নি (>বাংলা<) */
function rawJsxText(code) {
  const out = []
  const re = />([^<>{}\n]*[ঀ-৿][^<>{}\n]*)</g
  let m
  while ((m = re.exec(code))) out.push(m[1].trim())
  return out
}

/**
 * দুই-ভাষার ডাটা-জোড়া (`label_bn: '…'`, `name_bn: '…'` …) অভিধানের লেখা নয় — pick()/lt() দিয়ে দেখানো হয়
 * (যেমন features/projects/registry/icons.tsx এর বাছাইয়ের নাম)। তাই লিটারেল তোলার আগে বাদ।
 */
function stripBilingualPairs(code) {
  return code.replace(/\b(\w+_bn)\s*:\s*(['"`])(?:\\.|(?!\2)[^\\])*\2/g, "$1: ''")
}

/**
 * সন্দেহজনক t(): ডাটাবেসের লেখা t() দিয়ে নয়, pick()/lt() দিয়ে দেখাতে হয় (পরিকল্পনা §৫.১৩)।
 * যেমন t(project.name_bn), t(meta.title), t(field.label_bn), t(x.description) — শুধু সতর্কবার্তা।
 * (t(item.label) এর মতো কোডের স্থির লেবেল বৈধ, তাই শুধু _bn/_en, title, description, summary ধরা হয়।)
 */
function suspiciousT(code) {
  const out = []
  const re = /\bt\(\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)+)\s*[,)]/g
  let m
  while ((m = re.exec(code))) {
    const last = m[1].split('.').pop()
    if (/(_bn|_en)$|^(title|description|summary)$/.test(last)) out.push(m[0].replace(/[,)]$/, ')'))
  }
  return out
}

const { EN } = await import(pathToFileURL(path.join(SRC, 'i18n', 'en.ts')).href)

const used = new Map() // key → files
const rawJsx = []
const dbTextInT = []
for (const file of walk(SRC)) {
  const original = fs.readFileSync(file, 'utf8')
  const code = stripBilingualPairs(original)
  const rel = path.relative(ROOT, file)
  for (const s of suspiciousT(original)) dbTextInT.push(`${rel}: ${s}`)
  for (const s of literals(code)) {
    if (!used.has(s)) used.set(s, new Set())
    used.get(s).add(rel)
  }
  // `//` কমেন্টের "<path> গুলোয় … <g>" কে JSX টেক্সট না ভাবতে কমেন্ট-লাইন বাদ
  if (file.endsWith('.tsx')) for (const s of rawJsxText(code.replace(/^\s*\/\/.*$/gm, ''))) rawJsx.push(`${rel}: ${s}`)
}

const missing = [...used.keys()].filter((k) => !(k in EN)).sort()
const unused = Object.keys(EN).filter((k) => !used.has(k)).sort()
const badPlaceholders = Object.entries(EN).filter(([bn, en]) => {
  const p = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',')
  return p(bn) !== p(en)
})

const jsonIdx = process.argv.indexOf('--json')
if (jsonIdx > 0) {
  const outPath = process.argv[jsonIdx + 1]
  const obj = {}
  for (const k of missing) obj[k] = ''
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2))
  console.log(`wrote ${missing.length} missing keys → ${outPath}`)
}

console.log(`বাংলা লিটারেল (UI): ${used.size} · EN অভিধান: ${Object.keys(EN).length}`)
if (rawJsx.length) {
  console.log(`\n⚠ t() ছাড়া JSX টেক্সট (${rawJsx.length}):`)
  for (const s of rawJsx) console.log('  ' + s)
}
if (dbTextInT.length) {
  console.log(`\n⚠ ডাটাবেসের লেখা t() দিয়ে? pick()/lt() ব্যবহার করুন (${dbTextInT.length}):`)
  for (const s of dbTextInT) console.log('  ' + s)
}
if (badPlaceholders.length) {
  console.log(`\n⚠ প্লেসহোল্ডার মেলেনি (${badPlaceholders.length}):`)
  for (const [bn, en] of badPlaceholders) console.log(`  ${bn}  ⇢  ${en}`)
}
if (unused.length) {
  console.log(`\nℹ অব্যবহৃত EN key (${unused.length}):`)
  for (const k of unused) console.log('  ' + k)
}
if (missing.length) {
  console.log(`\n✗ অনুবাদ নেই (${missing.length}):`)
  for (const k of missing) console.log(`  ${k}   [${[...used.get(k)].join(', ')}]`)
  process.exit(1)
}
console.log('\n✓ সব বাংলা লিটারেলের ইংরেজি অনুবাদ আছে')
