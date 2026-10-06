#!/usr/bin/env node
/**
 * stats-filter-check (ফিল্টার অনুযায়ী পরিসংখ্যান, SQL ১৫) — লাইভে **শুধু পড়ে**, লগইন ছাড়া (anon key):
 * প্রতিটি প্রকাশিত প্রকল্পে কয়েক রকম ফিল্টার (প্রতিটি সাল, জেলা, ক্যাটাগরির মান, সাল+জেলা, নামের অংশে সার্চ) দিয়ে
 *   ক) তালিকার একই ফিল্টারে আনা সারিগুলো (PostgREST — অ্যাপের list() এর একই শর্ত) থেকে হাতে গোনা
 *   খ) project_stats_filtered এর উত্তর
 * মেলায়: মোট, জেলা/উপজেলা/ইউনিয়ন কভার, টাকা/সংখ্যার যোগফল, ক্যাটাগরির ভিন্ন মান।
 * ফাংশন না থাকলে (SQL ১৫ চালানো হয়নি) SKIP।
 * চালানো: npm run stats-filter-check
 */
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
const URL_ = env.VITE_SUPABASE_URL.replace(/\/+$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

let pass = 0
let fail = 0
const ok = (label, cond, detail = '') => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
}
const rpc = async (fn, args) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) })
  return { r, body: await r.text() }
}

/** অ্যাপের list() এর একই শর্তে সারি আনা (পাতা ধরে, সর্বোচ্চ ২০০০০) */
async function rowsFor(key, f, pub) {
  const qs = new URLSearchParams({ select: 'year,division,district,upazila,union_name,extra', project_type: `eq.${key}` })
  if (f.year !== undefined) qs.set('year', `eq.${f.year}`)
  if (f.division) qs.set('division', `eq.${f.division}`)
  if (f.district) qs.set('district', `eq.${f.district}`)
  if (f.upazila) qs.set('upazila', `eq.${f.upazila}`)
  if (f.union_name) qs.set('union_name', `eq.${f.union_name}`)
  for (const [k, v] of Object.entries(f.fields ?? {})) qs.append('extra', `cs.${JSON.stringify({ [k]: v })}`)
  if (f.q) {
    const like = `%${f.q}%`
    const extra = pub.filter((x) => x.searchable).map((x) => `extra->>${x.key}.ilike.${like}`)
    qs.set('or', `(${[`name.ilike.${like}`, `father_or_husband_name.ilike.${like}`, `address.ilike.${like}`, ...extra].join(',')})`)
  }
  const out = []
  for (let from = 0; from < 20000; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/housing_beneficiaries?${qs}`, { headers: { ...H, range: `${from}-${from + 999}` } })
    const page = await r.json()
    if (!Array.isArray(page)) throw new Error(JSON.stringify(page).slice(0, 200))
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

function countFrom(rows, pub) {
  const uniq = (fn) => new Set(rows.map(fn).filter((x) => x !== null)).size
  const fields = {}
  for (const x of pub.filter((p) => ['money', 'number', 'category'].includes(p.type))) {
    if (x.type === 'category') fields[x.key] = uniq((r) => (typeof r.extra?.[x.key] === 'string' && r.extra[x.key] !== '' ? r.extra[x.key] : null))
    else fields[x.key] = rows.reduce((a, r) => a + (typeof r.extra?.[x.key] === 'number' ? r.extra[x.key] : 0), 0)
  }
  return {
    total: rows.length,
    districts: uniq((r) => r.district),
    upazilas: uniq((r) => `${r.district}|${r.upazila}`),
    unions: uniq((r) => (r.union_name ? `${r.district}|${r.upazila}|${r.union_name}` : null)),
    fields,
  }
}

const probe = await rpc('project_stats_filtered', { p_key: 'semi_pucca', p_filters: {} })
if (probe.r.status === 404 && /PGRST202/.test(probe.body)) {
  console.log('SKIP  project_stats_filtered নেই — আগে 15_filtered_stats.sql চালান (চেকলিস্ট সারি ৩৭)')
  process.exitCode = 3
} else await main()

async function main() {

const projects = await fetch(`${URL_}/rest/v1/projects?select=key,is_group,project_fields(key,type,visibility,is_active,filterable,searchable)&is_group=eq.false&order=sort_order`, { headers: H }).then((r) => r.json())
let combos = 0
for (const p of projects) {
  const pub = (p.project_fields ?? []).filter((f) => f.visibility === 'public' && f.is_active)
  const all = await rowsFor(p.key, {}, pub)
  if (!all.length) {
    console.log(`—     ${p.key}: রেকর্ড নেই, বাদ`)
    continue
  }
  const filters = [{}]
  for (const y of new Set(all.map((r) => r.year))) filters.push({ year: y })
  for (const d of new Set(all.map((r) => r.district))) filters.push({ district: d })
  for (const r of all.slice(0, 3)) filters.push({ year: r.year, district: r.district, upazila: r.upazila })
  for (const c of pub.filter((f) => f.type === 'category' && f.filterable)) {
    for (const v of [...new Set(all.map((r) => r.extra?.[c.key]).filter((v) => typeof v === 'string' && v))].slice(0, 15)) filters.push({ fields: { [c.key]: v } })
  }
  const nameRow = await fetch(`${URL_}/rest/v1/housing_beneficiaries?select=name&project_type=eq.${p.key}&limit=1`, { headers: H }).then((r) => r.json())
  if (nameRow[0]?.name?.length >= 3) filters.push({ q: nameRow[0].name.slice(0, 3) })
  const bad = []
  for (const f of filters) {
    const want = countFrom(await rowsFor(p.key, f, pub), pub)
    const { body } = await rpc('project_stats_filtered', { p_key: p.key, p_filters: f })
    const got = JSON.parse(body)
    const gotFields = Object.fromEntries(Object.entries(got.fields ?? {}).map(([k, v]) => [k, v.type === 'category' ? v.distinct : Number(v.sum)]))
    const same = got.total === want.total && got.distinct?.districts === want.districts && got.distinct?.upazilas === want.upazilas && got.distinct?.unions === want.unions && JSON.stringify(gotFields, Object.keys(gotFields).sort()) === JSON.stringify(want.fields, Object.keys(gotFields).sort())
    if (!same) bad.push(`${JSON.stringify(f)} → পেয়েছি ${JSON.stringify({ total: got.total, ...got.distinct, fields: gotFields })}, চাই ${JSON.stringify(want)}`)
    combos++
  }
  ok(`${p.key}: ${filters.length}টি ফিল্টারে পরিসংখ্যান = তালিকার সারি থেকে গোনা (মোট ${all.length})`, bad.length === 0, bad.slice(0, 2).join(' | '))
}
console.log(`\nফল: PASS ${pass}, FAIL ${fail} · মোট ${combos}টি ফিল্টার মেলানো হয়েছে (শুধু পড়া)`)
process.exitCode = fail ? 2 : 0
}
