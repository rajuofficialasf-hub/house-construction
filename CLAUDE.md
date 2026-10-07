# House construction (As-Sunnah Foundation project platform)

A public site listing each project's beneficiaries, with an admin panel for records, photos and the project registry. The React UI talks to the API only through the adapters in `src/backend/`. The project moved here from a Supabase version (`docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md`); that history, and where to restore anything removed, is in `docs/history/README.md`.

## Stack profile

- **Frontend:** React 19 + Vite + TypeScript with TanStack Query (ST-01). Backends are chosen in `src/backend/factory.ts`.
- **Backend:** Express 5 + TypeScript in `server/` (ST-02).
- **Database:** PostgreSQL 17 through `postgres` (postgres.js), with dbmate SQL migrations in `server/db/migrations/`. This is not Prisma, a deliberate deviation from ST-03. The server was built this way, Prisma adds nothing a small app needs, and moving would be a rewrite. The intent of the DB rules still holds:
  - tagged-template queries only
  - never edit a migration that has run
  - every migration has a down section
  - index every FK
  - separate `housing_owner` (migrations) and `housing_app` (runtime) roles
- **Auth:** the server's own admin table and opaque cookie sessions (`server/src/auth/`), not auth-core. This is a deliberate deviation from ST-04: a few admins, no signup, public reads (`docs/architecture/migration-notes.md`). Admins have the role `admin` or `main_admin`, and only a `main_admin` may delete.
- **File storage:** the storage adapter in `server/src/storage/`. The NAS driver is used in dev and tests. The S3 driver is built but unused (ST-05).
- **Supabase:** removed (ST-06). Don't add any use; `npm run check:prod-bundle` fails on it.

## Commands

- `docker compose up -d db`: local Postgres, which the server tests need.
- `npm --prefix server run db:migrate`, `db:seed`, `dev`: the API on port 3001.
- `npm --prefix server run admin -- create --email <e> --name <n> [--role main_admin]`: create an admin; `set-role` changes the role, and only one admin may be `main_admin`.
- `npm --prefix server run typecheck` and `npm --prefix server test`: server checks.
- `npm run dev`, `npm run build`, `npm run lint`, `npm test`: the UI.
- `npm run test:contract:rest`, `npm run test:e2e:rest-admin`, `npm run test:all`: contract, admin end-to-end against the server, and the full UI suite.
