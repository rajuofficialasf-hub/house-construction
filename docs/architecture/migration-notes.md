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
   - `supabase/sql/*`: port new or changed SQL into `server/db/migrations/`.
   - `backend/supabase/*` and the shared backend types: add the matching endpoint and REST adapter method.
   - `docs/api/API_CONTRACT.md`: implement whatever changed.
5. Run the contract and e2e suites against `rest`. A failure means a feature exists on Supabase but not yet on the new server.
6. Merge migration work to `main` in small pieces. It is safe because production does not use it, and it keeps the branches close.

## Safety net

Before migrating, run the test suite described in [../testing/README.md](../testing/README.md). It lists which behaviors are verified only on the mock backend and how to re-point the suite at the new server.
