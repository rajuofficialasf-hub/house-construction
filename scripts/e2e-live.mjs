// Runs the read-only live Playwright specs, or skips cleanly when Supabase credentials are missing.
// Credentials: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment or in .env.local.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const local = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
const has = (k) => !!process.env[k] || new RegExp(`^${k}=\\S`, 'm').test(local)

if (!has('VITE_SUPABASE_URL') || !has('VITE_SUPABASE_ANON_KEY')) {
  console.log('[e2e:live] skipped — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set (see .env.example)')
  process.exit(0)
}
const r = spawnSync('npx', ['playwright', 'test', '--project=live', ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
