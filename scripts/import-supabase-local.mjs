// Proves the Supabase import end to end against a real (local) Supabase stack, and times it
// (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md):
//   1. resets the local stack to supabase/sql (20 seeded records), then, through Supabase's own HTTP
//      APIs, adds two admins with known passwords, uploads photos for two records (and points a third
//      at a missing object), and changes a serial as an admin;
//   2. imports into a scratch database housing_import_check on the compose cluster, photos on a temp
//      folder, then runs verify --photos against an API started on that database;
//   3. logs both admins in through the new API with their Supabase passwords;
//   4. drops the scratch database and the folder.
// It never touches the live project: every URL comes from `supabase status` and must be localhost.
// Plain fetch instead of the Supabase client, so the script outlives the client's removal (roadmap C8).
// Needs Docker (`docker compose up -d db`), the Supabase CLI and Node 22.
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const TAG = '[import:supabase-local]'
const root = fileURLToPath(new URL('..', import.meta.url))
const serverDir = path.join(root, 'server')
const tsx = path.join(serverDir, 'node_modules/.bin/tsx')
const SCRATCH = 'housing_import_check'
const OWNER_PW = process.env.HOUSING_OWNER_PASSWORD ?? 'housing_owner_local'
const APP_PW = process.env.HOUSING_APP_PASSWORD ?? 'housing_app_local'
const ownerUrl = `postgres://housing_owner:${OWNER_PW}@127.0.0.1:5432/${SCRATCH}?sslmode=disable`
const appUrl = `postgres://housing_app:${APP_PW}@127.0.0.1:5432/${SCRATCH}?sslmode=disable`
const ADMINS = [
  { email: 'First.Admin@example.org', password: 'first admin supabase password' },
  { email: 'second.admin@example.org', password: 'second admin supabase password' },
]

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })
const die = (message) => {
  console.error(`${TAG} ${message}`)
  process.exit(1)
}
const local = (url) => ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
const psql = (sql) => run('docker', ['compose', 'exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql], { cwd: root })
const timings = []
async function timed(label, fn) {
  const start = performance.now()
  const result = await fn()
  timings.push([label, ((performance.now() - start) / 1000).toFixed(1)])
  return result
}
const freePort = async () => {
  const srv = createServer().listen(0, '127.0.0.1')
  await once(srv, 'listening')
  const { port } = srv.address()
  srv.close()
  return port
}

/** Runs the import CLI with the source URL piped to its prompt. */
function importCli(args, sourceUrl, env) {
  const r = run(tsx, ['src/cli/import-supabase.ts', ...args], { cwd: serverDir, input: `${sourceUrl}\n`, env: { ...process.env, ...env } })
  process.stdout.write(r.stdout)
  process.stderr.write(r.stderr)
  return r.status
}

// ---- 1. the local Supabase stack, as an admin would leave it ----
if (run('supabase', ['--version']).status !== 0) die('the Supabase CLI is not installed (https://supabase.com/docs/guides/cli)')
if (run('supabase', ['status', '-o', 'json']).status !== 0) {
  console.log(`${TAG} starting the local stack…`)
  if (run('supabase', ['start'], { stdio: 'inherit' }).status !== 0) process.exit(1)
} else {
  console.log(`${TAG} resetting the local database to supabase/sql…`)
  if (run('supabase', ['db', 'reset', '--local'], { stdio: 'inherit' }).status !== 0) process.exit(1)
}
const status = run('supabase', ['status', '-o', 'json'])
const st = JSON.parse(status.stdout.slice(status.stdout.indexOf('{')))
for (const url of [st.API_URL, st.DB_URL]) if (!url || !local(url)) die(`refusing a non-local Supabase URL: ${url}`)

/** One Supabase HTTP call; `token` defaults to the service key, which bypasses RLS (local stack only). */
async function sb(method, pathname, { body, token = st.SERVICE_ROLE_KEY, key = st.SERVICE_ROLE_KEY, headers = {} } = {}) {
  const res = await fetch(`${st.API_URL}${pathname}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...(body !== undefined && !Buffer.isBuffer(body) && { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) die(`${method} ${pathname}: HTTP ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const userIds = []
for (const admin of ADMINS) {
  const user = await sb('POST', '/auth/v1/admin/users', { body: { email: admin.email, password: admin.password, email_confirm: true } })
  userIds.push(user.id)
  await sb('POST', '/rest/v1/housing_admins', { body: { user_id: user.id, email: admin.email }, headers: { prefer: 'return=minimal' } })
}

const seeded = await sb('GET', '/rest/v1/housing_beneficiaries?select=id,project_type,serial_no&order=serial_no.asc,project_type.asc&limit=3')
if (seeded.length < 3) die('the seed has fewer than 3 records')
const image = (color) => sharp({ create: { width: 1200, height: 900, channels: 3, background: color } })
const objectPath = (r, name) => `housing/${r.project_type}/${String(r.serial_no).padStart(4, '0')}/${name}`
const publicUrl = (p) => `${st.API_URL}/storage/v1/object/public/housing-photos/${p}`
const upload = async (p, buffer) => {
  await sb('POST', `/storage/v1/object/housing-photos/${p}`, { body: buffer, headers: { 'content-type': 'image/webp', 'x-upsert': 'true' } })
  return publicUrl(p)
}
const [a, b, c] = seeded
const urls = {
  [a.id]: {
    prev_photo_url: await upload(objectPath(a, 'prev.webp'), await image('#a33').webp().toBuffer()),
    prev_thumb_url: await upload(objectPath(a, 'prev_thumb.webp'), await image('#a33').resize(400).webp().toBuffer()),
    // A browser-made WebP never has EXIF; this one does, so the import must re-encode it.
    current_photo_url: await upload(objectPath(a, 'current.webp'), await image('#3a3').webp().withExif({ IFD0: { Copyright: 'x' } }).toBuffer()),
  },
  [b.id]: { prev_photo_url: await upload(objectPath(b, 'prev.webp'), await image('#33a').webp().toBuffer()) },
  [c.id]: { current_photo_url: publicUrl(objectPath(c, 'current.webp')) }, // never uploaded: a gap
}
for (const [id, values] of Object.entries(urls)) {
  await sb('PATCH', `/rest/v1/housing_beneficiaries?id=eq.${id}`, {
    body: { ...values, photo_updated_at: new Date().toISOString() },
    headers: { prefer: 'return=minimal' },
  })
}

// A serial change made the way the admin UI makes it, so serial changes and the log hold real rows.
const session = await sb('POST', '/auth/v1/token?grant_type=password', { body: ADMINS[0], key: st.ANON_KEY, token: st.ANON_KEY })
await sb('POST', '/rest/v1/rpc/housing_change_serial', { body: { p_id: b.id, p_new_serial: 900 }, key: st.ANON_KEY, token: session.access_token })

// ---- 2. import into a scratch database, then verify ----
const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'housing-import-check-'))
const reportFile = path.join(storageRoot, 'report.json')
const port = await freePort()
const publicApiUrl = `http://127.0.0.1:${port}`
const env = { DATABASE_MIGRATION_URL: ownerUrl, PUBLIC_API_URL: publicApiUrl, STORAGE_DRIVER: 'nas', STORAGE_ROOT: path.join(storageRoot, 'files') }
let api
let failed = false
try {
  psql(`drop database if exists ${SCRATCH} with (force)`)
  const created = psql(`create database ${SCRATCH} owner housing_owner`)
  if (created.status !== 0) die(`could not create ${SCRATCH} (is \`docker compose up -d db\` running?)\n${created.stderr}`)
  psql(`grant connect, temporary on database ${SCRATCH} to housing_app`)
  const migrated = run('npm', ['--prefix', 'server', 'run', 'db:migrate'], { cwd: root, env: { ...process.env, DATABASE_MIGRATION_URL: ownerUrl } })
  if (migrated.status !== 0) die(`could not migrate ${SCRATCH}\n${migrated.stdout}${migrated.stderr}`)

  const photoBase = `${st.API_URL}/storage/v1/object/public/housing-photos/`
  const imported = await timed('import', () => importCli(['import', '--report', reportFile, '--photo-base', photoBase], st.DB_URL, env))
  if (imported !== 0) throw new Error('import failed')

  api = spawn(tsx, ['src/server.ts'], {
    cwd: serverDir,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, ...env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: appUrl, ALLOWED_ORIGINS: publicApiUrl, COOKIE_SECURE: 'false', LOG_LEVEL: 'warn' },
  })
  for (let i = 0; ; i++) {
    const ready = await fetch(`${publicApiUrl}/api/v1/readyz`).then((r) => r.ok, () => false)
    if (ready) break
    if (i > 60) throw new Error('the API did not become ready')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  const verified = await timed('verify --photos', () => importCli(['verify', '--report', reportFile, '--photos'], st.DB_URL, env))
  if (verified !== 0) throw new Error('verify failed')

  // ---- 3. Supabase passwords work on the new API ----
  const login = (body) =>
    fetch(`${publicApiUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: publicApiUrl }, body: JSON.stringify(body) })
  for (const admin of ADMINS) {
    const res = await login(admin)
    if (res.status !== 200) throw new Error(`${admin.email} could not log in with the Supabase password (HTTP ${res.status})`)
  }
  const wrong = await login({ email: ADMINS[1].email, password: 'not the password at all' })
  if (wrong.status !== 401) throw new Error(`a wrong password answered ${wrong.status}, not 401`)
  console.log(`${TAG} both admins logged in with their Supabase passwords`)
} catch (err) {
  failed = true
  console.error(`${TAG} ${err instanceof Error ? err.message : String(err)}`)
} finally {
  api?.kill()
  psql(`drop database if exists ${SCRATCH} with (force)`)
  await rm(storageRoot, { recursive: true, force: true })
}
for (const [label, seconds] of timings) console.log(`${TAG} ${label}: ${seconds} s`)
console.log(`${TAG} ${failed ? 'FAILED' : 'passed'}`)
process.exit(failed ? 1 : 0)
