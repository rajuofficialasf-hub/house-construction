---
title: Migrate the Housing App from Supabase to the Org Stack (Roadmap)
type: migrate
status: requirements
date: 2026-10-05
---

# Migrate the Housing App from Supabase to the Org Stack (Roadmap)

## Goal
The housing site runs in production on our own Express + PostgreSQL service with no Supabase dependency. The public sees the same data, admins import and edit records exactly as before, serial numbers continue unbroken, and other apps can read the public data through a documented `/api/v1`.

## Problem
Supabase supplies the database, row-level security, the serial/bulk/stats SQL functions, admin auth and photo storage. The organization wants the app on its own stack and wants other projects to consume the housing data. The work is too large for one session, so it is split into chunks (below). Each chunk is planned with `ae-plan` and built with `ae-work` in its own session.

This roadmap supersedes `docs/plans/2026-10-04-1357-housing-service-own-stack-plan.md` (its database and auth choices mostly stand; its photo design is replaced by `docs/plans/2026-10-04-1607-feat-photo-storage-strategy-plan.md`). Its Security Baseline, deployment and cutover sections remain the reference for chunks C2, C6 and C7.

## Requirements

**Behavior parity**
- **R1** Every operation in `docs/api/API_CONTRACT.md` works on the new server under `/api/v1`, and the existing backend-contract suite (`tests/contract/`) passes against it.
- **R2** The existing Playwright suites (mock write flows and public read flows) pass with `VITE_HOUSING_BACKEND=rest` against the new server.
- **R3** Anyone can read housing data without logging in; only admins can write, and a write without an admin session is refused with the contract's unauthenticated or forbidden error.
- **R4** Serial numbers keep today's rules: assigned per project type from 1, changed only through change-serial, never reused after delete, and never reset by the migration.
- **R5** Bulk import is all-or-nothing, and bulk update-by-serial behaves as the contract says.
- **R6** Every admin write, login and logout writes an activity-log row carrying the acting admin.

**Admin login**
- **R7** A few admins log in with email and password and stay logged in through an HttpOnly cookie session; no token is readable by browser JavaScript.
- **R8** There is no signup; admins are created, disabled and given new passwords only through a server CLI script.
- **R9** Every login failure shows the same message, and repeated failures from one IP are rate-limited.
- **R10** Existing Supabase admins can log in after cutover with their current passwords.

**Photos**
- **R11** Photos are stored through the storage adapter; production starts on the S3 driver and the NAS driver is built and tested for a later switch (as specified in `docs/plans/2026-10-04-1607-feat-photo-storage-strategy-plan.md`).
- **R12** The browser loads every photo through the API, never from a bucket URL, and uploaded photos have EXIF/GPS data stripped.
- **R13** Every existing photo from Supabase Storage is visible on its record after cutover.

**Integration**
- **R14** Other apps can call the public read endpoints (list, detail, stats, years, filter options) from an allowlisted origin, and an OpenAPI spec for `/api/v1` is served by the API.

**Migration safety**
- **R15** Production stays on Supabase until cutover day; until then, the other developer can keep shipping on Supabase, following the working rules in `docs/architecture/migration-notes.md`.
- **R16** At cutover, record counts, serial counters, activity-log rows and photo counts match between Supabase and the new database, and Supabase stays read-only for a rollback window before it is deleted.
- **R17** After cutover the repo contains no `@supabase/*` dependency or Supabase adapter code, and the production bundle check confirms it.

## Scope
- In: the `server/` API, database port, admin login, read and write endpoints, photo storage (S3 + NAS drivers), the REST adapter in the UI, tests against the server, CI, staging and production deploy, data import and cutover, Supabase removal.
- Out (not now):
  - auth-core or any shared identity provider; tokens other apps can verify.
  - Write access for other apps (API keys, service credentials) and webhooks.
  - Embedding the housing UI inside another app.
  - Switching production photos from S3 to the NAS (the driver is built; the switch is a later env change plus the copy script).
  - Prisma.
  - UI redesign or new features.

## Key decisions
- **Stack: Node 22 + Express 5 + TypeScript + zod, PostgreSQL 17, plain SQL with a tagged-template client (`postgres`) and numbered `.sql` migrations. No Prisma.** The core logic (serials, bulk, stats, activity log) already lives in plpgsql that Prisma can't express, so Prisma would cover only about ten trivial queries and add a second schema to keep in sync. Governs R1, R4, R5. (user-directed; needs the ST-03 amendment below.)
- **Minimal admin session login, no auth-core.** Public reads with a handful of admins don't need refresh tokens, key rotation or cross-app tokens; a small argon2 + HttpOnly-cookie session is simpler to maintain. Keep a `Principal` seam so a host app's login could be accepted later. Governs R7–R10. (user-directed; needs the ST-04 amendment below.)
- **Photos: S3 driver first, NAS driver built now for the future.** The NAS isn't ready for production; switching later is the copy script plus an env change. Governs R11–R13. (user-directed.)
- **Integration = public read API only** in the first release, with a CORS allowlist and an OpenAPI spec. Governs R14. (user-directed.)
- **One chunk per session.** Each chunk gets its own `ae-plan` file and `ae-work` session, and is merged to `main` in small pieces (production doesn't use the new code until cutover). Keeps sessions short and token use bounded. (user-directed.)
- **Rule amendments for assunnah-engineering (separate task, outside this repo):**
  - ST-03: Prisma by default; a small app whose core logic lives in SQL functions and that doesn't use auth-core may use a parameterized tagged-template SQL client with numbered `.sql` migrations.
  - ST-04: auth-core when an app has end-user accounts or shares login with other apps; an app with only a few internal admins may use a minimal session login that keeps `NE-SEC-05`, `AU-10` and `AU-13`.

## Delivery chunks
Each chunk is one session (plan, build, review, merge). Order matters; C3 and C5 can swap.

| Chunk | What | Covers | Depends on |
|---|---|---|---|
| **C1** | Server skeleton + database port: `server/` package, config, errors, health, local Docker PG17, `supabase/sql` ported to migrations (RLS and storage SQL dropped, actor read from `app.*` settings), app and migration roles | R4 (schema level), R15 | none |
| **C2** | Admin login: admins/sessions tables, login/logout/me, rate limit, create-admin CLI, activity rows for login/logout, REST auth adapter in cookie mode | R3, R6, R7–R9 | C1 |
| **C3** | Read endpoints + REST adapter reads + read contract tests against the server; CORS allowlist and OpenAPI spec | R1 (reads), R3, R14 | C1 |
| **C4** | Write endpoints: create, update, delete, change serial, bulk insert, bulk update, activity log; REST adapter writes; write contract and mock e2e suites on `rest` | R1 (writes), R2, R4–R6 | C2, C3 |
| **C5** | Photos: storage adapter with S3 and NAS drivers, `files` table, photo upload/delete/serve routes, EXIF strip, REST image adapter, driver copy script | R11, R12 | C2 |
| **C6** | CI, staging and production deploy (PM2 + nginx), backups and restore drill, uptime check | R2 (in CI) | C4, C5 |
| **C7** | Data import and cutover: import script (records, serial counters, activity log, admins with password hashes, photos to S3), rehearsal on staging, cutover, rollback window | R10, R13, R16 | C6 |
| **C8** | Remove Supabase after the rollback window: dependency, adapter, `supabase/` folder, migrate-photos script, docs | R17 | C7 + rollback window |

After every chunk: merge `main` into the migration branch and port anything the other developer added on Supabase (`docs/architecture/migration-notes.md`, "After each merge").

## Success criteria
- Cutover is invisible to public users: same pages, same data, same photo links working.
- The full contract and e2e suites pass in CI against the server and a Postgres service container.
- A new developer can run the whole stack locally with one command.

## Open questions
- **Postgres host:** confirm with the box owner that self-hosted PostgreSQL 17 on the PM2 box is acceptable (fallback: small managed Postgres; no code change). Needed before C6.
- **Admin password hashes:** confirm that Supabase lets us export `auth.users.encrypted_password` for R10; if not, admins reset passwords once at cutover. Needed before C7.
- **S3 provider:** AWS S3 or Cloudflare R2 for the S3 driver. Needed before C6.
