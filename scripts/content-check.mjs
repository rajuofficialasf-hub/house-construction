#!/usr/bin/env node
/**
 * কনটেন্ট-চেক (পর্ব ২, M-ধাপ ৪) — লগইন ছাড়া (anon) যা দেখা যায়, তার সারসংক্ষেপ:
 *   - প্রকল্পের তালিকা (গ্রুপ/উপ-প্রকল্প, প্রকাশ, slug, ছবি-মোড, ভূগোলের স্তর), ফিল্ড, স্ট্যাট কার্ড
 *   - হোম পেইজের ওভারভিউ (projects_overview): প্রতিটি প্রকল্পে মোট, মোট উপকারভোগী, জেলা
 *   - কোথায় ইংরেজি খালি (ইংরেজি মোডে সেখানে বাংলা দেখাবে) — শুধু সতর্কবার্তা, কখনো ব্যর্থ হয় না
 * SQL ১০/১১ চালানো না থাকলে জানায় যে সাইট "ফলব্যাক" (পুরনো-ডাটাবেস পথ) এ চলছে।
 *
 * চালানো: npm run content-check   (.env.local থেকে শুধু VITE_SUPABASE_URL ও anon key পড়ে; কিছু লেখে না)
 */
import fs from 'node:fs'

for (const f of ['.env.local', '.env']) loadEnv(f)
const URL_ = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const KEY = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
if (!URL_ || !KEY) {
  console.error('ত্রুটি: .env.local এ VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY নেই।')
  process.exit(1)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const MISSING = new Set(['PGRST205', '42P01', 'PGRST202', '42883', 'PGRST204', '42703'])

async function call(path, init) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H, ...init })
  const text = await r.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { ok: r.ok, status: r.status, body, missing: !r.ok && MISSING.has(body?.code) }
}

const warnings = []
const warn = (where, what) => warnings.push(`${where}: ${what}`)
const empty = (s) => typeof s !== 'string' || s.trim() === ''

console.log(`কনটেন্ট-চেক (anon) · ${URL_}\n`)

// ---------------------------------------------------------------- প্রকল্প ও ফিল্ড
const pr = await call('projects?select=*&order=sort_order,key')
let projects = []
let fields = []
if (pr.missing) {
  console.log('⚠ projects টেবিল নেই — SQL ১০ চালানো হয়নি। সাইট "ফলব্যাক" এ চলছে: ঘর নির্মাণের ৩টি প্রকল্প কোডের')
  console.log('  src/backend/fallbackProjects.ts থেকে আসে, স্ট্যাট আসে পুরনো housing_stats থেকে। এতে কোনো ক্ষতি নেই।\n')
} else if (!pr.ok) {
  console.error(`ত্রুটি: projects পড়া যায়নি (HTTP ${pr.status}) ${JSON.stringify(pr.body).slice(0, 200)}`)
  process.exit(1)
} else {
  projects = pr.body
  const fr = await call('project_fields?select=*&order=project_key,sort_order')
  fields = fr.ok ? fr.body : []
  const byKey = new Map(projects.map((p) => [p.key, p]))
  console.log(`প্রকল্প (${projects.length}টি, লগইন ছাড়া যা দেখা যায় — খসড়া এখানে আসে না):`)
  for (const p of projects) {
    const kind = p.is_group ? 'গ্রুপ' : p.parent_key ? `উপ-প্রকল্প (${p.parent_key})` : 'একক'
    const path = p.parent_key ? `/${byKey.get(p.parent_key)?.slug ?? p.parent_key}/${p.slug}` : `/${p.slug}`
    const own = fields.filter((f) => f.project_key === p.key)
    console.log(`  • ${p.key} — ${p.name_bn} / ${p.name_en}`)
    console.log(`      ${kind} · ${path} · ছবি ${p.photo_mode} · ভূগোল ${p.geo_depth} · ফিল্ড ${own.length}টি · স্ট্যাট কার্ড ${(p.stat_cards ?? []).length}টি${p.show_on_home ? '' : ' · হোমে নেই'}`)
    for (const f of own) {
      console.log(`        - ${f.key} (${f.type}${f.required ? ', আবশ্যক' : ''}${f.is_active ? '' : ', আর্কাইভ'}) — ${f.label_bn}${f.label_en ? ' / ' + f.label_en : ''}`)
    }

    // ইংরেজি খালি
    const at = `প্রকল্প ${p.key}`
    if (empty(p.name_en)) warn(at, 'name_en খালি')
    if (!empty(p.summary_bn) && empty(p.summary_en)) warn(at, 'summary_en খালি (কার্ডের ছোট বর্ণনা)')
    if (!empty(p.description_bn) && empty(p.description_en)) warn(at, 'description_en খালি (পেইজের পরিচিতি)')
    if (!empty(p.unit_bn) && empty(p.unit_en)) warn(at, 'unit_en খালি')
    if (!p.is_group && p.photo_mode === 'before_after' && !empty(p.prev_label_bn) && empty(p.prev_label_en)) warn(at, 'prev_label_en খালি')
    if (!p.is_group && p.photo_mode !== 'none' && !empty(p.current_label_bn) && empty(p.current_label_en)) warn(at, 'current_label_en খালি')
    for (const c of p.stat_cards ?? []) {
      if (empty(c.label_en)) warn(at, `স্ট্যাট কার্ড "${c.id}" এর label_en খালি`)
      if (!empty(c.home_label_bn) && empty(c.home_label_en)) warn(at, `স্ট্যাট কার্ড "${c.id}" এর home_label_en খালি`)
    }
    for (const f of own) {
      if (empty(f.label_en)) warn(`${at} › ফিল্ড ${f.key}`, `label_en খালি (ইংরেজিতে "${f.label_bn}" দেখাবে)`)
      if (!empty(f.help_bn) && empty(f.help_en)) warn(`${at} › ফিল্ড ${f.key}`, 'help_en খালি')
    }
  }
  console.log()
}

// ---------------------------------------------------------------- ওভারভিউ
const ov = await call('rpc/projects_overview', { method: 'POST', body: JSON.stringify({ p_include_drafts: false }) })
if (ov.missing) {
  console.log('⚠ projects_overview নেই — SQL ১১ চালানো হয়নি। হোম পেইজ প্রতিটি প্রকল্পে আলাদা housing_stats কলে চলবে (ফলব্যাক)।')
} else if (!ov.ok) {
  console.log(`⚠ projects_overview পড়া যায়নি (HTTP ${ov.status}) ${JSON.stringify(ov.body).slice(0, 200)}`)
} else {
  const g = ov.body.global ?? {}
  console.log(`হোম ওভারভিউ: প্রকল্প ${g.projects} · মোট উপকারভোগী ${g.total} · জেলা ${g.districts}`)
  for (const x of ov.body.projects ?? []) {
    const s = x.stats ?? {}
    const money = Object.entries(s.fields ?? {})
      .filter(([, v]) => v.type === 'money')
      .map(([k, v]) => ` · ${k} মোট ৳${v.sum}`)
      .join('')
    const cats = Object.entries(s.fields ?? {})
      .filter(([, v]) => v.type === 'category')
      .map(([k, v]) => ` · ${k} ${v.distinct}টি ক্যাটাগরি`)
      .join('')
    console.log(`  • ${x.key}: মোট ${s.total} · জেলা ${s.distinct?.districts ?? 0} · উপজেলা ${s.distinct?.upazilas ?? 0} · ইউনিয়ন ${s.distinct?.unions ?? 0}${money}${cats}${x.featured ? ' · ছবিসহ কার্ড' : ' · ছবি নেই'}`)
  }
}

// ---------------------------------------------------------------- ফল
console.log()
if (warnings.length) {
  console.log(`ইংরেজি খালি (${warnings.length}টি) — ইংরেজি মোডে এগুলোর জায়গায় বাংলা দেখাবে; চাইলে প্যানেল থেকে ঠিক করুন:`)
  for (const w of warnings) console.log(`  ⚠ ${w}`)
} else if (projects.length) {
  console.log('✓ সব প্রকল্প, ফিল্ড ও স্ট্যাট কার্ডে ইংরেজি আছে।')
}
process.exit(0)

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}
