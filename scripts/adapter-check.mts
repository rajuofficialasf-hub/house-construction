#!/usr/bin/env node
/**
 * adapter-check (পর্ব ২, M-ধাপ ৪) — Supabase adapter-এর নিয়ম, নকল ক্লায়েন্ট দিয়ে (নেটওয়ার্ক নেই, কিছু লেখে না):
 *   - পুরনো ডাটাবেস (আসল "টেবিল/ফাংশন নেই" এরর): ফলব্যাক রেজিস্ট্রি, housing_stats থেকে স্ট্যাট, "নেই" মনে থাকা,
 *     লেখায় union_name/extra বাদ, পড়ায় খালি মান, গোপন মান ও প্রকল্প-লেখায় CONFIG_ERROR
 *   - নতুন ডাটাবেস: project_stats, ফিল্টার/সার্চ/সাজানোর whitelist, লেখার payload নিয়ম, ছবি-মোড, ক্যাশ
 * চালানো: npm run adapter-check
 */

import { createSupabaseHousingApi } from '../src/backend/supabase/housingApi.ts'
import { createSupabaseProjectsApi } from '../src/backend/supabase/projectsApi.ts'
import { resetLegacyState } from '../src/backend/supabase/legacy.ts'
import { FALLBACK_PROJECTS } from '../src/backend/fallbackProjects.ts'
import { DEFAULT_LIST_ORDER } from '../src/backend/interfaces/types.ts'
import { createSupabaseImageStorage } from '../src/backend/supabase/imageStorage.ts'
import { adminRole, clearAdminCache } from '../src/backend/supabase/session.ts'
import { mapSupabaseError } from '../src/backend/supabase/errors.ts'

type Op = [string, unknown[]]
type Handler = (target: string, ops: Op[]) => { data: unknown; error: unknown; count?: number }

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, info = '') => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}

/** chainable, thenable নকল query; প্রতিটি কল ops এ জমা হয়, await এ handler উত্তর দেয় */
function fakeClient(handler: Handler, log: { target: string; ops: Op[] }[]) {
  const builder = (target: string, ops: Op[] = []) => {
    const b: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => void, rej: (e: unknown) => void) => {
            log.push({ target, ops })
            try {
              res(handler(target, ops))
            } catch (e) {
              rej(e)
            }
          }
        }
        return (...args: unknown[]) => {
          ops.push([prop, args])
          return b
        }
      },
    })
    return b
  }
  const client = {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: unknown) => builder(`rpc:${fn}`, [['args', [args]]]),
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  }
  return () => client as never
}

const storage = { upload: async () => ({ path: 'p', url: 'u' }), delete: async () => {}, move: async () => ({ path: 'p', url: 'u' }), publicUrl: () => 'u', pathFromUrl: () => null }
const MISSING_TABLE = { code: 'PGRST205', message: "Could not find the table 'public.projects'" }
const MISSING_FN = { code: 'PGRST202', message: 'Could not find the function' }
const opsOf = (log: { target: string; ops: Op[] }[], target: string, op: string) =>
  log.filter((l) => l.target === target).flatMap((l) => l.ops.filter((o) => o[0] === op).map((o) => o[1]))
/** শেষ RPC কলের আর্গুমেন্ট (না থাকলে {}) */
const lastArgs = (log: { target: string; ops: Op[] }[], target: string): Record<string, unknown> =>
  (opsOf(log, target, 'args').at(-1)?.[0] as Record<string, unknown> | undefined) ?? {}

const rec = { id: 'r1', project_type: 'semi_pucca', serial_no: 1, year: 2024, name: 'ক', father_or_husband_name: '', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার', address: '', prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, prev_photo_source: null, current_photo_source: null, photo_updated_at: null, created_at: '', updated_at: '' }

// ===================================================================== ১. পুরনো ডাটাবেস (আসল "নেই" এরর)
{
  resetLegacyState()
  const log: { target: string; ops: Op[] }[] = []
  const get = fakeClient((target, ops) => {
    const isList = ops.some((o) => o[0] === 'range' || o[0] === 'in')
    if (target === 'housing_beneficiaries' && isList) return { data: [{ ...rec }], error: null, count: 1 }
    if (target === 'projects' || target === 'project_fields' || target === 'beneficiary_private') return { data: null, error: MISSING_TABLE }
    if (target === 'rpc:project_stats' || target === 'rpc:projects_overview') return { data: null, error: MISSING_FN }
    if (target === 'rpc:housing_stats') return { data: { total: 10, by_year: { 2024: 10 }, by_division: {}, by_district: { চট্টগ্রাম: 10 }, by_upazila: {}, distinct: { divisions: 1, districts: 1, upazilas: 1 }, by_location: {} }, error: null }
    if (target === 'housing_beneficiaries') return { data: { ...rec }, error: null } // পুরনো সারি: union_name/extra নেই
    return { data: null, error: null }
  }, log)
  const projects = createSupabaseProjectsApi(get, { trustedServer: true })
  const api = createSupabaseHousingApi(get, storage as never, { trustedServer: true, projects })

  const list = await projects.list()
  ok('পুরনো DB: রেজিস্ট্রি = ফলব্যাকের ৩টি প্রকল্প', list.map((p) => p.key).join() === 'housing,semi_pucca,tin')
  ok('পুরনো DB: backendMode = legacy', (await projects.backendMode()) === 'legacy')
  const st = await api.stats('semi_pucca')
  ok('পুরনো DB: stats → housing_stats(semi_pucca), নতুন শেপে', st.total === 10 && st.distinct.unions === 0 && JSON.stringify(st.by_union) === '{}' && st.by_project.semi_pucca === 10 && lastArgs(log, 'rpc:housing_stats').p_project_type === 'semi_pucca')
  await api.stats()
  ok('পুরনো DB: stats() (গ্রুপ) → housing_stats(null)', lastArgs(log, 'rpc:housing_stats').p_project_type === null)
  const before = log.filter((l) => l.target === 'rpc:project_stats').length
  await api.stats('tin')
  ok('পুরনো DB: "নেই" মনে থাকে — project_stats আর ডাকা হয় না', log.filter((l) => l.target === 'rpc:project_stats').length === before)
  const ov = await projects.overview()
  ok('পুরনো DB: overview ফলব্যাকে, মোট দুবার গোনা নয়', ov.projects.length === 3 && ov.global.total === 10 && ov.global.projects === 2 && ov.global.districts === 1, JSON.stringify(ov.global))

  await api.create({ project_type: 'semi_pucca', year: 2024, name: 'খ', father_or_husband_name: '', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার', address: '', union_name: 'আশুলিয়া', extra: { amount: 5 } })
  const ins = opsOf(log, 'housing_beneficiaries', 'insert').at(-1)?.[0] as Record<string, unknown>
  ok('পুরনো DB: create এ union_name ও extra বাদ (কলামই নেই)', !('union_name' in ins) && !('extra' in ins) && ins.name === 'খ')
  const r = await api.getById('r1')
  ok('পুরনো DB: পড়া রেকর্ডে union_name "" ও extra {} বসে', r.union_name === '' && JSON.stringify(r.extra) === '{}')
  ok('পুরনো DB: getPrivate → {} (নেটওয়ার্ক কল ছাড়া)', JSON.stringify(await api.getPrivate('r1')) === '{}')
  const e1 = await api.setPrivate('r1', { phone: '1' }).then(() => null, (e) => e)
  ok('পুরনো DB: setPrivate → CONFIG_ERROR', e1?.code === 'CONFIG_ERROR')
  const e2 = await projects.create({ key: 'x', slug: 'x', name_bn: 'x', name_en: 'x' }).then(() => null, (e) => e)
  ok('পুরনো DB: প্রকল্প তৈরি → CONFIG_ERROR (বাংলা বার্তা)', e2?.code === 'CONFIG_ERROR', e2?.message)
  await api.list({ project_type: 'semi_pucca', union_name: 'আশুলিয়া', fields: { category: 'গরু' }, q: 'ক' })
  const lops = log.filter((l) => l.target === 'housing_beneficiaries').at(-1)!.ops
  ok('পুরনো DB: তালিকায় ইউনিয়ন/কাস্টম ফিল্টার উপেক্ষিত, সার্চ পুরনো ৩ কলামে', !lops.some((o) => o[0] === 'contains') && !lops.some((o) => o[0] === 'eq' && o[1][0] === 'union_name') && String(lops.find((o) => o[0] === 'or')?.[1][0]).split(',').length === 3)
}

// ===================================================================== ২. নতুন ডাটাবেস
{
  resetLegacyState()
  const log: { target: string; ops: Op[] }[] = []
  const sr = { ...structuredClone(FALLBACK_PROJECTS[1]), key: 'self_reliance', slug: 'self-reliance', parent_key: null, photo_mode: 'after_only', file_prefix: 'sr' }
  const housingNoUnion = { ...structuredClone(FALLBACK_PROJECTS[2]), geo_depth: 'upazila' } // টিন: ইউনিয়ন বন্ধ ধরে পরীক্ষা
  const F = (key: string, type: string, extra: Record<string, unknown> = {}) => ({ id: key, project_key: 'self_reliance', key, label_bn: key, label_en: key, help_bn: '', help_en: '', type, options: [], required: false, visibility: 'public', show_in_table: true, show_in_card: false, show_in_detail: true, filterable: false, searchable: false, fill_down: false, max_length: null, min_value: null, max_value: null, import_aliases: [], sort_order: 1, is_active: true, created_at: '', updated_at: '', ...extra })
  const fieldRows = [F('category', 'category', { filterable: true, searchable: true }), F('amount', 'money', { filterable: true }), F('item', 'text'), F('phone', 'phone', { visibility: 'admin', show_in_table: false })]
  const get = fakeClient((target, ops) => {
    if (target === 'projects') return { data: [FALLBACK_PROJECTS[0], FALLBACK_PROJECTS[1], housingNoUnion, sr].map(({ fields: _f, ...p }) => p), error: null }
    if (target === 'project_fields') return { data: fieldRows, error: null }
    if (target === 'rpc:project_stats') return { data: { total: 3, distinct: { unions: 2 }, by_union: { 'ঢাকা|সাভার|আশুলিয়া': 2 }, fields: {} }, error: null }
    if (target === 'housing_beneficiaries') {
      if (ops.some((o) => o[0] === 'range' || o[0] === 'in')) return { data: [rec], error: null, count: 1 }
      const pt = ops.find((o) => o[0] === 'eq' && o[1][0] === 'id') ? 'self_reliance' : 'semi_pucca'
      return { data: { ...rec, project_type: pt, union_name: 'আশুলিয়া', extra: { amount: 1 } }, error: null, count: 1 }
    }
    return { data: null, error: null }
  }, log)
  const projects = createSupabaseProjectsApi(get, { trustedServer: true })
  const api = createSupabaseHousingApi(get, storage as never, { trustedServer: true, projects })

  ok('নতুন DB: backendMode = full', (await projects.backendMode()) === 'full')
  const s = await api.stats('self_reliance', { light: true })
  const psArgs = lastArgs(log, 'rpc:project_stats')
  ok('নতুন DB: stats → project_stats(key, light), খালি কী ভরাট', psArgs.p_key === 'self_reliance' && psArgs.p_light === true && s.distinct.unions === 2 && s.by_year && JSON.stringify(s.by_project) === '{}')
  const fo = await api.filterOptions('self_reliance')
  ok('নতুন DB: filterOptions এ ইউনিয়ন (by_union থেকে)', fo.unions[0] === 'ঢাকা|সাভার|আশুলিয়া')

  await api.list({ project_type: 'self_reliance', fields: { category: '  গরু   ছাগল ', amount: '5000', item: 'x', phone: '017', hacked: 'y' }, q: 'রহিম', sort: 'extra.amount', union_name: 'আশুলিয়া' })
  const lops = log.filter((l) => l.target === 'housing_beneficiaries').at(-1)!.ops
  const contains = lops.filter((o) => o[0] === 'contains').map((o) => JSON.stringify(o[1][1]))
  ok('নতুন DB: ফিল্টার whitelist — শুধু filterable পাবলিক (category, amount); item/phone/অচেনা বাদ', contains.join() === '{"category":"গরু ছাগল"},{"amount":5000}', contains.join(' '))
  ok('নতুন DB: সার্চে searchable কাস্টম ফিল্ড যোগ', String(lops.find((o) => o[0] === 'or')?.[1][0]).includes('extra->>category.ilike'))
  ok('নতুন DB: extra.<key> অনুযায়ী সাজানো → extra->amount', lops.some((o) => o[0] === 'order' && o[1][0] === 'extra->amount'))
  ok('নতুন DB: ইউনিয়ন ফিল্টার', lops.some((o) => o[0] === 'eq' && o[1][0] === 'union_name' && o[1][1] === 'আশুলিয়া'))
  await api.list({ project_type: 'self_reliance', sort: 'extra.phone' })
  ok('নতুন DB: গোপন ফিল্ড দিয়ে সাজানো যায় না (serial_no এ ফেরে)', log.filter((l) => l.target === 'housing_beneficiaries').at(-1)!.ops.some((o) => o[0] === 'order' && o[1][0] === 'serial_no'))

  const base = { year: 2024, name: 'খ', father_or_husband_name: '', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার', address: '' }
  await api.create({ ...base, project_type: 'self_reliance', union_name: 'আশুলিয়া', extra: { amount: 5 } })
  let ins = opsOf(log, 'housing_beneficiaries', 'insert').at(-1)?.[0] as Record<string, unknown>
  ok('নতুন DB: ইউনিয়ন-প্রকল্পে union_name ও কাস্টম-ফিল্ডের extra যায়', ins.union_name === 'আশুলিয়া' && JSON.stringify(ins.extra) === '{"amount":5}')
  await api.create({ ...base, project_type: 'tin', union_name: 'আশুলিয়া', extra: { amount: 5 } })
  ins = opsOf(log, 'housing_beneficiaries', 'insert').at(-1)?.[0] as Record<string, unknown>
  ok('নতুন DB: ইউনিয়ন-বন্ধ ও ফিল্ডহীন প্রকল্পে দুটোই বাদ', !('union_name' in ins) && !('extra' in ins))
  await api.create({ ...base, project_type: 'semi_pucca' })
  ins = opsOf(log, 'housing_beneficiaries', 'insert').at(-1)?.[0] as Record<string, unknown>
  ok('নতুন DB: ঘর নির্মাণের ফর্ম (নতুন কী নেই) — payload হুবহু আগের মতো', Object.keys(ins).sort().join() === Object.keys({ ...base, project_type: 1 }).sort().join())

  const e = await api.uploadPhoto('r1', 'prev', { photo: new Blob(), thumb: new Blob() }).then(() => null, (x) => x)
  ok('নতুন DB: শুধু-পরের-ছবি প্রকল্পে prev আপলোড আটকায় (আপলোডের আগেই)', e?.code === 'VALIDATION_ERROR', e?.message)
  const before = log.filter((l) => l.target === 'projects').length
  await api.create({ ...base, project_type: 'self_reliance' })
  await api.create({ ...base, project_type: 'self_reliance', extra: { amount: 2 } })
  ok('নতুন DB: প্রকল্পের সেটিং ক্যাশ থেকে (প্রতি লেখায় নতুন কল নয়)', log.filter((l) => l.target === 'projects').length === before)

  // M-ধাপ ১৭: ডিফল্ট ক্রম — সাল বড় থেকে ছোট, তারপর সিরিয়াল ছোট থেকে বড়
  await api.list({ project_type: 'semi_pucca', ...DEFAULT_LIST_ORDER })
  const ord = log.filter((l) => l.target === 'housing_beneficiaries').at(-1)!.ops.filter((o) => o[0] === 'order').map((o) => JSON.stringify(o[1]))
  ok('ডিফল্ট ক্রম: order(year, desc) তারপর order(serial_no, asc)', ord.join(' ') === '["year",{"ascending":false}] ["serial_no",{"ascending":true}]', ord.join(' '))
}

// ===================================================================== ৩. রেজিস্ট্রি এক কলে (M-ধাপ ১৫: project_fields embed)
{
  resetLegacyState()
  const F = (id: string, project_key: string, key: string, sort_order: number) => ({ id, project_key, key, label_bn: key, label_en: key, help_bn: '', help_en: '', type: 'text', options: null, required: false, visibility: 'public', show_in_table: true, show_in_card: false, show_in_detail: true, filterable: false, searchable: false, fill_down: false, max_length: null, min_value: '5', max_value: null, import_aliases: null, sort_order, is_active: true, created_at: '', updated_at: '' })
  const rows = () => [
    { ...structuredClone(FALLBACK_PROJECTS[1]), fields: undefined, project_fields: [F('b', 'semi_pucca', 'zeta', 20), F('a', 'semi_pucca', 'alpha', 20), F('c', 'semi_pucca', 'first', 10)] },
    { ...structuredClone(FALLBACK_PROJECTS[2]), fields: undefined, project_fields: [] },
  ]
  // ক) embed চলে: একটিই কল, ফিল্ড প্রকল্পে, ক্রম sort_order → key, project_fields কী প্রকল্পে থাকে না
  let log: { target: string; ops: Op[] }[] = []
  let projects = createSupabaseProjectsApi(fakeClient((t) => (t === 'projects' ? { data: rows(), error: null } : { data: null, error: { message: 'unexpected ' + t } }), log), { trustedServer: true })
  let list = await projects.list({ includeDrafts: true })
  const sel = log.find((l) => l.target === 'projects')?.ops.find((o) => o[0] === 'select')?.[1][0]
  const semi = list.find((p) => p.key === 'semi_pucca')
  ok('রেজিস্ট্রি: একটিই কল (select "*, project_fields(*)"), আলাদা project_fields কল নেই', log.length === 1 && sel === '*, project_fields(*)', `${log.map((l) => l.target).join(',')} ${String(sel)}`)
  ok('রেজিস্ট্রি: embed এর ফিল্ড প্রকল্পে, আগের ক্রমে (sort_order, তারপর key), সংখ্যা/তালিকা স্বাভাবিক; প্রকল্পে project_fields কী নেই', semi?.fields.map((f) => f.key).join() === 'first,alpha,zeta' && semi.fields[0].min_value === 5 && Array.isArray(semi.fields[0].options) && !('project_fields' in (semi as object)) && list.find((p) => p.key === 'tin')?.fields.length === 0, semi?.fields.map((f) => f.key).join())
  // খ) embed নেই (PGRST200 — সম্পর্ক অচেনা): আগের মতো দুই কল
  log = []
  projects = createSupabaseProjectsApi(
    fakeClient((t, ops) => {
      const s = ops.find((o) => o[0] === 'select')?.[1][0]
      if (t === 'projects' && s !== '*') return { data: null, error: { code: 'PGRST200', message: 'Could not find a relationship' } }
      if (t === 'projects') return { data: rows().map(({ project_fields: _f, ...p }) => p), error: null }
      if (t === 'project_fields') return { data: rows()[0].project_fields, error: null }
      return { data: null, error: null }
    }, log),
    { trustedServer: true },
  )
  list = await projects.list({ includeDrafts: true })
  ok('রেজিস্ট্রি: embed না চললে (PGRST200) আগের দুই কলে — একই ফল, পুরনো-ডাটাবেস মোড নয়', log.map((l) => l.target).join() === 'projects,projects,project_fields' && list.find((p) => p.key === 'semi_pucca')?.fields.map((f) => f.key).join() === 'first,alpha,zeta' && (await projects.backendMode()) === 'full', log.map((l) => l.target).join())
}

// ===================================================================== ৪. প্রকল্পভিত্তিক ইউজার (পর্ব চ, M-ধাপ ১৮)
{
  // ছবি: আগে নতুন ফাইল (upsert false); "আগেই আছে" হলে তবেই ওভাররাইট (upsert true) — ওভাররাইট SQL ১৪-এ শুধু মূল এডমিন
  const calls: { path: string; upsert: boolean }[] = []
  const exists = new Set<string>()
  let overwriteAllowed = true
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string, _f: Blob, o: { upsert: boolean }) => {
          calls.push({ path, upsert: o.upsert })
          if (exists.has(path) && !o.upsert) return { data: null, error: { statusCode: '409', message: 'The resource already exists' } }
          if (exists.has(path) && !overwriteAllowed) return { data: null, error: { statusCode: '403', message: 'new row violates row-level security policy' } }
          exists.add(path)
          return { data: { path }, error: null }
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: 'https://x/' + p } }),
      }),
    },
  }
  const st = createSupabaseImageStorage(() => client as never)
  const target = { project_type: 'sr', serial_no: 1, kind: 'current' as const, variant: 'full' as const }
  await st.upload(new Blob(['a']), target)
  ok('ছবি: নতুন ফাইল একবারেই, upsert ছাড়া', calls.length === 1 && calls[0].upsert === false, JSON.stringify(calls))
  calls.length = 0
  await st.upload(new Blob(['b']), target)
  ok('ছবি: ফাইল আগেই থাকলে তবেই ওভাররাইট (upsert true) — মূল এডমিন', calls.map((c) => c.upsert).join() === 'false,true', JSON.stringify(calls))
  overwriteAllowed = false
  const e = await st.upload(new Blob(['c']), target).then(() => null, (x) => x)
  ok('ছবি: ইউজারের ওভাররাইট আটকালে বাংলা "অনুমতি নেই" (FORBIDDEN)', e?.code === 'FORBIDDEN' && /অনুমতি আপনার নেই/.test(e.message), e?.message)

  // ভূমিকা: editor (SQL ১৪) প্যানেলে ঢোকেন; অচেনা ভূমিকা নয়
  for (const [raw, want] of [['editor', 'editor'], ['main_admin', 'main_admin'], ['admin', 'admin'], ['guest', null]] as const) {
    clearAdminCache()
    const c = { rpc: async () => ({ data: [{ role: raw, email: 'x@y', all_projects: false, projects: ['sr'] }], error: null }) }
    ok(`ভূমিকা "${raw}" → ${want ?? 'এডমিন নন'}`, (await adminRole(() => c as never, 'u-' + raw)) === want)
  }
  const m = mapSupabaseError({ code: '42501', message: 'new row violates row-level security policy for table "projects"' })
  ok('RLS এর ইংরেজি বার্তা → বাংলা, কোড FORBIDDEN', m.code === 'FORBIDDEN' && m.message.startsWith('এই কাজের অনুমতি আপনার নেই'), m.message)
  const g = mapSupabaseError({ code: '42501', message: 'বিস্তারিত ঠিকানা মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন' })
  ok('ডাটাবেসের বাংলা গার্ড-বার্তা যেমন আছে তেমন', g.code === 'FORBIDDEN' && g.message.includes('শুধু মূল এডমিন'), g.message)
}

console.log(`\nফল: PASS ${pass}, FAIL ${fail}`)
process.exit(fail ? 1 : 0)
