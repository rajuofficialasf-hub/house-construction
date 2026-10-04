# Supabase to Express and PostgreSQL: migration notes

Source of truth for the target API: [../api/API_CONTRACT.md](../api/API_CONTRACT.md). Diagrams: [../diagrams/backend-architecture.md](../diagrams/backend-architecture.md).

## Supabase services in use

| Service | Used by | Replacement |
|---|---|---|
| Database plus auto REST (PostgREST) | `src/features/housing/backend/supabase/housingApi.ts` | Express routes plus SQL |
| Auth (email and password) | `.../supabase/authProvider.ts` | Login endpoint, password hashing, JWT or cookie |
| Storage (`housing-photos`) | `.../supabase/imageStorage.ts` | Photo endpoint, disk or S3 or MinIO |

Not used: Realtime, Edge Functions.

## What moves out of the database

- Row Level Security (`supabase/sql/03_rls.sql`) becomes admin middleware: anyone reads, only admins write.
- RPC functions (`02_serial`, `04_rpc_stats`, `07_rpc_bulk`, `09_activity_log`) stay as Postgres functions or become service code. Serial and bulk work are safer inside SQL transactions.
- `auth.users` and `auth.uid()` do not exist in plain Postgres. The admin table needs its own credentials columns.
- `05_storage.sql` is dropped.
- `01_schema.sql` and `06_seed.sql` should port mostly as-is.

## Known facts that affect the migration

- The REST `HousingApi` adapter is a stub today (every method throws NOT_IMPLEMENTED). Only the REST auth adapter is written.
- Serial counters never decrease and deleted serials are never reused (`02_serial.sql`).
- Admin login and logout write activity-log rows.
- `scripts/migrate-photos.mjs` uses the Supabase service key and needs a rewrite.

## Open decisions

1. JWT or HttpOnly cookie sessions.
2. CORS origins and login rate limiting.
3. Photo storage location.

## Safety net

Before migrating, run the test suite described in [../testing/README.md](../testing/README.md). It lists which behaviors are verified only on the mock backend and how to re-point the suite at the new server.
