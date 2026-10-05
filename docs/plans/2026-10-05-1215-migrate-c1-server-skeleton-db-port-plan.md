---
title: C1 Server Skeleton and Database Port
type: migrate
status: in-progress
date: 2026-10-05
---

# C1 Server Skeleton and Database Port

Chunk C1 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R4".

## Goal
A developer can start a local PostgreSQL 17 and the new `server/` API with a few commands, and the housing schema, serial rules and activity log work in that database exactly as they do on Supabase today. Production is untouched.

## Problem
Every later chunk (login, reads, writes, photos) needs a running server and the housing database without Supabase. The SQL in `supabase/sql/` depends on Supabase pieces (`auth.uid()`, `request.jwt.claims`, `anon`/`authenticated` roles, row-level security, the `storage` schema), so it can't run on plain Postgres as written.

## Requirements
- **R1** One command starts a local PostgreSQL 17 bound to `127.0.0.1` only, with a dev database and a separate test database.
- **R2** The `server/` API starts only when its environment config is valid, and otherwise exits with a message naming the bad setting.
- **R3** `GET /api/v1/healthz` returns 200 while the process is up; `GET /api/v1/readyz` returns 200 when the database answers and 503 when it doesn't, without internal detail.
- **R4** Unknown routes and unexpected errors return the contract error body `{ error: { code, message } }` (`docs/api/API_CONTRACT.md` §1.2) with no stack trace.
- **R5** The migrations build the full housing schema on an empty database: records, serial counters, serial-change history, stats and years functions, bulk update by serial, and the activity log with its trigger.
- **R6** Serials keep today's rules in the new database: per project type from 1, protected from direct change, changed only through the change-serial function, and never reused after delete (roadmap R4).
- **R7** The activity-log trigger records the acting admin from the transaction's actor settings, the same way it records the Supabase user today.
- **R8** The server's runtime database role can read and write housing data and call the housing functions, but can't change the schema or edit or delete activity-log rows.
- **R9** A dev seed loads the same 20 example records as `supabase/sql/06_seed.sql`, and refuses to run against a non-local database.
- **R10** Nothing used by production changes: no edits to `supabase/`, the Supabase adapter, the UI or the root build (roadmap R15).

## Scope
- In: local Docker Postgres, the `server/` package skeleton, config, logging, errors, health routes, graceful shutdown, migrations ported from `supabase/sql/`, database roles and grants, the actor helper, the dev seed and the test reset helper, docs.
- Out (not now): admin tables and login (C2), any `/api/v1/housing` route, CORS and OpenAPI (C3), the REST adapter, photos and the `files` table (C5), CI and deploy (C6).

## Key decisions
- From the roadmap: Express 5 + TypeScript + zod, plain SQL with `postgres` (porsager), no Prisma, no auth-core.

## Technical decisions
- **`server/` is its own npm package with its own `package.json`, lockfile and `tsconfig.json`** (`ST-20` allows an existing app to keep its layout, `ST-21`). The root package stays as it is, so the frontend build, `tsc -b`, and the root Vitest config (`src/**`, `tests/**` only) are not affected (R10). The root `oxlint` run lints `server/` too, which is wanted.
- **Node 22 pinned** with `"engines": { "node": ">=22 <23" }` in `server/package.json` and a root `.nvmrc` containing `22` (`ST-22`).
- **Dependencies:** `express@5`, `zod`, `postgres`, `helmet`, `pino`, `pino-http`; dev: `typescript`, `tsx`, `vitest`, `supertest`, `@types/express`, `@types/supertest`, `@types/node`. Each one is justified in its commit (`ST-30`). `dbmate` (npm package) runs migrations. It installs a platform binary through optional dependencies; check that before adding it (`ST-32`).
- **Migrations use dbmate** with `-- migrate:up` / `-- migrate:down` sections, in `server/db/migrations/`, named `0001_...sql` and so on. They run as `housing_owner` through `DATABASE_MIGRATION_URL`. Plain numbered SQL files fit the roadmap decision, and the tool records which files ran.
- **Roles are created outside migrations.** `server/db/roles.sql` creates `housing_owner` (owns the schema, runs migrations) and `housing_app` (runtime). Locally it runs from the Docker init script. On servers, ops runs it once (C6). Passwords come from env, never from committed files (`NE-CFG-02`). Migrations only GRANT and REVOKE (`DB-ROLE-01`).
- **Grants** (in the last migration): revoke all from `PUBLIC` on the housing tables and functions. Then give `housing_app`:
  - SELECT, INSERT, UPDATE and DELETE on `housing_beneficiaries`;
  - SELECT on `housing_serial_counters`, `housing_serial_changes` and `housing_activity_log`;
  - EXECUTE on the housing functions.

  Counters, serial changes and the log are written only by `SECURITY DEFINER` functions owned by `housing_owner`, which already set `search_path`. So the app role can't edit history (R8).
- **Supabase pieces dropped in the port:** `03_rls.sql` and `05_storage.sql` entirely, every `grant ... to anon, authenticated`, `enable row level security` and its policies, and the `is_housing_admin()` checks inside `housing_change_serial` and `housing_log_event`. Authorization moves to the service layer (`NE-SEC-03`, `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` C2). Remove `create extension pgcrypto`, because `gen_random_uuid()` is built in from PG13. Everything else ports as-is, including the `array_append` fix in the log trigger (`docs/testing/README.md`, "Found by this run").
- **The actor comes from transaction settings.** `housing_current_actor()` reads `nullif(current_setting('app.actor_id', true), '')::uuid` and `current_setting('app.actor_email', true)`, and falls back to `current_user` as the email when both are empty (as today for non-JWT callers). `housing_change_serial` uses the same function instead of `auth.uid()`. `server/src/db.ts` exports `withActor(actor, fn)`. It opens `sql.begin`, runs `select set_config('app.actor_id', $1, true), set_config('app.actor_email', $2, true)`, then runs `fn(tx)`. The `true` makes the settings last for the transaction only, so they can't leak between pooled connections. `actor_id` stays `uuid`, so the C2 admin ids must be uuid.
- **The bulk function (`07_rpc_bulk.sql`) ports unchanged.** C4 decides whether bulk moves to TypeScript (for the contract's 413 over 500 rows).
- **Health routes follow `NE-ERR-05`:** `/api/v1/healthz` and `/api/v1/readyz`, kept under `/api/v1` because nginx proxies only that prefix. Readiness runs `select 1` with a 2-second timeout (`NE-ERR-03`).
- **App setup, in middleware order:** `trust proxy` from config (`NE-SEC-10`), `pino-http` with a request id and `redact` for authorization, cookie and password fields (`NE-LOG-01`, `NE-LOG-02`), `helmet()` (`NE-SEC-01`), `express.json({ limit: '100kb' })` (`NE-REQ-02`), routes, the 404 handler, then the error handler (`NE-ERR-01`, `NE-SEC-11`). An `AppError(code, status, message, details?)` class carries the contract codes. The handler maps an `AppError` and a zod error to 400 `VALIDATION_ERROR`; anything else is logged in full and returns 500 `INTERNAL_ERROR`.
- **`createApp(deps)` is separate from `server.ts`,** so Supertest runs the real app without listening on a port (`TS-01`). `server.ts` listens and, on `SIGTERM`/`SIGINT`, stops accepting connections, waits for in-flight requests, then runs `sql.end({ timeout: 5 })` (`NE-ERR-04`).
- **Config** (`server/src/config.ts`): one zod schema over `process.env` with `NODE_ENV`, `PORT`, `DATABASE_URL` (runtime, `housing_app`), `LOG_LEVEL` and `TRUST_PROXY` (`NE-CFG-01`). `DATABASE_MIGRATION_URL` is read only by the migrate script. Committed `server/.env.example` uses placeholders.
- **Test database:** the server's DB tests run against `housing_test` through `TEST_DATABASE_URL`. A guard refuses any host that isn't `localhost` or `127.0.0.1`, following `assertLocal` in `tests/contract/supabase.local.contract.test.ts` (`TS-02`, `TS-03`). Each test file migrates once. `resetTestData()` truncates housing tables and the log and zeroes the counters as `housing_owner`, so each test creates its own data (`TS-14`).
- **Port 5432 on 127.0.0.1** (`DB-ROLE-03`). It doesn't clash with Supabase local (54322).

## Implementation units

### U1. Local PostgreSQL 17 in Docker
- **Goal:** One command starts a local Postgres with roles and two databases.
- **Requirements:** R1
- **Files:** `compose.yaml` (root), `server/db/roles.sql`, `server/db/docker-init/01-init.sh`, `server/.env.example`, `README.md` (local server section)
- **Approach:** Run `ae-docker-setup`, scoped to the Postgres service only, because the API runs with `tsx` on the host in this chunk. Use the image `postgres:17` with port `127.0.0.1:5432:5432`, a named volume and a healthcheck. The init script runs `roles.sql` (role passwords from compose env) and creates `housing` and `housing_test`, both owned by `housing_owner`.
- **Tests:** manual. `docker compose up -d db`, then `psql` as `housing_app` and as `housing_owner` into both databases. A connection from a non-loopback address is refused.
- **Done when:** a fresh clone gets a healthy database with `docker compose up -d db`, and the README says how.
- **Depends on:** none
- **Status:** done

### U2. Server package skeleton
- **Goal:** The `server/` app starts with validated config, logs JSON, serves health routes and returns contract-shaped errors.
- **Requirements:** R2, R3, R4, R10
- **Files:** `server/package.json`, `server/package-lock.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `.nvmrc`, `server/src/config.ts`, `server/src/logger.ts`, `server/src/db.ts`, `server/src/errors.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/routes/v1/health.ts`, `server/src/*.test.ts`
- **Approach:** As described in Technical decisions. The tsconfig has `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `module`/`moduleResolution` `nodenext` and `outDir: dist` (`ST-10`). Scripts: `dev` (`tsx watch src/server.ts`), `build` (`tsc`), `start` (`node dist/server.js`), `typecheck`, `test`. Error codes match the `KNOWN_CODES` list in `src/features/housing/backend/rest/http.ts`.
- **Tests:**
  - config: valid env parses; a missing `DATABASE_URL` or a non-numeric `PORT` throws an error naming the setting.
  - `healthz` is 200.
  - `readyz` is 200 against `housing_test`, and 503 with `{ error: { code: 'INTERNAL_ERROR' } }` when given a database client pointed at a closed port.
  - an unknown route gives 404 `NOT_FOUND` in the contract shape.
  - a route that throws an `Error('secret detail')` gives 500 with a generic message and no stack or "secret detail" in the body.
  - a JSON body over 100 kB gives 413 `PAYLOAD_TOO_LARGE`.
  - responses carry helmet headers and no `x-powered-by`.
- **Done when:** `npm --prefix server run typecheck` and `npm --prefix server test` pass, `npm --prefix server run dev` serves `/api/v1/readyz` = 200 against the Docker database, and the root `npm run build` and `npm test` still pass.
- **Depends on:** U1
- **Status:** done

### U3. Port the housing schema to migrations
- **Goal:** The migrations rebuild the Supabase housing schema on plain Postgres, with roles and the actor helper.
- **Requirements:** R5, R6, R7, R8
- **Files:** `server/db/migrations/0001_housing_schema.sql` (from `supabase/sql/01_schema.sql`), `0002_serial.sql` (from `02_serial.sql`), `0003_stats.sql` (from `04_rpc_stats.sql`), `0004_bulk_update.sql` (from `07_rpc_bulk.sql`), `0005_activity_log.sql` (from `09_activity_log.sql`), `0006_app_role_grants.sql`; `server/db/schema.sql` (dbmate dump); `server/package.json` scripts `db:migrate`, `db:status`; `server/src/db.ts` (`withActor`); `server/test/db/*.test.ts`, `server/test/support/db.ts`
- **Approach:** Copy each source file and make only the changes listed in Technical decisions. Each file's header names the `supabase/sql/` file it came from. That keeps the "After each merge" sync rule in `docs/architecture/migration-notes.md` easy to follow. `-- migrate:down` drops what the file created. That's acceptable because there's no shared data yet; once these migrations have run on staging, fix forward only (`DB-MIG-02`).
- **Tests** (real Postgres, `housing_test`, as `housing_app` unless noted):
  - Migrations apply to an empty database, and `db:status` shows none pending.
  - Inserting into each project type assigns serials 1, 2, 3 per type, independently.
  - Deleting serial 3 and inserting again gives 4, not 3 (never reused).
  - A direct `UPDATE ... set serial_no` is refused.
  - `housing_change_serial` moves a record to a free serial and writes a `housing_serial_changes` row whose `changed_by` is the actor; moving onto a taken serial fails with a unique violation.
  - `housing_next_serial` returns counter + 1.
  - `housing_stats` and `housing_years` return the expected totals for inserted rows (expected values written by hand, `TS-11`).
  - `housing_bulk_update_by_serial`: updates the matching rows; one unknown serial rolls back the whole batch; more than 500 rows is refused.
  - Inside `withActor({ id, email })`:
    - an insert writes a `create` log row with that actor id and email;
    - an update of `name` writes `update` with the old and new values;
    - an update with no tracked change writes no row;
    - a photo-only change writes `photo_update`;
    - a delete writes `delete`.
  - Outside `withActor`, the log row's `actor_email` is the database user name.
  - Actor settings don't leak: a second transaction on the same pool after `withActor` has no actor.
  - `housing_log_event('login', '{}', null)` writes a row; an action with uppercase letters is refused.
  - As `housing_app`, these fail with insufficient privilege: `CREATE TABLE`, `ALTER TABLE housing_beneficiaries`, `UPDATE housing_activity_log`, `DELETE FROM housing_activity_log`, `UPDATE housing_serial_counters`.
- **Done when:** all of the above pass, and `npm --prefix server run db:migrate` works on the Docker dev database.
- **Depends on:** U1, U2
- **Status:** todo

### U4. Dev seed and test reset
- **Goal:** Developers get example data locally, and tests get a clean database per test, with no way to hit a shared database.
- **Requirements:** R9
- **Files:** `server/db/seed/dev.sql` (from `supabase/sql/06_seed.sql`), `server/scripts/db-seed.ts`, `server/test/support/db.ts` (`resetTestData`), `server/package.json` script `db:seed`
- **Approach:** `db-seed.ts` checks that the URL host is local before running `dev.sql` as `housing_owner`, the same as the `assertLocal` pattern in `tests/contract/supabase.local.contract.test.ts`. `resetTestData()` is the plain-Postgres version of `supabase/sql/08_reset_test_data.sql` and also clears the activity log. `08` itself is not ported, because it's a one-time wipe for the live project.
- **Tests:**
  - seeding a fresh dev database gives 12 `semi_pucca` and 8 `tin` rows, and counters 12 and 8;
  - seeding with a non-local host exits non-zero and writes nothing;
  - after `resetTestData()`, counts are 0 and the next serial is 1.
- **Done when:** `npm --prefix server run db:seed` loads the 20 records locally, and the U3 tests use `resetTestData()` between cases.
- **Depends on:** U3
- **Status:** todo

### U5. Docs
- **Goal:** The next chunk's session, and the other developer, can see what changed and how to keep the two schemas in sync.
- **Requirements:** R10
- **Files:** `docs/architecture/migration-notes.md`, `docs/testing/README.md`, `README.md`
- **Approach:**
  - In migration-notes, close open decisions 1 (cookie sessions) and 3 (S3 first, NAS later) with links to the roadmap.
  - Add a table mapping each `supabase/sql/` file to its migration or "dropped, because ...".
  - Update the "After each merge" rule: a new `supabase/sql/NN_*.sql` becomes a new `server/db/migrations/NNNN_*.sql`.
  - In the testing README, add how to run the server DB tests.
- **Tests:** none (docs only). Check every path in the new text exists.
- **Done when:** the docs match the code, and the roadmap's C1 row can be marked done.
- **Depends on:** U3, U4
- **Status:** todo

## Verification
- `docker compose up -d db`
- `npm --prefix server ci && npm --prefix server run typecheck && npm --prefix server test`
- `npm --prefix server run db:migrate && npm --prefix server run db:seed && npm --prefix server run dev`, then `curl -s localhost:<PORT>/api/v1/readyz`
- Root, unchanged behavior: `npm run lint && npm run build && npm test && npm run check:prod-bundle`

## Risks and rollback
- **Production:** nothing in C1 is deployed or read by the UI, so rollback is reverting the commits.
- **Migrations:** all `0001`–`0006` are new and run only on local and test databases in this chunk. Their down sections drop everything they create, and the dev database can be rebuilt from scratch (`DB-MIG-05`). After the first staging run (C6) they are frozen (`DB-MIG-02`).
- **Schema drift:** the other developer may add `supabase/sql/10_*.sql` while C1 is in progress. Merge `main` before U5 and port any new file as the next migration.
- **Dropped admin checks** in `housing_change_serial` and `housing_log_event`: safe only while nothing but the server calls them. The server must check admin rights before calling (C2, C4). Revoking `PUBLIC` EXECUTE keeps other database users out.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `migrate/c1-server-db`
- **Updated:** 2026-10-05 12:45
- **Next:** U3, port `supabase/sql/01_schema.sql` to `server/db/migrations/0001_housing_schema.sql` and add dbmate
- **Uncommitted:** none
- **Notes:** Local machine runs Node 26; code targets Node 22 (`ST-22`), so run server commands with `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH`. TypeScript pinned to ~6.0.2 to match the root (npm picked 7 by default). esbuild's postinstall (used by tsx/vitest) was checked and rebuilt; installs use `--ignore-scripts` (`ST-32`).
