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
const IGNORE = [/[\\/]backend[\\/]/, /geoMatch\.ts$/, /bdGeo\.ts$/, /[\\/]i18n[\\/]en\.ts$/, /\.d\.ts$/, /\.test\.tsx?$/]
// importColumns.ts এ শিরোনাম-ম্যাচিং alias গুলো (aliases: [...]) অনুবাদের দরকার নেই — নিচে বাদ দেওয়া হয়
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

function stripAliasArrays(code) {
  // importColumns.ts: aliases: ['…', '…'] → বাদ
  return code.replace(/aliases:\s*\[[^\]]*\]/g, 'aliases: []')
}

const { EN } = await import(pathToFileURL(path.join(SRC, 'i18n', 'en.ts')).href)

const used = new Map() // key → files
const rawJsx = []
for (const file of walk(SRC)) {
  let code = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  if (/importColumns\.ts$/.test(file)) code = stripAliasArrays(code)
  for (const s of literals(code)) {
    if (!used.has(s)) used.set(s, new Set())
    used.get(s).add(rel)
  }
  if (file.endsWith('.tsx')) for (const s of rawJsxText(code)) rawJsx.push(`${rel}: ${s}`)
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
