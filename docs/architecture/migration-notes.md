# Supabase to Express and PostgreSQL: migration notes

Source of truth for the target API: [../api/API_CONTRACT.md](../api/API_CONTRACT.md). Diagrams: [../diagrams/backend-architecture.md](../diagrams/backend-architecture.md).

## Supabase services in use

| Service | Used by | Replacement |
|---|---|---|
| Database plus auto REST (PostgREST) | `src/backend/supabase/housingApi.ts` | Express routes plus SQL |
| Auth (email and password) | `.../supabase/authProvider.ts` | Admin login endpoint, argon2 hashes, HttpOnly cookie session (no auth-core) |
| Storage (`housing-photos`) | `.../supabase/imageStorage.ts` | Storage adapter in `server/`: S3 driver first, NAS driver later; photos served through the API |

Not used: Realtime, Edge Functions.

## What moves out of the database

- Row Level Security (`supabase/sql/03_rls.sql`) becomes admin middleware: anyone reads, only admins write.
- RPC functions (`02_serial`, `04_rpc_stats`, `07_rpc_bulk`, `09_activity_log`) stay as Postgres functions or become service code. Serial and bulk work are safer inside SQL transactions.
- `auth.users` and `auth.uid()` do not exist in plain Postgres. The admin table needs its own credentials columns.
- `05_storage.sql` is dropped.
- `01_schema.sql` and `06_seed.sql` should port mostly as-is.

## Known facts that affect the migration

- The REST adapter covers login, reads, writes, photos and the activity log (C2–C5).
- Serial counters never decrease and deleted serials are never reused (`02_serial.sql`).
- Admin login and logout write activity-log rows.
- `scripts/migrate-photos.mjs` uses the Supabase service key and needs a rewrite.

## Decisions

Roadmap: [../plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md](../plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md).

1. Sessions: an opaque token in an HttpOnly cookie, not JWT. Only its SHA-256 is stored; timeouts are 8 hours idle and 7 days absolute. Settled in C2 ([../plans/2026-10-05-1246-migrate-c2-admin-login-plan.md](../plans/2026-10-05-1246-migrate-c2-admin-login-plan.md)).
2. CORS and login rate limiting: the API answers only the origins in `ALLOWED_ORIGINS`, with credentials, and refuses state-changing requests from any other origin. Login is limited to 10 failures per IP per 15 minutes, counted in memory, which is exact only while the API runs as one process. Settled in C2. C3 split CORS into two lists: other apps' origins go in `PUBLIC_READ_ORIGINS`, which gets credential-less CORS on the housing GETs and `openapi.json` only, and never passes the write Origin check. An origin may be on only one list. The public reads are limited to 300 requests per IP per minute, also in memory.
3. Photos: the storage adapter (`server/src/storage/`), S3 at cutover, NAS later. Settled in C5 ([../plans/2026-10-05-1722-migrate-c5-photos-plan.md](../plans/2026-10-05-1722-migrate-c5-photos-plan.md)):
   - Every upload gets server-made UUID keys (`housing/<uuid>.webp`) and rows in `housing_files`; the record's `*_url` columns hold `PUBLIC_API_URL/api/v1/photos/<file id>`. Serial-based paths stay a Supabase-only rule.
   - A serial change moves no file and changes no URL. A replaced photo, a photo delete and a record delete mark the old rows in the transaction and remove the files after commit; `npm --prefix server run files:sweep` retries any removal that failed.
   - The server re-encodes every upload as WebP with all metadata removed and makes the thumbnail itself.
   - `GET /api/v1/photos/:id` serves photos publicly with its own rate limit (1200 per IP per minute). It was cached a year as immutable; C6 changed that to one day (`public, max-age=86400`), so a deleted photo leaves browser and CDN caches within a day.
4. Writes: every POST, PUT or DELETE under `/api/v1/housing` needs an admin session, checked before the body is read. The acting admin for the activity log always comes from the session (`withActor()`), never from the request. The bulk routes take up to 500 rows in one transaction, with a 10 MB body limit; every other route has 100 KB. Settled in C4 ([../plans/2026-10-05-1601-migrate-c4-write-endpoints-plan.md](../plans/2026-10-05-1601-migrate-c4-write-endpoints-plan.md)). C6 added a write rate limit: 120 writes per admin per minute, counted in memory. A bulk request counts as one, the activity-log POST isn't counted, and a write without a session is still 401.
5. Deploy: settled in C6 ([../plans/2026-10-06-0925-migrate-c6-deploy-plan.md](../plans/2026-10-06-0925-migrate-c6-deploy-plan.md); steps for a person in [../operations/runbook.md](../operations/runbook.md)).
   - GitHub Actions runs every suite against PostgreSQL 17.
   - On the organization box, Cloudflare (with Authenticated Origin Pulls) → nginx 1.20 → one PM2 API process per environment. The API binds to loopback, and `TRUST_PROXY=1` because nginx overwrites `X-Forwarded-For` with the client IP.
   - Each environment has its own Linux user, PostgreSQL 17 cluster, env files and S3 photo bucket.
   - The UI and the API share one origin, so `PUBLIC_API_URL` is the site's origin.
   - Nightly encrypted backups go to an Object Lock bucket for 30 days, and the restore drill runs quarterly.
   - Production stays on Supabase until C7.
6. Import and cutover: settled in C7 ([../plans/2026-10-06-1035-migrate-c7-cutover-plan.md](../plans/2026-10-06-1035-migrate-c7-cutover-plan.md); the steps in [../operations/runbook.md](../operations/runbook.md) sections 19 and 20).
   - `import-supabase import` reads one read-only snapshot of the Supabase database over verified TLS, as a temporary read-only role, and writes it as `housing_owner` in one transaction: the same record ids and serials, the exact counters, serial changes and the activity log (same ids), with the log trigger off while loading.
   - Admins keep their Supabase id and bcrypt hash and log in with their current password; the first login rehashes it to argon2id. Admins who couldn't log in arrive disabled.
   - Photos are copied from the public bucket through the storage adapter (new UUID keys, `housing_files` rows, `PUBLIC_API_URL/api/v1/photos/<id>` URLs). A clean WebP is stored as is; anything else is re-encoded like an upload.
   - `import-supabase verify` compares both databases and every photo URL; any difference fails.
   - The write freeze is `is_housing_admin()` returning `false` on Supabase, which also keeps Supabase read-only for the 14-day rollback window. Rollback re-enters the new stack's writes by hand from its activity log, within 72 hours.

## Where each `supabase/sql` file went

The server's migrations are in `server/db/migrations/` and run with `npm --prefix server run db:migrate` ([C1 plan](../plans/2026-10-05-1215-migrate-c1-server-skeleton-db-port-plan.md)).

| `supabase/sql/` | `server/db/` | Changes |
|---|---|---|
| `01_schema.sql` | `migrations/0001_housing_schema.sql` | No `pgcrypto` extension |
| `02_serial.sql` | `migrations/0002_serial.sql` | No grants or row-level security; admin check moved to the server; `changed_by` comes from `housing_current_actor()`, which is now defined here |
| `03_rls.sql` | `migrations/0007_admin_auth.sql` | `housing_admins` gets its own uuid id, email, name and password hash instead of pointing at `auth.users`; no row-level security, the server checks admin rights; sessions in `housing_admin_sessions` |
| `04_rpc_stats.sql` | `migrations/0003_stats.sql` | No grants |
| `05_storage.sql` | dropped | Photos move to the storage adapter (C5) |
| `06_seed.sql` | `seed/dev.sql` | Dev only, through `npm --prefix server run db:seed`; safe to run again |
| `07_rpc_bulk.sql` | `migrations/0004_bulk_update.sql` | No grants |
| `08_reset_test_data.sql` | not ported | Tests reset with `resetTestData()` in `server/test/support/db.ts` |
| `09_activity_log.sql` | `migrations/0005_activity_log.sql` | No row-level security or grants; admin check moved to the server; the actor comes from `app.actor_id` and `app.actor_email`, set per transaction by `withActor()` in `server/src/db.ts` |
| none | `migrations/0006_app_role_grants.sql` | The runtime role `housing_app` writes only records and calls the functions; nothing is granted to `PUBLIC` |
| none (Supabase Storage objects) | `migrations/0009_housing_files.sql` | One row per stored photo file: UUID key, driver, record slot; `deleted_at` marks a file still to be removed from storage. `housing_app` gets select, insert, update and delete |
| none | `migrations/0010_search_and_activity_indexes.sql` | `pg_trgm` in its own `extensions` schema (a trusted extension's functions stay executable by PUBLIC, so they are kept out of `public`); trigram indexes for the list search and the activity log's actor filter, and `(project_type, at desc)` for its project filter (C7) |

## Working rules until cutover

From the cutover on, production runs on the new stack and these rules end: nothing ships on Supabase any more, and C8 removes it after the rollback window.

Another developer keeps shipping features on the Supabase version while the new stack is built. Both run side by side until the cutover day. New development rules for the new stack come after cutover.

**For everyone working on the current (Supabase) version:**

1. Call the backend only through the adapter. Only files in `src/backend/supabase/` may import `@supabase/supabase-js`. Components, pages and hooks use the backend from `backend/factory.ts`.
2. Add database changes as new numbered files in `supabase/sql/` (`10_...sql`, `11_...sql`). Do not edit files that have already run on the live project.
3. When you add or change a data operation, update `docs/api/API_CONTRACT.md` in the same commit.

**For the migration work:**

1. Add, never remove. The new server goes in `server/`, and the REST adapter goes in `backend/rest/`. Do not delete or rewrite the Supabase adapter, `supabase/sql/` or the existing UI before cutover. Removing Supabase is the last step (own-stack plan U7, "after cutover").
2. Production stays on `VITE_HOUSING_BACKEND=supabase`. Only local and staging use `rest`.
3. Merge `main` into the migration branch at least weekly, and whenever the other developer pushes.
4. After each merge, check these paths:
   - `supabase/sql/*`: port each new `supabase/sql/NN_*.sql` as the next `server/db/migrations/NNNN_*.sql`, add a row to the table above, and grant `housing_app` what it needs. Never edit a migration that has already run on staging or production; add a new one. From the first staging deploy on, migrations are add-only and must work with the previous release's code, because a rollback switches the code back but never the schema.
   - `backend/supabase/*` and the shared backend types: add the matching endpoint and REST adapter method.
   - `docs/api/API_CONTRACT.md`: implement whatever changed.
5. Run the contract and e2e suites against `rest`. A failure means a feature exists on Supabase but not yet on the new server.
6. Merge migration work to `main` in small pieces. It is safe because production does not use it, and it keeps the branches close.

## Safety net

Before migrating, run the test suite described in [../testing/README.md](../testing/README.md). It lists which behaviors are verified only on the mock backend and how to re-point the suite at the new server.
