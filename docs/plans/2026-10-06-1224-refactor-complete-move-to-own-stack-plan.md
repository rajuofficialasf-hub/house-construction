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
| **P3** | Bulk and photos: `0014`, `POST/PUT …/records/bulk` v2 (`_clear`, `extra` merge, private keys routed), `POST /records/:id/serial`, `PUT/DELETE /records/:id/photos/:slot` with photo mode checked before storing (R8, AE3), the photo route's draft visibility check, `years`, `next-serial` (null for drafts unless admin), `GET/POST /activity`, record and private log v2 | R1, R4, R6, R7, R8, R9 | P2 |
| **P4** | Project and field writes: `0015`, `POST/PATCH(If-Match)/DELETE /projects`, publish and unpublish, `PUT /projects/order`, field create, update, archive, delete, reorder, usage, rename-value, covers `PUT/DELETE /projects/:key/cover` (draft covers 404 to visitors), config activity log | R2, R3, R6, R9 | P1 (P3 for the rename-value log) |
| **P5** | Stats and overview: `0016`, `GET /projects/:key/stats?light=1` (`by_union`, `by_project`, field sums, category `by_value`), `GET /projects/overview` (`featured`, `without_photo`); OpenAPI complete for every route; dev seed gains a draft project with custom and private fields | R5, R1, R9 | P3, P4 |
| **P6** | REST adapter and default: rewrite `src/backend/rest/endpoints.ts` and `index.ts` to the new routes with no legacy fallback; real `ProjectsApi`; REST default in `factory.ts`, `.env.example`, `compose.yaml`; move legacy into the mock; contract suite gains a `ProjectsApi` part and every new `HousingApi` method, run against REST and, while it still exists, local Supabase as the parity reference | R1, R10, R11 | P5 |
| **P7** | Playwright and import tests: `admin-rest` specs for the wizard and settings, field and stat-card builders, covers, import with custom and private fields, CSV export with private columns, category rename, delete hidden from a plain admin (AE1); unit tests for `importFields.ts` and `importAnalyze.ts`; CI runs all suites on REST | R12, R14 | P6 |
| **P8** | Chrome walkthrough on the local stack against a checklist drawn from M-steps 1–15 (`docs/MULTI_PROJECT_PLAN.md`), saved in `docs/progress/`; fix whatever it finds | R13 | P7 green in CI |
| **P9** | Removal: Supabase package, adapter, `supabase/` folder, scripts, tests, Playwright projects, env vars; `deploy/`, the edge service and jobs, the runbook; `import:supabase` and its tests and fixtures; `/housing` routes and `API_CONTRACT.md`; `PROJECTS_API_CONTRACT.md` corrected to the server as built; docs rewritten, including the mermaid pages in `docs/diagrams/` (`backend-architecture.md` loses the Supabase, deploy and cutover pictures and gains the registry tables; `test-strategy.md` loses the live-Supabase lanes); bundle check; AE4 search | R15, R16, R17, R18 | P8 checklist fully checked |
| **P10** | Handoff guide: run, extend, test; `CLAUDE.md` profile final | R19 | P9 |

P1 to P3 are planned in full below. Each later chunk gets its own units from `ae-plan` at its start, against the code as it is then.

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
- **Status:** done

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
- **Status:** done

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
- **Status:** done

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
- **Status:** done

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
- **Status:** done

## Implementation units — P2 (Record rules and single-record API)

### P2 decisions

These settle what research turned up. They add to Technical decisions and change none of them.

- **The triggers are plain invoker functions, not `security definer`.**
  - `housing_app` already reads the tables they read (`0006`, `0011`).
  - `housing_field_value` is called from inside the triggers, so `housing_app` gets an explicit `execute` grant (`0006` revokes PUBLIC EXECUTE, `docs/learnings/database/postgres-default-privileges-public-execute.md`).
- **Every `raise` in `0013` is `HC400`.** No P2 rule is a conflict. A duplicate serial is still the unique index's `23505`, which `errors.ts` already maps to 409. `HC409` is mapped now and first raised by P4's guards (for example a key change once data exists).
- **An unknown key is never echoed.**
  - The reference's unknown-key messages print the key the client sent (`10b`). The port uses fixed text ("অচেনা ফিল্ড" / "অচেনা গোপন ফিল্ড").
  - `DETAIL` is `extra.<key>` only when the key matches the field-key format from `0011` (`^[a-z][a-z0-9_]{0,39}$`). Otherwise it is just `extra` (or `private`).
  - The API's zod schemas also refuse such keys first (`NE-SEC-09`: this keeps out `__proto__` and friends). The SQL rule is the backstop for direct writes.
- **The "only `main_admin` may null a photo" check leaves the trigger.**
  - The reference does it with `auth.uid()` and `is_housing_main_admin()`. A trigger can't know the caller's role safely (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`).
  - So the API enforces it. The new record bodies don't accept `prev_photo_url`, `current_photo_url` or either thumb **from any role**, and the strict schema gives 400.
  - Contract §5.1 already says photo columns are never client-writable. A photo is removed only through `DELETE /records/:id/photos/:slot` (P3, `main_admin`). This meets "a plain admin can't null a photo URL through PATCH" and is stricter than it.
  - The trigger keeps the photo-mode rule (R8). It needs no caller.
- **The new routes return the full record.** They use their own column list and strict response schema: the old 19 columns plus `union_name` and `extra`, matching `HousingRecord` in `src/backend/interfaces/types.ts`. The old `RECORD_COLUMNS` and `housingRecord` (`server/src/housing/`) stay untouched, so `/housing` responses don't change.
- **A visitor's `extra` holds only public field keys** (user-decided at P2 doc review). For a non-admin viewer, the read query keeps only the keys of the project's public fields (archived public fields included). It is a whitelist, not a blacklist, so a key with no field row is dropped too: `(select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(extra) e where e.key = any(<public keys>))`, using the keys from the project lookup. An admin gets `extra` as stored. The write trigger already refuses private keys, so this is a second guard.
- **`union_name` and `extra` are stored as sent on any project** (contract §4.4.4 allows ignore or reject). The trigger refuses `extra` keys the project doesn't define. The P6 adapter may keep its `shapeWrite`.
- **List filters bind every key as a parameter, never as SQL text** (`DB-Q-01`):
  - `f.<key>` is used only when the key is a public, active, `filterable` field of the project, and is ignored otherwise (§4.4.1). The match is `extra @> ${sql.json({ [key]: value })}`, served by the GIN index on `extra`.
    - A category or text value is normalised the way the trigger does (NFC, trim, collapsed spaces, at most 100 characters).
    - A number or money value must parse as a number, else 400 with `details.field = 'f.<key>'`.
    - At most 10 `f.` filters.
  - `q` (at most 100 characters) uses the existing `ilike … escape '\\'` pattern from `server/src/housing/reads.ts`. It searches `name`, `father_or_husband_name`, `address`, and `extra ->> ${key}::text` for each public, active, `searchable` field. The `::text` cast is required: `jsonb -> unknown` is ambiguous between the text and integer overloads.
  - `sort=extra.<key>` orders by `extra -> ${key}::text nulls last` when the key is a public, active field, and falls back to `serial_no` otherwise.
    - jsonb orders numbers as numbers and strings as text, the same as the Supabase adapter.
    - The tie-break is always `serial_no asc, id asc`.
- **Private writes replace the whole set.**
  - `PUT /records/:id/private` writes `{ data }` as an update, or an insert when no row exists (never `on conflict do update`, see U11), and the trigger drops empty values. A set left empty stays as a `{}` row.
  - Reads (`GET` and the bulk `POST`) treat `{}` as no values.
- **Some writes go unlogged until P3.**
  - The `0005` log trigger watches only the system columns. A PATCH that changes only `extra` or `union_name` writes no log row, and neither does a private PUT.
  - P3's `0014` (record and private log v2) closes this.
  - Until then, every new write still runs inside `withActor`, so P3 needs no route change.
  - **Meanwhile, a security-event log line** (user-decided at P2 doc review, `NE-LOG-03`): a private PUT logs `{ event: 'private_update', actor, record_id, keys }` (key names only), and a bulk private read logs `{ event: 'private_read_many', actor, project_key, count }`. Neither ever logs a value.
- **`0011`'s early write grants on `housing_projects` and `housing_project_fields` stay** (P1 review note). P4 needs them and is two chunks away. Revoking and re-granting would add two migrations for nothing.

### U7. Migration `0013_record_rules`
- **Goal:** The database validates and normalises every record write and every private-values write, for every project, with the reference rules and our own error class.
- **Requirements:** R4, R7 (private values never in `extra`), R8 (photo mode), R9.
- **Files:**
  - `server/db/migrations/0013_record_rules.sql`
  - `server/test/support/db.ts`:
    - `FieldInput` (used by `insertField`) gains `required`, `filterable`, `searchable`, `max_length`, `min_value` and `max_value`
    - new `insertPrivate(sql, recordId, data)`
  - `server/test/db/record-rules.test.ts` (new)
  - `server/test/db/privileges.test.ts`: the new grant
- **Approach:**
  - Port from `supabase/sql/10b_project_guards.sql`:
    - `housing_field_value` (lines 96–168), with the money limit `n > 10000000000` (from `13_money_limit.sql`)
    - `housing_validate_record` (173–290) and its trigger `housing_beneficiaries_validate`, `before insert or update … for each row`. By name it fires after the serial and `updated_at` triggers, as in the reference.
    - `beneficiary_private_validate` (298–346) as `housing_beneficiary_private_validate`, with its trigger
  - Adapt as follows:
    - table names → `housing_projects`, `housing_project_fields`, `housing_beneficiary_private`
    - drop `security definer`, `set search_path` stays as `public`
    - drop the photo-delete block that uses `auth.uid()` (P2 decisions)
    - drop all RLS, `asf_meta` and `notify pgrst`
    - every `errcode` becomes `HC400`
    - the unknown-key messages become fixed text, and `DETAIL` is checked against the key format (P2 decisions)
  - Check every `raise` by hand: fixed text, at most a field or project label and configured limits (`max_length`, `min_value`, `max_value`), never an input value.
  - Grant `execute` on `housing_field_value` to `housing_app`. The trigger functions need no grant.
  - `-- migrate:down` drops both triggers, then the three functions. Nothing is destroyed, so `DB-MIG-05` needs no undo note.
  - Follow `server/db/migrations/0011_projects_registry.sql` for layout, comments and the grant block.
- **Tests** (`test/db/`, real Postgres, writes through `appDb()` so the app role is proven):
  - **Normalisation:**
    - name and geo text are trimmed and NFC'd
    - a category value has its spaces collapsed
    - a phone in Bangla digits is stored in ASCII
    - an empty or null `extra` value is dropped
  - **Per type,** one `it.each` row each, refused with `HC400` and `DETAIL = 'extra.<key>'`:
    - a text field given a number
    - over `max_length`, and over the default limit when unset
    - a number with 3 decimals
    - money with a fraction, a negative value, and `10000000001`
    - money at `10000000000` is accepted
    - below `min_value` and above `max_value`
    - a bad date format and an impossible date (`2026-02-30`)
    - a bad phone
  - **Record rules:**
    - a record in a group project is refused (`DETAIL = 'project_type'`)
    - an empty name is refused (`name`)
    - an empty upazila is refused (`upazila`)
    - a required `father_or_husband_name` and `address` are refused when empty (from `core_fields`)
    - `union_name` is required only when `geo_depth = 'union'` and `core_fields.union_name.required` is true; an empty `union_name` is accepted on the seeded `tin` and `semi_pucca`
    - on UPDATE, a required core field is checked only if it was set before
    - a non-object `extra` is refused
    - an unknown key is refused with the fixed message
    - a key `Bad Key!` gives `DETAIL = 'extra'` and the message does not contain `Bad Key`
    - a private field's key in `extra` is refused
    - an archived field's key is refused when new, and kept when unchanged on UPDATE
    - a required public active field is enforced on INSERT, and on UPDATE when it was set before
  - **Photo mode:**
    - `after_only` refuses a `prev_photo_url` (`DETAIL = 'prev_photo_url'`)
    - `none` refuses a `current_photo_url`
    - `before_after` accepts both
  - **Private values:**
    - a public field's key is refused (`DETAIL = 'private.<key>'`)
    - an unknown key is refused with the fixed message
    - an archived private key is kept when unchanged and refused when new, through an UPDATE; on an INSERT it is always refused
    - a non-object `data` is refused
    - an unknown `record_id` is refused (`HC400`; the FK can't fire first because the trigger runs before it)
  - **No echo** (`TS-10`): for each refusal above, the error's `detail` matches `^[a-z_]+(\.[a-z][a-z0-9_]*)?$`, and neither `message` nor `detail` contains the sentinel value `ZZ-SENTINEL-93` that was sent.
  - **Privileges:** `housing_app` can execute `housing_field_value`, and the "no function granted to PUBLIC" test still passes.
- **Done when:**
  - `npm --prefix server test` is green, including the global setup's up, down, up cycle and every existing `/housing` suite (the trigger applies to them too)
  - `npm --prefix server run db:migrate` and `db:seed` work on the dev database
- **Depends on:** none
- **Status:** done

### U8. HC errors reach the client
- **Goal:** A guard's own message and field key reach the client for class `HC`. Every other database error keeps its fixed text.
- **Requirements:** R9; Technical decisions "The guards' own errors reach the client".
- **Files:** `server/src/errors.ts`, `server/src/errors.test.ts`.
- **Approach:**
  - In `postgresError()`, before the existing switch:
    - `HC400` → `AppError('VALIDATION_ERROR', err.message, { field })`
    - `HC409` → `AppError('CONFLICT', err.message, { field })`
    - any other `HC…` code → the generic 500
  - `field` is `err.detail`, but only when it matches `^[a-z_]+(\.[a-z][a-z0-9_]*)?$`. Otherwise `details` leaves it out.
  - Match on the code, never on the constraint name (`docs/learnings/database/raised-sqlstate-has-no-constraint-name.md`).
  - The warn log keeps logging `{ code, constraint }` and adds `field`. It never logs `err.message` for any class: messages carry labels only, but they stay out of logs anyway.
- **Tests** (unit, with error objects shaped like postgres.js errors):
  - `HC400` → 400 with the message and `details.field`
  - `HC409` → 409
  - a `DETAIL` that fails the pattern (`extra.Bad Key`, `x'; drop`, an empty string) gives no `details.field`
  - `HC500` → 500 with the generic message
  - `23514` keeps "ইনপুট সঠিক নয়"
  - a `23505` on the serial key keeps 409
  - the logged object holds no `message` and no `detail` text other than the checked field
- **Done when:** the unit tests pass. U10's HTTP tests confirm it end to end.
- **Depends on:** none (it can run beside U7)
- **Status:** done

### U9. Record reads
- **Goal:** Records can be read one at a time, by serial, by a list of serials, and as a filtered, searched, sorted page. A visitor sees only records of public projects.
- **Requirements:** R1, R4 (`union_name`, `extra`), R7.
- **Files:**
  - `server/src/records/schemas.ts` (new): the record response schema (strict, 21 columns), `listQuery` with `f.*` parsing, `serialParams`, `serialsQuery` (reuse the dedupe and sort in `server/src/housing/schemas.ts:79`), `idParams`
  - `server/src/records/reads.ts` (new): `RECORD_V2_COLUMNS`, `getRecord`, `listProjectRecords`, `getBySerial`, `getBySerials`, plus a `projectForRecords(sql, key, viewer)` lookup that returns the project and its public active fields
  - `server/src/routes/v1/records.ts` (new): the read routes. The router is mounted at `/api/v1`, so it has **no `router.use()`**: every route names its full path and its own middleware (`router.get('/projects/:key/records', readLimiter, sessionAwareCaching, …)`). A root-level `use()` would rate-limit or gate every `/api/v1` request.
  - `server/src/app.ts`: mount it after the health and auth routers and before `notFoundHandler`, and add four entries to `PUBLIC_READ_ROUTES`. Check that `projectsReadRouter` (mounted at `/api/v1/projects`) doesn't answer `/projects/:key/records…` first: it has no matching route, so the request falls through, and a test proves it.
  - `server/src/openapi.ts` and `server/test/http/openapi.test.ts` (router list)
  - `server/test/http/records-reads.test.ts` (new)
  - `server/test/http/security.test.ts`: CORS cases
- **Approach:**
  - Follow `server/src/routes/v1/projects.ts`: the read rate limiter, `sessionAwareCaching`, `viewerOf(req)`, a thin route and `{ data }` or `{ data, meta }`.
  - **Visibility:**
    - a visitor's read joins on `housing_public_project_keys()`, so a draft's record, or one in a published child of a draft group, is 404 (lists 404 on the project)
    - an admin session sees drafts with no flag, like `GET /projects/:key`
  - **The project lookup runs first, with the viewer's visibility applied before anything else:**
    - an unknown key, or a draft (including a draft group) to a visitor, is 404, so a visitor can't tell a draft key from an unknown one
    - a group key on the list and serial routes is 400 (§4.4.1)
    - the lookup returns the field whitelist, so `f.*`, `q` and `sort` use one fields query, not one per key (`DB-Q-03`)
  - **Query parameters:**
    - `page_size` is 1–100 with a default of 50 (`DB-Q-04`)
    - `serials?nos=` takes at most 100 numbers, else 400, and drops missing serials
    - `union_name` is an exact match after NFC and trim
    - `f.*`, `q` and `sort` follow P2 decisions
  - **Public-read CORS:** add `/projects/:key/records`, `/projects/:key/records/serial/:n`, `/projects/:key/records/serials` and `/records/:id`. Each regex is anchored (`/records/[^/]+/?$`), so `/records/:id/private` never matches.
- **Tests (each test creates its own data):**
  - **Visitor:**
    - a published project's list returns its records with `union_name` and `extra`, and the response parses with the strict schema
    - a draft's list, serial, serials and `GET /records/:id` are each 404
    - a draft group's key is 404 (not 400) on the list route
    - the same for a published child of a draft group (also the direct-GET gap from P1's review)
  - **Admin:** the draft's records are returned, with `Cache-Control: private, no-store`.
  - **`extra` stripping:** a record whose `extra` holds a key of a field since made `admin` (set as owner in the test) returns without that key to a visitor, on the list, `GET /records/:id` and serials routes, and with it to an admin.
  - **Filters:**
    - `union_name` exact match
    - `f.<category>` matches a value sent with extra spaces
    - `f.<number>` matches numerically
    - an `f.` key that is private, archived, not `filterable` or unknown is ignored, so the result is the unfiltered list
    - `f.<number>=abc` is 400
    - 11 `f.` filters is 400
  - **`q`:**
    - matches name, father's name and address
    - matches a `searchable` public field's value and not a non-searchable one's
    - `%` and `_` in `q` match literally
    - 101 characters is 400
  - **Sort:**
    - `sort=extra.<money>` orders numerically, with missing values last, in both directions
    - `sort=extra.<unknown>` falls back to `serial_no`
    - `union_name` and `name` sorts work
  - **Paging:**
    - `meta` is right
    - an empty list gives `total_pages: 1`
    - `page_size=101` is 400
  - **Serials:**
    - `serial/:n` 404 on a missing serial
    - `serials?nos=` with 101 numbers is 400
    - duplicates and gaps come back deduped, in serial order
  - **Errors:**
    - a bad key format, a bad uuid and a non-integer serial are 400
    - an unknown project is 404
    - a group key is 400
  - **Mounting:**
    - an unknown path under `/api/v1` is still 404
    - `/auth/login` and `/healthz` don't count against the record limiters
  - **CORS:**
    - a public-read origin may GET each new route without credentials
    - it gets no grant on `/records/:id/private`
  - **OpenAPI:** the drift test passes.
- **Done when:** the tests pass, and `curl 'localhost:3001/api/v1/projects/tin/records?page_size=2'` on the dev stack returns seeded records with `union_name` and `extra`.
- **Depends on:** U7 (the widened `insertField`, and `extra` validated on insert)
- **Status:** done

### U10. Record writes
- **Goal:** Admins create records in any non-group project, patch them, and a `main_admin` deletes them. The guard messages from U7 reach the client.
- **Requirements:** R1, R4, R6, R8, R9.
- **Files:**
  - `server/src/records/schemas.ts`: `createBody` and `patchBody` (strict). The `extra` value schema allows keys in the field-key format, with string, number or null values.
  - `server/src/records/writes.ts` (new): `createProjectRecord` and `patchRecord`, following `server/src/housing/writes.ts`. Delete reuses `deleteRecord` from there.
  - `server/src/routes/v1/records-admin.ts` (new): the write routes. They are mounted at `/api/v1` like U9's, so there is no `router.use()`. Each route lists `requireAdmin` (or `requireMainAdmin`) and the write limiter itself, in the order `housing-admin.ts:107` uses. A test adds a route-coverage check: every non-GET route in the router has an admin guard.
  - `server/src/app.ts`: CORS `site.methods` gains `PATCH`
  - `server/src/openapi.ts` and `server/test/http/openapi.test.ts`
  - `server/test/http/records-writes.test.ts` (new); `server/test/http/security.test.ts`
- **Approach:**
  - **`POST /projects/:key/records`:**
    - the project lookup from U9 runs first (unknown → 404, group → 400, a draft is allowed for an admin)
    - insert inside `withActor`, binding `extra` with `tx.json(...)` (`docs/learnings/database/copy-rows-as-jsonb-text-and-bind-with-text-cast.md`)
    - `serial_no` is optional, and a duplicate is 409
    - return 201 with the full record
  - **`PATCH /records/:id`:**
    - any subset of the editable fields, and at least one
    - `project_type`, `serial_no`, a photo URL or a thumb is 400 for every role (P2 decisions)
    - a sent `extra` replaces the whole column (§4.4.5)
    - 404 when the record is missing
  - **`DELETE /records/:id`:** `requireMainAdmin`, then the existing `deleteRecord`, which tombstones the files and lets the private row cascade. Storage cleanup happens after commit (`DB-TX-02`).
  - The `/housing` routes stay unchanged.
- **Tests (follow `server/test/http/housing-writes.test.ts`):**
  - **Create:**
    - creates a record with `union_name` and `extra`, and the log row has the actor
    - the next serial is assigned
    - a duplicate serial is 409
    - a draft project accepts a record
    - a group is 400
    - an unknown project is 404
  - **Patch:**
    - changes a field and returns the full record
    - `extra` replaces the whole column, and the stored row confirms it
    - an unchanged archived value survives a patch of another field
    - an empty body is 400
    - `project_type` or `serial_no` is 400
    - **photo rule:** a plain admin's `{ current_photo_url: null }` is 400, and the stored URL and the `housing_files` row are unchanged. A `main_admin` gets the same 400.
  - **Guard errors end to end:**
    - money `10000000001` gives 400 with the Bangla message and `details.field = 'extra.<key>'`
    - an unknown key `Bad Key!` is refused by zod with 400, and its text is not in the response
    - a malformed value `ZZ-SENTINEL-93` for a number field is 400, and the sentinel is not in the response body
  - **Delete:**
    - a `main_admin` gets 204, and the record, its private row and its files are gone (tombstoned)
    - a plain admin gets 403, and the record, its private row and its stored file remain
    - a missing record is 404
  - **Auth:**
    - no session is 401 on all three routes
    - a disabled admin's cookie is 401
    - a PATCH from an origin not on the list is 403 (`originCheck`)
  - **CORS:**
    - a PATCH preflight from the site origin is granted
    - from a public-read origin it gets no grant (`docs/learnings/security/cors-read-only-origin-list-needs-own-method-check.md`)
  - **Old routes:** the existing `housing-writes`, `housing-bulk` and `housing-photos` suites pass unchanged.
- **Done when:** the tests pass, and `npm run test:contract:rest` and `npm run test:e2e:rest-admin` still pass on the old routes.
- **Depends on:** U7, U8, U9 (the shared schemas and project lookup)
- **Status:** done

### U11. Private values
- **Goal:** Admins read and replace one record's private values and read them in bulk for CSV export. Nothing private reaches a visitor, a cache, a log line or an error body.
- **Requirements:** R4, R7, R9; the Technical decision "Private values never leave the admin path".
- **Files:**
  - `server/src/records/private.ts` (new): `getPrivate`, `putPrivate`, `getPrivateMany`
  - `server/src/records/schemas.ts`: `privateBody` (keys in the field-key format), `privateManyBody` (`ids`: 1–100 uuids)
  - `server/src/routes/v1/records-admin.ts`: the three routes
  - `server/src/logger.ts`: `REDACT` gains `req.body` and `res.body`, so a body is never logged even if a later change starts logging bodies
  - `server/src/openapi.ts`
  - `server/test/http/records-private.test.ts` (new)
- **Approach:**
  - All three routes take `requireAdmin`, including the GET and the bulk POST, and send `Cache-Control: private, no-store`. None goes on `PUBLIC_READ_ROUTES`.
  - **`GET /records/:id/private`:** returns `{ data: {...} }`, or `{ data: {} }`. A missing record is 404.
  - **`PUT /records/:id/private`:**
    - one `withActor` transaction, binding with `tx.json`:
      1. `select … from housing_beneficiaries where id = $id for update`. No row is 404 (not the trigger's `HC400`). The lock also serialises concurrent PUTs to one record.
      2. `update housing_beneficiary_private set data = … where record_id = $id returning data`
      3. only if no row was updated: `insert … returning data`
    - Not `insert … on conflict do update`: Postgres fires the BEFORE INSERT trigger first, with no `old`, so an unchanged archived key would be refused.
    - returns the normalised stored data
  - **`POST /projects/:key/records/private`:**
    - `{ ids }`, at most 100, else 400
    - one query filtered by `project_type = key` and `data <> '{}'`
    - ids from other projects are dropped silently
    - returns `{ data: { <id>: {...} } }`, built from zod-checked uuids only
- **Tests:**
  - **Happy path:**
    - PUT then GET round-trips a phone in Bangla digits, stored in ASCII
    - a second PUT that leaves a key out deletes it
    - an empty or null value is not stored
    - an unchanged archived key survives a PUT
  - **Refusals:**
    - a public field's key gives 400 with `details.field = 'private.<key>'`
    - an unknown key is 400 with no key text in the body
    - `ids` with 101 entries is 400
  - **Bulk:**
    - returns only ids of this project that have values
    - another project's id is dropped
  - **Authorisation (`TS-13`):**
    - a visitor gets 401 on all three, with no data in the body
    - a public-read origin gets no CORS grant on them
    - a disabled admin's cookie is 401
  - **Caching:** every response, including errors, has `Cache-Control: private, no-store`.
  - **Security events:** a PUT logs `private_update` with the actor and the key names, and a bulk read logs `private_read_many` with the actor, project and count.
  - **No leak** (`NE-LOG-02`): with a capturing log stream, a PUT, a GET, a bulk read and a refused PUT of a sentinel phone `01799999999` leave no log line containing it, and no error body contains it.
  - **Delete:** a record delete removes the private row (asserted in U10). A plain admin has no delete route for private values. Clearing them is a PUT of `{}`, which the contract allows any admin.
- **Done when:** the tests pass, and the OpenAPI document lists the three routes as admin-only.
- **Depends on:** U7, U10 (the admin router and shared schemas)
- **Status:** done

### U12. P1 review follow-ups
- **Goal:** Close the P1 review's P3 items that are cheap and touch code P2 doesn't otherwise change.
- **Requirements:** R6, R9.
- **Files:**
  - `server/src/auth/admins.ts`
  - `server/test/auth/admins.test.ts`
  - `server/test/cli/admin.test.ts`
  - `server/test/http/housing-photos.test.ts`
  - `server/test/http/projects-reads.test.ts`
- **Approach:**
  - **Concurrent first `main_admin`:** `createAdmin` and `setRole` catch a `23505` whose `constraint_name` is `housing_admins_one_main_admin`, and throw the same `AdminCliError` as `assertNoOtherMainAdmin`.
  - **CLI invalid role:** the test asserts the CLI's own message and that `housing_admins` gained no row. This tells the CLI check apart from the DB CHECK.
  - **Photo delete 403:** the existing plain-admin case also asserts that the stored file is still readable through the storage driver.
  - **Direct GET:** `GET /projects/<published child of a draft group>` is 404 to a visitor and 200 to an admin.
  - The `0011` grants note is settled in P2 decisions, with no change.
- **Tests:**
  - two concurrent `createAdmin(..., role: 'main_admin')` calls: one succeeds, and the other throws the friendly error
  - the same for two concurrent `setRole` promotions
  - plus the three test additions above
- **Done when:** the server suite passes.
- **Depends on:** none (it can run beside U7 and U8)
- **Status:** done

### P2 order and parallel lanes

- **Lane A (sequential):** U7 → U9 → U10 → U11. They share `server/src/records/schemas.ts`, the admin router, `app.ts` and `openapi.ts`, so running them in parallel would only produce merge conflicts.
- **Lane B (parallel with A):** U8 and U12. They touch files no Lane A unit touches. U8 must land before U10's HTTP tests run.

### Verification (P2)

- `npm --prefix server run typecheck` and `npm --prefix server test` (needs `docker compose up -d db`)
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:e2e:rest-admin`: the old routes must still pass under the new triggers
- `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` and `db:seed` on the dev database

### Risks and rollback (P2)

- **The record trigger applies to the old `/housing` writes, bulk import and the dev seed.** The seed projects are `before_after` with `union_name` optional, and the old bodies hold only system columns, so they pass. U7's done check runs every existing suite and `db:seed` to prove it.
- **Rolling back `0013`** drops the triggers and functions only. No data is lost.
- **The `extra`, `union_name` and private writes have no activity-log row until P3** (P2 decisions). Private writes and bulk reads get a security-event log line meanwhile.

### Definition of done (P2)

- U7–U12 are done and their tests pass.
- The P2 verification commands pass.
- `ae-review` has run with no open P0 or P1.
- P3's start runs `ae-plan` on this file to add P3's units.

## Implementation units — P3 (Bulk, photos, years, next serial, activity)

### P3 decisions

These settle what P3's research turned up. They add to Technical decisions, the settled Deferred-to-Planning answers and the P2 decisions, and change none of them.

- **`housing_bulk_update_by_serial` v2 replaces v1 in place, with the same signature and the same grant.**
  - The old `PUT /housing/bulk` then runs v2 too. Its zod enum still allows only `semi_pucca` and `tin`, and v2 accepts both.
  - One behaviour changes on the old route: v1 cleared `father_or_husband_name`, `address` and the two photo sources on `""`. v2 treats `""` as unchanged for every field, which is `main`'s Supabase behaviour and the contract (§4.4.7).
  - Nothing relies on v1's clearing: the UI sends only non-empty cells (contract v1.2), and the REST adapter's `legacyPayload` strips `_clear`. A test on the old route pins the new behaviour.
  - The private part does **not** use the reference's `on conflict do update`. That fires the BEFORE INSERT trigger with no `old` (U11), so an unchanged archived private key would be refused. The port updates `data = data || patch` first, and inserts only when no row was updated, the same as `putPrivate`.
- **Bulk insert gets a SQL function too: `housing_bulk_insert_records(p_project_key text, p_rows jsonb, p_use_given_serial boolean) returns integer`.** The reference has none (the Supabase adapter inserts in chunks and is not all-or-nothing).
  - The contract asks for `details.row_index` on the failing row (§4.4.7). A multi-row `INSERT` can't say which row a trigger refused, and a row-per-statement loop in TypeScript is 500 round trips (`DB-Q-03`). A plpgsql loop does both in one call.
  - The function splits each row's `extra` into public and private keys the same way v2 update does, so a POST can carry private values too.
  - The old `POST /housing/bulk` keeps its TypeScript multi-row insert unchanged.
- **Both bulk functions report the failing row in `HINT`.**
  - Each loops over `jsonb_array_elements(p_rows) with ordinality`. One outer `exception when sqlstate 'HC400' or sqlstate 'HC409'` handler re-raises with the same errcode, message and detail, plus `hint = 'row_index=<i>'`. `i` is 0-based, matching zod's `rows.<i>` path.
  - The insert function also turns a `unique_violation` (the serial) into `HC409` with `DETAIL = 'serial_no'` and the row index. So a serial taken in the database is 409 with the row, and the TypeScript pre-check is not needed on the new route.
  - `errors.ts` adds `details.row_index` for class `HC` only, and only when `hint` matches `^row_index=(\d{1,3})$`.
  - The single outer handler costs one subtransaction per call, not per row.
- **`housing_next_serial` is not changed.** This supersedes "`housing_next_serial` v2" in the settled `0014` row, which also predates `housing_bulk_insert_records`. U13 is the authority for what `0014` holds.
  - The reference v2 adds only a visibility gate (`public_project_keys() or is_housing_admin()`). Authorization stays in the API (Technical decisions, `docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`).
  - Today's function already returns null for a key with no counter row, which covers groups and unknown keys.
- **`GET /projects/:key/next-serial` answers 200 with `next_serial: null` for an unknown key, a group, and a project hidden from the caller.** The contract says null for a draft or group unless the caller is an admin (§4.3). Returning null for unknown keys too means a visitor still can't tell a draft key from an unknown one (the Visibility decision). A bad key format is 400.
- **`GET /projects/:key/years` follows the record reads: a hidden or unknown key is 404.** A group key is allowed and covers its leaves through `housing_project_leaf_keys` (the port of `project_leaf_keys`, with the server's `housing_` prefix). For a visitor the leaves are also filtered by `housing_public_project_keys()`, so a draft child of a published group adds no years.
- **The activity log v2 replaces `housing_log_record_change` in place and adds `housing_log_private_change`.**
  - Both are `security definer`, like `0005`, because `housing_app` has only `select` on the log.
  - The private trigger logs `private_update` with `{ fields: [<changed keys>], masked: true }` and never a value. When the record is gone (the delete cascade), it writes nothing.
  - Public `extra` values are logged as old and new per key (`extra.<key>`). `extra` never holds a private key (the `0013` trigger), and the log is admin-only.
- **Photo mode is checked before the body is read.**
  - The receiver stores files as it streams them, so a check after it would store and then remove (contract §4.4.10, AE3).
  - The route looks up the record's `photo_mode` first, and answers 404 or 400 before calling the receiver.
  - The `0013` trigger stays as the backstop for a race with a `photo_mode` change.
- **The receiver takes the slot from the caller.**
  - `createPhotoReceiver`'s function gains an optional `{ kind }`. When it is given, a multipart `kind` field is refused as unexpected, the same as any other unknown field.
  - The old route passes nothing and keeps reading the field.
- **The photo service returns the caller's column list.** `savePhoto` and `deletePhoto` take the columns to return: `RECORD_COLUMNS` from `/housing`, `ADMIN_RECORD_COLUMNS` from the new routes. Neither route re-reads the record.
- **A draft project's photo is 404 to a visitor.**
  - `findLiveFile` takes the viewer and joins the file's record. For a visitor it also requires `b.project_type = any(public.housing_public_project_keys())`. The function returns `text[]`, so `in (select …)` would fail; every existing caller uses `= any`.
  - Response headers:
    - a visitor's 200 keeps `public, max-age=86400`
    - an admin's 200 sends `private, no-store`
    - a 404 sends `no-store`, so no browser keeps a stale 404 after an admin publishes
  - A published photo cached by a visitor's browser stays cached for up to a day after an unpublish. This is accepted (user-decided at P3 doc review): file ids never change, so long caching is what keeps photo pages fast, no shared cache exists yet, and the same was true on Supabase's public bucket. A shorter TTL or `Vary` is revisited when hosting is designed.
  - P4 adds covers to the join.
- **P2 leftovers:**
  - **A single private GET writes a security-event line** `{ event: 'private_read', actor, record_id }`, with no keys or values. This matches the bulk read's `private_read_many`. It is a pino line, not an activity row: the contract says reads aren't in the activity log (§4.4.8).
  - **The project's fields query on the create and private routes stays.** It is one small query, and the bulk routes need the field list anyway.
  - **Phone filter normalisation stays as it is.** Phones are private and never filterable.
- **Client events can't forge server actions: `POST /activity` takes an allowlist** (user-decided at P3 doc review).
  - `CLIENT_EVENT_ACTIONS` holds the client events the UI sends today (contract §4.5): `login`, `logout`, `import_run`, `photo_bulk_run`, `records_export` and `category_merge`. Anything else is 400.
  - A denylist would let any server action someone forgot to list be forged.
  - `SERVER_LOGGED_ACTIONS` stays as a second check and gains only `private_update`. P4 adds its `project_*` and `field_*` names in the unit that first writes them.
  - The old `/housing/activity` route keeps its denylist (with `private_update` added) until P9.
  - `details` stays a size-capped object, as in the old body. It is what the client said happened, not proof.
- **`POST /activity` counts against the per-admin write limit** (120 a minute). The old router skips its limiter for `/activity`. The new routes follow the records-admin pattern, where every route names its own guard and limiter, and client events are a few per import or export.
- **Names as built.** `recordProject`, `ADMIN_RECORD_COLUMNS` and `projectRecord` are the built names of U9's `projectForRecords`, `RECORD_V2_COLUMNS` and the record response schema. U14 and U15 use `recordProject`, which returns the project and its fields and refuses groups. U17 uses `getProject` (`server/src/projects/reads.ts`), because `years` and `next-serial` need only the project row and allow groups.
- **New routes and their files:**
  - Public reads (`years`, `next-serial`) go in `server/src/routes/v1/records.ts`. That router is mounted before the projects router, whose router-wide limiter would otherwise count them twice (U9 note).
  - Admin writes go in `records-admin.ts`.
  - `/activity` gets its own router, `server/src/routes/v1/activity.ts`, because it isn't a record route.

### U13. Migration `0014_record_functions_v2`
- **Goal:** The database can run the v2 bulk update and a v2 bulk insert for any project, and logs every record and private-value change, including `extra`-only, `union_name`-only and private changes.
- **Requirements:** R4, R9 (all-or-nothing bulk, `_clear`, the activity row for every write).
- **Files:**
  - `server/db/migrations/0014_record_functions_v2.sql`
  - `server/test/db/bulk-update.test.ts` (extend)
  - `server/test/db/bulk-insert-records.test.ts` (new)
  - `server/test/db/activity-log.test.ts` (extend)
  - `server/test/db/privileges.test.ts`: the new grants
- **Approach:**
  - **`housing_project_leaf_keys(p_key text) returns text[]`**
    - port `project_leaf_keys` from `supabase/sql/11_project_rpcs.sql:39`
    - plain invoker, `stable`
    - reads `housing_projects`
    - it is not visibility-aware, so callers filter
  - **`housing_bulk_update_by_serial(p_project_type text, p_rows jsonb)`**
    - `create or replace` with the same signature, so the `0006` grant holds. Port `supabase/sql/11_project_rpcs.sql` lines 486–571, with these changes:
      - an unknown or group key raises `HC400` with `DETAIL = 'project_type'`
      - the 500-row (`22023`) and missing-serial (`23502`) raises stay as they are
      - the private patch is update-then-insert (P3 decisions)
      - the outer `HC` handler adds the row index (P3 decisions)
    - Keep these from the reference:
      - `admin_keys` includes archived private fields
      - a private key in `_clear` is ignored
      - values that are `null` or `""` are skipped
      - the return is `{ updated, missing }`
  - **`housing_bulk_insert_records(p_project_key text, p_rows jsonb, p_use_given_serial boolean) returns integer`** (new)
    - the same project check and 500-row limit as the update
    - per row: split `extra` by `admin_keys`, then `insert into housing_beneficiaries (...) values (...) returning id`
      - `serial_no` is set only when `p_use_given_serial`
      - `year` is `(r->>'year')::int`
      - columns with a `''` default take `coalesce(r->>'x', '')`
    - insert the private row only when the private part is not empty
    - errors:
      - `unique_violation` on `housing_beneficiaries_project_serial_key` only → `HC409` with `DETAIL = 'serial_no'`. Any other unique violation is re-raised unchanged.
      - the outer handler adds the row index
    - returns the number inserted
  - **The row-index handler, in both bulk functions:**
    - The project check and the 500-row check run before the guarded `begin … exception` block, so their errors carry no row.
    - The row counter is a plain `integer` variable set at the start of each iteration. Plpgsql variables survive the block's rollback, so the handler can read it.
    - The handler has `when sqlstate 'HC400' or sqlstate 'HC409'` and, in the insert function, a separate `when unique_violation` branch that checks `constraint_name` from `get stacked diagnostics`.
    - The two bodies split `extra` the same way on purpose. Each carries a comment naming the other, so a fix to one is made in both.
  - **Record log v2:** `create or replace function housing_log_record_change()`, porting `12_activity_log_v2.sql`. It keeps `security definer set search_path = public`, as in `0005`, with every table name schema-qualified.
    - Create and delete snapshots gain `union_name` and `extra`.
    - The update diff gains `union_name` and one `extra.<key>` entry per changed key, over the union of old and new keys.
    - The action rule and photo handling stay as they are.
  - **Private log:** `housing_log_private_change()` and the trigger `housing_beneficiary_private_activity_log`, `after insert or update or delete … for each row`.
    - Ported from `12`, using the table names from `0011`, schema-qualified.
    - `security definer set search_path = public`, as in `0005`.
    - The changed keys are sorted, and zero changed keys writes no row.
    - When the record is gone, it writes no row.
  - Strip from the reference: `security definer` on the bulk update, RLS, `asf_meta`, `notify pgrst`, the self-test select, and the `anon`/`authenticated` grants.
  - Check every new `raise` by hand: fixed text, a field key in `DETAIL`, never an input value.
  - Grant `execute` to `housing_app` on `housing_project_leaf_keys(text)` and `housing_bulk_insert_records(text, jsonb, boolean)`. The `0006` revoke means nothing is inherited (`docs/learnings/database/postgres-default-privileges-public-execute.md`).
  - **`-- migrate:down`:**
    - drop the private trigger and its function, the insert function and leaf keys
    - restore `0004`'s `housing_bulk_update_by_serial` and `0005`'s `housing_log_record_change` bodies verbatim
    - nothing is destroyed. Activity rows written by v2 stay, so `DB-MIG-05` needs no undo note.
  - Follow `server/db/migrations/0013_record_rules.sql` for layout, comments and the grant block.
- **Tests** (`test/db/`, real Postgres, calls through `appDb()` inside a `withActor`-style `set_config` so the app role and the actor are proven):
  - **Leaf keys:**
    - a group returns its children in `sort_order`, then `key`, order
    - a leaf returns itself
    - an unknown key returns `{}`
  - **Bulk update v2:**
    - `extra` merges: an unsent key survives
    - `_clear` empties `address` and `union_name`, nulls a photo source, and removes `extra.<key>`
    - `""` and `null` leave a value unchanged, including `father_or_husband_name` (the v1 change)
    - clearing a required public field, or a required core field that was set, is `HC400` with `hint = 'row_index=1'` when it is the second row
    - a private key in `extra` lands in `housing_beneficiary_private` and never in `extra`: as an insert when no private row exists, and as a merge that keeps the other private keys when one does
    - an unchanged archived private key in an existing row is accepted
    - a private key in `_clear` changes nothing
    - an unknown serial goes into `missing` and inserts nothing
    - a group or unknown key is `HC400` with `DETAIL = 'project_type'` and no hint. The existing assertion at `bulk-update.test.ts:48` (`23514` for `brick`) changes to this.
    - 501 rows is `22023`
    - a failure in row 3 leaves rows 1 and 2 unchanged (all-or-nothing)
  - **Bulk insert:**
    - `assign_serial` gives consecutive serials
    - `use_given_serial` keeps them and the counter ends at least at the highest
    - a private key goes to the private table
    - a serial already in the database is `HC409` with `DETAIL = 'serial_no'` and the right `row_index`
    - a project check failure carries no hint
    - an invalid custom value in the third row is `HC400` with `row_index=2` and nothing is inserted
    - a draft project is accepted
    - a group is `HC400`
  - **Log v2:**
    - an `extra`-only change writes `update` with `changes['extra.amount'] = { old, new }`
    - a `union_name`-only change writes `update`
    - a create snapshot holds `union_name` and `extra`
    - the existing `{changes, photo_kinds}` assertions still pass
    - a private insert and a private update each write `private_update` with `{ fields: [...], masked: true }`, the actor, `record_id`, `serial_no` and `record_name`
    - a private write of the sentinel `01799999999` leaves no log row whose `details` text contains it
    - rewriting the same private data writes no row
    - deleting a record writes `delete` and no `private_update`
  - **Privileges:**
    - `housing_app` can execute the two new functions
    - both log functions are `prosecdef` with `search_path=public` in `proconfig`
    - the "no function granted to PUBLIC" test still passes
- **Done when:**
  - `npm --prefix server test` is green, including the global setup's up, down, up cycle and the old `housing-bulk` and `housing-activity` suites
  - `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` and `db:seed` work on the dev database
- **Depends on:** none
- **Status:** done

### U14. Bulk insert and update routes v2
- **Goal:** Admins import and update a project's records in batches of up to 500, with custom and private values, all or nothing. A failure names the row and the field.
- **Requirements:** R1, R4, R9.
- **Files:**
  - `server/src/records/schemas.ts`: `bulkCreateBody` and `bulkUpdateBody`
  - `server/src/records/writes.ts`: `bulkInsertRecords` and `bulkUpdateRecords`
  - `server/src/routes/v1/records-admin.ts`: the two routes
  - `server/src/routes/v1/housing-admin.ts`: export `checkRowCount` and the 10 MB parser so both routers share them
  - `server/src/app.ts`: the 100 KB parser bypass matches the old `BULK_PATH` or, for POST and PUT only, the anchored `^/api/v1/projects/[a-z][a-z0-9_]*/records/bulk/?$` (the key regex's charset)
  - `server/src/housing/schemas.ts`: correct the stale comment at line 168 (the import no longer sends `""` for blank cells)
  - `server/src/errors.ts` and `server/src/errors.test.ts`: `details.row_index` from `hint`
  - `server/src/openapi.ts`
  - `server/test/http/records-bulk.test.ts` (new)
  - `server/test/http/housing-bulk.test.ts`: one case for the `""` change
  - `server/test/http/p3-admin-auth.test.ts` (new): the shared auth test
- **Approach:**
  - **Middleware, in this order, on both routes:** `requireAdmin`, `limitWrites`, the 10 MB parser, then `checkRowCount` (413 above 500, before zod). Follow `server/src/routes/v1/housing-admin.ts:57-79` and `:104-111`. No `router.use()`.
  - **Project lookup first:** `recordProject` as an admin, so an unknown key is 404, a group is 400 and a draft is allowed.
  - **`bulkCreateBody`:**
    - `{ mode: 'use_given_serial' | 'assign_serial', rows }`
    - each row is strict: the record-create fields, `serial_no` optional, and `extra` through `customValues`
    - photo URLs and thumbs are refused (P2 decisions)
    - `use_given_serial` needs a serial on every row, and a duplicate within the batch is 400 with `row_index`. Reuse the old body's checks in `server/src/housing/schemas.ts`.
    - `assign_serial` drops `serial_no`
  - **`bulkUpdateBody`:**
    - `{ rows }`, each strict with `serial_no` required, every other field optional, and `extra` through `customValues`
    - `null` and `""` are dropped for every field in the transform, so clearing happens only through `_clear`. The SQL function ignores them too. The old body drops only `null`, and keeps `""` for four fields.
    - `_clear` is at most 50 entries, each `father_or_husband_name`, `address`, `union_name`, `prev_photo_source`, `current_photo_source` or `extra.<field key>`, deduped
  - **Writes:** one `withActor` call each, binding the rows with `tx.json`:
    - `select public.housing_bulk_insert_records(${key}, ${tx.json(rows)}, ${useGiven}) as inserted` → `{ data: { inserted, failed: [] } }`
    - `select public.housing_bulk_update_by_serial(${key}, ${tx.json(rows)})` → `{ data: { updated, missing } }`
  - Private values written by a bulk call get their activity row from U13's trigger, so the routes add no pino line.
  - **`errors.ts`:**
    - for class `HC`, add `row_index` when `err.hint` matches `^row_index=(\d{1,3})$`
    - a non-matching hint is ignored
    - the warn log adds `row_index` and still never logs the message
- **Tests (follow `server/test/http/housing-bulk.test.ts`):**
  - U13 holds the behaviour matrix (merge, `_clear`, private routing, `missing`, all-or-nothing). These tests cover only what the routes add (user-decided at P3 doc review).
  - **POST:**
    - one happy path: 200 rows with `union_name`, public `extra` and one private key are inserted, the private values are readable through `GET /records/:id/private`, and each record has a `create` log row with the actor
    - a serial taken in the database is 409 with `row_index` and `field = 'serial_no'` in the body
    - a duplicate in the batch is 400 with `row_index`
    - a missing serial under `use_given_serial` is 400
    - money `10000000001` in row 4 gives 400 with `details.row_index = 3` and `details.field = 'extra.<key>'`
  - **PUT:**
    - one happy path: `{ updated, missing }` comes back and a merged `extra` value is stored
    - clearing a required field gives 400 with `row_index` in the body
    - an `_clear` entry outside the list, such as `name` or `extra.Bad Key`, is 400 with no key text echoed
  - **Both routes:**
    - 501 rows is 413
    - 500 rows succeed inside the statement timeout (as the old test does)
    - a body over 10 MB is 413
    - an unknown key `Bad Key!` in `extra` is 400 with no key text
    - the sentinel `ZZ-SENTINEL-93` as a number value is not echoed
    - a private phone sentinel `01799999999` in a row that fails validation (and in a row that fails a later row's check) appears in neither the 400 body, the captured log stream nor `housing_activity_log.details`
    - a group key is 400
    - an unknown project is 404
    - a draft project works for an admin
  - **Auth:**
    - no session is 401, before the 10 MB body is parsed (the 413 check doesn't run)
    - a plain admin may bulk write
    - a 200 KB JSON body to another POST route, such as `/projects/x/records/private`, still gets the 100 KB cap (413)
  - **Shared auth test** (new, `server/test/http/p3-admin-auth.test.ts`): one `it.each` over a table of P3's admin routes. For each route it checks:
    - no session is 401
    - a disabled admin's cookie is 401
    - an origin off the list is 403 on writes
    - a public-read origin gets no CORS grant
    U14 creates it with the two bulk routes. U15, U17 and U18 each add their routes as rows.
  - **Old route:** a `""` `address` in `PUT /housing/bulk` leaves the stored address unchanged.
  - **`errors.test.ts`:**
    - `hint: 'row_index=7'` gives `row_index: 7`
    - `'row_index=x'`, `'row_index=1; drop'` and a hint on a non-`HC` error add nothing
  - **Guard coverage:** the existing check still passes with the two new routes.
- **Done when:** the tests pass, and the OpenAPI drift test lists both routes.
- **Depends on:** U13
- **Status:** done

### U15. Photo upload and delete on records v2
- **Goal:** Admins upload a record's before or after photo, respecting the project's photo mode before any file is stored. Only a `main_admin` removes one.
- **Requirements:** R1, R6, R8 (AE3), R9.
- **Files:**
  - `server/src/photos/process.ts`: the receiver's optional `{ kind }`
  - `server/src/photos/service.ts`: `savePhoto` and `deletePhoto` take the column list to return
  - `server/src/routes/v1/housing-admin.ts`: passes `RECORD_COLUMNS`, otherwise unchanged
  - `server/src/records/reads.ts`: `recordPhotoMode(sql, id)`
  - `server/src/records/schemas.ts`: `photoParams` (`id` uuid, `slot` `prev | current`)
  - `server/src/routes/v1/records-admin.ts`: the two routes
  - `server/src/app.ts`: pass `receivePhoto` and `publicApiUrl` to `recordsAdminRouter`
  - `server/test/http/records-writes.test.ts:281` and `server/test/http/openapi.test.ts:65`: build the router with the new deps (`receivePhoto` as a stub and `testPhotoDeps().publicApiUrl`, as `openapi.test.ts:61` builds the housing router)
  - `server/src/auth/middleware.ts`: `requireMainAdmin` takes an optional message. The plain export keeps today's text.
  - `server/src/openapi.ts`
  - `server/test/http/records-photos.test.ts` (new)
  - `server/test/http/p3-admin-auth.test.ts`: two rows
- **Approach:**
  - **`PUT /records/:id/photos/:slot`:** `requireAdmin`, `limitWrites`, then the steps below.
    1. Parse the params: a bad uuid or slot is 400.
    2. `recordPhotoMode`: `select p.photo_mode from housing_beneficiaries b join housing_projects p on p.key = b.project_type where b.id = ${id}`.
       - no row → 404
       - `none` → 400 "এই প্রকল্পে ছবি নেই", with `details.field = '<slot>_photo_url'`
       - `after_only` with `prev` → 400, with `field = 'prev_photo_url'` and `0013`'s photo-mode message
    3. `receivePhoto(req, { kind: slot })`, then `savePhoto(..., ADMIN_RECORD_COLUMNS)`. The receiver's processing is unchanged, so it keeps the 5 MB (413) cap, magic-byte check, metadata strip, WebP and the concurrency limit. Only where it reads the slot from changes.
  - **`DELETE /records/:id/photos/:slot`:** the `requireMainAdmin` guard built with the message "শুধু মূল এডমিন ছবি মুছতে পারেন" (§4.4.11), `limitWrites`, then `deletePhoto(..., ADMIN_RECORD_COLUMNS)`. It is idempotent with 200. A missing record is 404. Storage cleanup runs after commit, as today.
  - Both return `{ data: Record }` in the strict `projectRecord` shape. The `photo_update` activity row comes from the record trigger.
  - Follow `server/src/routes/v1/housing-admin.ts:150` and `server/test/http/housing-photos.test.ts` (sharp-built PNG, `testStorage()`).
- **Tests:**
  - **AE3:**
    - on an `after_only` project, a `prev` upload is 400 with `field = 'prev_photo_url'`
    - the storage folder holds no new file, `housing_files` has no new row, and the record is unchanged
  - **`none`:** both slots are 400 with nothing stored.
  - **`before_after`:**
    - both slots upload
    - the response holds `<slot>_photo_url` as `/api/v1/photos/<fileId>`, `union_name` and `extra`
    - a replace tombstones the old file
    - a `photo_update` log row has the actor
  - **Plain admin:**
    - may upload and replace
    - gets 403 on DELETE with the photo message, and the URL, the file row and the stored file remain
  - **`main_admin` DELETE:**
    - clears the slot's photo and thumb and sets `photo_updated_at`
    - a second DELETE is 200 with no new log row
  - **Errors:**
    - an unknown record is 404 on both, and the PUT stores nothing
    - a bad slot (`side`) is 400
    - a bad uuid is 400
    - a 5 MB + 1 byte photo is 413
    - a non-image is 400
    - a multipart `kind` field is 400
  - **Draft project:** an admin may upload.
  - **Auth:** both routes are added to `p3-admin-auth.test.ts`.
  - **Old route:** the `housing-photos` suite passes unchanged.
  - **Guard coverage:** the check still passes.
- **Done when:** the tests pass, and the OpenAPI drift test lists both routes.
- **Depends on:** none in code. It shares files with U14 and U17, so it runs after U14 in lane A.
- **Status:** done

### U16. Draft visibility on photo downloads
- **Goal:** A visitor can't fetch a photo of a draft project's record, and an admin's photo responses are never cached by a shared cache.
- **Requirements:** R7; the Technical decision "File downloads check visibility".
- **Files:**
  - `server/src/photos/serve.ts`: `findLiveFile(sql, id, viewer)`
  - `server/src/routes/v1/photos.ts`: pass `viewerOf(req)`, set the headers
  - `server/test/http/photos.test.ts` (extend)
- **Approach:**
  - **The lookup:** join `housing_beneficiaries b on b.id = f.record_id`. For a visitor, add `and b.project_type = any(public.housing_public_project_keys())`. An admin skips that condition. A tombstoned file and a file with no record stay 404 as today.
  - **Headers** (P3 decisions):
    - visitor 200: `public, max-age=86400`, as today
    - admin 200: `private, no-store`
    - 404: `no-store`
  - **HEAD** follows the same rule.
  - **The P4 hook:** a comment marks where P4 adds the cover join.
- **Tests:**
  - a visitor's GET and HEAD of a draft project's photo are 404, with `no-store`
  - the same for a published child of a draft group
  - an admin gets 200 with `private, no-store`, and the bytes match
  - a published project's photo to a visitor is 200 with `public, max-age=86400`
  - unpublishing the project (as owner in the test) makes the next visitor request 404
  - a public-read origin (no cookie) gets 404 for the draft photo
  - the existing serving, rate-limit and CORS cases pass
- **Done when:** the tests pass.
- **Depends on:** none (it touches only `photos/serve.ts`, `routes/v1/photos.ts` and their test, so it can run beside lane A)
- **Status:** done

### U17. Years, next serial and serial change
- **Goal:** The site lists a project's years and the admin form shows the next serial. An admin moves a record to another serial without the old one ever being reissued.
- **Requirements:** R1, R7, R9.
- **Files:**
  - `server/src/records/reads.ts`: `projectYears` and `projectNextSerial`
  - `server/src/records/writes.ts`: `changeRecordSerial`
  - `server/src/records/schemas.ts`: `serialBody` (`{ serial_no }`, strict)
  - `server/src/routes/v1/records.ts`: `GET /projects/:key/years` and `GET /projects/:key/next-serial`
  - `server/src/routes/v1/records-admin.ts`: `POST /records/:id/serial`
  - `server/src/app.ts`: two `PUBLIC_READ_ROUTES` entries
  - `server/src/openapi.ts`
  - `server/test/http/records-years-serial.test.ts` (new)
  - `server/test/http/p3-admin-auth.test.ts`: one row
- **Approach:**
  - **`years`:**
    - the read limiter and `sessionAwareCaching`
    - `getProject(sql, key, viewer)` from `server/src/projects/reads.ts`: null is 404
    - then `select distinct year from housing_beneficiaries where project_type = any(public.housing_project_leaf_keys(${key}))`, plus `and (${admin} or project_type = any(public.housing_public_project_keys()))` for the visibility filter (P3 decisions), ordered `year desc`
    - returns `{ data: number[] }`. The list is bounded by the years that exist, so it has no limit parameter.
  - **`next-serial`:**
    - the same middleware
    - the project lookup decides `null` for an unknown, group or hidden key, else `select public.housing_next_serial(${key})`
    - returns `{ data: { project_type, next_serial } }`
  - **Public-read CORS:** anchored entries `/projects/[^/]+/years/?$` and `/projects/[^/]+/next-serial/?$`.
  - **`POST /records/:id/serial`:** `requireAdmin` and `limitWrites`, then one `withActor`:
    1. lock the record `for update`. No row is 404.
    2. If the serial is unchanged, return the record with no call and no log row (the Supabase adapter does the same).
    3. Otherwise `select ${tx(ADMIN_RECORD_COLUMNS)} from public.housing_change_serial(${id}, ${serial})`.
    - A taken serial is 409 through the existing `23505` mapping. Follow `server/src/housing/writes.ts:62`.
- **Tests:**
  - **`years`:**
    - a leaf's years are distinct and newest first
    - a group's years cover its children
    - a draft child's years are absent for a visitor and present for an admin
    - a draft key is 404 for a visitor and 200 for an admin, with `private, no-store`
    - a disabled admin's cookie gets the visitor view (404)
    - an unknown key is 404
    - a project with no records gives `[]`
    - a bad key is 400
  - **`next-serial`:**
    - a published leaf returns last + 1
    - a draft returns null to a visitor and a number to an admin
    - a group and an unknown key return null
    - a bad key is 400
    - a visitor's draft and unknown-key bodies are identical apart from `project_type`
  - **Serial change:**
    - 200 with the new serial, with `union_name` and `extra` kept
    - a `serial_change` log row and a `housing_serial_changes` row
    - the counter is at least the new serial
    - a later create doesn't get the old serial
    - an unchanged serial is 200 with no log row
    - a taken serial is 409
    - a missing record is 404
    - `0`, `1.5`, a string or an extra key in the body is 400
    - a plain admin may change it
    - the route is added to `p3-admin-auth.test.ts`
  - **CORS:** a public-read origin may GET `years` and `next-serial` without credentials.
  - **OpenAPI:** the drift test passes.
- **Done when:** the tests pass, and `curl localhost:3001/api/v1/projects/housing/years` on the dev stack returns the seeded years.
- **Depends on:** U13 (`housing_project_leaf_keys`)
- **Status:** done

### U18. Activity routes, server-only actions and the single private read line
- **Goal:** Admins read the activity log for any project and post client events, a client can't forge a server-logged action, and a single private read leaves a security-event line.
- **Requirements:** R1, R9; P2 leftovers.
- **Files:**
  - `server/src/housing/schemas.ts`:
    - `SERVER_LOGGED_ACTIONS` gains `private_update`
    - new `CLIENT_EVENT_ACTIONS` (P3 decisions)
    - new `projectActivityQuery` and `projectActivityBody`, which take a registry key (the key regex) for `project_type` in place of the two-value enum. P9 drops the old ones.
  - `server/src/housing/activity.ts`: `listActivity` and `logEvent` take the wider query and body types
  - `server/src/routes/v1/activity.ts` (new)
  - `server/src/app.ts`: mount it at `/api/v1` with no `router.use()`
  - `server/src/routes/v1/records-admin.ts`: the `private_read` line on `GET /records/:id/private`
  - `server/src/openapi.ts` and `server/test/http/openapi.test.ts` (router list)
  - `server/test/http/activity.test.ts` (new)
  - `server/test/http/p3-admin-auth.test.ts`: two rows
  - `server/test/http/records-private.test.ts`: the new line
- **Approach:**
  - **`GET /activity`:** `privateNoStore`, `requireAdmin`, the read limiter, then `listActivity`.
    - Query fields: `action` (`^[a-z_]{1,40}$`), `project_type` (key regex), `record_id` (uuid), `actor_email` (at most 254 characters, as the old query, partial, `ilike` escaped as in `server/src/housing/reads.ts`), `from` and `to` (ISO), `page` (at most 10000, so no deep `OFFSET` scan), and `page_size` (at most 100, default 50).
    - Newest first, `at desc, id desc`. Returns `{ data, meta }`.
  - **`POST /activity`:** `requireAdmin`, `limitWrites`, then `logEvent`.
    - `action` must be in `CLIENT_EVENT_ACTIONS` and not in `SERVER_LOGGED_ACTIONS` (400)
    - `project_type` is an optional key, checked for format only
    - `details` follows the old body's limits
    - returns 201 `{ data: { id } }`
    - the actor comes from the session
  - Neither route goes on `PUBLIC_READ_ROUTES`.
  - The new router's own guard-coverage test checks every route, GETs included, because both are admin-only.
  - **`private_read`:** log `{ event: 'private_read', actor, record_id }` after a successful read, beside the existing `private_update` line.
- **Tests:**
  - **List:**
    - filters by `action`, by a non-seed `project_type`, by `record_id`, by a partial `actor_email` (with `%` matched literally), and by `from` and `to`
    - paging `meta` is right
    - `page_size=101` is 400
    - a `private_update` row from U13 shows `fields` and `masked` with no value
  - **Post:**
    - a `records_export` event is 201 and listed with the session's actor
    - every action a server trigger or route writes (`create`, `update`, `delete`, `photo_update`, `serial_change`, `private_update`), plus `project_publish` and an unlisted `made_up_event`, is 400
    - each `CLIENT_EVENT_ACTIONS` entry is 201
    - `Bad Action` is 400
    - a `project_type` of a draft or registry key is accepted
  - **Auth (`TS-13`):**
    - both routes are added to `p3-admin-auth.test.ts`, the GET included
    - a visitor's 401 carries `private, no-store`
  - **The old route:** `POST /housing/activity` with `private_update` is now 400, and the `housing-activity` suite passes.
  - **`private_read`:** a single GET logs the line with the actor and `record_id`, and the capturing stream holds no value (the U11 sentinel test gains this case).
  - **OpenAPI:** the drift test passes with the new router listed.
- **Done when:** the tests pass.
- **Depends on:** U13 (for the `private_update` listing case)
- **Status:** done

### P3 order and parallel lanes

- **Lane A (sequential):** U13 → U14 → U15 → U17 → U18. They share `records-admin.ts`, `records/schemas.ts`, `app.ts` and `openapi.ts`.
- **Lane B (parallel with A):** U16. It touches only the photo-serving files and their test.

### Verification (P3)

- `npm --prefix server run typecheck` and `npm --prefix server test` (needs `docker compose up -d db`)
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:e2e:rest-admin`: the old routes must still pass with the v2 bulk update and log functions
- `npm run test:all`
- `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` and `db:seed` on the dev database

### Risks and rollback (P3)

- **`0014` replaces two functions the old routes use** (`housing_bulk_update_by_serial`, `housing_log_record_change`). The old suites, `test:contract:rest` and `admin-rest` run in U13's and the chunk's done checks. Rolling back restores both bodies verbatim and drops what `0014` added. No data is lost.
- **The old `PUT /housing/bulk` stops clearing on `""`** (P3 decisions). It matches `main` and the contract, and the UI never sends `""`.
- **The photo receiver and service change for both routes.** The old `housing-photos` suite is the guard.
- **Photo responses change their cache headers for admins and 404s.** Visitor responses for published photos are unchanged.

### Definition of done (P3)

- U13–U18 are done and their tests pass.
- The P3 verification commands pass.
- `ae-review` has run with no open P0 or P1.
- P4's start runs `ae-plan` on this file to add P4's units.

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
- **Next:** P3. Run `ae-plan` on this file to add P3's units (bulk v2, photos with photo mode, `years`, `next-serial`, `/activity`, record and private log v2 in `0014`), then `ae-work`.
- **Uncommitted:** none
- **Notes:**
  - Only P1 is planned in units. After P1, run `ae-plan` on this file to add P2's units.
  - The user confirmed that nothing is deployed and no users carry over (2026-10-06), so `0012` promotes no admin.
  - **The Supabase import tooling was removed in P1, ahead of P9.** That covers:
    - the server's `import:supabase` CLI and `src/import/`
    - their tests and fixture
    - the `housing_source_test` database
    - `scripts/import-supabase-local.mjs`

    `0011` gives records columns the Supabase source lacks, so the importer's tests broke. No data is imported (Key Decisions), so adapting the importer would have been thrown away. P9 still removes the rest of R16: `deploy/`, the edge service, the runbook, and bcrypt hash support if nothing else needs it.
  - **Registry tables keep the server's `housing_` prefix:**
    - `housing_projects`
    - `housing_project_fields`
    - `housing_beneficiary_private`

    The test setup's down-migration check then covers them.
  - **P1 done (2026-10-06):** U1–U6 are committed, and the full test run passed (server 554, UI 165, contract 40, admin-rest 35, `test:all` Playwright 53). `ae-simplify` was applied. `ae-review` found no P0, P1 or P2. P3s left for P2 to consider:
    - `0011` grants `housing_app` writes on the three new tables before any write route exists. The P2 routes need them.
    - Two concurrent first-`main_admin` creates fall back to the raw unique-index error. Only the CLI is affected.
    - Photo-delete tests don't assert that the stored file survives a 403.
    - The CLI invalid-role test can't tell the CLI check from the DB CHECK.
    - There is no direct-GET test for a published child of a draft group.
  - **Dev database:** migrated to `0012`. Existing dev admins are plain `admin`. Give yours delete rights with `npm --prefix server run admin -- set-role --email <you> --role main_admin`.
  - **U4 notes:**
    - The REST contract runner's admin (`tests/contract/rest.contract.test.ts`) is also `main_admin`, because the contract deletes.
    - The auth routes are not in the OpenAPI document by design, so the `role` enum lives only in the code.
  - **U6 notes:**
    - Visitors' project reads send `Vary: Cookie` and no `Cache-Control`. An admin's get `private, no-store`.
    - `isPublicReadPath` keeps its `/housing` prefix rule until P9 and lists the project routes explicitly in `PUBLIC_READ_ROUTES` (`server/src/app.ts`).
  - **`housing_seed_projects()`** (owner-only) holds the seed rows, so `resetTestData` and the e2e reset restore the same registry.
  - **P2 planned (2026-10-06):**
    - `ae-plan` added U7–U12 and the P2 decisions.
    - The next step is `ae-work` on U7, with U8 and U12 able to run beside it. This replaces the "Next" line above.
    - Two contract points for P9 to write into `PROJECTS_API_CONTRACT.md`:
      - record bodies refuse photo URL and thumb keys from every role
      - `details.field` is present only when it matches the field-key pattern
    - `ae-doc-review` ran on P2 (2026-10-06). It fixed the private PUT (update-then-insert, not an upsert), router mounting (no root `use()`), the `::text` casts, the `union_name` rule, and draft-group 404s. The user chose: strip non-public `extra` keys for visitors, add security-event log lines for private writes and bulk reads, and keep U12 in P2.
  - **U7 notes:** the record trigger now refuses an unknown project, a non-object `extra` and an undefined private key before the FK or CHECK can, so three `projects-registry` tests expect `HC400` now. The size CHECK is reached with three valid 2000-letter long texts. `insertProject` gained `geo_depth` and `core_fields`.
  - **Lane B (U8, U12) notes:** built in a parallel worktree and cherry-picked as `298cb62` and `4e7a39d`.
    - The plain-admin photo-delete 403 case lives in `main-admin.test.ts`. The new file-survival test was added to `housing-photos.test.ts` instead, so U12 stayed inside its file list.
    - The main_admin race tests hold a SHARE lock on `housing_admins` to force both calls past the check; they failed with the raw `23505` before the fix.
    - Three U12 tests passed before any change (the CLI invalid-role message, the photo 403 and the draft-group direct GET): they pin behaviour that already worked.
  - **U9 notes:**
    - `viewerOf` and `sessionAwareCaching` are now exported from `routes/v1/projects.ts`.
    - The records router is mounted before the projects router, whose router-wide limiter would otherwise also count `/projects/:key/records`.
    - The CORS cases sit in `records-reads.test.ts` (as `projects-reads.test.ts` does), not in `security.test.ts`.
    - The database collation (`en_US`) doesn't order Bangla by code point, so the name-sort test checks that `asc` and `desc` mirror each other.
    - `test/db/search-indexes.test.ts` ("activity indexes…") failed once in a full run and passed on rerun. It depends on the planner, so it was already flaky and P2 didn't cause it.
  - **U10 notes:**
    - postgres.js picks the insert or update form of `${sql(object)}` from the word just before it. A table alias (`insert into t as b`, `update t as b set`) breaks that, so writes return the unaliased `ADMIN_RECORD_COLUMNS`.
    - `extra` keys are checked by `customValueKeys` on the raw object. A plain `z.record` puts the rejected key in the error path (so `details.field` would echo it) and assigns `__proto__`. `openapi.ts` describes that check by hand, because zod can't turn a custom check into JSON Schema.
    - `recordFields`, `writeText` and `serialNo` are exported from `housing/schemas.ts`. `actorOf` and `writeRateLimiter` are exported from `housing-admin.ts`. The records admin router has its own write-limit counter.
  - **U11 notes:** `privateNoStore` runs before `requireAdmin`, so a 401 is also marked `private, no-store`. The guard-coverage test in `records-writes.test.ts` skips it when looking for the first real handler. The bulk read is a POST, so it counts against the per-admin write limit.
  - **P2 done (2026-10-06):** U7–U12 are committed (974f8d6..8e551fb).
    - **Full run:** server 692, UI 165, contract 40, admin-rest 35, `test:all` Playwright 53. Typecheck and lint are clean.
    - **`ae-simplify`** applied 5 changes. **`ae-review`** ran correctness, standards, security, database and testing reviewers and found no P0 or P1. The P2 (no 429 tests on the new limiters) and two P3s (plan-less IDs in comments, an unbounded poll in the race test) were fixed.
    - The `0013` file's comment wording changed after it ran on the local dev database. dbmate keeps no checksum and nothing is shared, so nothing needs re-running.
    - **Left for later chunks:**
      - `GET /records/:id/private` writes no security-event line (the PUT and the bulk read do). P3's log v2 can decide whether single reads are logged.
      - The two admin routes that only need the project's existence also run its fields query (one small query).
      - A `phone` value given to a filter isn't digit-normalised. Phones are private and never filterable, so this has no effect today.
  - **P3 planned (2026-10-06):** `ae-plan` added U13–U18 and the P3 decisions. The next step is `ae-work` on U13, with U16 able to run beside lane A. This replaces the "Next" line above. Choices made in planning:
    - `housing_bulk_update_by_serial` v2 replaces v1 in place, so the old `PUT /housing/bulk` no longer clears on `""`.
    - A new `housing_bulk_insert_records` function gives `row_index` for trigger errors.
    - `housing_next_serial` is unchanged, and the API gates it.
    - A single private GET gets a `private_read` pino line.
  - **`ae-doc-review` ran on P3 (2026-10-06).**
    - It fixed:
      - the visitor filter on photos and years (`= any(...)`, not `in (select ...)`)
      - the `bulk-update.test.ts:48` assertion
      - the row-index handler's details and the serial-only `unique_violation`
      - `search_path` on the log functions
      - the anchored bulk-parser bypass
      - `requireMainAdmin`'s photo message
      - the router deps in two tests
      - the `actor_email` limit and the `page` cap
    - The user chose:
      - an allowlist for `POST /activity`
      - keep the 1-day visitor photo cache
      - trim the tests duplicated between U13 and U14, with one shared auth test for P3's admin routes
