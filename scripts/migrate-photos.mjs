#!/usr/bin/env node
/**
 * ছবি বাল্ক মাইগ্রেশন স্ক্রিপ্ট — শুধু লোকাল কম্পিউটারে (Node), ব্রাউজারে নয়।
 *
 * চালানো:   npm run migrate-photos -- --csv data/photos.csv --project semi_pucca
 *           npm run migrate-photos -- --local-folder ./photos --project tin
 *           npm run migrate-photos -- --from-db --project self-reliance --dry-run
 * প্রকল্পের তালিকা আসে ডাটাবেস থেকে (service_role — খসড়াসহ সব প্রকল্প; M-ধাপ ১২)। ছবি মোড মানা হয়:
 * "শুধু পরের ছবি" প্রকল্পে আগের ছবির কাজ বাদ, "ছবি নেই" প্রকল্প বাদ।
 * (ভেতরে `tsx` চলে, তাই src/ এর TypeScript অ্যাডাপ্টার সরাসরি ব্যবহার হয় — একই কোড, একই পাথ নিয়ম।)
 *
 * .env (প্রজেক্ট রুটে, গিটে যায় না):
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...      ← service_role key; কখনো VITE_ প্রিফিক্স দেবেন না, ফ্রন্টএন্ডে রাখবেন না
 *
 * অপশন:
 *   --from-db               CSV লাগে না: ডাটাবেসে থাকা রেকর্ডের prev/current_photo_source লিঙ্ক থেকেই কাজ (ইম্পোর্টের পর সবচেয়ে সহজ)।
 *                           --project না দিলে ছবিসহ সব প্রকল্পে; শুধু-পরের-ছবি প্রকল্পে prev বাদ
 *   --csv <file>            শীট বা রেকর্ড-পাতার এক্সপোর্ট CSV (UTF-8)। কলাম নিজে চেনা হয় সাধারণ শব্দে:
 *                             সিরিয়াল ("সিরিয়াল", "ক্রমিক", "serial", "SL") · আগের ছবি ("আগের/পূর্বের … ছবি/লিঙ্ক", "before", "prev")
 *                             · পরের ছবি ("বর্তমান/পরের … ছবি/লিঙ্ক", "after", "current"; শুধু-পরে প্রকল্পে শুধু "ছবি"/"photo" ও চলে)
 *                             · ঐচ্ছিক প্রকল্প ("প্রকল্প", "project" — key, slug, প্রিফিক্স বা নাম)। এক্সপোর্টের "(সিস্টেম URL)" কলাম উপেক্ষা
 *   --local-folder <dir>    সিরিয়াল-নামের ফাইল থেকে আপলোড: semi_0001_prev.jpg, 0001_current.png, self-reliance-0003.jpg,
 *                           demo_0001.jpg (শুধু-পরে প্রকল্পে আগে/পরে লাগে না) — প্রিফিক্স = file_prefix, key বা slug (অঙ্কও চলে)
 *   লিঙ্ক সমর্থন: SharePoint/OneDrive (download=1), Google Drive (file/d/ID বা ?id= → uc?export=download; শেয়ার "Anyone with the link" লাগবে),
 *                 যেকোনো সরাসরি http(s) ছবি-লিঙ্ক।
 *   --local-root <dir>      CSV এর SharePoint/OneDrive লিঙ্কের ফোল্ডার-পাথ ধরে লোকাল কপি থেকে ছবি নেওয়া (লিঙ্ক ডাউনলোড না করে):
 *                           (Google Drive লিঙ্কে ফাইলনাম থাকে না, তাই এই মোড Drive এ কাজ করে না — সরাসরি ডাউনলোড বা --local-folder)
 *                           OneDrive এ "ঘর নির্মাণ-…" ফোল্ডারটি জিপ করে নামিয়ে আনজিপ করুন; লিঙ্কের ".../Documents/A/B/IMG.jpg" অংশ
 *                           <dir>/A/B/IMG.jpg বা <dir>/B/IMG.jpg হিসেবে খোঁজা হয়। না পেলে সাধারণ ডাউনলোডে ফিরে যায়।
 *   --project <প্রকল্প>     key, slug বা ফাইল-প্রিফিক্স — যেমন semi_pucca / semi-pucca / semi, self_reliance / self-reliance / sr
 *                           (CSV তে প্রকল্প কলাম না থাকলে / ফাইলনামে প্রিফিক্স না থাকলে আবশ্যক; --from-db এ না দিলে সব প্রকল্প)
 *   --col-serial/--col-prev/--col-current/--col-project <header>   কলামের হেডার নাম (স্বয়ংক্রিয় শনাক্ত না হলে)
 *   --local-only            --local-root এ ফাইল না পেলে লিঙ্ক ডাউনলোড না করে "বাদ" (ধাপে ধাপে ছবি বসালে সুবিধা)
 *   --concurrency <n>       একসাথে কতটি (ডিফল্ট ৪)
 *   --limit <n>             প্রথম n টি কাজ (পরীক্ষার জন্য, যেমন ১০)
 *   --force                 আগে থেকে ছবি থাকলেও আবার আপলোড (ডিফল্ট: বাদ = resume)
 *   --dry-run               ডাউনলোড/আপলোড না করে শুধু পরিকল্পনা দেখাও
 *   --failed <file>         ব্যর্থদের CSV (ডিফল্ট: failed.csv)
 *   --timeout <ms>          প্রতি ডাউনলোডের সময়সীমা (ডিফল্ট ৩০০০০)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createSupabaseHousingApi, createSupabaseImageStorage } from '../src/backend/supabase/index.ts'
import { PHOTO_SPEC } from '../src/features/housing/utils/photoSpec.ts'
import { createSupabaseProjectsApi } from '../src/backend/supabase/projectsApi.ts'
import { buildProjectAliases, parsePhotoFilename, photoTarget } from '../src/features/housing/utils/photoFilename.ts'
import { FALLBACK_PROJECTS } from '../src/backend/fallbackProjects.ts'

// ---------------------------------------------------------------- args
const args = parseArgs(process.argv.slice(2))
if (args.help || (!args.csv && !args['local-folder'] && !args['from-db'])) {
  printHelp()
  process.exit(args.help ? 0 : 1)
}
const concurrency = Math.max(1, Number(args.concurrency ?? 4))
const limit = args.limit ? Number(args.limit) : Infinity
const force = !!args.force
const dryRun = !!args['dry-run']
const timeoutMs = Number(args.timeout ?? 30000)
const failedPath = args.failed ?? 'failed.csv'
const localRoot = args['local-root'] ? path.resolve(String(args['local-root'])) : null
const localOnly = !!args['local-only']
if (localOnly && !localRoot) die('--local-only এর সাথে --local-root লাগবে')
if (localRoot && !fs.existsSync(localRoot)) die(`--local-root ফোল্ডার নেই: ${localRoot}`)

// ---------------------------------------------------------------- env / adapters
loadEnv('.env')
loadEnv('.env.local')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
// আপলোডে service_role লাগে; dry-run এ শুধু পড়া, তাই anon key দিয়েও চলে
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || (dryRun ? process.env.VITE_SUPABASE_ANON_KEY : undefined)
if (!url || !key) die(dryRun ? '.env.local এ VITE_SUPABASE_URL/ANON_KEY বা .env এ SUPABASE_URL/SERVICE_ROLE_KEY দিন' : '.env এ SUPABASE_URL ও SUPABASE_SERVICE_ROLE_KEY দিন (উপরের মন্তব্য দেখুন)')
if (!dryRun && !process.env.SUPABASE_SERVICE_ROLE_KEY) die('আপলোডের জন্য .env এ SUPABASE_SERVICE_ROLE_KEY লাগবে (anon key দিয়ে লেখা যায় না)')
const client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
const getClient = () => {
  if (!client) die('dry-run ছাড়া Supabase ক্লায়েন্ট লাগবে')
  return client
}
const storage = createSupabaseImageStorage(getClient)
const api = createSupabaseHousingApi(getClient, storage, { trustedServer: true })

// ---------------------------------------------------------------- প্রকল্প (M-ধাপ ১২: ডাটাবেস থেকে, সব প্রকল্প)
// service_role এ খসড়াসহ সব; dry-run এ anon key হলে শুধু প্রকাশিত। ডাটাবেসে প্রকল্প-টেবিল না থাকলে কোডের ফলব্যাক (ঘর নির্মাণ)।
let ALL_PROJECTS
try {
  ALL_PROJECTS = await createSupabaseProjectsApi(getClient, { trustedServer: true }).list({ includeDrafts: true })
} catch (err) {
  log(`প্রকল্পের তালিকা আনা যায়নি (${err?.message ?? err}) — কোডের ফলব্যাক তালিকা (ঘর নির্মাণ) ব্যবহার হচ্ছে`)
  ALL_PROJECTS = FALLBACK_PROJECTS
}
const LEAVES = ALL_PROJECTS.filter((p) => !p.is_group)
const PHOTO_PROJECTS = LEAVES.filter((p) => p.photo_mode !== 'none')
const PROJECT_ALIASES = buildProjectAliases(LEAVES)
const projectByKey = new Map(LEAVES.map((p) => [p.key, p]))
const project = args.project ? resolveProject(args.project) : null
if (args.project && !project) die(`--project "${args.project}" চেনা যায়নি। প্রকল্প: ${LEAVES.map((p) => `${p.key} (${p.slug}${p.file_prefix ? ', ' + p.file_prefix : ''})`).join(' · ')}`)
if (project && projectByKey.get(project)?.photo_mode === 'none') die(`"${project}" প্রকল্পে ছবি নেই (ছবি মোড: ছবি নেই)`)
/** ছবি মোড অনুযায়ী যেসব ঘরের কাজ চলে */
const kindsOf = (pt) => {
  const mode = projectByKey.get(pt)?.photo_mode ?? 'before_after'
  return mode === 'before_after' ? ['prev', 'current'] : mode === 'after_only' ? ['current'] : []
}

// ---------------------------------------------------------------- jobs
/** @typedef {{ project_type: string, serial_no: number, kind: 'prev'|'current', source: string, local?: string }} Job */

/** @type {Job[]} */
let jobs = []
if (args['from-db']) jobs = await jobsFromDb()
if (args.csv) jobs = jobs.concat(jobsFromCsv(args.csv))
if (args['local-folder']) jobs = jobs.concat(jobsFromFolder(args['local-folder']))
if (jobs.length === 0) die('কোনো কাজ পাওয়া যায়নি (CSV তে লিঙ্ক নেই / ফোল্ডারে মিলমতো ফাইল নেই)')
jobs = jobs.slice(0, limit)

log(`মোট কাজ: ${jobs.length} (${dryRun ? 'dry-run' : `একসাথে ${concurrency}টি`})`)

// রেকর্ড আগে থেকে টেনে নিই (প্রকল্প অনুযায়ী, সিরিয়াল ধরে)
const recordMap = new Map()
{
  const byProject = new Map()
  for (const j of jobs) (byProject.get(j.project_type) ?? byProject.set(j.project_type, []).get(j.project_type)).push(j.serial_no)
  for (const [pt, serials] of byProject) {
    const recs = await api.getBySerials(pt, serials)
    for (const r of recs) recordMap.set(`${r.project_type}:${r.serial_no}`, r)
  }
  log(`রেকর্ড পাওয়া গেছে: ${recordMap.size}`)
}

// ---------------------------------------------------------------- run
const results = { done: 0, skipped: 0, failed: 0 }
/** @type {{serial_no:number, project_type:string, kind:string, source:string, reason:string}[]} */
const failed = []
let cursor = 0
const startedAt = Date.now()

async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++]
    const tag = `[${job.project_type} #${String(job.serial_no).padStart(4, '0')} ${job.kind}]`
    try {
      if (dryRun) {
        const rec = recordMap.get(`${job.project_type}:${job.serial_no}`)
        const local = !job.local && localRoot ? resolveLocal(job.source, localRoot) : null
        const state = !rec ? '⚠ রেকর্ড নেই' : !force && rec[`${job.kind}_photo_url`] ? 'বাদ হবে (আগেই ছবি আছে)' : job.local ? 'ফাইল: ' + job.local : local ? 'লোকাল কপি: ' + local : localRoot ? (localOnly ? 'বাদ হবে — লোকাল কপি নেই' : '⚠ লোকাল কপি নেই → লিঙ্ক ডাউনলোড চেষ্টা হবে') : 'লিঙ্ক: ' + job.source.slice(0, 80)
        log(`${tag} (dry-run) ${state}`)
        results.done++
        continue
      }
      const record = recordMap.get(`${job.project_type}:${job.serial_no}`)
      if (!record) throw new Error('এই সিরিয়ালের রেকর্ড ডাটাবেসে নেই')
      if (!force && record[`${job.kind}_photo_url`]) {
        results.skipped++
        log(`${tag} বাদ — আগেই ছবি আছে (আবার করতে --force)`)
        continue
      }
      let input
      let from = job.local ? 'ফাইল' : 'লিঙ্ক'
      if (job.local) input = fs.readFileSync(job.local)
      else {
        const local = localRoot ? resolveLocal(job.source, localRoot) : null
        if (local) {
          input = fs.readFileSync(local)
          from = 'লোকাল কপি'
        } else if (localOnly) {
          results.skipped++
          log(`${tag} বাদ — লোকাল কপি নেই (--local-only)`)
          continue
        } else input = await download(job.source, timeoutMs)
      }
      assertImage(input)
      const { photo, thumb, width, height } = await compress(input)
      await api.uploadPhoto(record.id, job.kind, {
        photo: new Blob([photo], { type: PHOTO_SPEC.mime }),
        thumb: new Blob([thumb], { type: PHOTO_SPEC.mime }),
      })
      if (!job.local && job.source && !record[`${job.kind}_photo_source`]) {
        await api.update(record.id, { [`${job.kind}_photo_source`]: job.source })
      }
      // পরের কাজে একই রেকর্ডের হালনাগাদ অবস্থা যেন থাকে
      record[`${job.kind}_photo_url`] = 'done'
      results.done++
      log(`${tag} ✓ [${from}] ${(photo.length / 1024).toFixed(0)} KB (${width}×${height}) + থাম্ব ${(thumb.length / 1024).toFixed(0)} KB`)
    } catch (err) {
      results.failed++
      const reason = err?.message ?? String(err)
      failed.push({ ...job, reason })
      log(`${tag} ✗ ${reason}`)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))

// ---------------------------------------------------------------- report
const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
log('')
log(`শেষ (${secs}s): সফল ${results.done}, বাদ ${results.skipped}, ব্যর্থ ${results.failed}`)
if (failed.length) {
  const rows = [['serial_no', 'project_type', 'kind', 'source', 'reason']].concat(
    failed.map((f) => [f.serial_no, f.project_type, f.kind, f.local ?? f.source, f.reason]),
  )
  fs.writeFileSync(failedPath, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8')
  log(`ব্যর্থদের তালিকা: ${failedPath} — এগুলো ম্যানুয়ালি নামিয়ে সিরিয়াল-নামে (যেমন semi_0007_prev.jpg) /admin/photos পেইজে দিন`)
}
process.exit(results.failed ? 2 : 0)

// ================================================================ helpers
/** ডাটাবেসের রেকর্ড থেকে কাজ: যেসব রেকর্ডে লিঙ্ক আছে কিন্তু (force ছাড়া) ছবি নেই */
async function jobsFromDb() {
  const projects = project ? [project] : PHOTO_PROJECTS.map((p) => p.key)
  const out = []
  for (const pt of projects) {
    let page = 1
    for (;;) {
      const p = await api.list({ project_type: pt, page, page_size: 100, sort: 'serial_no', order: 'asc' })
      for (const r of p.data) {
        for (const kind of kindsOf(pt)) {
          const src = r[`${kind}_photo_source`]
          if (src && /^https?:\/\//i.test(src) && (force || !r[`${kind}_photo_url`])) out.push({ project_type: pt, serial_no: r.serial_no, kind, source: src })
        }
      }
      if (page >= p.meta.total_pages || p.data.length === 0) break
      page++
    }
  }
  log(`ডাটাবেস: ${out.length} ছবির কাজ (${projects.join(', ')})`)
  return out
}

function jobsFromCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  const table = parseCsv(text)
  if (table.length < 2) die('CSV খালি বা শুধু হেডার')
  const header = table[0].map((h) => h.trim().normalize('NFC'))
  const col = (flag, candidates) => {
    if (args[flag]) {
      const i = header.indexOf(args[flag].normalize('NFC'))
      if (i === -1) die(`--${flag}="${args[flag]}" হেডারে নেই। হেডার: ${header.join(' | ')}`)
      return i
    }
    const lower = header.map((h) => h.toLowerCase())
    for (const c of candidates) {
      const i = lower.indexOf(c.toLowerCase().normalize('NFC'))
      if (i !== -1) return i
    }
    return -1
  }
  // হুবহু নাম না মিললে সাধারণ শব্দে (এক্সপোর্টের "(সিস্টেম URL)" কলাম কখনো নয় — ওগুলো আমাদের নিজের ছবির ঠিকানা)
  const hint = (i, re) => (i !== -1 ? i : header.findIndex((h) => re.test(h) && !/সিস্টেম url|system url/i.test(h)))
  const iSerial = hint(col('col-serial', ['serial_no', 'serial', 'sl', 'sl no', 'সিরিয়াল', 'সিরিয়াল নং', 'ক্রমিক', 'ক্রমিক নং']), /সিরিয়াল|ক্রমিক|serial|^sl\b/i)
  const PREV_RE = /(পূর্ব|আগে|আগের|before|prev|old).*(ছবি|photo|image|লিঙ্ক|link)|^(prev|before)/i
  const iPrev = hint(col('col-prev', ['prev_photo_source', 'prev', 'previous', 'before', 'পূর্বের ঘরের ছবি', 'পূর্বের ছবি', 'আগের ছবি', 'পূর্বের ঘরের ছবি (লিঙ্ক)']), PREV_RE)
  const curRe = /(বর্তমান|পরে|পরের|after|current|now).*(ছবি|photo|image|লিঙ্ক|link)|^(current|after)/i
  let iCur = hint(col('col-current', ['current_photo_source', 'current', 'after', 'বর্তমান ঘরের ছবি', 'বর্তমান ছবি', 'বর্তমান ঘরের ছবি (লিঙ্ক)']), curRe)
  // শুধু-পরে প্রকল্পে একটিই ছবি — "উপকরণসহ ছবি (লিঙ্ক)" বা শুধু "ছবি"/"photo"
  if (iCur === -1) iCur = header.findIndex((h, i) => i !== iPrev && /ছবি|photo|image|লিঙ্ক|link/i.test(h) && !/সিস্টেম url|system url|আপডেট|update/i.test(h))
  const iProj = hint(col('col-project', ['project_type', 'project', 'প্রকল্প']), /প্রকল্প|project/i)
  if (iSerial === -1) die(`সিরিয়াল কলাম পাওয়া যায়নি; --col-serial দিন। হেডার: ${header.join(' | ')}`)
  if (iPrev === -1 && iCur === -1) die(`ছবির লিঙ্কের কলাম পাওয়া যায়নি; --col-prev / --col-current দিন। হেডার: ${header.join(' | ')}`)
  if (iProj === -1 && !project) die('CSV তে প্রকল্প কলাম নেই; --project দিন (key, slug বা প্রিফিক্স)')
  log(`CSV কলাম: সিরিয়াল="${header[iSerial]}"${iPrev !== -1 ? `, আগের ছবি="${header[iPrev]}"` : ''}${iCur !== -1 ? `, পরের ছবি="${header[iCur]}"` : ''}${iProj !== -1 ? `, প্রকল্প="${header[iProj]}"` : ''}`)
  const out = []
  let bad = 0
  for (let r = 1; r < table.length; r++) {
    const row = table[r]
    if (row.every((c) => !c.trim())) continue
    const serial = Number(toAsciiDigits(row[iSerial] ?? '').trim())
    const pt = iProj !== -1 ? normalizeProject(row[iProj]) : project
    if (!Number.isInteger(serial) || serial < 1 || !pt) {
      bad++
      log(`সারি ${r + 1}: সিরিয়াল/প্রকল্প অবৈধ — বাদ (সিরিয়াল="${row[iSerial]}", প্রকল্প="${iProj !== -1 ? row[iProj] : project}")`)
      continue
    }
    for (const [kind, i] of [['prev', iPrev], ['current', iCur]]) {
      if (i === -1) continue
      const link = (row[i] ?? '').trim()
      if (!link) continue
      if (!kindsOf(pt).includes(kind)) {
        bad++
        log(`সারি ${r + 1} ${kind}: "${pt}" প্রকল্পে এই ছবির ঘর নেই (ছবি মোড) — বাদ`)
        continue
      }
      if (!/^https?:\/\//i.test(link)) {
        bad++
        log(`সারি ${r + 1} ${kind}: লিঙ্ক নয় — "${link.slice(0, 60)}"`)
        continue
      }
      out.push({ project_type: pt, serial_no: serial, kind, source: link })
    }
  }
  log(`CSV: ${table.length - 1} সারি → ${out.length} ছবির কাজ${bad ? `, ${bad}টি অবৈধ এন্ট্রি বাদ` : ''}`)
  return out
}

function jobsFromFolder(dir) {
  const out = []
  let unmatched = 0
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!fs.statSync(full).isFile()) continue
    const p = parsePhotoFilename(name, PROJECT_ALIASES)
    if (!p) {
      if (/\.(jpe?g|png|webp)$/i.test(name)) {
        unmatched++
        log(`ফোল্ডার: "${name}" — নাম বোঝা যায়নি, বাদ`)
      }
      continue
    }
    const pt = p.project_type ?? project
    if (!pt) {
      unmatched++
      log(`ফোল্ডার: "${name}" — প্রকল্প প্রিফিক্স নেই, --project দিন`)
      continue
    }
    const target = photoTarget(p.kind, projectByKey.get(pt)?.photo_mode ?? 'before_after')
    if (!target.ok) {
      unmatched++
      const why = { prev_not_allowed: 'এই প্রকল্পে শুধু পরের ছবি — _prev চলবে না', kind_missing: 'আগে না পরে লেখা নেই (_prev / _current)', no_photos: 'এই প্রকল্পে ছবি নেই' }[target.reason]
      log(`ফোল্ডার: "${name}" — ${why}, বাদ`)
      continue
    }
    out.push({ project_type: pt, serial_no: p.serial_no, kind: target.kind, source: `file:${name}`, local: full })
  }
  log(`ফোল্ডার: ${out.length} ছবির কাজ${unmatched ? `, ${unmatched}টি বাদ` : ''}`)
  return out
}

function normalizeProject(v) {
  return resolveProject(v)
}

/** key, slug, ফাইল-প্রিফিক্স বা নাম (বাংলা/ইংরেজি; "সেমিপাকা", "টিন" এর মতো ছোট রূপও) → প্রকল্পের key */
function resolveProject(v) {
  const s = String(v ?? '').trim().normalize('NFC').toLowerCase()
  if (!s) return null
  if (PROJECT_ALIASES[s]) return PROJECT_ALIASES[s]
  const byName = LEAVES.find((p) => [p.name_bn, p.name_en].some((n) => n && n.normalize('NFC').toLowerCase() === s))
  if (byName) return byName.key
  // নামের শুরু দিয়ে (যেমন "সেমিপাকা" → "সেমিপাকা ঘর নির্মাণ") — শুধু একটি মিললে
  const starts = LEAVES.filter((p) => p.name_bn && p.name_bn.normalize('NFC').toLowerCase().startsWith(s))
  return starts.length === 1 ? starts[0].key : null
}

/**
 * লিঙ্কের পাথ (…/Documents/A/B/IMG.jpg) → লোকাল ফোল্ডারে একই কাঠামোয় ফাইল।
 * root নিজেই "A" ফোল্ডার হতে পারে, তাই সামনের অংশ একে একে বাদ দিয়ে খোঁজা হয়; নাম NFC/NFD দুই রূপেই চেষ্টা।
 */
var fileIndex = null // var: helpers ফাইলের নিচে, উপরের কোড আগে চলে (let হলে TDZ)
/** root এর নিচে সব ছবি ফাইলের নাম → পাথ (একবার তৈরি); ফোল্ডার-কাঠামো না মিললে শুধু ফাইলনামে খোঁজার জন্য */
function buildFileIndex(root) {
  const map = new Map()
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/.(jpe?g|png|webp|heic)$/i.test(ent.name)) {
        const k = ent.name.normalize('NFC').toLowerCase()
        map.set(k, (map.get(k) ?? []).concat(p))
      }
    }
  }
  walk(root)
  return map
}

function resolveLocal(link, root) {
  let segs
  try {
    const u = new URL(link)
    segs = decodeURIComponent(u.pathname).split('/').filter(Boolean)
  } catch {
    return null
  }
  const i = segs.findIndex((x) => x.toLowerCase() === 'documents' || x.toLowerCase() === 'shared documents')
  const rel = i === -1 ? segs.slice(-3) : segs.slice(i + 1)
  for (let start = 0; start < rel.length; start++) {
    for (const form of ['NFC', 'NFD']) {
      const candidate = path.join(root, ...rel.slice(start).map((x) => x.normalize(form)))
      if (fs.existsSync(candidate)) return candidate
    }
  }
  // ফোল্ডার-কাঠামো মেলেনি → শুধু ফাইলনামে (IMG_… নাম সময়-ছাপসহ, প্রায় অনন্য)
  fileIndex ??= buildFileIndex(root)
  const hits = fileIndex.get(rel[rel.length - 1].normalize('NFC').toLowerCase()) ?? []
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) {
    // একাধিক হলে যেটির ফোল্ডার-পাথের সাথে লিঙ্কের বেশি অংশ মেলে
    const score = (p) => rel.filter((seg) => p.normalize('NFC').includes(seg.normalize('NFC'))).length
    return hits.sort((a, b) => score(b) - score(a))[0]
  }
  return null
}

/** Google Drive লিঙ্ক থেকে ফাইল-আইডি (file/d/ID, open?id=, uc?id=, id= প্যারাম) */
function driveFileId(u) {
  const m = u.pathname.match(/\/file\/d\/([\w-]{10,})/)
  if (m) return m[1]
  const id = u.searchParams.get('id')
  return id && /^[\w-]{10,}$/.test(id) ? id : null
}

/** SharePoint/OneDrive/Google Drive শেয়ার লিঙ্ককে সরাসরি ডাউনলোড লিঙ্কে রূপান্তরের চেষ্টা */
function toDirectUrl(link) {
  try {
    const u = new URL(link)
    const host = u.hostname.toLowerCase()
    // Google Drive: ফাইল "Anyone with the link" শেয়ার হলে uc?export=download কাজ করে; নইলে HTML (লগইন/অনুমতি) → ব্যর্থ
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const id = driveFileId(u)
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`
    }
    if (host.endsWith('sharepoint.com') || host.endsWith('onedrive.live.com') || host === '1drv.ms') {
      if (!u.searchParams.has('download')) u.searchParams.set('download', '1')
      return u.toString()
    }
    return link
  } catch {
    return link
  }
}

async function download(link, ms) {
  const direct = toDirectUrl(link)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(direct, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (asf-housing-migrate)', accept: 'image/*,*/*;q=0.8' },
    })
    const ctype = (res.headers.get('content-type') ?? '').toLowerCase()
    if (res.status === 401 || res.status === 403) throw new Error(`লগইন লাগছে বা অনুমতি নেই (HTTP ${res.status}) — লিঙ্ক "Anyone with the link" করুন`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (ctype.includes('text/html') || looksLikeHtml(buf)) {
      const html = buf.subarray(0, 4000).toString('utf8')
      if (/drive\.google\.com|Google Drive/i.test(html) && /confirm=|virus scan|too large/i.test(html)) {
        throw new Error('Google Drive: ফাইল বড় বলে নিশ্চিতকরণ পেইজ — ছবি ১০০ MB এর কম রাখুন')
      }
      throw new Error('লগইন পেইজ/HTML এসেছে, ছবি নয় — লিঙ্ক পাবলিক নয় ("Anyone with the link" করুন) বা সরাসরি ডাউনলোড সমর্থন করে না')
    }
    if (ctype && !ctype.startsWith('image/') && !ctype.includes('octet-stream')) {
      throw new Error(`content-type ছবি নয়: ${ctype}`)
    }
    return buf
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`সময়সীমা (${ms} ms) পার`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function looksLikeHtml(buf) {
  const head = buf.subarray(0, 512).toString('utf8').trimStart().toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml') || head.startsWith('<')
}

/** ম্যাজিক বাইট: JPEG / PNG / WebP / GIF / HEIC না হলে এরর */
function assertImage(buf) {
  if (buf.length < 12) throw new Error('ফাইল খুব ছোট, ছবি নয়')
  const b = buf
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  const isWebp = b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'
  const isGif = b.subarray(0, 3).toString('ascii') === 'GIF'
  const isHeic = b.subarray(4, 8).toString('ascii') === 'ftyp'
  if (!(isJpeg || isPng || isWebp || isGif || isHeic)) {
    throw new Error(looksLikeHtml(buf) ? 'HTML পেইজ এসেছে (লগইন লাগছে?)' : 'ছবির ম্যাজিক বাইট মেলেনি — ফাইল ছবি নয়')
  }
}

/** sharp দিয়ে ব্রাউজারের utils/imageProcessing.ts এর সমতুল্য: EXIF রোটেশন, ≤১৬০০px, WebP ৮০; থাম্ব ৪০০px */
async function compress(buf) {
  const base = sharp(buf, { failOn: 'none' }).rotate()
  const meta = await base.metadata()
  const photo = await base.clone().resize({ width: PHOTO_SPEC.maxWidth, withoutEnlargement: true }).webp({ quality: PHOTO_SPEC.quality }).toBuffer()
  const thumb = await base.clone().resize({ width: PHOTO_SPEC.thumbWidth, withoutEnlargement: true }).webp({ quality: PHOTO_SPEC.quality }).toBuffer()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  const scale = w ? Math.min(1, PHOTO_SPEC.maxWidth / w) : 1
  return { photo, thumb, width: Math.round(w * scale), height: Math.round(h * scale) }
}

// ---- CSV (RFC 4180: কোটেশন, কমা, নতুন লাইন সমর্থিত) ----
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** বাংলা অঙ্ক → ASCII (শীটে সিরিয়াল বাংলায় থাকলে) */
function toAsciiDigits(s) {
  return String(s).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
}

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

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const [k, inline] = a.slice(2).split('=', 2)
    if (inline !== undefined) out[k] = inline
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i]
    else out[k] = true
  }
  return out
}

function printHelp() {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*\n/, '').replace(/^ \* ?/gm, ''))
}

function log(msg) {
  console.log(msg)
}

function die(msg) {
  console.error('ত্রুটি: ' + msg)
  process.exit(1)
}
