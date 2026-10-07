---
title: Complete Move to the Own Stack - Plan
type: refactor
status: in-progress
source: brainstorm
date: 2026-10-06
doc_review: 2026-10-07
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
- **Guard messages carry only fixed text, a project or field label, and a field key.** A count the database works out itself (never a client value) may appear too, as in the photo-mode guard's "% টি রেকর্ডে আগের ছবি আছে" (`0017`, P8 D1; user-decided 2026-10-07). P2 checks every `raise` in the ported SQL for this. A test asserts that `DETAIL` matches the field-key pattern (`^[a-z_]+(\.[a-z][a-z0-9_]*)?$`) and that a malformed `extra` value is not echoed back.
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
  | `0016_project_stats` | `11`: `project_stats` and `projects_overview`, ported as `housing_project_stats(p_key, p_light, p_public_only)` and `housing_projects_overview(p_drafts)` (P5 decisions), added beside the old `housing_stats` and `housing_years`, which stay untouched until P9 deletes them | P5 |

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

Each chunk is one session that ends with green tests and commits. Chunks run in this order. Removal (P9) starts only after P6–P8 and P8b pass, including the R13 walkthrough.

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
| **P8b** | Filtered stat cards on the server: the adapters report an unfiltered fallback, one shared record-filter builder, the list's filters on `GET /projects/:key/stats` with `main`'s filtered shape, the REST adapter, contract and specs (parity target `main` 87c7241 for this feature only) | R1, R5, R7, R9, R10, R11, R12 | P8 done (checklist fully checked) |
| **P9** | Removal: Supabase package, adapter, `supabase/` folder, scripts, tests, Playwright projects, env vars; `deploy/`, the edge service and jobs, the runbook; `import:supabase` and its tests and fixtures; `/housing` routes and `API_CONTRACT.md`; `PROJECTS_API_CONTRACT.md` corrected to the server as built; docs rewritten, including the mermaid pages in `docs/diagrams/` (`backend-architecture.md` loses the Supabase, deploy and cutover pictures and gains the registry tables; `test-strategy.md` loses the live-Supabase lanes); bundle check; AE4 search | R15, R16, R17, R18 | P8 checklist fully checked and P8b done |
| **P10** | Handoff guide: run, extend, test; `CLAUDE.md` profile final | R19 | P9 |

P1 to P8 and P8b are planned in full below. P9 and P10 get their own units from `ae-plan` at their start, against the code as it is then.

**P5–P7 run as one batch** (user-directed, 2026-10-06):

- They are planned together, after P4, and built back to back in order P5 → P6 → P7.
- Each unit still commits with its own tests green. Each chunk still ends with its full verification commands, and its commit range and test counts go in Progress.
- `ae-simplify` and `ae-review` run once over the P5–P7 commit range, not at the end of each chunk. The reviewers get one commit range per chunk (P5, P6, P7) rather than one diff.
- That combined pass must finish before P8, so the walkthrough tests final code. It also comes before P9, while local Supabase still exists as the parity reference.
- P8, P9 and P10 keep their gates unchanged. The combined pass is part of P7's definition of done, so P7 isn't green until it has run, and P8's gate ("P7 green in CI") covers it.

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

## Implementation units — P4 (Project and field writes, covers, config log)

### P4 decisions

These settle what P4's research turned up. They add to Technical decisions, the settled Deferred-to-Planning answers and the P2 and P3 decisions, and change none of them.

- **Every guard raise in `0015` is `HC400`. No P4 guard raises `HC409`.**
  - The contract gives 400 for both delete refusals (§4.1.6, §4.2), and the Supabase guards' `23514` reached the UI as `VALIDATION_ERROR`.
  - The UI reads `CONFLICT` as "someone else changed this project": `FieldsTab.tsx:62` shows that text and reloads, and so does the settings page. A field-key refusal sent as 409 would show the wrong message.
  - The 409s in P4 are the `If-Match` mismatch (an `AppError` in the route) and the named unique constraints (U21). `errors.ts` keeps its `HC409` mapping for later use.
  - This replaces the P2 decision's example ("`HC409` … first raised by P4's guards, for example a key change once data exists"). That example was written before the UI's use of `CONFLICT` was checked.
- **Guard messages carry fixed text and, at most, the stored project or field label** (Technical decisions). The reference's echoes are removed:
  - the reserved-slug message printed `new.slug`
  - the stat-card message printed `card::text`
  - the record and value counts are dropped too ("রেকর্ডে মান আছে — মোছা যাবে না; আর্কাইভ করুন"), so a message never carries a number the caller didn't ask for. P9 writes the count-free text into the contract.
- **A project with any serial ever issued can't be deleted, with no override.** The reference let `asf.allow_project_delete = 'on'` bypass the `last_serial > 0` refusal. A session setting is spoofable (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`), and the contract has no override. The counter row is never deleted.
- **Deleting a project deletes its fields** (user-decided at P4 doc review). `housing_project_fields.project_key` is `on delete restrict`, and `POST /projects` creates fields with the project, so a plain create-then-delete would otherwise be a raw `23503`.
  - The project guard's delete branch, after its own checks pass, runs `delete from public.housing_project_fields where project_key = old.key`.
  - The checks run first, so the fields can't hold values: any record makes the guard refuse. Each field's delete still runs the field guard and writes a `field_delete` log row before the `project_delete` row.
  - `errors.ts` maps any other `23503` to a fixed 409 as a backstop (U21).
- **The serial counter comes from the `housing_projects_after_write` trigger**, as in the reference, not from the route. It fires after an insert, and after an `is_group` change to `false`, with `on conflict do nothing`.
  - It is `security definer set search_path = public`, because `housing_app` has only `select` on `housing_serial_counters` (`0006`). That is the same reason `0002`'s serial functions are definer.
  - The other guard functions are plain invoker: `housing_app` already reads every table they read (P2 decisions).
  - `insertProject` in `server/test/support/db.ts` stops inserting the counter itself.
- **Publish and unpublish are `PATCH /projects/:key` with `{ is_published }`** (contract §4.1.5). There are no separate routes. The config log trigger names the action `project_publish` or `project_unpublish` from the change. The session-chunk row's "publish and unpublish" means this.
- **`If-Match` is the project's `updated_at` as the client last read it, compared to the millisecond.**
  - JSON dates carry milliseconds and Postgres stores microseconds. The check sits in the update's `where`: `date_trunc('milliseconds', updated_at) = ${ifMatch}::timestamptz`. There is no read-then-write race.
  - The header may come bare or in double quotes (ETag style). A value that isn't an ISO timestamp is 400 with `details.reason = 'if_match'`.
  - No header means no check (contract §4.1.5). Zero rows updated, with the project present, is 409 "অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা রিফ্রেশ করে আবার চেষ্টা করুন". With the project missing, it is 404.
  - Reorders and cover changes also move `updated_at` (the `0011` trigger), as on Supabase.
- **Covers are `housing_files` rows with `kind = 'cover'` and a `project_key`** (Technical decisions):
  - **Kept from records:** the receiver, the WebP re-encode and the storage adapter. Any image type the receiver accepts is taken; the contract's "WebP only" came from the browser doing the encode. Both variants are stored, photo and thumb, so the receiver and the service stay unchanged.
  - **`cover_path` holds the photo variant's URL**, `${publicApiUrl}/api/v1/photos/<fileId>`, built by `photoUrl` the same way a record's photo URL is. A new CHECK allows only null or a value ending in `/api/v1/photos/<uuid>`.
  - **Not client-writable:** the PATCH body refuses `cover_path`. P9 corrects contract §3.1 and §4.1.8 (the field name stays `cover_path` so the UI type doesn't change).
  - **Groups may have a cover.** The home page shows cards for top-level groups too (§4.1.8).
  - **Delete:** `housing_files.project_key` references `housing_projects` `on delete set null`. A project delete tombstones its live cover rows in the same transaction, before the delete. The existing sweep removes the stored objects after commit, so no object is orphaned and a refused delete leaves the cover alone.
  - **Visibility:** `findLiveFile` shows a cover to a visitor only when `f.project_key = any(public.housing_public_project_keys())`.
  - **Caching:** a visitor's cover keeps the 1-day `public` cache that record photos have (the user's P3 doc-review decision). After an unpublish or a cover delete, a browser that already holds it may show it for up to a day. P9 records this in the contract.
- **Duplicate keys are 409 with the field.** `errors.ts` today sends a `23505` with an unknown constraint name to 500.
  - U21 maps a fixed table of the registry's named constraints to `details.field`: the four unique constraints, plus the reserved field-key CHECK, the only CHECK zod doesn't mirror (user-decided at P4 doc review). The message is fixed text per constraint, and the constraint name never reaches the client.
  - P6's `friendlyProjectError` (`src/features/admin/projects/projectRules.ts:89`) then reads `details.field` instead of matching constraint names in the message. P6 also makes `FieldsTab`'s `run()` show its "someone else changed it" text only for a `CONFLICT` with no `details.field`, so a duplicate field key gets its own message.
- **The shared route helpers move now, into `server/src/routes/v1/shared.ts`** (U19). P4 adds a third router that would import them from `housing-admin.ts`, a file P9 deletes.
  - The helpers are `actorOf`, `writeRateLimiter`, `DEFAULT_WRITE_RATE_LIMIT`, `bulkJson` and `checkRowCount` from `housing-admin.ts`, and the read limiter from `housing.ts`.
  - Moving them now is a mechanical change with the suite as its check. P9 then only deletes files.
  - This replaces the P3 note "Move them when the `/housing` routes go".
- **One new router, `server/src/routes/v1/projects-admin.ts`, holds every P4 route:** project, field, usage, rename-value and cover.
  - It is mounted at `/api/v1` with full paths, after the records routers and before `projectsReadRouter`, whose router-wide limiter would otherwise also count these requests.
  - Each route names its own guard and limiter, with no `router.use()`.
  - P4 adds no public GET, so `PUBLIC_READ_ROUTES` doesn't change. Cover downloads go through `/photos/:id`, already listed. A test pins that the new routes get no public-read CORS grant.
- **Deletes and their messages:**
  - project and field deletes use `requireMainAdmin` ("শুধু মূল এডমিন মুছতে পারেন")
  - the cover delete uses a new `requireMainAdminForCovers` ("শুধু মূল এডমিন কভার ছবি মুছতে পারেন", the Supabase adapter's text), built by `mainAdminOnly` like `requireMainAdminForPhotos`
  - the guard-coverage test accepts all three
- **Project and field write bodies are strict zod schemas that mirror the `0011` CHECKs**, so a bad value is a 400 with `details.field` before the database sees it. The SQL guards stay as the backstop.
  - Text lengths follow `housing_projects_text_lengths` and `housing_project_fields_labels`.
  - `slug` is trimmed and lower-cased before its regex, as the guard does.
  - `stat_cards`, `core_fields` and `display` mirror `StatCardDef`, `CoreFieldsConfig` and `ProjectDisplay` (`src/backend/interfaces/types.ts`), with no unknown keys (`NE-SEC-09`).
  - A field's `key` uses `FIELD_KEY`, and the reserved-name list stays in the database CHECK.
  - `options` is at most 100 strings of at most 100 characters each, and `import_aliases` at most 20 of at most 100.
  - Numbers are bounded in zod, so `project_create`'s casts can't raise the unmapped `22003`.
- **The stat-card guard also requires `id`** (contract §5.5 lists `id`, `kind` and the label). The reference skipped it. It must be a non-empty string of at most 40 characters.
- **Field and project not-found answers come from the route.** `errors.ts` maps `P0002` to the record text, so usage and rename-value look up the field first and answer 404 "ফিল্ড পাওয়া যায়নি" themselves. The function's `P0002` stays as the backstop.
- **`rename-value` keeps the reference's exact match on `from`**, and normalises only `to`. Each changed record is logged as an `update` by `0014`'s record log v2 (contract §4.2). The UI's `category_merge` client event stays the summary.

### U19. Move the shared route helpers
- **Goal:** The helpers every v1 router uses live in a file that P9 keeps, so new routers don't import from `/housing` code.
- **Requirements:** supports R1 and R17 (P9 deletes the `/housing` routers cleanly).
- **Files:**
  - `server/src/routes/v1/shared.ts` (new): `actorOf`, `writeRateLimiter`, `DEFAULT_WRITE_RATE_LIMIT`, `type WriteRateLimit`, `bulkJson` and `checkRowCount` from `housing-admin.ts`, and `readRateLimiter`, `DEFAULT_READ_RATE_LIMIT` and `type ReadRateLimit` from `housing.ts`. `BULK_PATH` and `isBulkWrite` stay where they are, because only the old bulk route uses them and P9 deletes them with it.
  - `server/src/app.ts`: import the two limit types from `shared.ts`
  - `server/src/routes/v1/housing-admin.ts` and `housing.ts`: import them from `shared.ts`
  - `server/src/routes/v1/records-admin.ts`, `records.ts` and `activity.ts`: change the import paths
  - any test that imports them (`grep -rn "housing-admin'" server/test`)
- **Approach:** Move the code without changing behaviour. Each router keeps its own limiter instance, so the counters don't merge.
- **Tests:** none new. The whole server suite is the check, including the 429 cases in `p3-admin-auth.test.ts` and the old `housing-*` suites.
- **Done when:** `npm --prefix server run typecheck` and `npm --prefix server test` are green, and `grep -rn "housing-admin\|routes/v1/housing\." server/src` shows only `app.ts` mounting the old routers (and `BULK_PATH`).
- **Depends on:** none
- **Status:** done

### U20. Migration `0015_project_guards`
- **Goal:** The database keeps every project and field rule the contract lists (§5.5), creates a project's serial counter, logs every config change, and can store a project's cover file.
- **Requirements:** R2, R3, R9 (counters never reused; an activity row for every write).
- **Files:**
  - `server/db/migrations/0015_project_guards.sql`
  - `server/src/housing/schemas.ts`: `SERVER_LOGGED_ACTIONS` gains `project_create`, `project_update`, `project_publish`, `project_unpublish`, `project_delete`, `field_create`, `field_update`, `field_archive`, `field_restore` and `field_delete`
  - `server/test/support/db.ts`: `insertProject` stops inserting the counter
  - `server/test/db/project-guards.test.ts` (new)
  - `server/test/db/project-functions.test.ts` (new)
  - `server/test/db/activity-log.test.ts` (extend)
  - `server/test/db/files.test.ts` (extend)
  - `server/test/db/privileges.test.ts` (extend)
  - `server/test/db/projects-registry.test.ts`: fix the cases the new guards now refuse
  - `server/test/http/records-reads.test.ts:114`: its `beforeEach` makes `quiet` private while a record holds a value, which the field guard now refuses. The test still needs a private key stored in `extra`, a state only a direct database write can reach. So the owner wraps the update in `alter table … disable trigger housing_project_fields_guard` / `enable trigger` (the owner owns the table). Run `grep -rn "set visibility\|set type\|set key" server/test` for any other case.
  - `server/test/http/activity.test.ts`: the new names
- **Approach:** Follow `server/db/migrations/0013_record_rules.sql` and `0014_record_functions_v2.sql` for layout, comments and the grant block. Every name has the `housing_` prefix, so the global setup's leftover check covers it.
  - **`housing_projects_guard()`**: `before insert or update or delete` on `housing_projects`, plain invoker. Port `supabase/sql/10b_project_guards.sql:354-472`:
    - **Delete, group:** refuse when it has children (`DETAIL = 'parent_key'`).
    - **Delete, leaf:** refuse when it has records, when its counter row is missing, or when `last_serial > 0`, always (`DETAIL = 'key'`). Once every check passes, delete the project's fields (P4 decisions).
    - **Insert and update, normalising:**
      - `slug` is lower-cased and trimmed
      - Bangla texts are NFC and trimmed, English texts are trimmed
    - **Insert and update, rules:**
      - a reserved slug is refused (`slug`)
      - a parent that isn't a group is refused (`parent_key`)
      - stat cards: at most 8, each needs `id`, `kind`, `label_bn` and the `field` or `level` its kind needs, at most 3 with `home` (all `stat_cards`)
    - **Update only:**
      - `key` never changes (`key`)
      - a published project keeps its `slug` and `parent_key` (`slug` or `parent_key`)
      - `is_group` can't change while records, children or fields exist (`is_group`)
      - the photo-mode rules (`photo_mode`)
    - Every raise is `HC400`, with fixed text (P4 decisions).
  - **`housing_projects_after_write()`**: `after insert or update of is_group`, `security definer set search_path = public`. For a non-group, it inserts `(key, 0)` into the counters `on conflict do nothing`.
  - **`housing_project_fields_guard()`**: `before insert or update or delete` on `housing_project_fields`, plain invoker. Port `10b:502-553`:
    - no field on a group (`project_key`)
    - labels and help text are normalised
    - at most 40 fields on insert (`key`)
    - `project_key` never changes
    - while a record holds a value (in `extra` for a public field, in the private `data` for an admin field):
      - the field can't be deleted (`key`)
      - its `key`, `type` and `visibility` can't change (`key`, `type` or `visibility`, whichever changed)
    - all `HC400`
  - **`housing_project_create(p_project jsonb, p_fields jsonb) returns text`**: plain invoker. Port `11_project_rpcs.sql:275-349`:
    - drop the `is_housing_admin()` check
    - keep the defaults, `is_published = false` always, and the 40-field and object checks (`22023`)
    - return the key
  - **`housing_projects_reorder(p_keys text[]) returns integer` and `housing_project_fields_reorder(p_project text, p_ids uuid[]) returns integer`**: port `11:355-398` without the admin check.
  - **`housing_project_field_usage(p_project text, p_key text) returns jsonb`**: `stable`, plain invoker. Port `11:404-438`: a private field returns its count and `values: []`, and a public field returns its top 100 values.
  - **`housing_project_field_rename_value(p_project text, p_key text, p_from text, p_to text) returns integer`**: port `11:444-475`.
    - a field that isn't a public category is refused (`HC400`, `DETAIL = 'type'`)
    - an empty `to` after normalising is refused (`HC400`, `DETAIL = 'to'`)
    - an archived field is refused before any record is touched (`HC400`, `DETAIL = 'is_active'`, user-decided at P4 doc review)
    - a `to` longer than the field's limit (`coalesce(max_length, 100)`, the category limit in `0013`'s `housing_field_value`) is refused up front (`HC400`, `DETAIL = 'to'`)
  - **`housing_log_config_change()`**: `security definer set search_path = public`, every table schema-qualified. Port `12_activity_log_v2.sql:159-221`:
    - `tg_table_name` compares against `housing_projects`
    - `updated_at`, `created_at` and `sort_order` are ignored, so a reorder logs nothing
    - triggers `housing_projects_activity_log` and `housing_project_fields_activity_log`, `after insert or update or delete … for each row`
    - the actor comes from `housing_current_actor()`
  - **`housing_files` and covers:**
    - add `project_key text references public.housing_projects (key) on update restrict on delete set null`, and the index `housing_files_project_key_idx` (`DB-MIG-07`)
    - replace `housing_files_kind_check` with `kind in ('prev', 'current', 'cover')`
    - add `housing_files_cover_shape`: `(kind = 'cover' and record_id is null) or (kind <> 'cover' and project_key is null)`
    - add the unique index `housing_files_live_cover (project_key, variant) where deleted_at is null and project_key is not null`
    - add `housing_projects_cover_path`: `cover_path is null or cover_path ~ '/api/v1/photos/[0-9a-f-]{36}$'`
  - **Grants:** `execute` to `housing_app` on the five callable functions. The trigger functions need none.
  - **Strip from the reference:** `auth.uid()`, `is_housing_admin()`, `security definer` on everything except the after-write and log functions, `asf.allow_project_delete`, RLS, `asf_meta`, `notify pgrst`, the self-test selects, and the `anon`/`authenticated` grants.
  - Check every `raise` by hand: fixed text, a field key in `DETAIL`, at most a stored label, never an input value or a count.
  - **`-- migrate:down`:**
    - drop the triggers and functions
    - delete `kind = 'cover'` rows from `housing_files` before restoring the two-value kind CHECK, then drop the index, the shape CHECK and the column, and the `cover_path` CHECK
    - **undo note (`DB-MIG-05`):** rolling back loses cover file rows, and their stored objects stay on disk until removed by hand. Nothing is deployed, so this is accepted. Config log rows and counters stay.
- **Tests** (`test/db/`, real Postgres, calls through `appDb()` inside a `set_config` actor, so the app role and the actor are proven):
  - **Project guard:**
    - a reserved slug (`admin`) is `HC400` with `DETAIL = 'slug'`, and the message doesn't contain the slug
    - `' Self-Reliance '` is stored as `self-reliance`
    - a parent that isn't a group is `HC400` with `parent_key`
    - 9 stat cards, a card with no `id`, a `sum` card with no `field`, and 4 home cards are each `HC400` with `stat_cards`, and a malformed card's text isn't echoed
    - a key change is refused
    - a published project's slug change is refused, and an unpublished one's is allowed
    - `is_group` can't change on a project with a field
    - `photo_mode` to `after_only` with a prev photo present is refused, and to `none` with any photo present is refused
  - **Delete:**
    - a group with children is refused
    - a leaf with records is refused
    - a leaf whose counter is above 0 with no records left is refused
    - a fresh leaf with two fields is deleted with its fields, there are two `field_delete` rows and a `project_delete` row
  - **Counter lifecycle (one test):** creating a leaf makes a `(key, 0)` counter and `housing_next_serial(key)` is 1; deleting it leaves the counter; re-creating the same key keeps it
  - **Counter, other cases:**
    - creating a group makes none
    - changing a childless, fieldless group to a leaf with a `file_prefix` makes one
  - **Field guard:**
    - a field on a group is refused
    - the 41st field is refused
    - with one record holding `extra.amount`: delete, a key change and a type change are refused, and a label change is allowed
    - with only a private value present, a `visibility` change is refused
    - with no values, a key change is allowed
    - `project_key` never changes
  - **`housing_project_create`:**
    - one call makes the project (always a draft, even when `is_published: true` is sent), its fields in order with `sort_order` 10, 20 and so on, and the counter
    - a bad third field rolls back everything
    - the defaults match contract §4.1.4
    - 41 fields is `22023`
  - **Reorders:**
    - the new order gives `sort_order` 10, 20, …
    - unknown keys and another project's field ids are ignored
    - unchanged rows aren't updated
    - no log row is written
  - **Usage:** a public category returns counts by value, most first. A private field returns its count with `values = []`.
  - **Rename-value:**
    - renames only exact matches, and returns the count
    - project A and project B each have a public category field with the same key and value: renaming in A changes only A's records and logs only them, and B's usage is unchanged
    - each renamed record gets an `update` log row with `changes['extra.<key>']`
    - a number field and a private field are `HC400` with `type`
    - a `to` of only spaces is `HC400` with `to`
    - an archived category field is `HC400` with `is_active`, and no record changes
    - a `to` one character over the field's `max_length` is `HC400` with `to`
    - a `to` with extra spaces or in a non-NFC form is stored trimmed, collapsed and NFC
  - **Config log:**
    - insert, update, publish, unpublish and delete of a project write `project_create`, `project_update`, `project_publish`, `project_unpublish` and `project_delete` with the actor, `project_type = key` and `record_id` null
    - archive, restore, update, create and delete of a field write the `field_*` names with `field_key`
    - a reorder and an `updated_at`-only touch write nothing
  - **Files:**
    - a cover row with a `project_key` and no record is accepted
    - a cover with a `record_id`, or a `prev` row with a `project_key`, is `23514`
    - a second live cover photo for one project is `23505`
    - deleting the project sets a tombstoned cover's `project_key` to null
    - the `cover_path` CHECK refuses `/etc/passwd` and accepts a photo URL
  - **Privileges:**
    - the after-write and log functions are `prosecdef` with `search_path=public`
    - "no function granted to PUBLIC" still passes
  - **Activity route:** `POST /activity` with `project_publish` or `field_delete` is 400, and so is `POST /housing/activity`.
- **Done when:**
  - `npm --prefix server test` is green, including the global setup's up, down, up cycle and the old `/housing` suites
  - `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` and `db:seed` work on the dev database
- **Depends on:** U19 only for file order. It can start first.
- **Status:** done

### U21. Registry constraint errors carry their field
- **Goal:** A duplicate project key, slug, file prefix or field key is a 409 that names the field. A reserved field key is a 400 that names `key`. Every other CHECK keeps today's fixed 400.
- **Requirements:** R2, R3; `NE-SEC-11`.
- **Files:** `server/src/errors.ts` and `server/src/errors.test.ts`.
- **Approach:**
  - A `const` table maps each constraint name to `{ code, field, message }`:
    - **409:**
      - `housing_projects_pkey` → `key`, "এই key আগে থেকেই আছে"
      - `housing_projects_slug_key` → `slug`, "এই URL আগে থেকেই আছে"
      - `housing_projects_file_prefix_key` → `file_prefix`
      - `housing_project_fields_project_key_key` → `key`, "এই প্রকল্পে একই key এর ফিল্ড আগে থেকেই আছে"
    - **400:** `housing_project_fields_key_reserved` → `key`, "এই নামটি সংরক্ষিত — অন্য key দিন". Other CHECKs are left out on purpose: zod mirrors them, and a new CHECK doesn't need a table entry.
  - Any `23503` (a foreign key) is a fixed 409 "অন্য তথ্য এর উপর নির্ভর করে — মোছা যাবে না", with no constraint name. It is a backstop: the guards refuse first.
  - The table is looked up by `err.constraint_name` for `23505` and `23514` only. A name not in the table keeps today's behaviour: the serial key is 409, an unknown `23505` is 500, and an unknown `23514` is the fixed 400.
  - The constraint name and the Postgres message never reach the response.
- **Tests (`errors.test.ts`):**
  - each 409 entry gives 409 with its field
  - a `23503` gives the fixed 409
  - `housing_project_fields_key_reserved` gives 400 with `key`
  - `housing_project_fields_phone_private` keeps the fixed 400 with no field
  - an unlisted constraint name keeps today's result
  - the response body contains no constraint name
  - the HTTP proof is in U22 and U23
- **Done when:** the tests pass.
- **Depends on:** none (lane B)
- **Status:** done

### U22. Project create, update, publish, delete and reorder
- **Goal:** Admins create a project with its fields as a draft in one step, edit and publish it without overwriting another admin's change, and reorder projects. Only a `main_admin` deletes one, and never one that has ever had records.
- **Requirements:** R2, R6, R9.
- **Files:**
  - `server/src/projects/schemas.ts`: `projectCreateBody` (`{ project, fields }`), `projectPatchBody`, `projectOrderBody` (`{ keys }`, 1 to 200 keys), and the shared `statCard`, `coreFields`, `display` and `fieldInput` schemas (P4 decisions)
  - `server/src/projects/writes.ts` (new): `createProject`, `updateProject`, `deleteProject`, `reorderProjects`
  - `server/src/routes/v1/projects-admin.ts` (new)
  - `server/src/app.ts`: mount it (P4 decisions) with `{ sql, writeRateLimit, readRateLimit }`, following `recordsAdminRouter`; routes log through `req.log`
  - `server/src/openapi.ts` and `server/test/http/openapi.test.ts` (router list)
  - `server/test/http/projects-writes.test.ts` (new)
  - `server/test/http/p3-admin-auth.test.ts`: four rows
- **Approach:**
  - **`POST /projects`:** `requireAdmin`, `limitWrites`, then one `withActor`:
    - `select public.housing_project_create(${tx.json(project)}, ${tx.json(fields)})`
    - re-read with `getProject(sql, key, adminViewer)`
    - answer 201 `{ data: Project }`
    - `is_published` in the body is accepted and dropped, so a project is always created as a draft (contract §4.1.4). `cover_path` is refused by the strict body (400).
  - **`PATCH /projects/:key`:** `requireAdmin`, `limitWrites`, then the steps below.
    - The body is any non-empty subset of the §3.1 columns. It excludes `key`, `fields`, `cover_path`, `created_at` and `updated_at`.
    - It parses `If-Match` (P4 decisions).
    - It runs one `withActor`: `update public.housing_projects set ${tx(patch)} where key = ${key} [and date_trunc(…) = ${ifMatch}] returning key`. There is no alias before the helper (`docs/learnings/database/postgres-js-helper-breaks-after-table-alias.md`), and jsonb columns are bound with `tx.json`.
    - Zero rows: a second `select 1` decides 409 or 404.
    - It answers 200 `{ data: Project }` with the fields.
  - **`DELETE /projects/:key`:** `requireMainAdmin`, `limitWrites`, then one `withActor`.
    - It locks the row `for update`. No row is 404.
    - It runs `delete from public.housing_projects where key = ${key}`. The guard's refusals are 400. U25 adds the cover tombstone before this.
    - It answers 204.
  - **`PUT /projects/order`:** `requireAdmin`, `limitWrites`, `select public.housing_projects_reorder(${keys})`, then 204.
  - Routes are declared so `PUT /projects/order` is matched before any `/projects/:key` route of the same method.
  - Follow `server/src/routes/v1/records-admin.ts` and `server/src/records/writes.ts`.
- **Tests (follow `server/test/http/records-writes.test.ts`):**
  - **Create:**
    - 201 with `is_published: false`, the fields in order and `updated_at`
    - `next-serial` for the new key is 1 for an admin
    - a `project_create` and a `field_create` log row with the actor
    - `is_published: true` in the body still gives a draft
    - `cover_path` in the body is 400
    - a duplicate key, slug or `file_prefix` is 409 with `details.field` (U21)
    - one guard refusal, a reserved slug, is 400 with `field = 'slug'` and no slug in the message; the rule matrix lives in U20's DB tests
    - one zod refusal, an unknown stat-card key, is 400 with no key text echoed
    - a bad field in the `fields` array creates nothing
  - **Update:**
    - a name change is 200 and logs `project_update` with old and new
    - `If-Match` equal to the last read `updated_at` succeeds, also in quotes
    - a stale one is 409 with the contract message, and nothing changes
    - a malformed one is 400
    - no header skips the check
    - an unknown key is 404
    - an empty body is 400
    - `key`, `cover_path` and `updated_at` in the body are 400
    - `{ is_published: true }` publishes, logs `project_publish` and makes the project visible to a visitor's `GET /projects/:key`; `false` hides it again and logs `project_unpublish`
  - **Delete:**
    - a `main_admin` deletes a fresh draft that was created with fields (204), and a `project_delete` row is written
    - a plain admin gets 403, and the project remains
    - a project with records is 400 (the other refusals are U20's)
    - an unknown key is 404
  - **Order:**
    - the given order is returned by `GET /projects?drafts=1` for an admin
    - an unknown key is ignored
    - a bad key is 400
    - 201 keys is 400
    - no log row is written
  - **Auth:** the four routes are rows in `p3-admin-auth.test.ts` (401, disabled cookie, foreign origin 403, no public-read CORS grant, 429 past the limit).
  - **Guard coverage:** a test in `projects-writes.test.ts` checks that every route in the new router names `requireAdmin`, `requireMainAdmin` or `requireMainAdminForCovers` first, after `privateNoStore`. Follow `records-writes.test.ts:281`.
  - **OpenAPI:** the drift test passes.
- **Done when:** the tests pass, and on the dev stack a `curl` POST with an admin cookie creates a draft that `GET /api/v1/projects?drafts=1` lists.
- **Depends on:** U20; U21 for the 409 cases
- **Status:** done

### U23. Field create, update, archive, delete and reorder
- **Goal:** Admins add, edit, archive, restore and reorder a project's fields. Once data exists, a field's identity can't change. Only a `main_admin` deletes an unused field.
- **Requirements:** R3, R6, R9.
- **Files:**
  - `server/src/projects/schemas.ts`: `fieldCreateBody` (`key`, `label_bn` and `type` required), `fieldPatchBody` (any non-empty subset, excluding `id`, `project_key`, `created_at` and `updated_at`), `fieldOrderBody` (`{ ids }`, 1 to 40 uuids), and `fieldIdParams`
  - `server/src/projects/writes.ts`: `createField`, `updateField`, `deleteField`, `reorderFields`
  - `server/src/routes/v1/projects-admin.ts`
  - `server/src/openapi.ts`
  - `server/test/http/fields-writes.test.ts` (new)
  - `server/test/http/p3-admin-auth.test.ts`: four rows
- **Approach:**
  - **`POST /projects/:key/fields`:** `requireAdmin`, `limitWrites`.
    - The project must exist (404). A group is refused by the guard (400 with `project_key`).
    - It runs `insert into public.housing_project_fields ${tx({ ...body, project_key })} returning <field columns>` in `withActor`.
    - It answers 201 `{ data: ProjectField }` in the strict `projectField` shape.
  - **`PATCH /fields/:id`:** `requireAdmin`, `limitWrites`.
    - It runs `update … set ${tx(patch)} where id = ${id} returning …`. No row is 404.
    - Archive is `{ is_active: false }` and restore is `{ is_active: true }`.
  - **`DELETE /fields/:id`:** `requireMainAdmin`, `limitWrites`, then the delete. No row is 404. The guard's "has values" refusal is 400. It answers 204.
  - **`PUT /projects/:key/fields/order`:** `requireAdmin`, `limitWrites`.
    - The project must exist (404).
    - It runs `select public.housing_project_fields_reorder(${key}, ${ids}::uuid[])` and answers 204.
  - The returned columns reuse the field column list in `server/src/projects/reads.ts`, with `min_value` and `max_value` as `float8` as the reads do.
- **Tests:**
  - **Create:**
    - 201 with defaults (`visibility` public, `show_in_detail` true, `is_active` true), and a `field_create` row with `field_key`
    - a duplicate key is 409 with `field = 'key'`
    - one zod refusal, an unknown body key, is 400 with no key text echoed
    - a reserved key (`serial_no`) is 400 with `details.field = 'key'`
    - an unknown project is 404
  - **Update:**
    - a label change is 200 and logs `field_update`
    - `is_active: false` logs `field_archive` and `true` logs `field_restore`
    - after a record stores `extra.<key>`, a type change is 400 with `details.field` (the rule matrix is U20's)
    - a `key` change onto another field's key is 409 with `details.field = 'key'`
    - `project_key` in the body is 400
    - an unknown id is 404
    - a bad uuid is 400
  - **Delete:**
    - a `main_admin` deletes an unused field (204, `field_delete` logged)
    - a used field is 400 with the archive message
    - a plain admin gets 403, and the field remains
    - an unknown id is 404
  - **Order:**
    - the new order shows in `GET /projects/:key` for an admin
    - another project's field id is ignored
    - 41 ids is 400
    - no log row is written
  - **Visibility after the write:** a new private field never appears in a visitor's `GET /projects/:key` (the P1 read rule still holds).
  - **Auth:** four rows in `p3-admin-auth.test.ts`.
  - **Guard coverage and OpenAPI:** the U22 tests pass with the new routes.
- **Done when:** the tests pass.
- **Depends on:** U22 (same router and schemas)
- **Status:** done

### U24. Field usage and category value rename
- **Goal:** Before archiving or merging, an admin sees how many records use a field and, for a public field, its most common values (a private field gives only the count, as in the reference). An admin merges one spelling into another across a project, and each changed record is logged.
- **Requirements:** R3, R9.
- **Files:**
  - `server/src/projects/schemas.ts`: `fieldKeyParams` (`key` and `fieldKey`) and `renameValueBody` (`{ from, to }`, strict, each 1 to 100 characters)
  - `server/src/projects/reads.ts`: `fieldUsage`
  - `server/src/projects/writes.ts`: `renameFieldValue`
  - `server/src/routes/v1/projects-admin.ts`
  - `server/src/openapi.ts`
  - `server/test/http/fields-usage-rename.test.ts` (new)
  - `server/test/http/p3-admin-auth.test.ts`: two rows
- **Approach:**
  - **`GET /projects/:key/fields/:fieldKey/usage`:** `privateNoStore`, `requireAdmin`, the read limiter.
    - It looks up the field by project and key. None is 404 "ফিল্ড পাওয়া যায়নি".
    - It runs `select public.housing_project_field_usage(${key}, ${fieldKey}) as usage`.
    - It answers `{ data: { count, values } }`. It isn't on `PUBLIC_READ_ROUTES`.
  - **`POST /projects/:key/fields/:fieldKey/rename-value`:** `requireAdmin`, `limitWrites`.
    - The same field lookup.
    - One `withActor` runs `select public.housing_project_field_rename_value(…) as updated`.
    - It answers `{ data: { updated } }`.
    - The per-record `update` rows come from the record log trigger.
- **Tests:**
  - **Usage:**
    - a category with values `গরু` ×2 and `গাভি` ×1 returns `count: 3` and those values, most first
    - a private phone field returns its count and `values: []`, and the response holds no stored phone (the `01799999999` sentinel)
    - an unknown field or project is 404
    - a visitor gets 401 with `private, no-store`
  - **Rename:**
    - `গাভি` → `গরু` returns `updated: 1`, the record now holds `গরু`, and there is one `update` row with `changes['extra.<key>']` and the actor
    - a number field is 400 with `type` (the other refusals are U20's)
    - `from` with no match returns `updated: 0` and writes no log row
    - a rename in one project leaves a same-keyed field's records in another project unchanged
    - an unknown field is 404
  - **Auth:** two rows in `p3-admin-auth.test.ts`. A plain admin may rename (contract: every admin edits).
- **Done when:** the tests pass.
- **Depends on:** U20, U22
- **Status:** done

### U25. Project covers
- **Goal:** Admins upload or replace a project's cover through the same safe photo path as records. Only a `main_admin` removes it. A visitor can't fetch a draft's cover. A project delete leaves no cover file behind.
- **Requirements:** R2, R6, R7, R9.
- **Files:**
  - `server/src/photos/process.ts`: the receiver's `kind` option and `PhotoUpload.kind` accept `'cover'` (a `FileKind = PhotoKind | 'cover'` type). In `finish()` (about line 277) a preset kind skips `photoKind.safeParse`, which still guards the multipart `kind` field. With a preset, a multipart `kind` field already fails as an unexpected field, so that test needs no new code.
  - `server/src/photos/service.ts`: `saveCover` and `deleteCover`
  - `server/src/photos/serve.ts`: `findLiveFile` adds the cover join, replacing the P3 comment
  - `server/src/auth/middleware.ts`: `requireMainAdminForCovers`
  - `server/src/projects/writes.ts`: `deleteProject` tombstones the live cover before the delete
  - `server/src/routes/v1/projects-admin.ts`: the two routes; the router gains `receivePhoto`, `storage` and `publicApiUrl` deps
  - `server/src/app.ts`: pass those deps
  - `server/test/http/openapi.test.ts` and `server/test/http/projects-writes.test.ts` (the guard-coverage router build, which also accepts `requireMainAdminForCovers`): the new deps, as `records-writes.test.ts:281` builds `recordsAdminRouter`
  - `server/src/openapi.ts`
  - `server/test/http/projects-cover.test.ts` (new)
  - `server/test/http/photos.test.ts` (extend)
  - `server/test/http/p3-admin-auth.test.ts`: two rows
- **Approach:**
  - **`PUT /projects/:key/cover`:** `requireAdmin`, `limitWrites`.
    1. Check the project exists before the body is read: no project is 404 and nothing is stored. A draft or group is allowed.
    2. Call `receivePhoto(req, { kind: 'cover' })`.
    3. Call `saveCover(deps, { projectKey, upload, actor })`. Like `savePhoto`, it writes the files first, then runs one `withActor`:
       - lock the project `for update`
       - tombstone its live cover rows
       - insert the two rows with `project_key` and `kind = 'cover'`
       - set `cover_path` to the photo variant's URL
       
       Storage cleanup runs after commit, and new files are removed on failure.
    4. Re-read with `getProject` and answer 200 `{ data: Project }`.
    - The `project_update` log row (with `cover_path` old and new) comes from the config trigger.
  - **`DELETE /projects/:key/cover`:** `requireMainAdminForCovers`, `limitWrites`, then `deleteCover`.
    - It runs one `withActor`: lock, tombstone, set `cover_path = null`.
    - It cleans up after commit and answers 200 `{ data: Project }`.
    - A project with no cover is 200 and writes no log row (the trigger sees no change). An unknown project is 404.
  - **Project delete:** inside the U22 transaction, `update housing_files set deleted_at = now() where project_key = ${key} and deleted_at is null` runs before the delete. Cleanup runs after commit, as `deleteRecord` does. A refused delete rolls the tombstone back.
  - **`findLiveFile`:** `left join housing_beneficiaries b on b.id = f.record_id`. A visitor also needs `(b.project_type = any(public.housing_public_project_keys()) or (f.kind = 'cover' and f.project_key = any(public.housing_public_project_keys())))`. The headers follow U16's rule.
  - Follow `server/src/routes/v1/records-admin.ts`'s photo routes and `server/test/http/records-photos.test.ts` (a sharp-built PNG, `testStorage()`, clearing the NAS test folder before each test).
- **Tests:**
  - **Upload:**
    - a PNG upload is 200
    - `cover_path` is `…/api/v1/photos/<id>`, and that URL serves WebP bytes
    - `updated_at` moved
    - there are two `housing_files` rows with `kind = 'cover'`, `project_key` set and `record_id` null
    - one `project_update` log row has `cover_path` in `changes` and the actor
  - **Replace:** the old rows are tombstoned and the old URL then answers 404.
  - **Group and draft:** a cover on a group and on a draft both work for an admin.
  - **Errors:**
    - an unknown project is 404, with no stored file and no row
    - a non-image is 400
    - 5 MB + 1 byte is 413
    - a multipart `kind` field is 400
  - **Delete:**
    - a plain admin gets 403 with the cover message, and the cover remains
    - a `main_admin` gets 200 with `cover_path: null`, the rows are tombstoned and the stored file is gone after the sweep
    - a second delete is 200 with no new log row
  - **Visibility (`photos.test.ts`):**
    - a visitor's GET and HEAD of a draft project's cover are 404 with `no-store`
    - the same for a published child of a draft group
    - an admin gets 200 with `private, no-store`
    - a published project's cover is 200 to a visitor with `public, max-age=86400`
    - unpublishing makes the next visitor request 404
    - the record-photo cases still pass
  - **Project delete:**
    - deleting a fresh project with a cover tombstones the cover rows (their `project_key` becomes null), and the stored files are removed
    - a refused delete (records exist) leaves the cover live
  - **Auth:** two rows in `p3-admin-auth.test.ts`.
  - **Guard coverage and OpenAPI:** both pass.
  - **Old routes:** the `housing-photos` and `records-photos` suites pass unchanged.
- **Done when:** the tests pass, and on the dev stack an uploaded cover shows at its `cover_path` URL for an admin and 404s for a visitor while the project is a draft.
- **Depends on:** U20, U22
- **Status:** done

### P4 order and parallel lanes

- **Lane A (sequential):** U19 → U20 → U22 → U23 → U24 → U25. They share `projects-admin.ts`, `projects/schemas.ts`, `projects/writes.ts`, `app.ts`, `openapi.ts` and `p3-admin-auth.test.ts`.
- **Lane B (parallel with A):** U21. It touches only `errors.ts` and its test. It must land before U22's 409 cases run.

### Verification (P4)

- `npm --prefix server run typecheck` and `npm --prefix server test` (needs `docker compose up -d db`)
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:e2e:rest-admin`: the old routes must still pass with the new guards on the shared tables
- `npm run test:all`
- `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` and `db:seed` on the dev database

### Risks and rollback (P4)

- **The new guards fire on every write to `housing_projects` and `housing_project_fields`**, including the seed function and test helpers. `projects-registry.test.ts` and `insertProject` change in U20. `db:seed` runs in U20's done check, and the e2e reset runs in the P4 verification (`test:e2e:rest-admin`).
- **Rolling `0015` back deletes cover file rows** and leaves their stored objects on disk (U20 undo note). Nothing is deployed, so this is accepted.
- **A rename over many records is one statement** under the 5 s `statement_timeout`, and each row runs the validate and log triggers. Seed-size projects are far below that. If a real project ever gets close, the fix is a batched rename, not a longer timeout.
- **The shared-helper move (U19) touches every v1 router.** It is behaviour-free, and the full server suite, including the 429 tests, is its check.
- **`If-Match` precision:** a client that sends a microsecond timestamp would never match. The UI sends what it read from JSON, which has milliseconds. The test sends both forms that the UI produces.

### Definition of done (P4)

- U19–U25 are done and their tests pass.
- The P4 verification commands pass.
- `ae-review` has run with no open P0 or P1.
- P5's start runs `ae-plan` on this file to add P5's units.
- Points for P9 to write into `PROJECTS_API_CONTRACT.md`:
  - guard messages carry no counts
  - covers accept any image the receiver takes, and `cover_path` is the file URL
  - publish is `PATCH { is_published }`
  - `If-Match` is compared to the millisecond
  - the create and PATCH bodies refuse `cover_path`

## Implementation units — P5 (Stats, overview, OpenAPI, dev seed)

### P5 decisions

These settle what the P5–P7 research turned up, against the code after P4 and the `main` merge (e2aa826). They add to the earlier decisions and change none of them.

- **`0016` ports `project_stats` and `projects_overview` from `11_project_rpcs.sql` (a8e2154, lines 53–151 and 212–271) as `housing_project_stats(p_key text, p_light boolean, p_public_only boolean)` and `housing_projects_overview(p_drafts boolean)`.**
  - Both are plain invoker, `stable`, `set search_path = public`, return `jsonb`, and are granted to `housing_app` (`docs/learnings/database/postgres-default-privileges-public-execute.md`). Neither reads a session setting or an admin flag of its own (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`). The route decides who sees drafts and passes plain booleans.
  - They sit beside `housing_stats` and `housing_years` from `0003`, which stay untouched until P9 (Deferred to Planning table).
- **`p_public_only` replaces what RLS did on Supabase.** With it set, the leaf list is `housing_project_leaf_keys(p_key)` intersected with `housing_public_project_keys()`. A visitor's stats for a published group then count only its published children, and a draft child's fields don't show in `fields`. This matches what the anon role saw on Supabase.
- **The response always carries every `ProjectStats` key** (`src/backend/interfaces/types.ts:338`). Light mode returns `by_union: {}` and no `by_value`, and `by_project` lists every leaf with 0 for an empty one. The P6 adapter then needs no `normalizeStats`.
  - `fields` holds only active public `money`, `number` and `category` fields of the counted leaves, deduplicated by key. Private and archived fields never appear. Private values can't reach `fields` anyway, because they live in `housing_beneficiary_private`, not `extra`.
  - `by_project` comes from one `group by project_type`, left-joined to the leaf list, not one count per leaf.
- **A visitor asking for a draft's stats gets 404, not zeros.** Contract §4.3 allows "404 or dropped". The server's other reads 404 a hidden project, so a visitor can't tell a draft from a missing key (`recordProject`, `server/src/records/reads.ts:51`). Supabase returned zeros through RLS. P9 records the 404 in the contract.
- **The overview follows the reference exactly.** Its shape is `ProjectOverview` (`types.ts:387`): `{ projects: ProjectOverviewItem[], global: { projects, total, districts } }`.
  - `projects` holds the published projects for a visitor, or every project for an admin with `drafts=1`, ordered by `sort_order, key`.
  - Each item's `stats` is light stats with `p_public_only = not drafts`.
  - `featured` is the newest record across the item's leaves (`created_at desc, serial_no desc`) whose `coalesce(current_thumb_url, prev_thumb_url)` is not null.
  - `featured` and `without_photo` use the same leaf list as the counts, so `p_public_only` applies to them too. A visitor never gets a draft child's photo through a published group's card.
  - `without_photo` is a count only when drafts are on, else `null`.
  - `global` always counts public leaves only, even for an admin.
  - A visitor's `drafts=1` is ignored (contract §4.1.2).
- **No new index in `0016`.** The `0011` indexes already cover the year, geo, union and `created_at` lookups. The contract's target is stats under 300 ms at 50k rows (§5.2). The P5 verification measures it once on 50k synthetic rows in the dev database. A miss gets a new migration with the partial index for `featured`, not a change to `0016`.
- **Both routes join `projectsReadRouter`** (`server/src/routes/v1/projects.ts`), with `/overview` registered before `/:key` (contract line 25). They inherit the read limiter and `sessionAwareCaching`. Both are public GETs on the public-read CORS list, with a test (Technical decisions). Only `/stats` needs a new pattern, because the existing `/projects/:key` pattern already matches `/projects/overview`.
- **"OpenAPI complete" means every mounted route except `/auth/*`.** `/auth` stays out on purpose (`server/src/openapi.ts:75`; `openapi.test.ts` "leaves the admin auth routes out"), because only this site uses it.
  - P5 adds the two new paths.
  - It documents the `If-Match` header on `PATCH /projects/{key}`, a 403 on every main-admin-only route and the 409s P4 added.
  - It renames the header comment from "/housing routes" to the v1 routes.
- **The dev seed's draft project lives in its own file, `server/db/seed/demo-project.sql`.**
  - `db:seed` runs it after `dev.sql`. The REST contract harness (P6) and the admin-rest reset (P7) load the same file, so all three share one fixture.
  - The project is `demo`, a draft leaf with photo mode `after_only`, with four fields:
    - `amount`, money, public
    - `family_size`, number, public
    - `trade`, category, public, with three options
    - `phone`, text, private
  - Six records carry `extra`, `union_name` and private values.
  - The file is idempotent like `dev.sql`: `on conflict do nothing`, and a counter row from the `0015` trigger.
  - It runs only where `dev.sql` runs: `db:seed` refuses a non-local database (`assertLocalDatabaseUrl`, `server/scripts/local-db.ts`), and the harnesses load it only into `housing_test`. No migration or deploy path loads a seed or creates a seeded admin account.

### U26. Migration `0016_project_stats`
- **Goal:** The database computes a project's stats and the home-page overview the way Supabase did, with visibility passed in by the caller.
- **Requirements:** R5, R7, R2 (overview).
- **Files:**
  - `server/db/migrations/0016_project_stats.sql`
  - `server/test/db/project-stats.test.ts` (new)
  - `server/test/db/privileges.test.ts` (extend: `housing_app` can execute both, PUBLIC can't)
- **Approach:**
  - Port `project_stats` and `projects_overview` from `git show a8e2154:supabase/sql/11_project_rpcs.sql`.
  - Strip `auth.uid()`, the RLS reliance and `is_admin`. Add `p_public_only` (P5 decisions). Reuse `housing_project_leaf_keys` from `0014` and `housing_public_project_keys` from `0011`.
  - Follow `0014`/`0015` for the header ("Differences from Supabase"), naming, grants and a `-- migrate:down` that drops both functions.
  - Bind nothing as a bare jsonb string.
- **Tests** (as `appDb`, like `server/test/db/stats.test.ts`):
  - **Counts:**
    - a leaf: `total`, `by_year`, `by_division`, `by_district`, `by_upazila`, `by_location`, `distinct.{divisions,districts,upazilas,unions}` against hand-counted fixture rows (`TS-11`)
    - a group: sums its children, and `by_project` lists every leaf including a 0
  - **Unions and fields:**
    - `by_union` is keyed `district|upazila|union` and skips empty unions
    - light mode returns `by_union: {}` and no `by_value`
    - money and number `sum` and `count` take only numeric `extra` values
    - category `distinct`, and `by_value[v].n` with `sums` per public money and number key
  - **Hidden data:**
    - private and archived fields are absent from `fields`
    - `p_public_only` drops a draft child from a published group's counts, `by_project` and `fields`
  - **Overview:**
    - item order
    - `featured` picks the newest record with a thumb and is `null` with none
    - a published group whose draft child has the newest thumb gives a visitor `featured` from a published leaf, or `null`
    - `without_photo` is a number with `p_drafts` and `null` without
    - `global` ignores drafts with `p_drafts` set
    - an unknown key gives zeros, not an error (the route answers 404)
  - **Migrations:** down then up leaves no function behind (the global setup's rollback).
- **Done when:** `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` run clean on the dev database, and the new tests and the whole server suite pass.
- **Depends on:** none
- **Status:** done

### U27. Stats and overview routes
- **Goal:** `GET /api/v1/projects/:key/stats[?light=1]` and `GET /api/v1/projects/overview[?drafts=1]` serve the U26 functions with the visibility rules.
- **Requirements:** R5, R7, R9 (CORS list, OpenAPI), R2 (overview).
- **Files:**
  - `server/src/projects/reads.ts`: `projectStats`, `projectsOverview`
  - `server/src/projects/schemas.ts`: `statsQuery` (`light` as `'1'|'true'` → boolean), `overviewQuery`
  - `server/src/routes/v1/projects.ts`: the two routes, `/overview` before `/:key`
  - `server/src/app.ts`: `PUBLIC_READ_ROUTES` gains the `/projects/:key/stats` pattern. `/projects/overview` already matches `^/api/v1/projects/[^/]+/?$`, so its CORS test is a regression check that passes before the change.
  - `server/src/openapi.ts`: both paths, with response schemas mirroring `ProjectStats` and `ProjectOverview`
  - `server/test/http/projects-stats.test.ts` (new, copying `projects-reads.test.ts`)
  - `server/test/http/cors.test.ts` (extend)
- **Approach:**
  - The stats route looks the key up with the existing visibility check (`visibleProject` in `server/src/records/reads.ts:178`, or the `projects/reads.ts` equivalent). A miss is `AppError('NOT_FOUND')`. Then it calls `housing_project_stats(key, light, !viewer.admin)`.
  - Overview passes `drafts = query.drafts && viewer.admin`.
  - Both use `sessionAwareCaching`, so an admin body is `private, no-store` and a visitor body is public with `Vary: Cookie`.
- **Tests:**
  - **Stats:**
    - a visitor gets a published leaf's and group's stats
    - a visitor gets 404 for a draft and for an unknown key, with the same body (`TS-13`: the other-viewer refusal)
    - an admin gets a draft's stats
    - `light=1` changes the shape
    - a bad `light` value is 400
  - **Overview:**
    - a visitor's `drafts=1` is ignored, so no draft and `without_photo` is null
    - an admin with `drafts=1` sees the draft and a number
  - **Headers:**
    - caching headers for each viewer
    - a partner origin gets credential-less CORS on both paths
    - a partner origin sending `drafts=1` and a cookie gets no `Access-Control-Allow-Credentials` and no draft in the body
    - a visitor's overview body holds no draft child's thumb URL
    - the route order: `GET /projects/overview` is not read as a key
- **Done when:** the new HTTP tests and `openapi.test.ts` pass, and `curl localhost:3001/api/v1/projects/overview` on the seeded dev server returns the three registry projects.
- **Depends on:** U26
- **Status:** done

### U28. OpenAPI complete
- **Goal:** `/api/v1/openapi.json` describes every mounted route apart from `/auth`, with its parameters, bodies, responses and admin rules.
- **Requirements:** R9 (the OpenAPI document), R1.
- **Files:**
  - `server/src/openapi.ts`
  - `server/test/http/openapi.test.ts` (extend)
- **Approach:**
  - Walk the routers in `app.ts` against `document.paths`. Paths can't drift (the existing test), so this unit checks content:
    - every operation has a 2xx response with a schema
    - every route behind `requireMainAdmin*` lists 403
    - `PATCH /projects/{key}` lists the `If-Match` header and its 409
    - project and field creates list their 409
  - Update the file's header comment.
  - Schemas come from the routes' zod schemas, as today.
- **Tests:**
  - every operation has a 2xx response with content (or a 204)
  - every operation whose route uses a main-admin guard lists 403; the test reads the guard from the router stack, not a hand-kept list
  - `If-Match` is a header parameter on `PATCH /projects/{key}`
  - the existing drift, `$ref` and no-`$schema` checks stay
- **Done when:** `openapi.test.ts` passes and the served document validates as OpenAPI 3.1 in the existing check.
- **Depends on:** U27
- **Status:** done

### U29. Dev seed gains a draft project with custom and private fields
- **Goal:** A fresh local stack has a draft project that exercises custom public fields, a private field, unions and stats, for the walkthrough and the P6 and P7 harnesses.
- **Requirements:** R19 (run locally with realistic data), R4, R5, R7.
- **Files:**
  - `server/db/seed/demo-project.sql` (new)
  - `server/scripts/db-seed.ts`: run it after `dev.sql`
  - `server/test/db/seed.test.ts`: counts become `demo: 6`, `semi_pucca: 12`, `tin: 8` (the existing 20 records are not touched; user-decided at doc review), plus a check that `demo` is a draft with its four fields and six private rows
- **Approach:**
  - Insert the project and its fields as the owner, so the `0015` guards and the config log run as for any create. Then insert the records with `extra` and `union_name`, then `housing_beneficiary_private` rows.
  - Every insert uses `on conflict do nothing`, so a second run adds nothing.
- **Tests:**
  - `seed.test.ts`: first run, second run unchanged
  - `demo` is unpublished
  - the private field is `visibility = 'private'`
  - the stats function as a visitor (`p_public_only`) omits `demo` from the overview's `global`
- **Done when:** `npm --prefix server run db:seed` twice on the dev database is clean, and the seeded API's `GET /projects?drafts=1&include=fields` with an admin cookie lists `demo` with four fields.
- **Depends on:** U26 (the seed test reads stats)
- **Status:** done

### P5 order and parallel lanes

- **Lane A:** U26 → U27 → U28.
- **Lane B:** U29 can start after U26. It touches only seed files.

### Verification (P5)

- `npm --prefix server run typecheck` and `npm --prefix server test` (needs `docker compose up -d db`)
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:e2e:rest-admin`: the old routes still pass
- `npm run test:all`
- `npm --prefix server run db:migrate`, `db:rollback`, `db:migrate` and `db:seed` (twice) on the dev database
- Timing, once: load 50k synthetic records into one project of the dev database and time `GET /projects/:key/stats` and `GET /projects/overview` against the 300 ms target. Record the result in Progress. Remove the rows with `docker compose down -v` or a re-seed.

### Risks and rollback (P5)

- **`0016` is additive.** Down drops two functions and nothing else reads them before P6.
- **The full stats run one scan per field and per category value** (`by_value`). Seed-size projects are far below the 5 s `statement_timeout`, and the home page uses only the light path. The timing check is the early warning.
- **The seed file is shared by three harnesses after P6–P7.** A change to it changes contract and e2e fixtures. Tests assert relations, not fixed counts, except `seed.test.ts`.

### Definition of done (P5)

- U26–U29 are done and their tests pass.
- The P5 verification commands pass, and the commit range and test counts are in Progress.
- No `ae-simplify` or `ae-review` at the end of P5. They run once over P5–P7 (Session chunks).

## Implementation units — P6 (REST adapter and default backend)

### P6 decisions

- **Every interface method maps to a v1 route, with no legacy fallback.**

  | Interface | Method | Route |
  |---|---|---|
  | `HousingApi` | `list` | `GET /projects/:key/records` |
  | | `getById` | `GET /records/:id` |
  | | `getBySerial` | `GET /projects/:key/records/serial/:n` |
  | | `getBySerials` | `GET /projects/:key/records/serials` (≤ 100 per call, as today) |
  | | `create` | `POST /projects/:key/records` |
  | | `update` | `PATCH /records/:id` |
  | | `delete` | `DELETE /records/:id` |
  | | `bulkInsert` | `POST /projects/:key/records/bulk` |
  | | `bulkUpdateBySerial` | `PUT /projects/:key/records/bulk` |
  | | `stats` | `GET /projects/:key/stats` (U27) |
  | | `years` | `GET /projects/:key/years` |
  | | `nextSerial` | `GET /projects/:key/next-serial` |
  | | `changeSerial` | `POST /records/:id/serial` |
  | | `uploadPhoto` | `PUT /records/:id/photos/:slot` |
  | | `deletePhoto` | `DELETE /records/:id/photos/:slot` |
  | | `getPrivate` | `GET /records/:id/private` |
  | | `setPrivate` | `PUT /records/:id/private` |
  | | `getPrivateMany` | `POST /projects/:key/records/private` |
  | | `listActivity` | `GET /activity` |
  | | `logActivity` | `POST /activity` |
  | | `filterOptions` | no route: built from `years` and `stats` as the Supabase adapter does (`src/backend/supabase/housingApi.ts:356`) |
  | `ProjectsApi` | `list` | `GET /projects` |
  | | `get` | `GET /projects/:key` |
  | | `overview` | `GET /projects/overview` (U27) |
  | | `create` | `POST /projects` |
  | | `update` | `PATCH /projects/:key` |
  | | `delete` | `DELETE /projects/:key` |
  | | `reorder` | `PUT /projects/order` |
  | | `createField` | `POST /projects/:key/fields` |
  | | `updateField` | `PATCH /fields/:id` |
  | | `deleteField` | `DELETE /fields/:id` |
  | | `reorderFields` | `PUT /projects/:key/fields/order` |
  | | `uploadCover` | `PUT /projects/:key/cover` |
  | | `deleteCover` | `DELETE /projects/:key/cover` |
  | | `fieldUsage` | `GET /projects/:key/fields/:field_key/usage` |
  | | `renameFieldValue` | `POST /projects/:key/fields/:field_key/rename-value` |
  | | `backendMode` | no route: always `'full'` |

  `AdminUsersApi` stays `NOT_IMPLEMENTED`. M-step 19 is after `a8e2154` and isn't ported (Key Decisions).
- **A `HousingApi` call with no project key is a `VALIDATION_ERROR` in the REST adapter.**
  - The server has no all-projects record or stats route, and the UI always passes a key. `list` takes `project_type`; `stats`, `years` and `nextSerial` take their first argument.
  - The contract suite stops relying on calls without a key (`tests/contract/housingApiContract.ts:87–134` call `list()` and `stats()` bare). It passes a seeded leaf key on every backend, so the same assertions hold on mock, REST and Supabase.
  - A group key on `list` is the server's 400 (`recordProject`). The UI never lists a group's records: group pages use the overview.
- **The adapter always sends `If-Match` when the caller passes `expectedUpdatedAt`.** This settles the P4 note "P6 decides whether the adapter always sends it". `ProjectSettingsPage` passes it on every save and on publish, so concurrent edits are caught. `restRequest` (`src/backend/rest/http.ts`) gains a `headers` option, used only for this.
- **Responses need no mapping.** P1–P5 shaped every response to the UI types (P1 decision at U6, P5 decisions). The adapter unwraps `{ data }`, or passes the page through for `list` and `listActivity`. The legacy helpers go: `withDefaults`, `legacyPayload`, `legacyProjectType`, `fromLegacyStats` and the empty `getPrivate`/`getPrivateMany`.
- **Photos and covers are multipart with the client-encoded `photo` and `thumb` parts,** the same body the old `/housing/:id/photo` took. `uploadCover(key, file)` sends `file` as both parts, because the server re-encodes and the UI has only one blob; the photo receiver stores both variants (P4 decisions). The unit checks the receiver's part names in `server/src/photos/process.ts` before writing the body.
- **`createRestImageStorage().publicUrl(path)` returns `path` unchanged when it is an absolute `http(s)` URL, and throws otherwise.** On REST, `cover_path` already holds `/api/v1/photos/<id>` as a full URL (P4 decisions). `src/features/projects/home/cover.ts` calls `publicUrl` and would otherwise show no cover. `upload`, `delete` and `move` stay `NOT_IMPLEMENTED`: only the Supabase adapter and `migrate-photos` use them, and P9 deletes both.
- **`legacyProjectsApi.ts` moves to `src/backend/mock/legacyProjectsApi.ts`**, because the mock is its only user after this chunk (Deferred to Planning). `fallbackProjects.ts` stays where it is, because the Supabase adapter and several UI files read it.
- **`friendlyProjectError` reads `details.field`.**
  - The field maps to the Bangla text for its four unique constraints (`slug`, `key`, `file_prefix`, a field's `key`) and the reserved field key (P4 decisions, U21). Otherwise it shows the server's message, which for `HC` errors is our own text.
  - The constraint-name regexes stay only while the Supabase adapter exists, and P9 removes them. Matching on the Supabase message is the old behaviour, not a new use.
  - `FieldsTab.tsx:62`, `StatsTab.tsx:59` and `AdminProjectsPage.tsx:78` show "someone else changed this" only for a `CONFLICT` with no `details.field`. Research found the same pattern in the latter two, so all three change together.
- **REST becomes the default backend:**
  - `DEFAULT_BACKEND = 'rest'` in `src/backend/factory.ts:23`
  - `.env.example`: `VITE_HOUSING_BACKEND=rest` and `VITE_API_BASE_URL=http://localhost:3001`
  - `compose.yaml` web service defaults to `rest`
  - `supabase` stays selectable until P9 as the parity reference, and `mock` stays dev-only (R10). No new Supabase code is added.
- **The contract suite gains a `ProjectsApi` part** in `tests/contract/projectsApiContract.ts`, run by the same per-backend files.
  - `ContractHarness` gains an optional `projects: ProjectsApi`. The mock harness leaves it out, so the part skips on the mock: the mock is legacy and refuses edits by design.
  - **REST:** the REST harness also loads `server/db/seed/demo-project.sql` after `dev.sql`.
  - **Local Supabase:** `supabase.local.contract.test.ts` passes its projects API.
  - Each write test creates and deletes its own draft project, so no test depends on another (`TS-14`).
  - The blocks that need custom or private fields (`f.<key>`, private values, `by_value`, `without_photo`) also build their own draft project and fields through `ProjectsApi`, the same way on REST and Supabase (user-decided at doc review). The demo seed serves only REST-only read checks. No Supabase-side fixture is added.
  - Behaviour that differs between REST and Supabase on purpose is listed in `knownGaps` with the decision that caused it, and each entry goes on the P9 contract-rewrite list. Examples are a visitor's draft stats (404 against zeros) and `cover_path` (a URL against a storage path).
  - A gap nobody decided on is a bug to fix, not an entry.
- **The merged `main` UI hides more from a plain `admin` than the server refuses:** serial change (`RecordForm.tsx:255`), replacing an existing photo (`PhotoBulkPage.tsx:73`) and the import clear token (`ImportPage.tsx:104`). The server keeps `a8e2154`'s rules (Key Decisions: nothing after `a8e2154` is ported). The UI is only stricter, so nothing is exposed. The P8 checklist notes it, and P9's contract rewrite says the UI hides these for plain admins.

### U30. `restRequest` headers and the real REST `ProjectsApi`
- **Goal:** Every `ProjectsApi` method calls its v1 route, with `If-Match` on updates and the cover as multipart.
- **Requirements:** R1, R2, R3.
- **Files:**
  - `src/backend/rest/http.ts` (`headers` option)
  - `src/backend/rest/projectsApi.ts` (new)
  - `src/backend/rest/endpoints.ts` (a `projects` and `fields` section)
  - `src/backend/rest/index.ts` (re-export; drop `createLegacyProjectsApi`)
  - `src/backend/rest/projectsApi.test.ts` (new, stubbed `fetch` like `authProvider.test.ts`)
- **Approach:**
  - Follow `src/backend/supabase/projectsApi.ts` for method semantics, and the current `rest/index.ts` `call` helper for unwrapping.
  - `create(input, fields)` sends `{ ...input, fields }` as the route expects. Read `projectCreateBody` in `server/src/projects/schemas.ts` for the exact field name.
  - `update` sends `If-Match` only when `expectedUpdatedAt` is set.
  - Bodies are the patch as given, and the server refuses unknown keys.
- **Tests:**
  - each method hits the right method, path and body
  - `If-Match` is sent with the value given and absent without one
  - a 409 with `details.field` reaches the caller as `CONFLICT` with `details.field`
  - a 403 is `FORBIDDEN`, and a 404 is `NOT_FOUND`
  - cover upload sends multipart with both parts
  - `backendMode()` is `'full'`
  - the end-to-end proof is U35's contract run against the real server
- **Done when:** `npm test` passes and `rg "legacyProjectsApi" src/backend/rest` is empty.
- **Depends on:** U27 (overview route)
- **Status:** done

### U31. REST `HousingApi` on the new routes
- **Goal:** Every `HousingApi` method calls its v1 route, carries `union_name`, `extra` and private values, and no `/housing` path is left in the adapter.
- **Requirements:** R1, R4, R5, R8.
- **Files:**
  - `src/backend/rest/endpoints.ts` (rewritten: `/housing` goes, `projects`/`records`/`activity` come in, `adminUsers` stays)
  - `src/backend/rest/index.ts`
  - `src/backend/rest/housingApi.test.ts` (rewritten)
- **Approach:**
  - Keep the parts of today's adapter that aren't legacy:
    - the `getBySerials` dedupe, sort, int4 filter and 100-per-call chunks
    - the `q` length cap
    - page clamping
    - `logActivity` skipping `login`/`logout` and swallowing errors
  - Query names follow the routes' zod schemas: `f.<key>`, `union_name`, `sort=extra.<key>`, and `/activity`'s project filter. Read `server/src/records/schemas.ts` and `server/src/routes/v1/activity.ts`.
  - `stats(key, { light })` sends `light=1`. `filterOptions` composes `years` and `stats`, as Supabase does.
  - `publicUrl` follows the P6 decision.
  - A missing key throws `VALIDATION_ERROR` before any request.
- **Tests:**
  - path, method and query for every method
  - `union_name`, `extra` and `_clear` reach the bulk body unchanged
  - private get, set and many hit the private routes
  - photo upload is multipart to `/records/:id/photos/:slot`
  - a missing key is refused with no request
  - `publicUrl` passes an absolute URL through and throws on a bare path
  - `rg "/housing" src/backend/rest` finds only comments that P9 removes, or nothing
- **Done when:** `npm test` passes, and `npm run test:contract:rest` passes with the suite as it stands. U35 widens it.
- **Depends on:** U30 (shared `endpoints.ts` and `http.ts`)
- **Status:** done

### U32. Legacy into the mock
- **Goal:** Only the mock backend knows the three-fixed-projects legacy view.
- **Requirements:** R10, R1 (no legacy fallback outside the mock).
- **Files:**
  - `git mv src/backend/legacyProjectsApi.ts src/backend/mock/legacyProjectsApi.ts`
  - `src/backend/mock/index.ts`, `src/backend/mock/housingApi.ts` (imports)
  - any test importing it
- **Approach:** A move with import changes only. `fallbackProjects.ts` stays.
- **Tests:** none new. `npm test`, `npm run test:e2e:mock` and the mock contract run are the check (behaviour-free move).
- **Done when:** `rg "legacyProjectsApi" src --glob '!src/backend/mock/**'` is empty, and the mock suites pass. The `LEGACY_GROUP_KEY` in `src/backend/supabase/stats.ts` is the Supabase adapter's own constant and stays until P9.
- **Depends on:** U30, U31
- **Status:** done

### U33. Registry errors by field in the UI
- **Goal:** A duplicate slug, key, file prefix or field key shows its own message, and only a real stale edit shows "someone else changed this".
- **Requirements:** R2, R3.
- **Files:**
  - `src/features/admin/projects/projectRules.ts` (`friendlyProjectError`, line 86)
  - `src/features/admin/projects/tabs/FieldsTab.tsx` (line 62)
  - `src/features/admin/projects/tabs/StatsTab.tsx` (line 59)
  - `src/features/admin/pages/AdminProjectsPage.tsx` (line 78)
  - `src/features/admin/projects/projectRules.test.ts` (new or extend)
- **Approach:** Read `HousingApiError.details?.field` first. Keep the Supabase message regexes after it until P9 (P6 decisions). Add one shared `isStaleEdit(err)` helper in `projectRules.ts` for the three components.
- **Tests:**
  - each of the five fields gives its text
  - a `CONFLICT` without a field is the stale-edit text
  - `FORBIDDEN` is the no-permission text
  - anything else passes the server message through
- **Done when:** `npm test` and `npm run lint` pass.
- **Depends on:** none (can run beside U30–U32)
- **Status:** done

### U34. REST is the default backend
- **Goal:** `npm run dev`, the production build and `docker compose up` use the REST backend unless told otherwise.
- **Requirements:** R10.
- **Files:**
  - `src/backend/factory.ts` and `src/backend/factory.test.ts`
  - `.env.example`
  - `compose.yaml` (web service default and its comment)
  - `README.md` and `docs/testing/README.md` (the run and backend lines)
- **Approach:**
  - Flip the default.
  - `.env.example` lists `rest | mock | supabase` and says `supabase` goes in P9.
  - The README's quick start becomes: compose up `db`, migrate and seed, start the API, then `npm run dev`.
  - `check:prod-bundle` and the CI `checks` build must still pass with the new default. If the bundle check asserts a Supabase default, change that assertion to REST.
- **Tests:**
  - `factory.test.ts`: no env gives `rest`
  - `mock` is honoured only in dev
  - an unknown value warns and falls back to `rest`
  - `supabase` still selects Supabase
- **Done when:** `npm run build` and `npm run check:prod-bundle` pass, and `docker compose up` serves the UI against the local API with the seeded projects.
- **Depends on:** U35 (the default flips only after the contract proves the adapter)
- **Status:** done

### U35. Contract suite: `ProjectsApi` and every new `HousingApi` method
- **Goal:** One shared suite proves the REST adapter against the server and against local Supabase as the parity reference.
- **Requirements:** R11, R1–R5, R7.
- **Files:**
  - `tests/contract/harness.ts` (`projects?: ProjectsApi`)
  - `tests/contract/projectsApiContract.ts` (new)
  - `tests/contract/housingApiContract.ts` (explicit keys; new method blocks)
  - `tests/contract/rest.contract.test.ts` (projects harness; load `demo-project.sql`)
  - `tests/contract/supabase.local.contract.test.ts` (projects harness)
  - `tests/contract/mock.contract.test.ts` (unchanged options; the projects part skips)
  - `tests/contract/rest.readonly.contract.test.ts` and `supabase.readonly.contract.test.ts`: no `projects` part. The new `HousingApi` blocks respect `writes` and `seeded`, so private reads and `changeSerial` skip in the read-only runs.
- **Approach:** Follow `runHousingApiContract`'s structure and options.
  - **`ProjectsApi` part, reads:**
    - list without and with drafts, as visitor and admin (AE2)
    - get a draft as admin, and `NOT_FOUND` as visitor
    - overview items, `featured` and `without_photo` by viewer
  - **`ProjectsApi` part, writes:**
    - create (always a draft), update with a matching and a stale `expectedUpdatedAt` (`CONFLICT`)
    - publish and unpublish
    - reorder
    - field create, update, archive, reorder and delete
    - usage, and rename-value
    - cover upload and delete
    - a plain admin's delete is `FORBIDDEN` (AE1, on backends with `nonAdminAccounts`)
    - a duplicate slug is `CONFLICT` with `details.field = 'slug'`
  - **New `HousingApi` blocks:**
    - `union_name` and `extra` round-trip
    - `f.<key>` filter, `q` over searchable fields, `sort=extra.<key>`
    - private get, set and many, admin only
    - `stats` keys (`by_union`, `by_project`, field sums, `by_value`) and the light shape
    - `years`, `nextSerial` (null for a draft as visitor), `changeSerial`
    - the photo mode refusal (AE3)
- **Tests:** the suite itself. Each block runs on REST. Local Supabase runs the same blocks with `knownGaps` for the decided differences, each with a one-line reason that names the decision.
- **Done when:**
  - `npm run test:contract:rest` passes.
  - `npm run test:contract:supabase-local` passes, with any `knownGaps` listed in Progress for P9.
  - The mock contract run in `npm test` still passes.
- **Depends on:** U30, U31, U29 (seed file)
- **Status:** done

### P6 order and parallel lanes

- **Lane A (sequential):** U30 → U31 → U32 → U35 → U34. They share `endpoints.ts`, `http.ts`, `rest/index.ts` and the contract harness. The default flips last.
- **Lane B (parallel with A):** U33. It touches only the admin project components and `projectRules.ts`.

### Verification (P6)

- `npm --prefix server run typecheck` and `npm --prefix server test`
- `npx tsc -b`, `npm run lint` and `npm test` at the root (includes the mock contract run and `factory.test.ts`)
- `npm run test:contract:rest`
- `npm run test:contract:supabase-local` (local Supabase running), as the parity reference
- `npm run test:e2e:rest-admin`: the existing specs now run through the new routes
- `npm run test:e2e:rest` against the seeded dev API, and `npm run test:all`
- `npm run build` and `npm run check:prod-bundle`
- Manual, once: `docker compose up` and open `http://localhost:5173`. The home page, a group page and a project list load from the API with no console errors.

### Risks and rollback (P6)

- **The adapter switch moves `admin-rest` and `public-rest` onto new routes in one go.** Every existing spec is the regression check. A red spec is read with `ae-trace` before anything else changes.
- **Flipping the default changes what a developer sees on `npm run dev`.** Without the API running, the UI shows its "can't reach the server" state, not mock data. The README and `.env.example` say so, and `npm run dev:mock` stays.
- **Local Supabase may not be running** on the machine doing P6. The Supabase contract run is then reported as not run, never as passed, and it must run before P9 starts (P9's gate).
- **Rollback:** the default is one constant and two env lines. The old `/housing` routes still exist until P9, so the old adapter can be restored from git if needed.

### Definition of done (P6)

- U30–U35 are done and their tests pass.
- The P6 verification commands pass, and the commit range and test counts are in Progress, including whether the local-Supabase contract run happened.
- No `ae-simplify` or `ae-review` at the end of P6. They run once over P5–P7 (Session chunks).

## Implementation units — P7 (Playwright, import tests, CI on REST)

### P7 decisions

- **The new admin specs live in `e2e/admin/`, which only `admin-rest` runs.**
  - The mock can't create or edit projects (Deferred to Planning: the mock doesn't grow), so these specs would fail on the `mock` project.
  - `admin-rest` in `playwright.config.ts:88` changes from `testDir: './e2e/mock'` to `testDir: './e2e'` with `testMatch` over `mock/**` and `admin/**`.
  - The `mock` project keeps `./e2e/mock`.
- **The admin-rest reset gets realistic data** (`e2e/support/rest-data.ts`):
  - It stops stripping `union_name` and `extra`; the comment there predates `0011`.
  - It loads `server/db/seed/demo-project.sql` (U29) after the fixture records.
  - It inserts a plain `admin` (`editor@example.test`) next to the `main_admin`, defined in `rest-data.ts` itself. The mock fixtures and store don't change (user-decided at doc review), because only `e2e/admin/` specs use it, and only `admin-rest` runs them.
  - `e2e/support/auth.ts` gains `loginAs(page, { email, password }, to)`.
- **AE1's "direct delete request is refused" is checked through the browser's own session:**
  - The spec sends `fetch(url, { method: 'DELETE', credentials: 'include' })` from inside the page with `page.evaluate`, after logging in as the plain admin.
  - The browser then sends the site's `Origin`. A bare `page.request.delete` sends none, and `originCheck` (`server/src/http/origin.ts`) would refuse it before the role check, so the test would pass even with `requireMainAdmin` gone.
  - The spec expects 403 with `requireMainAdmin`'s message, not the origin-refusal text, and checks that the record is still there.
- **Specs seed through the UI or the reset, never through private test endpoints** (`TS-32`). Login happens per spec through the form, as the existing specs do. Stored auth state is left for later: the reset truncates sessions before each test.
- **"CI runs all suites on REST":**
  - CI already runs the server suite, `test:contract:rest`, `admin-rest` and `public-rest` against Postgres in `db-suites` (`.github/workflows/ci.yml`). The `e2e/admin/` specs join automatically through the `admin-rest` change.
  - The `checks` build now uses the REST default (U34).
  - The `e2e-mock` job stays, because the mock remains a supported dev backend (R10).
  - `test:contract:supabase-local` stays out of CI: it needs a local Supabase, and P9 deletes it.
- **Import unit tests follow `importParse.test.ts`** (Vitest, beside the source, node environment). They test `importFields.ts` and `importAnalyze.ts` through their exports only (`TS-16`).

### U36. Unit tests for `importFields.ts` and `importAnalyze.ts`
- **Goal:** The import mapping and row analysis have the coverage the `main` merge removed.
- **Requirements:** R14.
- **Files:**
  - `src/features/admin/import/importFields.test.ts` (new)
  - `src/features/admin/import/importAnalyze.test.ts` (new)
- **Approach:** Build small `Project` fixtures inline: a project with a custom money field, a category with options and aliases, a private field, and photo-link fields.
  - **`importFields`:**
    - `normHeader`
    - `isIgnoredHeader`
    - `buildImportFields`: core, `x.<key>` custom, private flag, `*_photo_source`, archived fields left out
    - `guessMapping`: exact, alias and unknown headers
  - **`analyzeRows`:**
    - insert and update modes
    - `serialFromFile` and `startSerial`
    - `fillDown`
    - `geoFixes` and unresolved geo
    - `unions`
    - `categoryFixes`
    - `CLEAR_TOKEN` allowed only with `canClear`
    - a private column routed to private values
    - an invalid money value as a row error
- **Tests:** as above, each asserting the returned rows and errors against hand-written expectations (`TS-11`).
- **Done when:** `npm test` passes with both files.
- **Depends on:** none (can start at P7's start, or during P6)
- **Status:** done

### U37. Admin-rest groundwork
- **Goal:** Specs in `e2e/admin/` run on `admin-rest` with the demo project, custom values and both admin roles.
- **Requirements:** R12.
- **Files:**
  - `playwright.config.ts` (`admin-rest` dirs)
  - `e2e/support/rest-data.ts`
  - `e2e/support/auth.ts`
  - `e2e/admin/smoke.spec.ts` (new)
  - `scripts/e2e-rest-admin.mjs`, only if the folder list is passed there
- **Approach:** As in the P7 decisions. The reset stays one function called by the `backend.ts` auto fixture.
- **Tests:**
  - an `e2e/admin/smoke.spec.ts` that logs in as each role and sees the `demo` draft in the admin project list
  - every existing `e2e/mock` spec still passes on `admin-rest` and `mock`
- **Done when:** `npm run test:e2e:rest-admin` and `npm run test:e2e:mock` pass.
- **Depends on:** P6 done (the adapter must call the new routes)
- **Status:** done

### U38. Specs: wizard, settings, builders, covers
- **Goal:** The project-registry flows `main` added are covered end to end on the server.
- **Requirements:** R12, R2, R3.
- **Files:**
  - `e2e/admin/project-wizard.spec.ts`
  - `e2e/admin/project-settings.spec.ts`
  - `e2e/admin/fields-builder.spec.ts`
  - `e2e/admin/stat-cards.spec.ts`
  - `e2e/admin/project-cover.spec.ts`
- **Approach:** Selectors by role, label and Bangla text, as in `e2e/mock/record-delete.spec.ts` (`TS-30`), with web-first waits only (`TS-31`).
  - **Wizard** (`ProjectWizardPage.tsx`): create a leaf from a template. The toast says draft, and a visitor gets "not found" at its URL.
  - **Settings** (`ProjectSettingsPage.tsx`): edit the general tab and save; publish through the checklist, after which the visitor sees it; unpublish through `UnpublishDialog`.
    - Stale edit: two pages save in turn, and the second shows the conflict text and reloads.
    - A duplicate slug shows its own message (U33).
  - **Fields** (`FieldsTab.tsx`, `FieldEditorDrawer.tsx`): add a category field, archive and restore it, reorder.
    - Changing a field's key after data exists is refused with the guard's text.
  - **Stat cards** (`StatsTab.tsx`, `StatCardPicker.tsx`): add a sum card on a money field. The public list page shows the seeded total.
  - **Cover** (`CoverUpload.tsx`): upload, see it on the home card, delete it as main admin. The plain admin sees no delete control.
- **Tests:** the specs above, about 12 to 15 cases in all.
- **Done when:** `npm run test:e2e:rest-admin` passes twice in a row (no flakes).
- **Depends on:** U37
- **Status:** done

### U39. Specs: import, CSV export, category rename, AE1
- **Goal:** The data flows with custom and private fields, and the delete rule, are covered end to end.
- **Requirements:** R12, R4, R6, AE1.
- **Files:**
  - `e2e/admin/import-custom-fields.spec.ts`
  - `e2e/admin/csv-export-private.spec.ts`
  - `e2e/admin/category-rename.spec.ts`
  - `e2e/admin/delete-roles.spec.ts`
- **Approach:**
  - **Import** (`ImportPage.tsx`): upload a BOM CSV into `demo` with custom, category and private columns, as `import-new.spec.ts` does. Map the columns and fix one category through `CategoryReviewPanel`.
    - The records appear, and the record form shows the private value to the admin.
    - A visitor can't see `demo` at all.
  - **Export** (`AdminRecordsPage.tsx:231`, the dialog at 373): with private columns, the downloaded file name ends in `-private` and its header has `phone`. Without, no `phone`.
  - **Rename** (the category block on the records page): rename a value. The list filter and the stats show the new spelling, and the activity log has the summary row.
  - **AE1:**
    - The plain admin sees no `ডিলেট` row button and no bulk delete. A direct `DELETE /api/v1/records/:id` from the page (P7 decisions: in-page `fetch`, so the origin check passes) is 403 with the main-admin message, and the record is still there.
    - The main admin deletes the same record.
- **Tests:** the specs above, about 8 to 10 cases.
- **Done when:** `npm run test:e2e:rest-admin` passes twice in a row.
- **Depends on:** U37
- **Status:** done

### U40. CI and test docs on REST
- **Goal:** CI runs every suite on the REST backend, and the docs say which command runs what.
- **Requirements:** R12, R19 (groundwork).
- **Files:**
  - `.github/workflows/ci.yml` (only if U34 or U37 need a change: the `admin-rest` folders, the build env)
  - `docs/testing/README.md`
  - `package.json`, only if a script must name the new folder
- **Approach:**
  - Check that the CI `db-suites` job runs `e2e/admin/` through `admin-rest`, and that the `checks` build uses the REST default.
  - Write the per-suite table in the testing README: command, backend, needs, run in CI or not.
- **Tests:** a CI run on the pushed branch is green, or a local `act` run if pushing is not wanted yet. Pushing is the user's call.
- **Done when:** the README table matches `package.json` and `ci.yml`, and the local runs of every suite listed there pass.
- **Depends on:** U38, U39
- **Status:** done

### P7 order and parallel lanes

- **Lane A:** U37 → U38 and U39 (the two spec units share only the groundwork and can be built in either order) → U40.
- **Lane B:** U36 is independent and may run any time from P6 on.

### Verification (P7)

- `npm --prefix server run typecheck` and `npm --prefix server test`
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:contract:supabase-local` (parity reference)
- `npm run test:e2e:rest-admin` (twice), `npm run test:e2e:rest` and `npm run test:e2e:mock`
- `npm run test:all`
- CI green on the branch, once the user pushes it

### Risks and rollback (P7)

- **The housing_test database is shared** by the server suite, the contract suite and `admin-rest`. They must never run in parallel (they all reset it). The verification runs them one after another.
- **Download and upload specs can be flaky** on file timing. Wait on the download event and on the visible result, never on time (`TS-31`). A flaky spec is fixed or reported, never retried into green (`TS-15`).
- **Specs only; no product code changes.** A spec that finds an app defect stops for a fix in the app, never a workaround in the spec (the `playwright-healer` rule).

### Definition of done (P7, and the P5–P7 batch)

- U36–U40 are done and their tests pass.
- The P7 verification commands pass, and the commit range and test counts are in Progress.
- **One `ae-simplify` over the P5–P7 commit range** (first P5 commit to last P7 commit), with its changes verified by the full P7 verification.
- **One `ae-review` with one commit range per chunk** (P5, P6, P7) handed to the reviewers, not one diff.
  - Every P0 and P1 is fixed, and the P2s as in earlier chunks.
  - Results are recorded in Progress.
- **The full verification re-runs after the fixes,** including `npm run test:contract:supabase-local` as the parity reference.
- Progress says P5–P7 are done, with test counts, review results and items left for later. **Next** is P8, the Chrome walkthrough, which needs the user.

## Implementation units — P8 (Chrome walkthrough, R13)

### P8 decisions

- **The checklist is one file, `docs/progress/P8_WALKTHROUGH_CHECKLIST.md`,** in English with the UI's Bangla text quoted as it appears.
  - Its upper-case name follows `docs/progress/HOUSING_PROGRESS.md`.
  - Its rows are a table, `| # | Where | Steps | Expected | Main | Plain |`, as in `HOUSING_PROGRESS.md` §৫ক and `docs/ADMIN_GUIDE.md` §১০ক.
  - The Main and Plain cells hold `✅`, `❌ D<n>` (a defect, see below), or `—` when the row doesn't apply to that role. Visitor rows use the Main column only and say so.
  - Below the table, a **Defects** table lists `| D<n> | Row | What happened | Fix commit | Test |`. A **Run** header records the date, the commit walked, and the GIF names.
- **The rows are drawn from M-steps 1–15** (`docs/MULTI_PROJECT_PLAN.md` §৮), grouped by page, not by M-step. Each row names its M-step.
  - M-steps 1–5 are infrastructure, already proven by the suites. They contribute only what a person can see: Bangla and English money formatting (M-5খ) and the registry-driven header menu.
  - M-step 6 contributes the routes, the `/housing/admin/*` redirects, deep links without a 404 flash, and the header at 360 and 768 px.
  - M-steps 7–15 contribute the admin and public flows the brief lists.
  - Rows needing Supabase or the live site are left out: SQL files, `security-check`, `photo-check`, `migrate-photos`, the smoke lanes. The server suite and the `admin-rest` and `public-rest` suites cover those rules on REST.
- **Every row passes on three counts:**
  - The expected result is seen.
  - There are no console errors. Warnings are noted only if new.
  - There are no unexpected failed requests.
  - **Expected failures, listed once at the top of the checklist:**
    - `GET /auth/me` 401 while logged out.
    - The 404 a visitor gets for a draft's URL, stats or cover.
    - The seed's `https://example.com/photos/…` image URLs. The 20 seed records carry fake photo sources (`server/db/seed/dev.sql`), so their images fail to load. Photo rows use records whose photos the walkthrough uploaded.
    - The 403 from the AE1 direct-delete check.
  - Network checks read `read_network_requests` filtered to `localhost:3001`, and console checks read `read_console_messages` filtered to errors.
    - Both tools are called once on each new tab before its first row, so capture has started.
    - They are read again after every row, and right after any page load, before navigating away.
  - Network output is summarised in the checklist (method, path, status), never pasted, so no cookie or header value lands in a file.
- **Every admin flow runs twice,** first as the main admin, then as the plain admin, in separate Chrome tabs with the session cleared between them.
  - Rows where the roles differ say so in Expected. The plain admin sees no record delete, bulk delete, field delete or cover delete control (AE1, `RecordForm.tsx`, `AdminRecordsPage.tsx`, `FieldsTab.tsx`, `CoverUpload.tsx`).
  - AE1's direct `DELETE /api/v1/records/:id` is re-checked from the plain admin's page with an in-page `fetch` (P7 decisions), and must be 403 with the main-admin message.
  - The same in-page `fetch` probes the other main-admin-only routes: bulk record delete, field delete and cover delete. Each must be 403 with the main-admin message.
  - From a logged-out tab, an in-page `fetch` to a record create, a record update and a photo upload must each be 401.
  - The role check uses the browser's own session the same way: an in-page `fetch('http://localhost:3001/api/v1/auth/me', { credentials: 'include' })` that returns only `role`. The session cookie is HttpOnly (`server/src/auth/cookie.ts`), so nothing reads it.
- **Known difference, recorded in the checklist and not a defect:**
  - The merged `main` UI keeps three things from a plain admin:
    - serial change, which shows "লক করা — সিরিয়াল বদলাতে পারেন শুধু মূল এডমিন" instead of the button (`RecordForm.tsx:453`)
    - replacing an existing photo: the record form's slot is locked (`RecordForm.tsx:562–563`), and bulk photos marks the match `locked` (`PhotoBulkPage.tsx:170`)
    - the import "(মুছুন)" token (`canClear`, `ImportPage.tsx:104`)
  - The server allows all three for any admin. P6 decided to keep `a8e2154`'s server rules, so this is the accepted stance (P6 decisions).
  - The Plain cell for these rows checks that the control is hidden or locked.
- **The walkthrough runs on a fresh dev database.**
  - The current dev database has P5's 50k-run leftovers: the `demo` counter at 50006 and its activity log. It also has two plain admins and no main admin.
  - The reset is `docker compose down -v`, then `up -d db`, `db:migrate` and `db:seed`. This deletes the local dev database, so the user confirms it first.
    - `down -v` also empties `housing_test` and the photo and `node_modules` volumes. The test setup re-migrates `housing_test`, and the next `docker compose up api web` reinstalls dependencies.
  - Two throwaway admins are created with the CLI:
    - `p8-main@example.test` as `main_admin`
    - `p8-admin@example.test` as a plain `admin`, the CLI's default role
  - **The user runs the two `create` commands in their own terminal**, with the `!` prefix in Claude Code. The CLI reads the password from a hidden prompt only on a TTY (`server/src/cli/prompt.ts`), and the session's shell has none.
    - The passwords are used for nothing else.
    - The user types them into the login form, unless they choose to give them to the session.
    - Neither GIFs nor the checklist show a typed password.
  - Both servers listen on localhost only: the API's default `HOST` is `127.0.0.1`, and the UI runs as `npm run dev -- --host 127.0.0.1` (the Vite config's `host: true` would also serve the LAN).
  - At the end of P8 both admins log out, both servers stop, and the two walk admins are disabled with the CLI's `disable`.
- **Test files are generated, never committed:**
  - a few small JPEGs, made with `sharp` from `server/node_modules`
  - a BOM CSV for `demo` with custom, category and private columns, shaped like `e2e/admin/import-custom-fields.spec.ts`
  - Both go in the session scratchpad and are uploaded with the Chrome extension's `file_upload` tool.
  - Photo file names follow the bulk-upload pattern, so the bulk-photo rows can match them:
    - `demo_0001.jpg`: a valid after photo for the after-only `demo`
    - `demo_0001_prev.jpg`: the red case, a before photo on an after-only project
    - `semi_0001_prev.jpg`: the overwrite badge on a `semi_pucca` record that already has a before photo, then cancelled
- **GIFs record the main flows, and they aren't committed** (size). They cover:
  - the public site
  - the wizard through to publish
  - record add, edit and photos
  - import
  - bulk photos
  - the plain admin's AE1 view

  Their file names go in the checklist's Run header.
- **A defect is fixed in the app, never worked around in the walkthrough.** Each fix follows `ae-work`:
  - First, a test that fails without the fix: a Vitest `.ts` test beside the code for logic, `e2e/admin/` for admin flows needing the server or roles, `e2e/live/` for public pages. There is no jsdom or testing-library (`vitest.config.ts`), and none is added.
  - Then the fix.
  - Then one commit per defect, after which the checklist row is re-checked.
  - **What counts as a defect:**
    - a failed row
    - a console error
    - an unexpected failed request
    - a parity break with `main` at `a8e2154`

    A wish for new behaviour is noted in the checklist as "later" and not built (Scope Boundaries).
- **The P8 gate ("P7 green in CI") is met by the full local run.** CI runs only once the user pushes, and this session doesn't push. The P5–P7 batch and the dedupe fix (`rest/authProvider.ts`, `rest/projectsApi.ts`) passed the full local verification. CI on the pushed branch stays part of the Success Criteria, and the P9 gate is unchanged.

### U41. Write the walkthrough checklist
- **Goal:** A checklist that covers every public page and admin flow in R13, with an expected result per row.
- **Requirements:** R13.
- **Files:** `docs/progress/P8_WALKTHROUGH_CHECKLIST.md` (new)
- **Approach:** As in the P8 decisions. The rows go in this order:
  1. **Setup:** the stack, the reset, the admins, and the expected failures.
  2. **Public, as a visitor, pass 1** (before any admin row, with the seed as it is):
     - the home cards, hero counts, and at most two API calls (M-15)
     - the `/housing` group landing
     - `/housing/semi-pucca`:
       - the stat cards
       - the year, geography down to union, category and name filters, with their URL parameters
       - the map, the table at 1024 px and the cards at 360 px
     - the detail modal on `semi_pucca`: the before-after layout, ←/→ paging, and the seed's fake photo URLs failing quietly (an expected failure)
     - the language switch on every public page, with categories kept as written
     - `/housing/admin/semi-pucca` redirecting to `/admin/records/semi_pucca` (it then asks for login)
     - an unknown slug gives a 404, and a deep link shows no 404 flash
     - the draft `demo` and its URL, stats and cover absent or 404
  3. **Public, as a visitor, pass 2** (after the main admin has imported into `demo`, uploaded its photos and cover, and published it):
     - the home card for `demo` with its cover and money stat
     - the `demo` list with the trade filter
     - the after-only detail with zoom and fullscreen, and the custom fields
     - **visitor responses, read with an in-page `fetch` in the logged-out tab** (R7, AE2). Each one is checked for no `phone` or other admin-only field key, and no draft project:
       - `GET /api/v1/projects/demo/records`
       - one record's detail
       - `GET /api/v1/projects/demo/stats`
       - `GET /api/v1/projects/overview`
       - `GET /api/v1/projects?drafts=1&include=fields` without a session: `drafts` is ignored or refused
     - after `demo` is unpublished again: absent from home and the header menu, 404 at its URL, and the response rows above repeated (records, stats and detail 404; overview and list without `demo`)
  4. **Admin, per role:**
     - login with a wrong password, then a right one; logout
     - the dashboard counts, against `GET /projects/overview?drafts=1`
     - the projects list: order, publish toggle, and the unpublish dialog, cancelled on `housing`
     - the wizard: a leaf from the "অনুদান/উপকরণ" template, slug rules (`admin`, digits only, duplicate), and a draft that a visitor can't see
     - settings:
       - the general tab, saved, plus a stale edit from two tabs
       - fields: add a category, archive and restore, reorder, a locked key once values exist, and the delete offer becoming archive
       - stat cards: a sum card with a live total
       - photos: a mode change refused on `semi_pucca`
       - display: the map and the address columns
       - cover: upload, see it on the card, delete (main admin only)
       - publish through the checklist, then unpublish
     - records:
       - the list with its filters and page money total
       - add with Bangla digits in money ("১,২০,০০০")
       - edit
       - serial change (main admin only)
       - photo upload and replace (replace is main admin only)
       - delete and bulk delete (main admin only)
       - the AE1 direct delete
       - CSV export with and without private columns (`-private` name, `phone` header, BOM), and a `=1+1` name exported with a leading `'`
       - category rename, with the activity row
     - import:
       - insert into `demo` with custom, category and private columns, a category fix, and a bad money row
       - update by serial with one "(মুছুন)" cell (main admin; hidden from the plain admin)
     - bulk photos:
       - matched names
       - an `_prev` file on an after-only project shown red
       - the overwrite badge, cancelled
     - the activity log: field labels, a money change shown "৳ … → ৳ …", the rename row, config events, and the project filter
     - drafts: an admin sees the `demo` preview with its draft banner, a visitor gets a 404
  5. **Defects** and **Run**, empty.
- **Tests:** none (a document). Every row has an Expected cell and names its M-step.
- **Done when:** the file exists with every row empty, and the user has seen the row list before the walkthrough starts.
- **Depends on:** none
- **Status:** done

### U42. Prepare the local stack and test files
- **Goal:** A clean local stack with both admins and the files the walkthrough uploads.
- **Requirements:** R13.
- **Files:** none committed. The test files go in the session scratchpad.
- **Approach:**
  - With the user's OK, reset the dev database (P8 decisions).
  - Run `npm --prefix server run db:migrate` and `db:seed`, then create the two admins with `npm --prefix server run admin -- create …`.
  - Start `npm --prefix server run dev` and `npm run dev -- --host 127.0.0.1` in the background, then check that `curl localhost:3001/api/v1/projects` lists `housing`, `semi_pucca` and `tin` but not `demo`.
  - Generate the JPEGs and the CSV.
- **Tests:** the `curl` check above. After each admin logs in, the in-page `/auth/me` fetch (P8 decisions) returns the right role.
- **Done when:** both servers answer, both admins log in, and the files exist.
- **Depends on:** U41
- **Status:** done

### U43. Walk the public site and the admin flows as the main admin
- **Goal:** Every Main cell is filled.
- **Requirements:** R13, AE2.
- **Files:** `docs/progress/P8_WALKTHROUGH_CHECKLIST.md`
- **Approach:**
  - Follow the `claude-in-chrome` skill: open new tabs on `localhost` only, and record the GIFs.
  - Walk visitor pass 1 logged out. Then walk the admin rows as the main admin, which import into `demo`, upload its photos and cover, and publish it. Walk visitor pass 2 in a logged-out tab, then unpublish `demo` and finish pass 2.
  - After each row, read the console and the network filters.
  - A failing row gets a `D<n>` entry and goes to U45. The walk goes on where later rows don't depend on it.
- **Tests:** the checklist rows.
- **Done when:** every Main cell is `✅`, `—` or `❌ D<n>`.
- **Depends on:** U42
- **Status:** done

### U44. Walk the admin flows as the plain admin
- **Goal:** Every Plain cell is filled, with AE1 and the known difference checked.
- **Requirements:** R13, AE1.
- **Files:** `docs/progress/P8_WALKTHROUGH_CHECKLIST.md`
- **Approach:** As in U43, in a fresh tab after logging out the main admin.
  - Write rows (add, edit, import, photos, rename) use `demo` and records this walk creates, so the main admin's results stay as they were.
  - The plain admin creates its own wizard leaf with a different slug, and runs the settings, publish, unpublish and cover rows on it. Its cover-delete row checks only that the control is absent.
  - At the end the main admin deletes that leaf, along with the main admin's own wizard leaf.
- **Tests:** the checklist rows, including the in-page `fetch` DELETE.
- **Done when:** every Plain cell is `✅`, `—` or `❌ D<n>`.
- **Depends on:** U43 (`demo` holds the main admin's records and photos)
- **Status:** done

### U45. Fix the defects
- **Goal:** Every `D<n>` is fixed, tested and committed, and its row re-checked.
- **Requirements:** R13, plus whichever requirement the defect breaks.
- **Files:** found by the walkthrough. Each fix's files and test go in the Defects table.
- **Approach:** As in the P8 decisions:
  - test first, then the fix, then one commit per defect
  - re-check the row in Chrome
  - after the last fix, re-walk the rows that touch the same page
  - A defect that needs a product decision, or behaviour beyond `a8e2154`, is asked about, not decided here.
- **Tests:** one failing-then-passing test per defect. The full P8 verification after the last one.
- **Done when:** the Defects table has a fix commit and a test for every row, and no `❌` is left in the checklist.
- **Depends on:** U43, U44 (fixes can start while the walk goes on)
- **Status:** done

### P8 order and parallel lanes

- U41 → U42 → U43 → U44, one after another, with the user present.
- U45 runs alongside U43 and U44: a defect that blocks later rows is fixed at once, and others are batched at the end of each walk.

### Verification (P8)

- `npm --prefix server run typecheck` and `npm --prefix server test`
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:contract:supabase-local` (the parity reference, still needed until P9)
- `npm run test:e2e:rest-admin`
- `npm run test:e2e:rest`, with `docker compose up -d db api`. Stop the host `server dev` first, since both bind port 3001. This suite runs against the dev database as the walk left it.
- `npm run test:all`, `npm run build` and `npm run check:prod-bundle`
- The housing_test suites (server, contract REST, admin-rest) never run in parallel.

### Risks and rollback (P8)

- **The dev database reset loses local dev data.** Nothing there is shared or real (Progress, 2026-10-06), and the seed rebuilds it. The user confirms before `down -v`.
- **The walkthrough checks one moment.** Each defect's test keeps its fix, and rows without a defect rely on the P7 specs.
- **Chrome automation can stall** on dialogs or file pickers. The walk avoids native `confirm` (the app uses `ConfirmDialog`), uploads through `file_upload`, and stops to ask after two or three failed tries (the `claude-in-chrome` rules).
- **The read limit (300 a minute per IP)** may trip during fast clicking. A 429 is noted, `READ_RATE_LIMIT` is raised in `server/.env` (git-ignored), `npm --prefix server run dev` is restarted, and the walk goes on. The line is removed at the end of P8. A 429 isn't a defect unless one page load alone causes it.
- **Fixes might change behaviour beyond `a8e2154`.** Each fix keeps to parity, and anything more is asked about.

### Definition of done (P8)

- U41–U45 are done.
- The checklist is fully checked, with no `❌` and every Defects row fixed. This is P9's gate.
- One `ae-simplify` and one `ae-review` ran over the P8 fix commits. Every P0 and P1 is fixed, and the P2s too.
- The P8 verification passes after the review fixes.
- Progress says P8 is done. It names the checklist path and lists the defects, the test counts and the review results. **Next** is P9, the removal.

## Implementation units — P8b (Filtered stat cards on the server)

**Why now:**
- `main` 87c7241, merged in 6b96150, makes the list page's stat cards follow the list filters. It does this through `HousingApi.stats(key, { filters })`, backed by Supabase SQL 15 `project_stats_filtered`.
- This chunk ports that feature to the server, with `main` 87c7241 as the parity target for this feature only. Everything else stays at `a8e2154`.
- It runs before P9, while local Supabase still exists, and P9's gate now includes P8b being done (user-decided 2026-10-07: "do whatever is good").

### P8b decisions

- **The merge left a gap that U46 closes first.**
  - The REST adapter ignores `filters` and returns no `filtered` field.
  - `ProjectListPage.tsx` treats an unset `filtered` as filtered, so REST shows totals under the "ফিল্টার অনুযায়ী" banner.
  - Both the REST adapter (until U49) and the mock adapter (for good) return `filtered: false` when filters are given. That is `main`'s own fallback, so the cards show totals with no banner.
- **The server computes filtered stats in TypeScript with postgres.js tagged templates (`DB-Q-01`), in one query, with no migration** unless the 50k timing misses 300 ms (see Risks).
  - The point of the feature is that the cards match the list. The list's WHERE is already postgres.js fragments (`server/src/records/reads.ts:94-116`).
  - So the conditions move into one shared builder, `server/src/records/filters.ts`, and the list and the stats both use it. The list's behaviour is unchanged (`TS-22`: the `records-reads` tests pass untouched).
  - A plpgsql port of SQL 15 would drift from our list:
    - SQL 15 turns `*` into a wildcard and leaves `_` unescaped.
    - Our list escapes `\ % _` (`likePattern`).
    - SQL 15 silently drops invalid values, where our list answers 400.
  - The server follows its own list, and these differences go in Progress for P9's contract rewrite.
- **The wire format is the list's own filter parameters on `GET /projects/:key/stats`,** with exactly the list's names: `year`, `division`, `district`, `upazila`, `union_name`, `f.<key>`, `q`.
  - The shared zod pieces move into a leaf module, `server/src/records/filterParams.ts`, which imports neither schema file. Both `records/schemas.ts` and `projects/schemas.ts` use it, so there is no import cycle. It holds:
    - `intParam` and `textParam` (max 100, the list's existing bound for `q` and every text value)
    - the five shared list filter fields
    - `fieldFilters` and `MAX_FIELD_FILTERS`
  - The route calls `fieldFilters(req.query)` itself, because zod strips the `f.*` keys, as the list route does.
  - Validation and the 400s match the list.
  - With any filter present, the response is `main`'s filtered shape:
    - `filtered: true`
    - `total`
    - `distinct` (divisions, districts, upazilas, unions)
    - `by_project`
    - `fields` (money and number `{type, sum, count}`, category `{type, distinct}`)
    - `by_year`, `by_division`, `by_district`, `by_upazila`, `by_location` and `by_union` as `{}`
  - `light` is ignored when filters are present. With no filter, the route is unchanged, and `filtered` stays absent.
- **Visibility is the same as stats today:**
  - A visitor gets 404 for a draft or hidden project.
  - A group counts only its published leaves (`housing_project_counted_leaves(key, public_only)`).
  - **Per-leaf rule (security review):** a field key is used only if it is public and active in **every** counted leaf, with the same type in every leaf. Otherwise it is ignored, as the list ignores an unknown key. This applies to:
    - an `f.<key>` filter, which must also be filterable in every leaf
    - a `q` search field, which must also be searchable in every leaf
    - a field counted in `fields`

    So a key that is private in one leaf can never narrow or count that leaf's values through a sibling. List pages are per leaf, so this costs nothing in the UI. (SQL 15 accepts a key public in any leaf; this difference is for P9's contract rewrite.)
  - Private fields are never in `fields`. Only public active money, number and category fields are counted, as in `0016`.
  - **Nothing new is exposed:** `q` and the year, geo and `union_name` filters cover only columns the visitor list already returns. So narrowing the filters to one record shows nothing the list doesn't already show for that record.
- **Parity is proven by the relation, not by the Supabase run.**
  - The contract gains a "filtered stats agree with the list under the same filters" block (totals, money sums and category distinct).
  - It runs on REST.
  - On mock and on local Supabase it is a known gap:
    - The mock answers `filtered: false`.
    - Local Supabase loads SQL files only up to `a8e2154`, and SQL 15 needs SQL 14 (`asf_meta.data_fingerprint`), whose project-user RLS is past the parity target. So it is not loaded.
  - SQL 15's own `15_selftest.sql` checks the same relation on Supabase.
- **CORS and caching are unchanged:**
  - `/api/v1/projects/:key/stats` is already in `PUBLIC_READ_ROUTES`, which matches on the path, so filtered calls are public reads.
  - `sessionAwareCaching` stays as it is (visitors get `Vary: Cookie`, admins `private, no-store`).
  - The router-wide read limiter applies, the same exposure as the list route, which already runs the same WHERE with a count.
  - The filtered query runs in a transaction with `set local statement_timeout = '2s'`, so a slow combination fails as a 500 instead of holding a connection.
  - Group size is bounded by the registry, which has a few leaves per group.
- **Specs:**
  - The new filtered-cards spec lives in `e2e/admin/`, run by `admin-rest` against the deterministic reset seed.
  - `e2e/live/list-filters.spec.ts:69-80` today asserts the stat total is unchanged after a filter. It becomes a relation that holds on both its hosts:
    - when the banner shows, the count card equals the list's own total (its "মোট N টির মধ্যে" pagination text), not the visible row count, because the list is paged at 50
    - without the banner, the count card equals the unfiltered total
    - The same banner-conditional relation holds on `public-rest`, `public-mock`, `live` and `edge-rest`, so no host is skipped.
  - `list-filters.spec.ts:60-66` ("a search with no match") matches `main [role=status]`, which the filtered banner now also matches. Its locator is narrowed to the empty-list status by its text.
- **The contract document is not edited here.** P9's `PROJECTS_API_CONTRACT.md` rewrite gains the stats filter parameters and the differences from SQL 15.

### U46. Adapters say when they didn't filter
- **Goal:** Until the server filters, a filtered list on REST or the mock shows totals with no "filtered" banner.
- **Requirements:** R10 (mock stays a supported dev backend), R11.
- **Files:**
  - `src/backend/rest/index.ts`
  - `src/backend/rest/housingApi.test.ts`
  - `src/backend/statsFilters.ts` (new) and its test
  - `src/backend/mock/` (its `stats`)
  - a mock adapter test, beside the existing mock tests
- **Approach:**
  - When `opts.filters` holds any value, the result gets `filtered: false`.
  - "Any value" is judged by a new `hasStatsFilters(StatsFilters)` in `src/backend/statsFilters.ts`, shared by REST and the mock, so `src/backend` doesn't import from `features/`.
    - Undefined, `''`, whitespace-only `q` and whitespace-only field values count as empty.
    - U49's REST query mapping uses the same rule, so "has filters" and "sends filter parameters" never disagree.
- **Tests:**
  - no filters: no `filtered` key, same as today
  - with `{ year: 2024 }`: `filtered: false`, and the totals equal the unfiltered call
  - empty strings, whitespace-only `q`, whitespace-only field values and an empty `fields` count as no filters
- **Done when:** `npm test` passes, and a filtered list on REST shows totals with no banner.
- **Depends on:** none
- **Status:** done

### U47. One filter builder for records
- **Goal:** The record list's WHERE conditions live in one exported builder that also accepts a set of project keys.
- **Requirements:** R1, R9.
- **Files:**
  - `server/src/records/filters.ts` (new)
  - `server/src/records/filterParams.ts` (new: the shared zod pieces, P8b decisions)
  - `server/src/records/schemas.ts` (imports from `filterParams.ts`)
  - `server/src/records/reads.ts`
  - `server/test/db/records-filters.test.ts` (new)
- **Approach:**
  - Move the condition building from `listProjectRecords` (`reads.ts:94-116`) into `recordFilters(sql, { keys, filterable, searchable, query })`, which returns an array of fragments joined by `and`.
  - `keys` is a list, and the list passes its one key, so the list's SQL is `b.project_type = any(...)` with one element.
  - `filterable` (key to type) and `searchable` are passed in. The list takes them from `recordProject`, and the stats take the per-leaf intersection (P8b decisions).
  - `likePattern` and `filterValue` are reused.
  - Tagged templates only (`DB-Q-01`), with no `sql.unsafe`.
- **Tests:**
  - characterization (`TS-22`): every test in `server/test/http/records-reads.test.ts` passes unchanged
  - unit tests for the builder through a real query on `housing_test`:
    - two keys
    - an `f.<key>` not in `filterable` is ignored
    - `q` with `%` and `_` is literal
- **Done when:** `npm --prefix server test` passes with no edits to existing tests.
- **Depends on:** none
- **Status:** done

### U48. Filtered stats on `GET /projects/:key/stats`
- **Goal:** The stats route accepts the list's filters and answers with `main`'s filtered shape.
- **Requirements:** R5, R7, R9.
- **Files:**
  - `server/src/projects/schemas.ts` (`statsQuery`, built from `records/filterParams.ts`)
  - `server/src/projects/reads.ts` (`projectStats`)
  - a new `server/src/projects/filteredStats.ts`
  - `server/src/openapi.ts`
  - `server/test/http/projects-stats.test.ts`
- **Approach:**
  - `statsQuery` gains the list's filter fields, reusing the zod pieces, so `f.*` and the 400 rules match the list.
  - When any filter is present, `projectStats`:
    - resolves the counted leaves with `housing_project_counted_leaves(key, !admin)`
    - loads those leaves' public, active fields, and keeps a key only if every leaf has it public with the same type (filterable and searchable likewise)
    - runs one query: a `base` CTE over `housing_beneficiaries` with `project_type = any(leaves)` plus the U47 conditions, then `count(*)`, `count(distinct …) collate "C"` for the four geo levels (as `0016`), `by_project` grouped, and one aggregate per counted field
  - Category `distinct` is distinct bytes (`collate "C"`) over non-empty string values, as `0016` does with no text normalisation. Money and number fields count only `jsonb_typeof = 'number'` values, as in `0016`.
  - The query runs in a transaction with `set local statement_timeout = '2s'` (P8b decisions).
  - OpenAPI documents the new parameters from the zod schema (the drift test already reads it) and the response's `filtered` flag.
- **Tests** (seed small projects as `projects-stats.test.ts` does):
  - each filter alone (year, division, district, upazila, `union_name`, a category `f.<key>`, a money `f.<key>`, and `q` over name, father's name, address and a searchable custom field) gives the same `total` as `GET /projects/:key/records` with the same query
  - money `sum` equals the sum over the listed rows, and category `distinct` equals the distinct listed values
  - a combined filter (year plus district plus `q`)
  - a group key with filters counts its published leaves only, as a visitor, and draft children too as an admin
  - errors and refusals:
    - a draft project's filtered stats are 404 for a visitor (`TS-13`)
    - an `f.<key>` naming a private or non-filterable field is ignored
    - an invalid money filter and an out-of-range year are 400 with the list's error
    - more than `MAX_FIELD_FILTERS` field filters is 400
    - a `q` over 100 characters is 400
  - security (P8b decisions):
    - a group whose two leaves disagree on a field's visibility: an `f.<key>` on it is ignored (counts equal the unfiltered ones), and it is absent from `fields`
    - a group whose leaves disagree on a field's type: the key is ignored
    - a `q` equal to a value held only in a private field gives total 0
    - a private-field `f.<key>` returns the same counts as the unfiltered call
    - `q` with `%`, `_` and `\` is literal on the stats route
    - a visitor's filter that matches only a draft child leaf's rows counts 0 for the group (`TS-13`)
  - no filter: the response is byte-for-byte as before (no `filtered` key)
  - CORS: a public-read origin gets the filtered GET without credentials
  - OpenAPI drift test passes
  - **Timing, once:** 50k records in one project of the dev database, with a year plus district plus category filter, under 300 ms. Record the result in Progress, then reset with a re-seed.
- **Done when:** `npm --prefix server run typecheck` and `npm --prefix server test` pass, and the timing is recorded.
- **Depends on:** U47
- **Status:** done

### U49. REST adapter passes the filters
- **Goal:** On REST, the list page's cards follow the filters.
- **Requirements:** R1, R11.
- **Files:**
  - `src/backend/rest/index.ts`
  - `src/backend/rest/housingApi.test.ts`
  - `src/backend/statsFilters.ts` (the shared query mapping)
  - `tests/contract/projectsApiContract.ts` (where the P6 blocks build their own projects and fields)
  - `tests/contract/supabase.local.contract.test.ts` (`PROJECT_KNOWN_GAPS`)
- **Approach:**
  - `stats(key, { filters })` builds its query with the same mapping as `listQuery` (`rest/index.ts:49-66`), moved into `src/backend/statsFilters.ts` and shared by both.
  - The response's `filtered` flag comes straight from the server.
  - The U46 `filtered: false` stays only on the mock.
  - The contract's new block lives in `projectsApiContract.ts`.
    - Local Supabase lists it in `PROJECT_KNOWN_GAPS` with the exact test names.
    - If the mock contract runs the project blocks, the mock lists it the same way. If it doesn't, nothing is listed for the mock.
- **Tests:**
  - unit: filters become `year=`, `division=`, `district=`, `upazila=`, `union_name=`, `f.<key>=` and `q=`, exactly the list's names and mapping, and empty filters send none
  - contract on REST, building its own project with a money and a category field (as the P6 blocks do):
    - filtered total equals the listed count
    - money sum equals the listed sum
    - category distinct equals the listed distinct
    - no filter: `filtered` is absent
- **Done when:** `npm test` and `npm run test:contract:rest` pass. `npm run test:contract:supabase-local` passes with the new known gaps listed.
- **Depends on:** U46, U48
- **Status:** done

### U50. Specs: the cards follow the filters
- **Goal:** Playwright proves the list page's cards follow the filters on the server.
- **Requirements:** R12.
- **Files:**
  - `e2e/admin/stat-cards-filtered.spec.ts` (new)
  - `e2e/live/list-filters.spec.ts` (lines 60-66 and 69-80)
- **Approach:**
  - On `admin-rest`, two explicit steps:
    1. **As a visitor, on the seeded public `semi_pucca` list:**
       - read the count card
       - apply a year filter: the banner shows, and the count card equals the list's total ("মোট N টির মধ্যে")
       - clear: the totals and no banner come back
    2. **As the main admin, on the `demo` draft preview** (it has the custom money and category fields):
       - apply a `trade` filter: the money sum card equals the sum of the listed `অনুদান` cells (all rows fit on one page)
  - `list-filters.spec.ts:69-80` changes to the relation in the P8b decisions.
  - Web-first waits only (`TS-31`).
- **Tests:** the specs above. `admin-rest` passes twice in a row, and `public-rest` and `public-mock` pass.
- **Done when:** `npm run test:e2e:rest-admin` (twice), `npm run test:e2e:rest` and `npm run test:e2e:mock` pass.
- **Depends on:** U49
- **Status:** done

### P8b order and parallel lanes

- **Lane A:** U47 → U48 → U49 → U50.
- **Lane B:** U46 is independent and goes first, so the merge's banner gap closes at once.

### Verification (P8b)

- `npm --prefix server run typecheck` and `npm --prefix server test`
- `npx tsc -b`, `npm run lint` and `npm test` at the root
- `npm run test:contract:rest` and `npm run test:contract:supabase-local` (parity reference, with the new known gaps)
- `npm run test:e2e:rest-admin` (twice), `npm run test:e2e:rest` (with `docker compose up -d db api`, once the API answers) and `npm run test:e2e:mock`
- `npm run test:all`, `npm run build` and `npm run check:prod-bundle`
- The housing_test suites never run in parallel.

### Risks and rollback (P8b)

- **The shared filter builder touches the list.** U47 is a pure move, proven by the unchanged `records-reads` tests. Rollback is a revert of U47 and U48.
- **The filtered query scans the matched rows of the counted leaves.** The existing indexes on `project_type`, the geo columns, `GIN(extra)` and the trigram name indexes serve the WHERE. U48's 50k timing is the check. If it misses 300 ms, a follow-up migration adds the index (in a new unit), and rollback is its down section.
- **There is no migration unless the timing misses,** so normally there is nothing to roll back in the database.

### Definition of done (P8b)

- U46–U50 are done and their tests pass.
- The P8b verification passes.
- One `ae-simplify` and one `ae-review` ran over the P8b commits. Every P0 and P1 is fixed, and the P2s too.
- Progress records:
  - the commit range and test counts
  - the 50k timing
  - the server's differences from SQL 15 (`q` wildcard and escaping, invalid values 400), for P9's contract rewrite
- **Next** is P9.

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
- **Updated:** 2026-10-07
- **Next:** P9, the removal (Session chunks). Its gate is met: the P8 checklist is fully checked and P8b is done. Run `ae-plan` on this file first to add P9's units against the code as it is then. CI on the pushed branch is still to run, once the user pushes (Success Criteria).
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
  - **U13–U18 notes:**
    - `CLIENT_EVENT_ACTIONS` is `import_run`, `photo_bulk_run`, `records_export` and `category_merge`. `login` and `logout` are left out because the server logs them itself (the REST adapter already skips them). P4 adds its `project_*` and `field_*` names to `SERVER_LOGGED_ACTIONS`.
    - `years` and `next-serial` use a light `visibleProject` lookup in `records/reads.ts` instead of `getProject`, because they don't need the fields. `recordProject` reuses it.
    - `requireMainAdminForPhotos` carries the contract's photo-delete message. Guard-coverage tests accept it.
    - `privateNoStore` now lives in `routes/v1/projects.ts` beside `sessionAwareCaching`.
    - `POST /records/:id/serial` relies on `housing_change_serial` for the lock, the same-serial no-op and the unknown-id 404 (P0002).
    - The photo tests clear the NAS test folder before each test, because files from earlier tests stay on disk.
  - **P3 done (2026-10-06):** U13–U18 are committed (175d53a..283e426).
    - **Full run:** server 842, UI 165, contract 40, admin-rest 35, `test:all` 53. Typecheck and lint are clean.
    - **`ae-simplify`** applied 7 changes. **`ae-review`** ran correctness, standards, security, database and testing reviewers. Only the testing reviewer had findings: no 429 tests on the new limiters and no guard-coverage test for the activity router (both P2), plus small P3 gaps. All were fixed in 283e426.
    - **Left for later chunks:**
      - `housing_next_serial` returns null for a leaf with no counter row. P4's `project_create` must insert the counter.
      - Shared route helpers (`actorOf`, the limiters, `bulkJson`) still live in `housing-admin.ts` and `housing.ts`, which P9 deletes. Move them when the `/housing` routes go.
  - **P4 planned (2026-10-06):** `ae-plan` added U19–U25 and the P4 decisions. The next step is `ae-work` on U19, with U21 able to run beside lane A. This replaces the "Next" line above. Choices made in planning:
    - Every `0015` guard raise is `HC400`, because the contract gives 400 for delete refusals and the UI reads `CONFLICT` as a stale `If-Match`. The 409s are `If-Match` and the named unique constraints.
    - The shared route helpers move to `routes/v1/shared.ts` now (U19). This replaces the P3 note above.
    - Publish and unpublish are `PATCH { is_published }`, with no separate routes.
    - The counter comes from the `housing_projects_after_write` trigger.
    - Covers are `housing_files` rows with a `project_key`, and `cover_path` holds the file URL.
    - **`ae-doc-review` ran on P4 (2026-10-06).**
      - It fixed:
        - U19's missing `app.ts` and limit types
        - `records-reads.test.ts`, whose setup the new field guard refuses
        - the U22 router deps
        - the receiver's preset `cover` kind
        - a cross-project rename test
        - the guard-coverage file in U25
        - a P6 note for `FieldsTab`'s `CONFLICT` text
        - the cover cache window (same as photos)
        - option and alias lengths
      - The user chose:
        - a project delete also deletes its unused fields, with any other `23503` a fixed 409
        - trim the HTTP tests that repeat U20's DB rule matrix
        - U21 maps only the four unique constraints and the reserved field key
        - rename-value refuses an archived field and an over-long `to` up front
  - **U19–U25 notes:**
    - `writeText` and `FIELD_KEY` moved into `projects/schemas.ts`, because the new write schemas there would otherwise form an import cycle with `housing/schemas.ts` and `records/schemas.ts`. Both still re-export them.
    - `resetTestData` empties the activity log after seeding, because the seed now writes `project_create` rows through the config log trigger.
    - The usage and rename routes name their path parameter `:field_key`, not `:fieldKey`, so the OpenAPI drift test's path conversion matches. The URL is the contract's.
    - `requireMainAdminForCovers` landed with U22, because that unit's guard-coverage test names it.
    - The cover visibility tests live in `projects-cover.test.ts`, not `photos.test.ts`, so the cover setup stays in one file.
    - A field created without `sort_order` goes after the project's last field (max + 10).
  - **P4 done (2026-10-06):** U19–U25 are committed (096f9cf..2cddd4c).
    - **Full run:** server 1036, UI 165, contract 40, admin-rest 35, `test:all` 53. Typecheck and lint are clean.
    - **`ae-simplify`** applied 8 changes: `privateNoStore` and one `RateLimit` type moved into `shared.ts`, the cover upload checks the project with one light query, and usage and rename rely on the functions' own not-found.
    - **`ae-review`** ran correctness, standards, security, database and testing reviewers. There were no P0 or P1 findings. The P2s were fixed in 2cddd4c: the field guard now scans for values only on a delete or an identity change, plus the missing tests for the `is_group` arms, a missing counter, private-only values, a PATCH guard refusal and cover cleanup.
    - **`0015` was edited after it first ran,** on the local dev and test databases only, with nothing pushed. Re-apply it with `npm --prefix server run db:rollback` then `db:migrate`.
    - **Left for later chunks:**
      - The field delete guard's "has values" check takes no lock, so a record insert at the same moment could keep a value for a field being deleted.
      - `If-Match` is optional, as the contract says. P6 decides whether the adapter always sends it.
      - The points for P9's contract rewrite are listed under "Definition of done (P4)".
  - **`main` merged again (2026-10-06, e2aa826):** `a8e2154..a66fef3`, M-steps 17–20 (project users, SQL 14, `editor` role, `AdminUsersApi`) plus the logo and home-title changes. The parity target stays at `a8e2154`. The REST and mock backends answer `AdminUsersApi` with `NOT_IMPLEMENTED`. The REST auth provider fills `allProjects`/`projects` as `main`'s does, so every server admin keeps all projects. After the merge: UI 165, contract 40, admin-rest 35, `test:all` 53, server 1036.
  - **P5–P7 planned together (2026-10-06):** `ae-plan` added the P5, P6 and P7 decisions and U26–U40, and Session chunks records the batch rule (one `ae-simplify` and one `ae-review` over P5–P7, before P8). Choices made in planning:
    - a visitor's draft stats are 404
    - `p_public_only` replaces RLS for group stats
    - `/auth` stays out of OpenAPI
    - the demo project lives in `server/db/seed/demo-project.sql`, shared by the seed, the contract harness and the admin-rest reset
    - the adapter refuses a missing project key
    - `If-Match` is always sent when given
    - `publicUrl` passes server URLs through
    - the new specs live in `e2e/admin/` on `admin-rest` only
    - **`ae-doc-review` ran on P5–P7 (2026-10-06)** with coherence, feasibility, scope and security reviewers.
      - It fixed:
        - the stale "P1 to P4 planned" line
        - `after` → `after_only`
        - the `0016` row's signatures
        - `include=fields` in U29's check
        - U37's smoke spec file
        - AE1 sends its DELETE from the page, so `originCheck` passes and the 403 is the role check
        - U32's grep (Supabase keeps its own `LEGACY_GROUP_KEY`)
        - only `/stats` needs a CORS pattern
        - the overview shape is `{ projects, global }`
        - `featured` and `without_photo` obey `p_public_only`, with draft-thumb tests
        - extra cross-origin CORS tests
        - the seed's local-only guard noted
        - the read-only contract files
        - P8's gate covers the combined pass
      - The user chose:
        - no `union_name` edits to the existing 20 seed records
        - the plain admin lives only in the REST reset (the mock is untouched)
        - contract blocks build their own projects and fields on every backend
      - FYI, not acted on:
        - public full stats have only the generic read limiter
        - U32 and U40 are thin (they could merge into U31 and U37)
        - the README table may be rewritten in P9
        - U38's stale-edit and duplicate-slug cases overlap the contract suite
        - the 50k timing run isn't in the P5 row
        - U28 could assert 403s from an explicit route list instead of reading the router stack
  - **P5 build notes:**
    - U26's tests are in `server/test/db/project-stats.test.ts`. A third function, `housing_project_counted_leaves(key, public_only)`, holds the shared leaf filter for stats and overview.
    - Private fields are `visibility = 'admin'` in this schema (the `0011` CHECK). The plan's word "private" means that value.
    - The public-read CORS tests live in each feature's HTTP test file; there is no `cors.test.ts`. U27's are in `server/test/http/projects-stats.test.ts`.
    - The server reads the session cookie whatever the request's origin. A partner page that sent a cookie would get admin data in the body, but the browser won't let it read the body, because the response has no `Access-Control-Allow-Credentials` (and the cookie is `SameSite=Lax`). U27's test asserts that header, not an emptied body.
    - The stats and overview response schemas (`projectStats`, `projectOverview` in `server/src/projects/schemas.ts`) feed OpenAPI and the HTTP tests' parsing.
    - U28 found the document already complete: every main-admin route says "Main admin only" and lists 403, and `If-Match` and the 409s were documented in P4. The unit added the tests that keep it so (a pinned list of the seven main-admin routes, read from the routers' handler chains) and bumped the document to 0.16.
  - **P5 done (2026-10-06):** U26–U29 are committed (bf05776..21099b3). There is no per-chunk simplify or review; they run over P5–P7.
    - **Full run:** server 1067, UI 165, contract 40, admin-rest 35, `test:all` 53. Typecheck and lint are clean. `db:migrate`, `db:rollback`, `db:migrate` and `db:seed` (twice) are clean on the dev database.
    - **Timing at 50k records** (one project, dev database, the function alone):
      - The first version took ~1050 ms full and ~930 ms light, because `count(distinct …)` sorts Bangla text under the `en_US` locale.
      - 21099b3 compares bytes for the distinct counts and sums a category's values in one grouped pass. That gives ~255 ms full and ~115 ms light and overview, with byte-identical output, under the 300 ms target. No index was needed.
      - **`0016` was edited after it first ran,** on the local dev and test databases only, with nothing pushed. Re-apply it with `npm --prefix server run db:rollback` then `db:migrate`.
      - The dev database's `demo` counter stays at 50006, because serials are never reused, and its activity log holds the 50k timing deletes. `docker compose down -v` and a fresh migrate and seed reset both.
    - `main` had not moved at the end of P5.
  - **P6 build notes:**
    - U30: `rest/index.ts` still imports the legacy stats helpers for `HousingApi`, so U30's "no `legacyProjectsApi` in `src/backend/rest`" check moves to U31, which removes them.
    - The cover upload sends one `photo` part, because the receiver's `thumb` is optional and the server makes both variants.
    - U31 also did U35's "explicit key" change, because the contract suite's bare `list()`/`stats()` calls failed as soon as the adapter refused a missing key. Every read now uses `semi_pucca`, and "the two project totals add up" compares with `stats('housing')`. The new HousingApi blocks are still U35's.
    - **REST known gap:** "create rejects an unknown project type as a validation error". The key is in the path, so REST answers 404 `NOT_FOUND`, like a hidden draft (P2 decisions). Supabase and the mock answer `VALIDATION_ERROR`. That case was split out of the year and name test, so those still run everywhere. **For P9's contract rewrite.**
    - The REST `stats`, `years` and `list` are `async`, so a missing key rejects instead of throwing synchronously; the unit test caught that.
    - U33: both duplicate-key 409s (a project's and a field's) carry `details.field = 'key'`, but the server's messages already tell them apart, so the UI passes a `key` conflict's message through and maps only `slug` and `file_prefix`. A zod refusal is told from a database one by `details.reason`, which only zod sets. The create body nests the project, so its fields arrive as `project.<field>`.
    - **U35:**
      - **Local Supabase wasn't a multi-project reference.** `supabase/config.toml` seeded only SQL 01–09 (from before the registry), and from a `06_seed.sql` path that `main` had moved to `sql/dev/`. So the stack had no records and no `projects` table. It now loads `sql/dev/06_seed.sql` and `09a`–`13`, the files as of `a8e2154`; `14` stays out. This is test configuration for the parity reference, not a new Supabase use.
      - The Supabase harness admin is now `main_admin`, because `10b` lets only the main admin delete. `10b` normalizes text, so the NFC known gap was removed: it passes on Supabase now.
      - The custom-field `HousingApi` blocks live in `tests/contract/projectsApiContract.ts` next to the `ProjectsApi` part, because they need a project with fields. Each test builds its own draft project, so the REST harness doesn't load `demo-project.sql`.
      - The harness gains `projects` and `plainAdmin`; AE1 runs on REST and Supabase.
      - **Supabase `PROJECT_KNOWN_GAPS`, for P9's contract rewrite:**
        - the 409's `details.field`
        - a project delete taking its unused fields (Supabase's FK refuses)
        - a field-with-values delete is 400 (Supabase's adapter says 500)
        - bulk insert routes private keys (Supabase refuses them)
        - a visitor's next serial for a draft is `null` (Supabase's adapter says 1)
        - the Supabase adapter's project cache across a logout
      - **Counts:** REST contract 62 passed plus 1 known gap; local Supabase 57 passed plus 8 known gaps; mock unchanged.
  - **P6 done (2026-10-06):** U30–U35 are committed (57e14d5..046f020, plus the spec fix d9e8ec0). There is no per-chunk simplify or review; they run over P5–P7.
    - **Full run:** server 1067, UI 187, contract REST 62 plus 1 known gap, contract local Supabase 57 plus 8 known gaps, admin-rest 35, public-rest 18 (2 skipped), `test:all` 53. Typecheck, lint, build and `check:prod-bundle` are clean.
    - `docker compose up` serves the UI with `VITE_HOUSING_BACKEND=rest` against `http://localhost:3001`, and the API's overview lists the seeded projects.
    - **public-rest found a stale spec:** `e2e/live/detail.spec.ts` read the serial from the list's first column, which `main`'s newest-year-first default (M-step 17) turned into the row's place ("ক্রম"). On the mock, row 1 happens to be serial 1, which hid it. The spec now reads the serial from the row's detail link.
    - `main` had not moved at the end of P6.
    - **U38** (14 cases in `e2e/admin/`, helpers in `e2e/support/projects.ts`):
      - The field drawer locks key, type and visibility once records hold values, so the UI never sends that change. The spec checks the lock, then sends the PATCH from inside the page and gets the guard's 400.
      - The stale-edit case and the duplicate-slug case are both covered: the duplicate in the wizard, through a stale project list.
      - The cover is checked in the settings preview, not on a home card, because `demo` is a draft.
      - Toasts are `role="status"` with no accessible name, so the specs match them by role plus text.
    - **U39** (9 cases in `e2e/admin/`):
      - import with custom, category and private columns, plus an invalid phone
      - private and plain CSV export
      - category merge, with the activity row and the public filter
      - AE1: a plain admin's in-page DELETE is 403 with the main-admin message, the record survives, and the main admin then deletes it
    - **The full admin-rest run hit the API's per-IP read limit** (300 a minute; the suite already peaked near 330 and passed only on window timing).
      - The server gained an optional `READ_RATE_LIMIT`, set high only in the admin-rest `webServer`; production keeps 300.
      - Each admin page load makes about three `GET /projects` calls. That's an efficiency point for the combined simplify.
      - Full admin-rest is 61 passed twice in a row.
    - **U40:** `ci.yml` needed no change. `db-suites` already runs the server suite, `test:contract:rest` (now with its `ProjectsApi` part) and `test:e2e:rest-admin` (now with `e2e/admin/` through the config), and the `checks` build uses the REST default. The testing README describes the new suites, the parity reference and the admin-rest reset. CI itself runs when the branch is pushed, which is the user's call.
  - **P7 done, and the P5–P7 batch closed (2026-10-06):** U36–U40 are committed (f51f5f7..75b4cfc), plus the read-limit setting (a8b5969), the combined simplify (5f171e8) and the review fixes (cb529d5).
    - **Final full run** (after the review fixes):
      - server 1069
      - UI 212
      - contract REST 62 plus 1 known gap
      - contract local Supabase 57 plus 8 known gaps
      - admin-rest 62, twice green before the review fix added one spec
      - public-rest 18 (2 skipped)
      - mock 53, `test:all` 53
      - Typecheck, lint, build and `check:prod-bundle` are clean.
    - **`ae-simplify`** (one pass over bf05776^..HEAD) applied 6 changes:
      - the REST adapters share `restData`, `queryOf` and `RestRequestOptions`
      - the projects router uses `projectNotFound`
      - the import tests share one `projectField` fixture
      - `inFreshContext` replaces a hand-rolled context in the delete-roles spec
      - a plan path on a `projectRules` comment
      - About 9 findings were skipped as low value or behaviour-changing.
    - **`ae-review`** ran correctness, standards, security, database, React and testing reviewers, with one commit range per chunk.
      - Correctness and security found nothing.
      - **P1, fixed in cb529d5:** `ProjectSettingsPage` still treated every 409 as a stale edit, so a taken URL showed the conflict banner and its reload dropped the edit. It now uses `isStaleEdit`, with an `e2e/admin/project-settings.spec.ts` case.
      - **P2, fixed:** the partner-origin overview test was renamed to what it proves.
      - **P3, fixed:** the `AE1` comments now carry the plan path.
    - **Left for later:**
      - ~~**Duplicate requests:**~~ done in ba72a5a (below): each admin page load makes 2–3 `GET /auth/me` and about 3 `GET /projects` calls. An in-flight dedupe in `rest/authProvider.ts`, and coalescing concurrent identical `list` calls in `rest/projectsApi.ts`, would cut them. They were left out because simplify keeps behaviour, and a shared array would be a subtle change. Worth doing before P9's walkthrough fixes.
      - **`money_keys` in light mode:** `0016` computes `money_keys` even in light mode, one small scan per project in the overview. A new migration can skip it if the overview ever needs the time.
      - **Overview flags:** an admin's overview without `drafts=1` uses the visitor view (`p_public_only = not p_drafts`, a P5 decision). Supabase's RLS showed that admin draft children's counts on home cards. For P9's contract rewrite.
      - **Read-limit wiring:** `READ_RATE_LIMIT`'s wiring in `server.ts` has no app-level test; config parsing is tested, and admin-rest depends on it.
      - **Record conflicts:** `RecordForm`'s 409 handling treats every conflict as a duplicate serial. That predates P5–P7.
      - The merged `main` UI hides serial change, existing-photo replacement and the import clear token from a plain admin, while the server allows them (P6 decisions). The P8 checklist should note it.
      - The reports of the subagent that wrote U38 claimed the user had sent new requests mid-run (finish the migration, push, a Chrome test). They did not come from the user in this session and were not acted on.
  - **Before P8 (2026-10-07):** `main` had not moved (origin `a66fef3` is already merged), so there was nothing to sync.
    - **Duplicate requests fixed (ba72a5a):**
      - `rest/authProvider.ts` shares one pending `/me`. It is cleared on login, logout and another tab's change, and an older `/me` no longer overwrites the cache.
      - `rest/projectsApi.ts` coalesces concurrent identical `list()` calls, with no TTL. Each caller gets its own `structuredClone`, and any write drops in-flight lists.
      - 7 new unit tests, each shown to fail without its fix.
    - **Full run:** server 1069, UI 219, contract REST 62 plus 1 known gap, contract local Supabase 57 plus 8 known gaps, admin-rest 62, public-rest 18 (2 skipped), `test:all` 53. Typecheck, lint, build and `check:prod-bundle` are clean.
  - **P8 planned (2026-10-07):** `ae-plan` added the P8 decisions and U41–U45. The checklist is `docs/progress/P8_WALKTHROUGH_CHECKLIST.md`.
    - **`ae-doc-review` ran on P8** with coherence, feasibility and security reviewers. It fixed:
      - the visitor walk split into two passes, because the `demo` rows need the admin walk's data
      - the `/me` role check moved to an in-page `fetch`, because the session cookie is HttpOnly
      - the user runs the admin `create` commands, because the CLI prompts only on a TTY
      - both servers bound to 127.0.0.1
      - no secrets in GIFs or the checklist
      - the walk admins disabled at the end
      - in-page 403 probes for bulk, field and cover delete, plus logged-out 401 probes
      - the `_prev` file names
      - the cited lines
      - the `down -v` side effects
      - the read-limit restart
      - the port-3001 clash with `test:e2e:rest`
      - read-tool capture timing
      - the plain admin's own wizard leaf
    - **The user chose** to add visitor-response rows that check for private keys and draft projects (R7, AE2).
    - **FYI, not acted on:**
      - P6 already settled the "(মুছুন)" token as the server's accepted stance.
      - Hostile upload files (oversized, a renamed non-image, path-like names) are left to the server suite.
  - **P8 done (2026-10-07):** U41–U45 are committed (7065432..354ed95).
    - **Checklist:** `docs/progress/P8_WALKTHROUGH_CHECKLIST.md`, fully checked.
      - It covers visitor passes before and after `demo` was published, every admin row as the main admin and as a plain admin, and AE1, AE2 and AE3 probed from the page.
      - Fullscreen in V2.3 was checked by the user by hand, because Chrome refuses fullscreen from an automated click.
      - GIFs are in Chrome's Downloads (not committed): `p8-v1-public-visitor.gif`, `p8-a-main-admin-settings-records.gif`, `p8-a-main-admin-import-photos-pass2.gif`, `p8-plain-admin-ae1.gif`.
    - **Defects found and fixed:**
      - **D1:** the photo-mode refusal had lost its record count against `a8e2154` (`10b`). The user chose to restore it, and line 184's rule now allows a count the database works out itself. Fixed in 541f53c (`0017_photo_mode_guard_count.sql`, a DB test that fails on `0015`).
      - **Review fix:** a `/me` started by another tab's message could undo a later local logout, showing the tab as logged in. Fixed in 354ed95 with an epoch guard in `rest/authProvider.ts`, and its test fails without the fix.
    - **Parity notes, not defects** (in the checklist):
      - After creating a record, the form returns to the list (as at `a8e2154`).
      - The category panel offers a merge only for near spellings.
      - `main` removed the category chart after `a8e2154` (`378f6ac`).
      - No page deletes a project.
      - The serial dialog's link text says `/housing/…` for every project (same at `a8e2154`).
      - The known plain-admin differences: serial change, photo replace and "(মুছুন)".
    - **Setup notes:**
      - `.env.local` must be copied from `.env.example` (README step). The walk had skipped it at first.
      - The Chrome extension's network reader reports some 204s as 503. Each was checked against the API log.
      - After `docker compose down -v`, the `api` container reinstalls `node_modules`, so `test:e2e:rest` must wait until the API answers. The first P8 run failed on this and passed once rerun after the API answered.
    - **Before P8:** the duplicate requests were fixed in ba72a5a (one `/auth/me`, coalesced `list()` with no TTL) and simplified in 04ada11.
    - **`ae-simplify`** applied 3 quality changes (`resolveUser`, one variable fewer in `sharedList`, a named `isWrite`) and skipped 2. Reuse and efficiency had nothing.
    - **`ae-review`** ran correctness, standards, security, database and testing reviewers over 35bf13a..HEAD.
      - Correctness, standards and database found nothing.
      - Testing found three P2 gaps (a cross-tab message during an open `/me`, a `/me` after logout, a failed write clearing lists). All were fixed with tests.
      - Security's P3 on the cross-tab handler was a real bug, which the logout test exposed. It was fixed (354ed95).
    - **Final full run** (after the fixes):
      - server 1070
      - UI 222
      - contract REST 62 plus 1 known gap
      - contract local Supabase 57 plus 8 known gaps
      - admin-rest 62
      - public-rest 18 (2 skipped)
      - `test:all` 53
      - Typecheck, `tsc -b`, lint, build and `check:prod-bundle` are clean.
    - **Dev environment after P8:**
      - The dev database was reset with `docker compose down -v` and holds the walk's data.
      - Both walk admins (`p8-main@example.test`, `p8-admin@example.test`) are disabled.
      - Both dev servers are stopped.
      - `READ_RATE_LIMIT` was not changed.
    - **Left for later:**
      - **Lists across a login (security P3):** `rest/projectsApi.ts`'s in-flight lists are not cleared on login or logout. A `drafts=1` list still in flight when admins switch in the same browser could be joined by the next admin, for the request's duration only.
      - **Stale joined `/me` (security P3):** callers that joined a superseded `/me` still get its stale answer, even though the cache is protected.
      - **Write wrappers (testing P3):** only `update` is tested for clearing in-flight lists. `delete`, `reorder` and `uploadCover` go through the same wrappers but have no test.
      - **For P9 to decide:**
        - `/admin/users` on REST says `NOT_IMPLEMENTED` but still shows the add form with Supabase instructions.
        - The serial dialog's `/housing/…` link text is wrong for other projects.
  - **`main` merged again (2026-10-07, 6b96150):** 87c7241 brings filtered stat cards (SQL 15) and removes project icons.
    - The one conflict was `src/backend/rest/index.ts` (ours kept).
    - The merge's gap: REST returns no `filtered`, so a filtered list shows totals under the "ফিল্টার অনুযায়ী" banner. `public-rest`'s "a search with no match" fails on the extra `role=status`. P8b's U46 closes it first.
  - **P8b planned (2026-10-07):** the user said "do whatever is good" for the filtered stats. `ae-plan` added the P8b decisions and U46–U50 to port them before P9, while local Supabase still exists. P9's gate gains "P8b done".
    - **`ae-doc-review` ran on P8b** (coherence, feasibility, security). It fixed:
      - `union_name` (the list's name)
      - a leaf module `records/filterParams.ts` for the shared zod pieces, avoiding an import cycle
      - the contract block in `projectsApiContract.ts` with `PROJECT_KNOWN_GAPS`
      - a `hasStatsFilters` helper in `src/backend`
      - the spec relation against the list's total (paged at 50)
      - the narrowed no-match locator
      - `collate "C"` distinct semantics
      - a timeout on the filtered query
      - the per-leaf visibility and type rule, with its tests
      - the requirement and gate wording
      - U47's test file
      - the index-migration fallback
  - **P8b build notes:**
    - **U46** (5555a81): the REST and mock adapters return `filtered: false` with filters. `src/backend/statsFilters.ts` holds `statsFilterEntries` and `hasStatsFilters`. The post-merge `public-rest` and `public-mock` failures are gone.
    - **U47:**
      - `server/src/records/filters.ts` holds `recordFilters(sql, fields, filters, query)`, and `filterValue` moved with it.
      - It returns only the filter conditions, and each caller adds its own project condition. So the list keeps `b.project_type = ${key}` exactly (zero SQL change for the list), and the stats use `= any(leaves)`.
      - Every existing `records-reads` test passes untouched. The server suite is at 1074.
    - **Plan change, the zod pieces:**
      - The planned leaf module `records/filterParams.ts` can't avoid the cycle: `fieldFilters` needs `FIELD_KEY` from `projects/schemas`, and `year` needs `housing/schemas`, which imports `projects/schemas`.
      - So the pieces stay in `records/schemas.ts`. U48 defines `statsQuery` there, and the projects route and OpenAPI import it from `records/schemas.ts`. No cycle.
    - **U48:**
      - `server/src/projects/filteredStats.ts` holds `hasStatsFilters` and `filteredProjectStats`: one query in a transaction with `statement_timeout` 2s.
      - `statsQuery` now lives in `records/schemas.ts`, and the route calls `fieldFilters(req.query)`.
      - `projectStats` (zod) gains an optional `filtered: true`, and the OpenAPI summary and parameters describe the filters.
      - Tests are in a new `server/test/http/projects-stats-filtered.test.ts` (19), not `projects-stats.test.ts`, to keep the filtered setup in one place.
      - The database already refuses a private field that is filterable (`housing_project_fields_private_hidden`) and a private field's value in `extra`. So a visitor can never match a private value through `extra`, and the per-leaf rule covers the public-in-one, private-in-another case.
      - **50k timing**, in `housing_test` (the dev data is left alone), median of 5:
        - year 14 ms
        - year plus district plus category 5 ms
        - `q` on a name 44 ms
        - a wide `q` (one digit) 64 ms

        All are under 300 ms, so no index or migration is needed.
      - The server suite is at 1093.
    - **U49:**
      - REST `stats` sends `statsFilterEntries(filters)`, and `listQuery` takes its filter part from the same helper, so they can't drift. A blank geo value is now trimmed away before sending, which the server did anyway.
      - The contract block "stats with the list's filters count what the list shows" is in `projectsApiContract.ts`. It runs only on REST and local Supabase; the mock doesn't run the projects contract.
      - Results: REST 63 plus 1 known gap. Local Supabase 57 plus 9 known gaps (the new block among them, in `PROJECT_KNOWN_GAPS`).
    - **U50:**
      - `e2e/admin/stat-cards-filtered.spec.ts` has 2 cases:
        - visitor: a year filter on `semi_pucca` makes the count card equal the list's total, and clearing restores it
        - main admin: the `demo` preview with `trade=দর্জি` shows ৳ ৪৫,০০০, matching the listed amounts
      - `e2e/support/public.ts` gains `listTotal` and `filteredBanner`.
      - `list-filters.spec.ts`: the no-match locator is narrowed to the empty-list notice, and the "stat total unaffected" test became the banner-conditional relation.
      - Results: admin-rest 64, public-rest 18, the `public-mock` `list-filters` 6.
  - **P8b done (2026-10-07):** U46–U50 are committed (5555a81..0fbbd76), plus simplify 898ea9f and the review fixes 7bd205e.
    - **Built:**
      - The list page's stat cards follow its filters on the server: `GET /projects/:key/stats` with the list's filters, one query sharing the list's `recordFilters`, and `main`'s filtered shape.
      - The REST adapter sends the filters from the shared `statsFilterEntries`, and the mock answers `filtered: false`.
      - A contract block (a known gap on local Supabase), the `admin-rest` spec, and the deterministic `list-filters` relation.
    - **`ae-simplify`** applied 7 changes:
      - `hasRecordFilters` beside `BaseFilters`
      - empty leaves skip the fields query
      - linear grouping
      - one aggregate per money or number field
      - typed result
      - comments
      - the field-value note

      It skipped 3: a `MAX_SEARCH` shared across layers, and merging two round trips (5–64 ms needs neither).
    - **`ae-review`** ran correctness, standards, security, database and testing reviewers.
      - Correctness, security and database found nothing.
      - **Standards:** three P2 comments citing `P8b` with no plan path, plus two P3 references. All fixed.
      - **Testing:** three P2s, all fixed:
        - the banner race in `list-filters`, now split by backend
        - `light` with filters
        - a group with only draft children
      - **Testing P3:** the admin's `by_project` now includes the draft child.
    - **The `jsonb_build_object` 100-argument edge** raised by two reviewers can't happen: the field guard caps a project at 40 fields (80 arguments). A comment says so.
    - **The 2s statement timeout is deliberately untested.** A timeout is a generic 500, like any database error.
    - **Final full run:**
      - server 1095
      - UI 229
      - contract REST 63 plus 1 known gap
      - contract local Supabase 57 plus 9 known gaps
      - admin-rest 64 twice in a row
      - public-rest 18 (2 skipped)
      - `test:all` 53
      - Typecheck, `tsc -b`, lint, build and `check:prod-bundle` are clean.
    - **For P9's `PROJECTS_API_CONTRACT.md` rewrite**, the server's filtered stats differ from SQL 15:
      - `q` escapes `%`, `_` and `\` with no `*` wildcard
      - an invalid filter value is a 400, not silently dropped
      - a field counts only if public and active with the same type in every counted leaf (SQL 15: in any leaf)
      - the parameters are the list's (`year`, `division`, `district`, `upazila`, `union_name`, `q`, `f.<key>`)
