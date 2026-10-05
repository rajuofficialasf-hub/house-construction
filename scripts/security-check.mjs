#!/usr/bin/env node
/**
 * নিরাপত্তা যাচাই — লগইন ছাড়া (শুধু anon key দিয়ে) কী করা যায় আর কী যায় না।
 * প্রত্যাশা: পড়া সব খোলা; লেখা (INSERT/UPDATE/DELETE/RPC-লেখা/Storage আপলোড) সব বন্ধ।
 *
 * চালানো:  node scripts/security-check.mjs          (.env.local থেকে VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY পড়ে)
 * এটি শুধু পাবলিক anon key ব্যবহার করে; কোনো গোপন কী লাগে না। ডাটাবেসে কিছু বদলায় না (সব লেখা-চেষ্টা ব্যর্থ হওয়ারই কথা;
 * কোনোটি সফল হলে সেটিই ত্রুটি এবং স্ক্রিপ্ট নিজে তা মুছে ফেলার চেষ্টা করে ও FAIL দেখায়)।
 */
import fs from 'node:fs'

loadEnv('.env.local')
loadEnv('.env')
const URL_ = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
if (!URL_ || !KEY) {
  console.error('ত্রুটি: .env.local এ VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY দিন')
  process.exit(1)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = (path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })

let pass = 0
let fail = 0
let skipped = 0
const ok = (label, cond, detail = '') => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
}
const skip = (label, why) => {
  skipped++
  console.log(`SKIP  ${label}  — ${why}`)
}
const status = (r) => `HTTP ${r.status}`
/** PostgREST: টেবিল (PGRST205) বা ফাংশন (PGRST202) ডাটাবেসে নেই */
const isMissing = (r, body) => r.status === 404 && /PGRST20[25]/.test(body)
const safeJson = (t) => {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

console.log(`প্রজেক্ট: ${URL_}\n`)

// ---------- পড়া (খোলা থাকা উচিত) ----------
let sample = null
{
  const r = await rest('housing_beneficiaries?select=id,project_type,serial_no,name&order=serial_no&limit=3')
  const rows = r.ok ? await r.json() : []
  sample = rows[0] ?? null
  ok('anon: রেকর্ড পড়া (SELECT)', r.ok, `${status(r)}, ${rows.length} সারি`)
}
{
  const r = await fetch(`${URL_}/rest/v1/rpc/housing_stats`, { method: 'POST', headers: H, body: JSON.stringify({ p_project_type: null }) })
  const j = r.ok ? await r.json() : null
  ok('anon: housing_stats RPC', r.ok && typeof j?.total === 'number', `${status(r)}, total=${j?.total}`)
}
{
  const r = await fetch(`${URL_}/rest/v1/rpc/housing_years`, { method: 'POST', headers: H, body: JSON.stringify({ p_project_type: 'semi_pucca' }) })
  ok('anon: housing_years RPC', r.ok, status(r))
}
{
  const r = await rest('housing_serial_counters?select=*')
  const rows = r.ok ? await r.json() : null
  ok('anon: কাউন্টার টেবিল অগম্য (খালি বা ৪০x)', !r.ok || (Array.isArray(rows) && rows.length === 0), status(r))
}
{
  const r = await rest('housing_admins?select=*')
  const rows = r.ok ? await r.json() : null
  ok('anon: এডমিন তালিকা অগম্য (খালি বা ৪০x)', !r.ok || (Array.isArray(rows) && rows.length === 0), status(r))
}
{
  const r = await rest('housing_serial_changes?select=*')
  const rows = r.ok ? await r.json() : null
  ok('anon: সিরিয়াল-বদলের লগ অগম্য', !r.ok || (Array.isArray(rows) && rows.length === 0), status(r))
}
// ---------- একটিভিটি লগ (09_activity_log.sql; M-ধাপ ১ এ যোগ) ----------
// টেবিল/ফাংশন না থাকলে (PGRST205 / PGRST202) সেটি নিরাপত্তা-ত্রুটি নয় — SKIP, সাথে "সারি ২৩" নির্দেশনা।
{
  const r = await rest('housing_activity_log?select=id,action,actor_email&limit=5')
  const body = await r.text()
  if (isMissing(r, body)) skip('anon: একটিভিটি লগ অগম্য', '09_activity_log.sql চালানো হয়নি (চেকলিস্ট সারি ২৩)')
  else {
    const rows = r.ok ? safeJson(body) : null
    ok('anon: একটিভিটি লগ অগম্য (খালি বা ৪০x)', !r.ok || (Array.isArray(rows) && rows.length === 0), `${status(r)}, ${Array.isArray(rows) ? rows.length + ' সারি' : 'n/a'}`)
  }
}
{
  const r = await fetch(`${URL_}/rest/v1/rpc/housing_log_event`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_action: 'security_check', p_details: { by: 'security-check' }, p_project_type: null }),
  })
  const body = await r.text()
  if (isMissing(r, body)) skip('anon: housing_log_event RPC নিষিদ্ধ', '09_activity_log.sql চালানো হয়নি (চেকলিস্ট সারি ২৩)')
  else {
    ok('anon: housing_log_event RPC নিষিদ্ধ (লগে লিখতে পারে না)', !r.ok, `${status(r)} ${body.slice(0, 80)}`)
    if (r.ok) console.log('   !! anon লগে লিখতে পেরেছে — housing_log_event এর এডমিন-যাচাই ভুল। লগে "security_check" সারিটি দেখা যাবে।')
  }
}

// ---------- লেখা (সব বন্ধ থাকা উচিত) ----------
{
  const body = { project_type: 'tin', year: 2025, name: 'SECURITY_CHECK_ROW', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার' }
  const r = await rest('housing_beneficiaries', { method: 'POST', body: JSON.stringify(body), headers: { prefer: 'return=representation' } })
  const inserted = r.ok ? await r.json() : null
  ok('anon: INSERT নিষিদ্ধ', !r.ok, status(r))
  if (r.ok && inserted?.[0]?.id) {
    console.log('   !! INSERT সফল হয়েছে — RLS নেই/ভুল। পরিষ্কার করার চেষ্টা…')
    await rest(`housing_beneficiaries?id=eq.${inserted[0].id}`, { method: 'DELETE' })
  }
}
if (sample) {
  const r = await rest(`housing_beneficiaries?id=eq.${sample.id}`, { method: 'PATCH', body: JSON.stringify({ address: 'HACKED' }), headers: { prefer: 'return=representation' } })
  const rows = r.ok ? await r.json() : null
  ok('anon: UPDATE নিষিদ্ধ (৪০x বা ০ সারি)', !r.ok || (Array.isArray(rows) && rows.length === 0), `${status(r)}, প্রভাবিত=${rows?.length ?? 'n/a'}`)
  const r2 = await rest(`housing_beneficiaries?id=eq.${sample.id}`, { method: 'DELETE', headers: { prefer: 'return=representation' } })
  const rows2 = r2.ok ? await r2.json() : null
  ok('anon: DELETE নিষিদ্ধ (৪০x বা ০ সারি)', !r2.ok || (Array.isArray(rows2) && rows2.length === 0), `${status(r2)}, প্রভাবিত=${rows2?.length ?? 'n/a'}`)
  const r3 = await fetch(`${URL_}/rest/v1/rpc/housing_change_serial`, { method: 'POST', headers: H, body: JSON.stringify({ p_id: sample.id, p_new_serial: 999999 }) })
  ok('anon: housing_change_serial RPC নিষিদ্ধ', !r3.ok, status(r3))
  const r4 = await fetch(`${URL_}/rest/v1/rpc/housing_bulk_update_by_serial`, { method: 'POST', headers: H, body: JSON.stringify({ p_project_type: sample.project_type, p_rows: [{ serial_no: sample.serial_no, address: 'HACKED' }] }) })
  const j4 = r4.ok ? await r4.json() : null
  ok('anon: bulk update RPC কার্যকর নয় (৪০x বা updated=0)', !r4.ok || j4?.updated === 0, `${status(r4)}, updated=${j4?.updated}`)
} else {
  console.log('SKIP  UPDATE/DELETE/RPC পরীক্ষা — টেবিলে কোনো সারি নেই (seed চালান)')
}
{
  const r = await rest('housing_serial_counters', { method: 'PATCH', body: JSON.stringify({ last_serial: 0 }), headers: { prefer: 'return=representation' } })
  const rows = r.ok ? await r.json() : null
  ok('anon: কাউন্টার বদল নিষিদ্ধ', !r.ok || (Array.isArray(rows) && rows.length === 0), status(r))
}
{
  const r = await fetch(`${URL_}/storage/v1/object/housing-photos/housing/tin/9999/prev.webp`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'image/webp', 'x-upsert': 'true' },
    body: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  })
  ok('anon: Storage আপলোড নিষিদ্ধ', !r.ok, status(r))
  if (r.ok) {
    console.log('   !! আপলোড সফল — Storage পলিসি ভুল। মুছে ফেলার চেষ্টা…')
    await fetch(`${URL_}/storage/v1/object/housing-photos/housing/tin/9999/prev.webp`, { method: 'DELETE', headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
  }
}
{
  // পাবলিক bucket এ অস্তিত্বহীন ফাইল চাইলে "Object not found"; bucket পাবলিক না হলে/না থাকলে "Bucket not found"
  const r = await fetch(`${URL_}/storage/v1/object/public/housing-photos/__security_check__/none.webp`)
  const text = await r.text()
  const isPublic = /object not found|nosuchkey/i.test(text)
  ok('bucket housing-photos পাবলিক (read)', isPublic, `${status(r)} ${text.slice(0, 80)}`)
}

console.log(`\nফল: PASS ${pass}, FAIL ${fail}${skipped ? `, SKIP ${skipped}` : ''}`)
if (skipped && !fail) console.log('কিছু পরীক্ষা বাদ পড়েছে — উপরের SKIP লাইনের নির্দেশনা অনুযায়ী SQL চালিয়ে আবার চালান।')
process.exit(fail ? 2 : skipped ? 3 : 0)

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
