# House construction (As-Sunnah Foundation project platform)

A public site listing each project's beneficiaries, with an admin panel for records, photos, the project registry and users. The React UI talks to the API only through the adapters in `src/backend/`. The project moved here from a Supabase version (`docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md`); that history, and where to restore anything removed, is in `docs/history/README.md`.

How to run, extend and test the stack: `docs/DEVELOPER_GUIDE.md`.

## Stack profile

- **Frontend:** React 19 + Vite + TypeScript (ST-01). Backends are chosen in `src/backend/factory.ts`. There is no TanStack Query, a deliberate deviation from ST-01: the project list is the registry store (`src/features/projects/registry/`, `useSyncExternalStore`) and pages call the `src/backend` adapters directly. Adopting TanStack Query is left as a later proposal.
- **Backend:** Express 5 + TypeScript in `server/` (ST-02).
- **Database:** PostgreSQL 17 through `postgres` (postgres.js), with dbmate SQL migrations in `server/db/migrations/`. This is not Prisma, a deliberate deviation from ST-03. The server was built this way, Prisma adds nothing a small app needs, and moving would be a rewrite. The intent of the DB rules still holds:
  - tagged-template queries only
  - never edit a migration that has run
  - every migration has a down section
  - index every FK
  - separate `housing_owner` (migrations) and `housing_app` (runtime) roles
- **Auth:** the server's own admin table and opaque cookie sessions (`server/src/auth/`), not auth-core. This is a deliberate deviation from ST-04: a few admins, no signup, public reads (`docs/architecture/migration-notes.md`).
- **File storage:** the storage adapter in `server/src/storage/`. The NAS driver is used in dev and tests. The S3 driver is built but unused (ST-05).
- **Supabase:** removed (ST-06). Don't add any use; `npm run check:prod-bundle` fails on it.

## Roles

- `main_admin`: one login only, set only by the CLI. The only role that deletes (records, photos, projects, fields, private values, covers) and manages users on `/admin/users`.
- `admin`: every project; writes, imports and project settings, no deletes.
- `editor`: a project user, limited to the projects the main admin assigns on `/admin/users`, or "all projects". It adds and fills in records only: no deletes, no replacing a photo, no emptying a filled value, no serial change, no project settings. The server enforces this on every write route (`server/src/auth/scope.ts`).

## Rules

- **The mock backend doesn't grow.** It keeps three fixed projects and refuses project and field edits. There is no `AdminUsersApi` and no registry in the mock (both answer `NOT_IMPLEMENTED`). New admin specs go in `e2e/admin/` and run on `admin-rest`, against the server (`docs/testing/README.md`).
- **The migration-comment exception is not a precedent.** In P9 the comment headers of the already-run migrations `0001`–`0017` were rewritten once, with the SQL and down sections unchanged (user-decided 2026-10-07). "Never edit a migration that has run" still holds.
- **The `housing_test` suites never run at the same time:** `npm --prefix server test`, `npm run test:contract:rest` and `npm run test:e2e:rest-admin` all reset that database.

## Commands

- `docker compose up`: database, migrations, seed (a fresh database only), API on port 3001 and UI on port 5173. `docker compose down -v` starts over.
- `docker compose exec api npm run admin -- create --email <e> --name <n> [--role admin|editor|main_admin]`: create a login (prompts for the password); `set-role`, `set-password`, `disable`, `enable` and `list` manage them. On the host: `npm --prefix server run admin -- …`.
- `docker compose up -d db`: Postgres alone, which the server tests need.
- `npm --prefix server run db:migrate`, `db:rollback`, `db:seed`, `dev`: the API on the host.
- `npm --prefix server run typecheck` and `npm --prefix server test`: server checks.
- `npm run dev`, `npm run build`, `npm run lint`, `npm test`: the UI.
- `npm run test:contract:rest`, `npm run test:e2e:rest-admin`, `npm run test:e2e:rest`, `npm run test:e2e:mock`, `npm run test:all`: contract and admin end-to-end against the server, public end-to-end against the compose API, the mock lane, and the full UI suite.
