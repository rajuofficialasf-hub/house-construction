---
title: Complete Move to the Own Stack - Plan
type: refactor
status: in-progress
source: brainstorm
date: 2026-10-06
doc_review: 2026-10-06
topic: complete-move-to-own-stack
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Complete Move to the Own Stack - Plan

## Goal Capsule

- **Objective:** The housing site runs entirely on our own Express + PostgreSQL stack with every feature the Supabase version has on today's `main`, and development continues on that one stack only.
- **Means:** Port the multi-project features to the server, make REST the default backend, prove parity with automated suites and a Chrome walkthrough, then delete the old system.
- **Product authority:** Forhad Hosain (project owner).
- **Open blockers:** None.

---

## Product Contract

### Summary

The Express + PostgreSQL server takes over everything the Supabase version does on `main` as of commit `a8e2154`: the project registry, custom and private fields, cover photos, per-project stats and unions, and the `main_admin` role. REST becomes the default backend. Parity is proven before anything is deleted. Then Supabase and the rollback, data-import and deploy tooling leave the repo, and a short guide tells the team how to run, extend and test the new stack.

### Problem Frame

The project is early in development and has no production users to protect. The migration roadmap (`docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md`) planned a production deploy (C6), a data import with a rollback window (C7) and a later Supabase removal (C8). That ceremony is no longer needed.

Meanwhile the other developer rebuilt the app as a multi-project platform on Supabase (M-steps 1–15, merged in `fbe7980`). The server still implements only the single-project contract. Today the REST adapter runs in a "legacy" mode that shows three fixed housing projects and refuses project and field edits (`src/backend/legacyProjectsApi.ts`). The gap between the two stacks is now most of the remaining work.

### Key Decisions

- **The parity target is frozen at `main` commit `a8e2154`.** Anything added on Supabase after that is not ported. (session-settled: user-directed — chosen over porting the other developer's Supabase work until handoff: the old system is no longer supported.) Governs R1–R8.
- **Supabase is deleted as soon as parity is proven.** There is no rollback window and no read-only period. (session-settled: user-directed — chosen over a rollback window: early stage, move ASAP.) Governs R15.
- **Deploy and cutover tooling is removed, not shelved.** (session-settled: user-directed — chosen over keeping the deploy scripts, keeping everything, or keeping the import script for dev data: there is no deployment yet.) Governs R16.
- **No data moves from Supabase.** The new stack starts from seed data. (session-settled: user-approved — the trade-off of losing the current Supabase records and photos was shown and accepted.)
- **The server adopts `main`'s multi-project API shape and retires `/api/v1/housing`.** No outside app uses those routes yet, so switching now is cheap. Keeping both would mean maintaining two APIs. (session-settled: user-approved — chosen over keeping the single-project routes alongside.) Governs R1, R17.
- **Parity is proven by automated suites plus a Chrome walkthrough.** (session-settled: user-directed — chosen over automated suites alone or the other developer's sign-off.) Governs R10–R13.
- **The handoff guide covers running, extending and testing only.** (session-settled: user-directed — a Supabase-to-new-stack map was left out.) Governs R19.
- **The S3 photo driver stays built but unused.** Local dev and tests use the NAS stand-in. (session-settled: user-approved.)

### Requirements

**Feature parity on the server**

- R1. Every operation in `docs/api/PROJECTS_API_CONTRACT.md` (v1.4) is served by the Express server under `/api/v1`, and the REST adapter calls it with no legacy fallback.
- R2. The project registry works end to end: list, get, overview, create (always as a draft), update with the concurrent-edit check, publish and unpublish, reorder, delete, cover upload and delete.
- R3. Project fields work end to end: create, update, archive, delete, reorder, usage counts and category value rename, with the guards the contract lists (for example no key, type or visibility change once data exists).
- R4. Records carry `union_name` and custom public values, and private values are stored apart and returned only to admins, singly and in bulk for CSV export.
- R5. Stats match the Supabase `project_stats` behavior: group roll-ups, `by_union`, field sums and category breakdowns, and the light version for the home page.
- R6. Two admin roles exist, `admin` and `main_admin`. Every delete (records, photos, projects, fields, private values, covers) is allowed only for `main_admin`, and the create-admin CLI sets the role.
- R7. Public reads see only published projects (whose group is also published) and public fields. Admins also see drafts and private fields.
- R8. Each project's photo mode (before and after, after only, none) is enforced by the server, as the Supabase adapter does today.
- R9. The server rules already built stay true: serial numbers per project from 1, never reused; all-or-nothing bulk import; bulk update with `_clear`; an activity-log row for every write carrying the acting admin; cookie sessions; rate limits; photos through the storage adapter with metadata stripped; CORS lists and the OpenAPI document.

**Default backend and proof**

- R10. REST is the default backend in the UI build, `.env.example` and `docker compose up`. The mock backend stays available for dev and tests only.
- R11. The backend-contract suite covers every `ProjectsApi` method and every new `HousingApi` method, and passes against the server.
- R12. Playwright covers the admin features `main` added: the project wizard and settings, field and stat-card builders, covers, the import wizard with custom and private fields, CSV export with private columns, category rename, and delete hidden from plain admins. All suites pass with the REST backend, locally and in CI.
- R13. A Chrome-driven walkthrough on the local stack covers every public page and admin flow. It is checked off against a feature list drawn from M-steps 1–15 in `docs/MULTI_PROJECT_PLAN.md`, with no console errors and no unexpected failed requests.
- R14. The import modules `main` replaced (`src/features/admin/import/importFields.ts`, `importAnalyze.ts`) get unit tests, restoring the coverage the merge removed.

**Removal**

- R15. Nothing in the repo depends on Supabase: no `@supabase/*` package, no Supabase adapter, no `supabase/` folder, no Supabase-only scripts, tests, Playwright projects or env vars. The production bundle check confirms it.
- R16. The deploy tooling (`deploy/`, the edge compose service, the CI deploy-config and edge jobs, the edge Playwright project, `docs/operations/runbook.md`) and the import and cutover tooling (the server's `import:supabase` CLI with its tests, fixtures and source test database) are removed. CI and local dev keep working.
- R17. The single-project routes and `docs/api/API_CONTRACT.md` are removed once R1 holds. `docs/api/PROJECTS_API_CONTRACT.md` becomes the one contract and is updated to describe the server as built.
- R18. Docs that describe Supabase setup, the cutover or the rollback window are removed or rewritten, so no doc tells a reader to use the old system.

**Handoff**

- R19. A short guide shows how to run the whole stack with one command (database, migrations, seed, API, UI, creating an admin with a role), how to add a feature end to end (migration, route, adapter method, tests), and which tests to run when and what CI checks.

### Acceptance Examples

- AE1. **Covers R6.** Given a plain `admin` is logged in, when they open a records list, then no delete control is shown, and a direct delete request is refused as forbidden. A `main_admin` sees and can use delete.
- AE2. **Covers R7.** Given a draft project with one private field, when a visitor who isn't logged in lists projects, then the draft is absent. An admin listing with drafts sees it, including the private field.
- AE3. **Covers R8.** Given an after-only project, when an admin uploads a before photo to one of its records, then the upload is refused as a validation error and nothing is stored.
- AE4. **Covers R15, R16.** Given the removal is done, when anyone searches the repo outside `docs/plans/` and `docs/learnings/` for `supabase`, `deploy/` or `import-supabase`, then nothing live turns up, and `npm run test:all` plus the server suite pass.

### Success Criteria

- A developer new to the repo follows the R19 guide and has the full stack running and an admin logged in without asking anyone.
- The R13 checklist is fully checked, and every suite in R11 and R12 is green in CI on the REST backend.

### Scope Boundaries

- Moving current Supabase records or photos to the new stack.
- Production hosting, backups, uptime checks and any deploy process. They get designed again when the app ships.
- Switching photo storage to S3.
- New features or UI changes beyond what `main` has at `a8e2154`.
- Porting anything added on Supabase after `a8e2154`.

### Dependencies / Assumptions

- The other developer stops pushing Supabase work to `main` from now on and builds new work on the new stack once it is ready. Otherwise the frozen target goes stale.
- `supabase/sql/10_projects.sql` through `13_money_limit.sql` and `src/backend/supabase/` are the reference for every rule R1–R8 port. Where they disagree with `docs/api/PROJECTS_API_CONTRACT.md`, the contract is corrected to match the running Supabase behavior.

### Outstanding Questions

**Deferred to Planning**

- Whether the mock backend grows to the full multi-project interfaces, or the new admin specs run only against the server.
- How SQL files 10–13 map onto server migrations, and whether the route rename lands in one step or alongside the new routes.
- Which of `main`'s check scripts (`smoke`, `photo-check`, `adapter-check`, `field-types-check`, `geo-check`, `content-check`, `admin-ui-check`, `build-rehearsal`, `build-unions`) are Supabase-specific and go with R15, and which are generic and stay.
- How the work splits into sessions. The earlier chunks ran one per session.

### Sources / Research

- `docs/api/PROJECTS_API_CONTRACT.md`: the target contract (v1.4).
- `docs/MULTI_PROJECT_PLAN.md` and `docs/progress/HOUSING_PROGRESS.md` (M-steps 1–15): what `main` built and why.
- `supabase/sql/10_projects.sql`, `10b_project_guards.sql`, `11_project_rpcs.sql`, `12_activity_log_v2.sql`, `13_money_limit.sql`: the rules to port.
- `src/backend/supabase/projectsApi.ts`, `housingApi.ts`, `stats.ts`: the reference adapter behavior.
- `src/backend/legacyProjectsApi.ts`: the temporary legacy mode that R1 removes.
- `server/`: the built single-project server (C1–C5), and `docs/architecture/migration-notes.md` for its settled decisions.
- `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md`: the roadmap this plan replaces for C6–C8.

---

<!-- ae-plan adds everything below -->

## Technical decisions

- **Stack profile** (`ST-43`). No `CLAUDE.md` exists yet, so U1 writes this profile there:
  - **Database:** PostgreSQL 17 through `postgres` (postgres.js) with dbmate SQL migrations, not Prisma.
    - This breaks `ST-03` and the `DB-MIG-01` tooling. Chunks C1–C5 settled it, and ~5k lines plus 10 migrations are built on it.
    - Moving to Prisma is outside this plan's requirements, so the profile records it as a deliberate deviation and proposes the rule change.
    - The intent of `DB-Q-01`, `DB-MIG-02..07` and `DB-ROLE-01` still applies: tagged-template queries only, never edit a run migration, a down section, FK indexes, separate `housing_owner` and `housing_app` roles.
  - **Auth:** own admin table with opaque cookie sessions, not auth-core. A few admins, no signup (`docs/architecture/migration-notes.md`). This is a recorded deviation from `ST-04`.
  - **Storage:** the storage adapter, NAS driver in dev and tests, S3 driver built but unused (`ST-05`).
  - **Frontend:** React 19 + Vite + TypeScript with TanStack Query (`ST-01`); talks to the API only through `src/backend/` adapters.
  - **Supabase:** being removed (`ST-06`), finished in P9.
- **Where the Supabase rules go.**
  - **Integrity rules move into the database as ported triggers** (`DB-TX-03`): field-value normalisation, record validation, project and field guards, counters.
    - The reference SQL is already written and tested, so porting it is faster and closer to parity than rewriting ~1,200 lines in TypeScript.
    - What gets stripped: `auth.uid()`, RLS policies, `asf_meta`, `security definer` and the `anon`/`authenticated` grants.
  - **Authorization moves into the API** (`NE-SEC-03`, `DB` intro): who may delete (`main_admin`), and which projects and fields a caller may see.
    - It does not stay in SQL, because a guard that trusts a session setting can be spoofed (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`).
- **The guards' own errors reach the client.**
  - The ported triggers raise our own SQLSTATE class `HC`: `HC400` for a validation error, `HC409` for a conflict. The message is the Bangla text and `DETAIL` holds the field (for example `extra.amount`).
  - `server/src/errors.ts` passes the message and `details.field` through **only** for class `HC`, because we wrote that text. Every other Postgres error keeps its fixed message (`NE-SEC-11`).
  - Map by code, not constraint name (`docs/learnings/database/raised-sqlstate-has-no-constraint-name.md`).
  - Lands with the first trigger port, in P2.
- **Visibility (replaces RLS).**
  - A SQL function `housing_public_project_keys()` (plain invoker, `stable`, granted to `housing_app`) ports `public_project_keys()`.
  - Public reads filter by it. With a live admin session the rule follows the contract (§4.1):
    - lists (`GET /projects`, later `overview`) include drafts only with `drafts=1`
    - `GET /projects/:key` and its fields return a draft to any admin session, with no flag
    - private field definitions always go to an admin session
  - Private field definitions are dropped in the read query for non-admins (§5.2).
  - "Admin session" is `req.admin` from `sessionMiddleware`, which already refuses expired sessions and disabled admins (`server/src/auth/session.ts:42`). It is never read from request input.
  - Any response whose body depends on the session sends `Cache-Control: private, no-store`, so no shared cache serves an admin body to a visitor.
- **`main_admin`.**
  - `housing_admins.role` is `admin` or `main_admin`, with at most one `main_admin`. This is a unique partial index, ported from `10b`.
  - No admin is promoted by migration. Nothing is deployed and no users carry over, so the CLI (U5) and the seeds set roles.
  - A `requireMainAdmin` middleware guards every delete route.
- **Photos keep the server's model** (R9, migration-notes decision 3):
  - storage keys are UUIDs
  - files are tracked in `housing_files`
  - URLs are `/api/v1/photos/<fileId>`
  - a serial change moves no file

  Covers reuse the same mechanism: a `housing_files` row with kind `cover` and a `project_key`. The contract's serial-based paths and cover path are corrected to this in P9 (R17).
- **File downloads check visibility** (user-decided at doc review, `NE-SEC-03`):
  - `GET /api/v1/photos/:fileId` joins the file to its record's project, or to the cover's project, and returns 404 to a visitor unless the project is in `housing_public_project_keys()`.
  - Admin sessions skip the check, and those responses send `Cache-Control: private, no-store`.
  - Public files keep today's long public cache.
  - This goes beyond Supabase, whose bucket is public.
  - P3 adds it with a visitor-gets-404 test for a draft's photo, and P4 extends it to covers.
- **Private values (phone, NID) never leave the admin path** (R4, contract §3.5, §4.5, `NE-LOG-02`):
  - the activity log records only the changed key names (`private_update` with `masked: true`), never values
  - pino `redact` covers the private request and response bodies (`data`, `extra` routed to private)
  - `GET/PUT /records/:id/private` and `POST …/records/private` are admin-only, send `Cache-Control: no-store`, and are never public-read paths
  - error `details` carry the field key, never the value
  - a record delete cascades its private row (U2)
- **Public-read CORS is an explicit list of public GET routes**, not a prefix. `/activity`, every `/private` route and every write stay off it. Public-read origins get credential-less CORS, so the browser sends no cookie and they can never get an admin body. Each chunk that adds a public GET adds it to the list, with a test.
- **Guard messages carry only fixed text, a project or field label, and a field key.** P2 checks every `raise` in the ported SQL for this. A test asserts that `DETAIL` matches the field-key pattern (`^[a-z_]+(\.[a-z][a-z0-9_]*)?$`) and that a malformed `extra` value is not echoed back.
- **Covers use the record-photo upload path:**
  - the same busboy and sharp receiver
  - magic-byte type check
  - metadata strip
  - WebP re-encode
  - 5 MB cap (`413` above it)
  
  A replace by any admin tombstones the old file through the existing sweep. Per the contract, only `DELETE` needs `main_admin`.
- **The money limit is 1e10.** SQL 13 is not a separate step. P2's port of `housing_field_value` writes the 1e10 limit directly.
- **JSON binding.** Bind every jsonb value (`extra`, private data, `stat_cards`, `core_fields`) as `${sql.json(x)}` or `${JSON.stringify(x)}::text::jsonb`, never as a bare string (`docs/learnings/database/copy-rows-as-jsonb-text-and-bind-with-text-cast.md`).

### Deferred to Planning — settled

- **The mock adapter's future: it does not grow.** The new admin specs run only against the server (`admin-rest`).
  - A full multi-project mock means re-implementing ~1,000 lines of guard, stats and validation rules in TypeScript, and they would drift from the server.
  - The mock keeps today's legacy view (three fixed projects, no project or field edits) for the existing `e2e/mock` specs and fast UI work, as R10 asks.
  - In P6, `legacyProjectsApi.ts` moves into `src/backend/mock/` because the mock becomes its only user.
- **How SQL 10–13 maps to migrations.** Each migration lands in the chunk that first needs it. Each one has a `-- migrate:down` that removes everything it adds (the test global setup rolls back every migration), plus explicit `housing_app` grants (`0006` revokes PUBLIC EXECUTE).

  | Migration | Ports | Chunk |
  |---|---|---|
  | `0011_projects_registry` | `10_projects.sql`: `projects`, `project_fields`, `beneficiary_private`, record columns `union_name` and `extra`, the `project_type` FK in place of the CHECK, indexes, the three seed rows (their counters already exist from `0002`), `housing_public_project_keys()` | P1 |
  | `0012_admin_roles` | `10b` role part: `role` column, CHECK, one-`main_admin` index | P1 |
  | `0013_record_rules` | `10b`: `housing_field_value` (money limit 1e10 from 13), `housing_validate_record`, `beneficiary_private_validate` | P2 |
  | `0014_record_functions_v2` | `11`: `project_leaf_keys`, `housing_bulk_update_by_serial` v2, `housing_next_serial` v2; `12`: record and private activity-log v2 | P3 |
  | `0015_project_guards` | `10b`: `projects_guard`, `projects_after_write`, `project_fields_guard`; `11`: `project_create`, reorders, `project_field_usage`, `project_field_rename_value`; `12`: config-change log; `housing_files` gains cover kind and `project_key` | P4 |
  | `0016_project_stats` | `11`: `project_stats(key, light)`, `projects_overview(drafts)`, added beside the old `housing_stats` and `housing_years`, which stay untouched until P9 deletes them | P5 |

- **The route switch: new routes go in beside the old ones** (confirmed by the user at doc review).
  - P1–P5 add the `/api/v1/projects…`, `/records…` and `/activity` routes beside `/api/v1/housing`.
  - P6 points the REST adapter at them and drops the legacy fallback.
  - P9 deletes the `/housing` routes and `docs/api/API_CONTRACT.md` (R17).
  - This way every chunk ends with CI green: today's `test:contract:rest` and `admin-rest` keep running on the old routes until the adapter moves.
- **Which check scripts are Supabase-only.**
  - **Removed in P9 (R15):** `smoke`, `photo-check`, `content-check`, `admin-ui-check`, `adapter-check`, `build-rehearsal`, `security-check`, `migrate-photos`, `contract-supabase-local`, `import-supabase-local`, `e2e-live`.
    - `smoke` is not repointed: `admin-rest` Playwright and the R13 walkthrough cover what it checked.
  - **Kept, generic:** `geo-check`, `field-types-check`, `build-unions`, `build-map`, `i18n-check`, `check-prod-bundle`, and `scripts/contract-rest.mjs` and `scripts/e2e-rest-admin.mjs` (behind `npm run test:contract:rest` and `npm run test:e2e:rest-admin`).
  - Names here are files in `scripts/`. P9 removes each file and its `package.json` script together.
    - `check-prod-bundle` gains a "no `supabase` in the bundle" assertion in P9, which is how R15 is proven.

## Session chunks

Each chunk is one session that ends with green tests and commits. Chunks run in this order. Removal (P9) starts only after P6–P8 pass, including the R13 walkthrough.

| Chunk | Scope | Requirements | Gate to start |
|---|---|---|---|
| **P1** | Foundation: stack profile, registry schema, admin roles end to end, project reads with draft and private visibility | R1 (partial), R6, R7 (reads), R2 (list/get), R9 | — |
| **P2** | Record rules and single-record API: `0013`, `errors.ts` HC mapping, `GET/PATCH/DELETE /records/:id`, `POST /projects/:key/records`, list with `union_name`, `f.*`, `q` over searchable fields, `sort=extra.*`, `serial/:n`, `serials`, private `GET/PUT /records/:id/private` and `POST …/records/private`; plain admin can't null a photo URL; CORS gains `PATCH` | R1, R4, R7, R9 | P1 |
| **P3** | Bulk and photos: `0014`, `POST/PUT …/records/bulk` v2 (`_clear`, `extra` merge, private keys routed), `POST /records/:id/serial`, `PUT/DELETE /records/:id/photos/:slot` with photo mode checked before storing (R8, AE3), the photo route's draft visibility check, `years`, `next-serial` (null for drafts unless admin), `GET/POST /activity`, record and private log v2 | R1, R4, R8, R9 | P2 |
| **P4** | Project and field writes: `0015`, `POST/PATCH(If-Match)/DELETE /projects`, publish and unpublish, `PUT /projects/order`, field create, update, archive, delete, reorder, usage, rename-value, covers `PUT/DELETE /projects/:key/cover` (draft covers 404 to visitors), config activity log | R2, R3, R6, R9 | P1 (P3 for the rename-value log) |
| **P5** | Stats and overview: `0016`, `GET /projects/:key/stats?light=1` (`by_union`, `by_project`, field sums, category `by_value`), `GET /projects/overview` (`featured`, `without_photo`); OpenAPI complete for every route; dev seed gains a draft project with custom and private fields | R5, R1, R9 | P3, P4 |
| **P6** | REST adapter and default: rewrite `src/backend/rest/endpoints.ts` and `index.ts` to the new routes with no legacy fallback; real `ProjectsApi`; REST default in `factory.ts`, `.env.example`, `compose.yaml`; move legacy into the mock; contract suite gains a `ProjectsApi` part and every new `HousingApi` method, run against REST and, while it still exists, local Supabase as the parity reference | R1, R10, R11 | P5 |
| **P7** | Playwright and import tests: `admin-rest` specs for the wizard and settings, field and stat-card builders, covers, import with custom and private fields, CSV export with private columns, category rename, delete hidden from a plain admin (AE1); unit tests for `importFields.ts` and `importAnalyze.ts`; CI runs all suites on REST | R12, R14 | P6 |
| **P8** | Chrome walkthrough on the local stack against a checklist drawn from M-steps 1–15 (`docs/MULTI_PROJECT_PLAN.md`), saved in `docs/progress/`; fix whatever it finds | R13 | P7 green in CI |
| **P9** | Removal: Supabase package, adapter, `supabase/` folder, scripts, tests, Playwright projects, env vars; `deploy/`, the edge service and jobs, the runbook; `import:supabase` and its tests and fixtures; `/housing` routes and `API_CONTRACT.md`; `PROJECTS_API_CONTRACT.md` corrected to the server as built; docs rewritten, including the mermaid pages in `docs/diagrams/` (`backend-architecture.md` loses the Supabase, deploy and cutover pictures and gains the registry tables; `test-strategy.md` loses the live-Supabase lanes); bundle check; AE4 search | R15, R16, R17, R18 | P8 checklist fully checked |
| **P10** | Handoff guide: run, extend, test; `CLAUDE.md` profile final | R19 | P9 |

Only P1 is planned in full below. Each later chunk gets its own units from `ae-plan` at its start, against the code as it is then.

## Implementation units — P1 (Foundation)

### U1. Record the stack profile
- **Goal:** `CLAUDE.md` states what the app runs on and the two deliberate deviations, so plans and reviews read them instead of flagging them.
- **Requirements:** (`ST-43`); supports all.
- **Files:** `CLAUDE.md` (new).
- **Approach:**
  - Add a `## Stack profile` section with one line per piece (database, auth, storage, frontend, Supabase status), each with its reason, using the text in Technical decisions.
  - Add a short `## Commands` list taken from the root and `server/` `package.json`. Keep it under ~40 lines; P10's guide carries the detail.
- **Tests:** none (docs). Check that every command named exists in a `package.json`.
- **Done when:** `CLAUDE.md` exists with the profile and no command it names is missing.
- **Depends on:** none
- **Status:** done

### U2. Migration `0011_projects_registry`
- **Goal:** The database holds projects, project fields and private values, and records carry `union_name` and `extra` and belong to a registered project.
- **Requirements:** R2, R3, R4, R7 (schema side).
- **Files:**
  - `server/db/migrations/0011_projects_registry.sql`
  - `server/test/support/db.ts` (`resetTestData` clears the new tables and restores the three seed projects; `ProjectType` widens to `string`; `insertRecord` accepts `union_name` and `extra`; new `insertProject` and `insertField` helpers)
  - `server/test/db/projects-registry.test.ts`
- **Approach:**
  - Port the DDL from `supabase/sql/10_projects.sql`: the `projects` table with every column and CHECK (key format, slug format and uniqueness, `projects_group_shape`, length checks, `photo_mode`, `geo_depth`, jsonb shape checks); `project_fields`; and `beneficiary_private(record_id pk references housing_beneficiaries on delete cascade, data jsonb)`.
  - Drop the `project_type` CHECK from `0001` and add an FK to `projects(key)`. Add `union_name text not null default ''` and `extra jsonb not null default '{}'` (with the object and size < 16 KB checks) to `housing_beneficiaries` (`DB-MIG-04`). Add the four indexes from `10` and index every new FK (`DB-MIG-07`).
  - Insert the `housing`, `semi_pucca` and `tin` rows exactly as `10` does, with `on conflict do nothing`.
  - Add `housing_public_project_keys()` as a plain `stable` SQL function.
  - Grants:
    - `housing_app`: select, insert, update and delete on the three tables, and execute on the function.
  - `updated_at` triggers follow `0001`'s pattern.
  - Leave out RLS, `asf_meta`, the `anon` and `authenticated` grants, and `security definer`.
  - Follow `server/db/migrations/0009_housing_files.sql` for layout, comments and the grant block.
  - The down section drops in reverse order and restores the `0001` CHECK.
  - Undo note (`DB-MIG-05`): down drops custom values and private data, which is acceptable because no shared database holds real data (no deploy, no import).
- **Tests** (`test/db/`, real Postgres, `TS-02`):
  - the seed rows exist, with `semi_pucca` and `tin` under the `housing` group and published
  - a record with an unknown `project_type` and an explicit `serial_no` is refused by the FK (23503); without `serial_no`, the `0002` serial trigger refuses it first (23514)
  - a bad key, slug or `file_prefix`, a group with a `file_prefix`, or a non-group without one, is refused (23514)
  - a duplicate slug or `file_prefix` is refused (23505)
  - an `extra` that is not an object, or is 16 KB or larger, is refused
  - deleting a record removes its `beneficiary_private` row
  - `housing_public_project_keys()` leaves out a draft, and a published child of a draft group
  - `housing_app` can write `beneficiary_private` (proves the grant)
  - the existing `test/db/*` and `test/http/*` suites still pass with the widened helpers
- **Done when:** `npm --prefix server test` is green, including the global setup's full up, down, up cycle.
- **Depends on:** none
- **Status:** todo

### U3. Migration `0012_admin_roles`
- **Goal:** Every admin has the role `admin` or `main_admin`, with at most one `main_admin`.
- **Requirements:** R6.
- **Files:** `server/db/migrations/0012_admin_roles.sql`, `server/test/support/db.ts` (`AdminInput.role`), `server/test/db/admin-roles.test.ts`.
- **Approach:**
  - Port the role part of `supabase/sql/10b_project_guards.sql` lines 37–45: `role text not null default 'admin'`, the CHECK, and the unique partial index `housing_admins_one_main_admin`.
  - `housing_app` keeps select only; roles change only through the CLI as owner (`0007` comment).
  - The down section drops the column.
- **Tests:**
  - default role is `admin`
  - an unknown role is refused
  - a second `main_admin` is refused (23505 on the index)
  - `housing_app` cannot update `role` (42501)
- **Done when:** the tests pass and `npm --prefix server run db:migrate` works on the dev database.
- **Depends on:** none (independent of U2)
- **Status:** todo

### U4. Role through the session and a `main_admin` guard on deletes
- **Goal:** The API knows each admin's role, reports it at login and in `/auth/me`, and refuses every delete from a plain admin.
- **Requirements:** R6 (AE1 server side), R9 (sessions unchanged).
- **Files:**
  - `server/src/auth/types.ts` (`AdminPrincipal.role`)
  - `server/src/auth/session.ts` and `service.ts` (select `role`)
  - `server/src/routes/v1/auth.ts:23` (drop the hard-coded `'admin'`)
  - `server/src/auth/middleware.ts` (`requireMainAdmin`)
  - `server/src/routes/v1/housing-admin.ts` (apply it to `DELETE /housing/:id` and the photo delete)
  - `server/src/openapi.ts` (role enum, 403 on deletes)
  - `server/test/support/session.ts` (`loginAdmin(..., { role })`)
  - `e2e/support/rest-data.ts` (the seeded admin is `main_admin`)
  - tests in `server/test/http/auth.test.ts` and `housing-writes.test.ts`, plus new `server/test/http/main-admin.test.ts`
- **Approach:**
  - `requireMainAdmin` runs after `requireAdmin`. It throws `AppError('FORBIDDEN', 'শুধু মূল এডমিন মুছতে পারেন')` unless `req.admin.role === 'main_admin'` (`NE-SEC-03`, deny by default). Every delete route added in P2–P4 uses the same middleware.
  - The role is read with the session lookup on every request, so a role change by the CLI applies on the next request with no re-login.
  - Existing tests that delete log in as `main_admin` explicitly; the default stays `admin`.
  - `toUser` returns `admin.role`, and the OpenAPI user schema's `role` becomes the enum `admin | main_admin`.
  - `e2e/support/rest-data.ts` passes `role: 'main_admin'` to `insertAdmin`.
- **Tests:**
  - login and `/auth/me` return the real role for each role
  - a plain admin gets 403 on record delete and on photo delete, and the record and file remain
  - a `main_admin` gets 204 and 200
  - no session gets 401
  - after a direct SQL update (test helper, as owner) demotes an admin, that admin's next delete is 403 without logging in again
  - a disabled `main_admin`'s existing cookie gets 401 on delete
  - the OpenAPI drift test passes
- **Done when:** server tests pass, and `npm run test:e2e:rest-admin` passes, including `record-delete` and `activity`, the two known failures.
- **Depends on:** U3
- **Status:** todo

### U5. Admin CLI sets the role
- **Goal:** Whoever runs the stack can create a `main_admin` or change an admin's role from the CLI.
- **Requirements:** R6, R19 (the guide will use it).
- **Files:** `server/src/cli/admin.ts`, `server/src/auth/admins.ts`, `server/test/cli/admin.test.ts`, `server/test/auth/admins.test.ts`.
- **Approach:**
  - `create` gains `--role admin|main_admin` (default `admin`), validated with zod like the existing flags.
  - A new `set-role --email --role` command.
  - `list` shows the role.
  - Making a second `main_admin` fails with a clear message ("a main admin already exists: <email>; demote them first"). It does not fail with a raw 23505.
  - `set-role` logs the change as a security event (`NE-LOG-03`).
  - Follow the existing `set-password` and `disable` commands.
- **Tests:**
  - create with each role
  - an invalid role is refused before touching the database
  - a second `main_admin` gives the friendly error and changes nothing
  - set-role promote and demote
  - an unknown email gives the error and a non-zero exit
  - list prints the roles
- **Done when:** the CLI tests pass and `npm --prefix server run admin -- create --role main_admin …` works on the dev database.
- **Depends on:** U3
- **Status:** todo

### U6. Project registry reads with draft and private visibility
- **Goal:** `GET /api/v1/projects`, `GET /api/v1/projects/:key` and `GET /api/v1/projects/:key/fields` serve the registry as the contract describes. Visitors see only published projects and public fields. Admins also see drafts and private fields.
- **Requirements:** R1, R2 (list and get), R7 (AE2).
- **Files:**
  - `server/src/projects/schemas.ts`: query schemas, plus the `Project` and `ProjectField` response shapes for OpenAPI
  - `server/src/projects/reads.ts`: named column lists, never `*` (`DB-Q-05`)
  - `server/src/routes/v1/projects.ts`
  - `server/src/app.ts`: mount it, and turn `isPublicReadPath` into an explicit route list that includes the three project GETs
  - `server/src/openapi.ts`
  - `server/test/http/projects-reads.test.ts`
- **Approach:**
  - Follow `server/src/routes/v1/housing.ts` and `server/src/housing/reads.ts`: the read rate limiter, a thin route that validates and calls the read, and the `{ data }` response.
  - Public callers filter by `housing_public_project_keys()`. `drafts=1` is honoured only when `req.admin` is set and ignored otherwise.
  - `include=fields` embeds fields in `sort_order` order, archived ones included, using one query for all projects (`DB-Q-03`, no per-project loop).
  - For non-admins, fields with `visibility = 'admin'` are dropped in the read query. The definition never leaves the server (§5.2).
  - Admin draft handling follows the Visibility decision. Session-dependent responses send `Cache-Control: private, no-store`.
  - Add the three GET routes to the explicit public-read CORS list.
  - Order is `sort_order`, then `key`. The list is bounded by the 40-field and registry size, and capped with a `limit` of 200 (`DB-Q-04`).
  - `:key` is validated against the key regex before the query (`NE-REQ-01`).
  - The response matches `src/backend/interfaces/types.ts` `Project` and `ProjectField` field for field, so P6's adapter needs no mapping.
- **Tests (each test creates its own data, `TS-14`):**
  - Setup data: a draft project with a private field.
  - **Visitor:**
    - the list leaves out the draft
    - `drafts=1` still leaves it out
    - `GET /projects/<draft>` is 404
    - a published project's fields leave out the private field
    - a published child of a draft group is absent (AE2, `TS-13`)
  - **Admin:**
    - the list without `drafts=1` leaves out the draft; `GET /projects/<draft>` returns it
    - a disabled admin's cookie with `drafts=1` gets published projects only
    - responses to an admin carry `Cache-Control: private, no-store`
    - `drafts=1` includes the draft
    - the private field is listed
    - archived fields are included
  - **Errors and order:**
    - a bad key format gives 400
    - an unknown key gives 404
    - the order is `sort_order` then `key`
  - **Cross-cutting:**
    - CORS: a public-read origin may GET `/projects` without credentials
    - the OpenAPI drift test passes
- **Done when:** the tests pass, and `curl localhost:3001/api/v1/projects` against the dev stack returns the three seed projects.
- **Depends on:** U2
- **Status:** todo

## Verification

Run these at the end of P1:

- `npm --prefix server run typecheck` and `npm --prefix server test` (needs `docker compose up -d db`)
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest`: the old routes must still pass
- `npm run test:e2e:rest-admin`, including the two specs that fail today
- `npm --prefix server run db:migrate`, `db:rollback` and `db:migrate` on the dev database

## Risks and rollback

- **Migrations `0011` and `0012` change a shared table.** No shared database holds real data, and the global setup proves that down runs cleanly. Rolling back drops custom values, private data and roles (`DB-MIG-05`), which is acceptable before any deploy.
- **Until `0013` (P2), the FK also admits a group or draft key** for a record inserted straight into the database. This is accepted: the old routes' zod enums still allow only `semi_pucca` and `tin`, and no shared data exists.
- **The FK in place of the CHECK** makes every test or fixture that inserts records rely on the seed rows. `resetTestData` restores them, and U2's done check runs the whole existing suite.
- **The old `/housing` routes stay live until P9.** They must keep passing their suites through P2–P5, because the new triggers also apply to them.

## Definition of done (P1)

- U1–U6 are done and their tests pass.
- The verification commands pass, and the two `admin-rest` specs that failed now pass.
- `ae-review` has run with no open P0 or P1.
- P2's start runs `ae-plan` on this file to add P2's units.

## Progress
- **Branch:** `dev-forhad`
- **Updated:** 2026-10-06
- **Next:** P1 U2, write migration `0011_projects_registry.sql` from `supabase/sql/10_projects.sql`.
- **Uncommitted:** none
- **Notes:**
  - Only P1 is planned in units. After P1, run `ae-plan` on this file to add P2's units.
  - The user confirmed that nothing is deployed and no users carry over (2026-10-06), so `0012` promotes no admin.
