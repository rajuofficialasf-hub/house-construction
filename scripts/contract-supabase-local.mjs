// Runs the full backend-contract suite (writes included) against a local Supabase stack built from supabase/sql.
// This is the check that the mock's write rules match real Supabase. It never touches the live project:
// the URL comes from `supabase status` and the test refuses any host other than localhost.
// Needs Docker and the Supabase CLI. Pass --no-reset to keep the current local data.
import { spawnSync } from 'node:child_process'

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })

if (run('supabase', ['--version']).status !== 0) {
  console.error('[contract:supabase-local] the Supabase CLI is not installed (https://supabase.com/docs/guides/cli)')
  process.exit(1)
}

let status = run('supabase', ['status', '-o', 'json'])
if (status.status !== 0) {
  console.log('[contract:supabase-local] starting the local stack…')
  if (run('supabase', ['start'], { stdio: 'inherit' }).status !== 0) process.exit(1)
} else if (!process.argv.includes('--no-reset')) {
  // Back to the seed, so serial counters and the activity log start from known values
  console.log('[contract:supabase-local] resetting the local database to the seed…')
  if (run('supabase', ['db', 'reset', '--local'], { stdio: 'inherit' }).status !== 0) process.exit(1)
}
status = run('supabase', ['status', '-o', 'json'])
const env = JSON.parse(status.stdout.slice(status.stdout.indexOf('{')))

const r = spawnSync('npx', ['vitest', 'run', 'tests/contract/supabase.local.contract.test.ts', ...process.argv.slice(2).filter((a) => a !== '--no-reset')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LOCAL_SUPABASE_URL: env.API_URL,
    LOCAL_SUPABASE_ANON_KEY: env.ANON_KEY,
    LOCAL_SUPABASE_SERVICE_KEY: env.SERVICE_ROLE_KEY,
  },
})
process.exit(r.status ?? 1)
