#!/usr/bin/env node
/**
 * নিরাপত্তা যাচাই — লগইন ছাড়া (শুধু anon key দিয়ে) কী করা যায় আর কী যায় না।
 * প্রত্যাশা: পড়া সব খোলা; লেখা (INSERT/UPDATE/DELETE/RPC-লেখা/Storage আপলোড) সব বন্ধ।
 * পর্ব ২ (M-ধাপ ৩): বহু-প্রকল্প — খসড়া লুকানো, গোপন মান বন্ধ, এডমিন-RPC বন্ধ, leak detector; প্রকল্পের key ডাটাবেস থেকে।
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

// ---------- বহু-প্রকল্প (পর্ব ২; SQL ১০–১২) ----------
// প্রকল্পের key আসে ডাটাবেস থেকে (হার্ডকোড নয়)। projects টেবিল না থাকলে পুরনো key ('tin') দিয়ে চলে।
let LEAF = 'tin'
let GROUP = null
let LEAVES = [] // সব প্রকাশিত রেকর্ড-প্রকল্প (M-ধাপ ২০)
{
  const r = await rest('projects?select=key,is_group,parent_key,is_published,slug&order=sort_order')
  const body = await r.text()
  if (isMissing(r, body)) {
    skip('বহু-প্রকল্পের পরীক্ষা', 'projects টেবিল নেই — 10_projects.sql চালানো হয়নি (চেকলিস্ট সারি ২৬)')
  } else {
    const rows = safeJson(body) ?? []
    LEAF = rows.find((p) => !p.is_group)?.key ?? LEAF
    GROUP = rows.find((p) => p.is_group)?.key ?? null
    LEAVES = rows.filter((p) => !p.is_group).map((p) => p.key)
    ok('anon: প্রকল্প-তালিকায় শুধু প্রকাশিত প্রকল্প (খসড়া দেখা যায় না)', r.ok && rows.length > 0 && rows.every((p) => p.is_published),
      `${status(r)}, ${rows.map((p) => p.key).join(', ')}`)
    const r2 = await rest('projects?select=key&is_published=eq.false')
    const draft = r2.ok ? await r2.json() : []
    ok('anon: খসড়া প্রকল্প খুঁজলেও পাওয়া যায় না', Array.isArray(draft) && draft.length === 0, `${status(r2)}, ${draft.length} সারি`)

    const rf = await rest('project_fields?select=project_key,key,visibility')
    const fields = rf.ok ? await rf.json() : []
    ok('anon: শুধু পাবলিক ফিল্ড দেখা যায় (গোপন ফিল্ডের সংজ্ঞাও নয়)', rf.ok && fields.every((f) => f.visibility === 'public'), `${status(rf)}, ${fields.length} ফিল্ড`)

    // leak detector: পাবলিক রেকর্ডের extra-তে পাবলিক ফিল্ডের বাইরের কোনো key নেই
    const allowed = new Map()
    for (const f of fields) allowed.set(f.project_key, (allowed.get(f.project_key) ?? new Set()).add(f.key))
    const rr = await rest('housing_beneficiaries?select=project_type,serial_no,extra&limit=1000')
    const recs = rr.ok ? await rr.json() : []
    const leaks = recs.flatMap((x) => Object.keys(x.extra ?? {}).filter((k) => !allowed.get(x.project_type)?.has(k)).map((k) => `${x.project_type}#${x.serial_no}.${k}`))
    ok('leak detector: পাবলিক রেকর্ডে অনুমোদিত-ফিল্ডের বাইরের কোনো মান নেই', rr.ok && leaks.length === 0, `${recs.length} রেকর্ড দেখা হয়েছে${leaks.length ? ' · ফাঁস: ' + leaks.slice(0, 5).join(', ') : ''}`)

    // গোপন টেবিল
    const rp = await rest('beneficiary_private?select=*')
    const pb = await rp.text()
    ok('anon: গোপন মান (beneficiary_private) পড়া নিষিদ্ধ', !rp.ok || (safeJson(pb) ?? []).length === 0, `${status(rp)} ${pb.slice(0, 60)}`)
    const rpi = await rest('beneficiary_private', { method: 'POST', body: JSON.stringify({ record_id: '00000000-0000-0000-0000-000000000000', data: {} }) })
    ok('anon: গোপন মান লেখা নিষিদ্ধ', !rpi.ok, status(rpi))

    // projects / project_fields এ লেখা
    const pIns = await rest('projects', { method: 'POST', body: JSON.stringify({ key: 'zz_security_check', slug: 'zz-security-check', name_bn: 'x', name_en: 'x', file_prefix: 'zzsc' }) })
    ok('anon: প্রকল্প তৈরি (INSERT) নিষিদ্ধ', !pIns.ok, status(pIns))
    const pUpd = await rest(`projects?key=eq.${LEAF}`, { method: 'PATCH', body: JSON.stringify({ name_en: 'HACKED' }), headers: { prefer: 'return=representation' } })
    const pUpdRows = pUpd.ok ? await pUpd.json() : null
    ok('anon: প্রকল্প বদল (UPDATE) নিষিদ্ধ (৪০x বা ০ সারি)', !pUpd.ok || (Array.isArray(pUpdRows) && pUpdRows.length === 0), `${status(pUpd)}`)
    const pDel = await rest(`projects?key=eq.${LEAF}`, { method: 'DELETE', headers: { prefer: 'return=representation' } })
    const pDelRows = pDel.ok ? await pDel.json() : null
    ok('anon: প্রকল্প মোছা (DELETE) নিষিদ্ধ (৪০x বা ০ সারি)', !pDel.ok || (Array.isArray(pDelRows) && pDelRows.length === 0), status(pDel))
    const fIns = await rest('project_fields', { method: 'POST', body: JSON.stringify({ project_key: LEAF, key: 'zz_sc', label_bn: 'x', type: 'text' }) })
    ok('anon: ফিল্ড তৈরি নিষিদ্ধ', !fIns.ok, status(fIns))
    const fUpd = await rest(`project_fields?project_key=eq.${LEAF}`, { method: 'PATCH', body: JSON.stringify({ label_en: 'HACKED' }), headers: { prefer: 'return=representation' } })
    const fUpdRows = fUpd.ok ? await fUpd.json() : null
    ok('anon: ফিল্ড বদল নিষিদ্ধ (৪০x বা ০ সারি)', !fUpd.ok || (Array.isArray(fUpdRows) && fUpdRows.length === 0), status(fUpd))
    const fDel = await rest(`project_fields?project_key=eq.${LEAF}`, { method: 'DELETE', headers: { prefer: 'return=representation' } })
    const fDelRows = fDel.ok ? await fDel.json() : null
    ok('anon: ফিল্ড মোছা নিষিদ্ধ (৪০x বা ০ সারি)', !fDel.ok || (Array.isArray(fDelRows) && fDelRows.length === 0), status(fDel))
    if (GROUP) {
      const g = await rest('housing_beneficiaries', { method: 'POST', body: JSON.stringify({ project_type: GROUP, year: 2025, name: 'SECURITY_CHECK_ROW', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার' }) })
      ok(`anon: গ্রুপে (${GROUP}) রেকর্ড ঢোকানো নিষিদ্ধ`, !g.ok, status(g))
    }
  }
}
// এডমিন-RPC গুলো anon চালাতে পারে না; পাবলিক RPC গুলো পারে (SQL ১১)
{
  const rpc = (name, args) => fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(args) })
  const denied = [
    ['project_create', { p_project: { key: 'zz_security_check', slug: 'zz-security-check', name_bn: 'x', name_en: 'x', file_prefix: 'zzsc' }, p_fields: [] }],
    ['project_field_usage', { p_project: LEAF, p_key: 'x' }],
    ['projects_reorder', { p_keys: [LEAF] }],
    ['project_fields_reorder', { p_project: LEAF, p_ids: [] }],
    ['project_field_rename_value', { p_project: LEAF, p_key: 'x', p_from: 'a', p_to: 'b' }],
  ]
  for (const [name, args] of denied) {
    const r = await rpc(name, args)
    const body = await r.text()
    if (isMissing(r, body)) skip(`anon: ${name} RPC নিষিদ্ধ`, '11_project_rpcs.sql চালানো হয়নি (চেকলিস্ট সারি ২৮)')
    else ok(`anon: ${name} RPC নিষিদ্ধ`, !r.ok, `${status(r)} ${body.slice(0, 70)}`)
  }
  const st = await rpc('project_stats', { p_key: GROUP ?? 'housing', p_light: true })
  const stb = await st.text()
  if (isMissing(st, stb)) skip('anon: project_stats পড়া যায়', '11_project_rpcs.sql চালানো হয়নি (চেকলিস্ট সারি ২৮)')
  else {
    const j = safeJson(stb)
    ok('anon: project_stats পড়া যায়', st.ok && typeof j?.total === 'number', `${status(st)}, total=${j?.total}`)
  }
  const ov = await rpc('projects_overview', { p_include_drafts: true })
  const ovb = await ov.text()
  if (isMissing(ov, ovb)) skip('anon: projects_overview পড়া যায়, খসড়া নেই', '11_project_rpcs.sql চালানো হয়নি (চেকলিস্ট সারি ২৮)')
  else {
    const j = safeJson(ovb)
    const list = j?.projects ?? []
    ok('anon: projects_overview পড়া যায়, খসড়া নেই (true দিলেও)', ov.ok && list.length > 0 && list.every((p) => p.is_published && p.without_photo === null),
      `${status(ov)}, ${list.map((p) => p.key).join(', ')} · মোট ${j?.global?.total}`)
  }
  if (GROUP) {
    const ns = await rpc('housing_next_serial', { p_project_type: GROUP })
    const nsb = await ns.text()
    ok(`anon: গ্রুপের (${GROUP}) পরের সিরিয়াল নেই (null)`, ns.ok && (nsb === 'null' || nsb === ''), `${status(ns)} ${nsb.slice(0, 30)}`)
  }
}

// ---------- লেখা (সব বন্ধ থাকা উচিত) ----------
{
  const body = { project_type: LEAF, year: 2025, name: 'SECURITY_CHECK_ROW', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার' }
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
// প্রকল্পভিত্তিক ইউজার (SQL ১৪, পর্ব চ): anon এর কোনো প্রকল্পে লেখার অধিকার নেই; ইউজার-তালিকা/বদল ও বরাদ্দ-টেবিল বন্ধ
{
  const why14 = '14_project_users.sql চালানো হয়নি (চেকলিস্ট সারি ৩৫)'
  const mine = await fetch(`${URL_}/rest/v1/rpc/housing_my_project_keys`, { method: 'POST', headers: H, body: '{}' })
  const mineBody = await mine.text()
  if (isMissing(mine, mineBody)) skip('anon: কোনো প্রকল্পে লেখার অধিকার নেই (housing_my_project_keys = [])', why14)
  else ok('anon: কোনো প্রকল্পে লেখার অধিকার নেই (housing_my_project_keys = [])', mine.ok && JSON.stringify(JSON.parse(mineBody)) === '[]', `${status(mine)} ${mineBody.slice(0, 60)}`)
  for (const [name, args] of [
    ['housing_admin_users', {}],
    ['housing_admin_user_save', { p_email: 'zz-security-check@example.invalid', p_all_projects: true, p_projects: [], p_active: true }],
  ]) {
    const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(args) })
    const body = await r.text()
    if (isMissing(r, body)) skip(`anon: ${name} RPC নিষিদ্ধ`, why14)
    else ok(`anon: ${name} RPC নিষিদ্ধ`, !r.ok, `${status(r)} ${body.slice(0, 70)}`)
  }
  // M-ধাপ ২০: প্রতিটি প্রকল্পে anon এর "এডিট পারে?" = false; নিজের এডমিন-তথ্য নেই; বরাদ্দ-টেবিলে লেখা নয়
  const leafKeys = [...new Set(['semi_pucca', 'tin', LEAF, ...LEAVES])]
  for (const key of leafKeys) {
    const r = await fetch(`${URL_}/rest/v1/rpc/housing_can_edit_project`, { method: 'POST', headers: H, body: JSON.stringify({ p_key: key }) })
    const body = await r.text()
    if (isMissing(r, body)) skip(`anon: housing_can_edit_project('${key}') = false`, why14)
    else ok(`anon: housing_can_edit_project('${key}') = false`, !r.ok || body.trim() === 'false', `${status(r)} ${body.slice(0, 40)}`)
  }
  {
    const r = await fetch(`${URL_}/rest/v1/rpc/housing_current_admin`, { method: 'POST', headers: H, body: '{}' })
    const body = await r.text()
    ok('anon: housing_current_admin — কোনো এডমিন-তথ্য নেই (খালি বা ৪০x)', !r.ok || body.trim() === '[]', `${status(r)} ${body.slice(0, 60)}`)
  }
  {
    // অচেনা user_id — নিষেধ না থাকলেও FK তে ব্যর্থ হতো; তাই লাইভে কিছু ঢোকার পথ নেই
    const r = await fetch(`${URL_}/rest/v1/housing_admin_projects`, { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ user_id: '00000000-0000-0000-0000-00000000dead', project_key: 'semi_pucca' }) })
    const body = await r.text()
    if (isMissing(r, body)) skip('anon: বরাদ্দ-টেবিলে লেখা নিষিদ্ধ', why14)
    else ok('anon: বরাদ্দ-টেবিলে লেখা নিষিদ্ধ', !r.ok && r.status !== 409, `${status(r)} ${body.slice(0, 70)}`)
  }
  const ap = await fetch(`${URL_}/rest/v1/housing_admin_projects?select=*`, { headers: H })
  const apBody = await ap.text()
  if (isMissing(ap, apBody)) skip('anon: ইউজার-বরাদ্দের টেবিল (housing_admin_projects) অগম্য', why14)
  else ok('anon: ইউজার-বরাদ্দের টেবিল (housing_admin_projects) অগম্য', !ap.ok || apBody.trim() === '[]', `${status(ap)} ${apBody.slice(0, 60)}`)
}
{
  const r = await rest('housing_serial_counters', { method: 'PATCH', body: JSON.stringify({ last_serial: 0 }), headers: { prefer: 'return=representation' } })
  const rows = r.ok ? await r.json() : null
  ok('anon: কাউন্টার বদল নিষিদ্ধ', !r.ok || (Array.isArray(rows) && rows.length === 0), status(r))
}
{
  const r = await fetch(`${URL_}/storage/v1/object/housing-photos/housing/${LEAF}/9999/prev.webp`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'image/webp', 'x-upsert': 'true' },
    body: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  })
  ok('anon: Storage আপলোড নিষিদ্ধ', !r.ok, status(r))
  if (r.ok) {
    console.log('   !! আপলোড সফল — Storage পলিসি ভুল। মুছে ফেলার চেষ্টা…')
    await fetch(`${URL_}/storage/v1/object/housing-photos/housing/${LEAF}/9999/prev.webp`, { method: 'DELETE', headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
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
