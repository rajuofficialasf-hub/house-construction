# Supabase to Express and PostgreSQL: migration notes

Source of truth for the target API: [../api/API_CONTRACT.md](../api/API_CONTRACT.md). Diagrams: [../diagrams/backend-architecture.md](../diagrams/backend-architecture.md).

## Supabase services in use

| Service | Used by | Replacement |
|---|---|---|
| Database plus auto REST (PostgREST) | `src/features/housing/backend/supabase/housingApi.ts` | Express routes plus SQL |
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

- The REST adapter covers login, reads, writes and the activity log (C2–C4). The server has no photo routes until C5. Until then:
  - a serial change leaves the photo URLs at the old serial's path, where the files still are;
  - a delete leaves any photo files in place.
- Serial counters never decrease and deleted serials are never reused (`02_serial.sql`).
- Admin login and logout write activity-log rows.
- `scripts/migrate-photos.mjs` uses the Supabase service key and needs a rewrite.

## Decisions

Roadmap: [../plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md](../plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md).

1. Sessions: an opaque token in an HttpOnly cookie, not JWT. Only its SHA-256 is stored; timeouts are 8 hours idle and 7 days absolute. Settled in C2 ([../plans/2026-10-05-1246-migrate-c2-admin-login-plan.md](../plans/2026-10-05-1246-migrate-c2-admin-login-plan.md)).
2. CORS and login rate limiting: the API answers only the origins in `ALLOWED_ORIGINS`, with credentials, and refuses state-changing requests from any other origin. Login is limited to 10 failures per IP per 15 minutes, counted in memory, which is exact only while the API runs as one process. Settled in C2. C3 split CORS into two lists: other apps' origins go in `PUBLIC_READ_ORIGINS`, which gets credential-less CORS on the housing GETs and `openapi.json` only, and never passes the write Origin check. An origin may be on only one list. The public reads are limited to 300 requests per IP per minute, also in memory.
3. Photos: the storage adapter, S3 at cutover, NAS later ([../plans/2026-10-04-1607-feat-photo-storage-strategy-plan.md](../plans/2026-10-04-1607-feat-photo-storage-strategy-plan.md)).
4. Writes: every POST, PUT or DELETE under `/api/v1/housing` needs an admin session, checked before the body is read. The acting admin for the activity log always comes from the session (`withActor()`), never from the request. The bulk routes take up to 500 rows in one transaction, with a 10 MB body limit; every other route has 100 KB. There is no write rate limit yet; C6 decides on one before production. Settled in C4 ([../plans/2026-10-05-1601-migrate-c4-write-endpoints-plan.md](../plans/2026-10-05-1601-migrate-c4-write-endpoints-plan.md)).

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

## Working rules until cutover

Another developer keeps shipping features on the Supabase version while the new stack is built. Both run side by side until the cutover day. New development rules for the new stack come after cutover.

**For everyone working on the current (Supabase) version:**

1. Call the backend only through the adapter. Only files in `src/features/housing/backend/supabase/` may import `@supabase/supabase-js`. Components, pages and hooks use the backend from `backend/factory.ts`.
2. Add database changes as new numbered files in `supabase/sql/` (`10_...sql`, `11_...sql`). Do not edit files that have already run on the live project.
3. When you add or change a data operation, update `docs/api/API_CONTRACT.md` in the same commit.

**For the migration work:**

1. Add, never remove. The new server goes in `server/`, and the REST adapter goes in `backend/rest/`. Do not delete or rewrite the Supabase adapter, `supabase/sql/` or the existing UI before cutover. Removing Supabase is the last step (own-stack plan U7, "after cutover").
2. Production stays on `VITE_HOUSING_BACKEND=supabase`. Only local and staging use `rest`.
3. Merge `main` into the migration branch at least weekly, and whenever the other developer pushes.
4. After each merge, check these paths:
   - `supabase/sql/*`: port each new `supabase/sql/NN_*.sql` as the next `server/db/migrations/NNNN_*.sql`, add a row to the table above, and grant `housing_app` what it needs. Never edit a migration that has already run on staging or production; add a new one.
   - `backend/supabase/*` and the shared backend types: add the matching endpoint and REST adapter method.
   - `docs/api/API_CONTRACT.md`: implement whatever changed.
5. Run the contract and e2e suites against `rest`. A failure means a feature exists on Supabase but not yet on the new server.
6. Merge migration work to `main` in small pieces. It is safe because production does not use it, and it keeps the branches close.

## Safety net

Before migrating, run the test suite described in [../testing/README.md](../testing/README.md). It lists which behaviors are verified only on the mock backend and how to re-point the suite at the new server.
