---
title: On Windows the test scripts that spawn npm, npx or dbmate without a shell fail with ENOENT; run their steps by hand
date: 2026-10-08
type: tooling
module: scripts (e2e, contract, prod-bundle), server/test
severity: medium
tags: [windows, spawn, npm, npx, dbmate, playwright, vitest, local-setup, pw-channel]
applies_when: running the admin e2e lane, the REST contract run, the prod-bundle check or the server test suite on a Windows host, or writing a Node script that spawns another CLI
---

# On Windows, spawn `npm`/`npx`/`dbmate` with a shell or run the steps by hand

## What happened

On a Windows 11 host, `npm run test:e2e:rest-admin` stopped at once with
`could not migrate housing_test; is the database up?` although the compose database was healthy.
`npm run check:prod-bundle` exited 1 with no output, and `npm --prefix server test` reported
"No test files found" after `spawn …\server\node_modules\.bin\dbmate ENOENT`.

## What didn't work

- Starting the database again, or pointing `TEST_DATABASE_MIGRATION_URL` at the right port. The
  scripts never reached the database.
- `npx playwright install chromium` on the same host: the Playwright CDN timed out on every attempt,
  with both download hosts, so the bundled Chromium could not be installed either.

## What to do

The scripts call `spawnSync('npm', …)` or `spawnSync('npx', …)` without `shell: true`. On Windows
those commands are `npm.cmd` and `npx.cmd`, and Node's `spawn` doesn't resolve the `.cmd` shim, so
the child fails with ENOENT before it runs. The same happens to the extensionless
`node_modules/.bin/dbmate` shim the server tests run by path.

Until the scripts are changed, run their steps by hand (Git Bash):

```bash
# admin e2e lane (scripts/e2e-rest-admin.mjs + scripts/lib/migrate-test-db.mjs by hand)
export TEST_DATABASE_URL='postgres://housing_app:housing_app_local@127.0.0.1:5433/housing_test?sslmode=disable'
export TEST_DATABASE_MIGRATION_URL='postgres://housing_owner:housing_owner_local@127.0.0.1:5433/housing_test?sslmode=disable'
DATABASE_MIGRATION_URL="$TEST_DATABASE_MIGRATION_URL" npm --prefix server run db:migrate
rm -rf .storage/e2e
PW_CHANNEL=chrome E2E_ADMIN_REST=1 npx playwright test --project=admin-rest

# REST contract run (scripts/contract-rest.mjs by hand)
REST_CONTRACT=1 npx vitest run tests/contract/rest.contract.test.ts

# prod-bundle check (scripts/check-prod-bundle.mjs by hand): build with the mock forced, then scan
VITE_HOUSING_BACKEND=mock npx vite build --outDir /tmp/prod-bundle --emptyOutDir
grep -rlE 'housing_mock_state|__housingMock|admin@example.test|__mock-photos|supabase' /tmp/prod-bundle
```

Use the port your compose database publishes (`DB_PORT` in `.env`; 5433 on a machine where a local
PostgreSQL holds 5432). `PW_CHANNEL=chrome` (`playwright.config.ts`) runs the specs in the installed
Google Chrome when the Playwright CDN is unreachable; unset, nothing changes.

The server suite has no by-hand equivalent on Windows, because `server/test/support/migrate.ts`
runs the dbmate shim by path from its global setup. Run it in CI, WSL or Linux.

If a script is changed, the portable fix is `spawnSync(cmd, args, { shell: true })`, or
`process.platform === 'win32' ? 'npm.cmd' : 'npm'`. Keep `stdio: 'inherit'` so the child's output
still reaches the terminal.

## Why

Node's `child_process.spawn` executes the named file directly. Windows has no `npm` or `npx`
executable, only `.cmd` and `.ps1` shims that need a shell, and the extensionless shims npm writes
into `node_modules/.bin` are POSIX shell scripts. CI runs on Linux, so the scripts work there and the
problem shows up only on a Windows developer machine.

## How to prevent it

- A Windows machine in the team runs `npm run test:e2e:rest-admin` and `npm run check:prod-bundle`
  once after any change to `scripts/`.
- New scripts that spawn a CLI pass `shell: true` or pick the `.cmd` name on `win32`.

## Files

- `scripts/e2e-rest-admin.mjs`
- `scripts/lib/migrate-test-db.mjs`
- `scripts/contract-rest.mjs`
- `scripts/check-prod-bundle.mjs`
- `server/test/support/migrate.ts`
- `playwright.config.ts` (the `PW_CHANNEL` opt-in)
