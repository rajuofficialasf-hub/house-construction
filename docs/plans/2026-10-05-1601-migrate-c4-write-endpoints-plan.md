---
title: C4 Write Endpoints
type: migrate
status: in-progress
source: plan
date: 2026-10-05
doc_review: 2026-10-05
---

# C4 Write Endpoints

Chunk C4 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R5". It builds on the C1 plan (`docs/plans/2026-10-05-1215-migrate-c1-server-skeleton-db-port-plan.md`), the C2 plan (`docs/plans/2026-10-05-1246-migrate-c2-admin-login-plan.md`) and the C3 plan (`docs/plans/2026-10-05-1352-migrate-c3-read-endpoints-plan.md`). The contract is `docs/api/API_CONTRACT.md` (v0.11 now, v0.12 after this chunk).

## Goal
A logged-in admin can create, edit, delete and renumber records, import and update from a sheet, and read the activity log through the new API, with the same results as on Supabase. The admin site works end to end with `VITE_HOUSING_BACKEND=rest`, except photos (C5).

## Problem
The REST adapter's writes and activity calls still throw `NOT_IMPLEMENTED`. C6 (deploy) and C7 (cutover) need a complete API. The shared contract suite and the admin Playwright specs have never run against the real server.

## Requirements
- **R1** `POST /housing`, `PUT /housing/:id`, `DELETE /housing/:id` and `POST /housing/:id/serial` behave as contract §4.5খ and §4.6–§4.8 say: 201, 200 or 204 on success, 400 for invalid input, 404 for an unknown id, and 409 for a serial already in use (roadmap R1).
- **R2** `POST /housing/bulk` inserts 1–500 rows all-or-nothing, and `PUT /housing/bulk` updates by serial and reports unknown serials in `missing`. More than 500 rows is a 413 (roadmap R5).
- **R3** `GET /housing/activity` returns the filtered log page, newest first. `POST /housing/activity` stores client events (`import_run`, `photo_bulk_run`, …) and refuses the events the server logs itself (`login`, `logout` and every record action) (roadmap R6).
- **R4** Every write and `GET /housing/activity` needs an admin session. Without one, any request under `/housing` other than GET, HEAD or OPTIONS gets `401` (given an allowed `Origin`; without one, originCheck's `403` comes first) before validation or any SQL runs. The actor in the log is always `req.admin`, never request input (roadmap R3).
- **R5** Serials keep today's rules: assigned per project from the counter, an explicit serial raises the counter, serials are never reused after delete, and `serial_no` and `project_type` change only through change-serial and never on update (roadmap R4).
- **R6** Every write that changes data leaves an activity row carrying the acting admin's id and email (roadmap R6). An update that changes no field logs nothing, as on Supabase (`0005_activity_log.sql`).
- **R7** The REST adapter's write and activity methods call these endpoints, and the shared contract suite runs with `writes: true` against the real server. Only photo tests remain known gaps, and they close in C5 (roadmap R1).
- **R8** The admin Playwright specs (`e2e/mock`) pass against the real server with `VITE_HOUSING_BACKEND=rest`, except the photo specs (C5) and the one spec about non-admin accounts, which the server doesn't have (roadmap R2).
- **R9** `GET /api/v1/openapi.json` documents the writes and the activity routes as admin-only with the session cookie scheme.

## Scope
- In:
  - write and activity routes, their services and body schemas
  - Postgres error mapping
  - the deny-by-default admin guard on `/housing`
  - REST adapter writes, the contract runner with `writes: true`, and an `admin-rest` Playwright project with a per-test database reset
  - contract v0.12, migration-notes and testing docs
- Out (not now):
  - photo upload, delete, serving and moving photo files on serial change or delete (C5)
  - new SQL migrations: none are needed (see Technical decisions)
  - write rate limits
  - CSV formula-injection hardening of the export (existing UI behavior)
  - any change to the Supabase adapter, `supabase/sql` or UI pages

## Key decisions
From the roadmap and the C4 brief, not reopened here:
- Express 5 with plain SQL through `postgres` tagged templates; no Prisma.
- Routes under `/api/v1`, thin, with zod on params, query and body (`NE-REQ-01`).
- The contract's error shapes.
- A 100kb body limit, larger only on the bulk route (`NE-REQ-02`).
- `requireAdmin` on every write, with `req.admin` passed into `withActor()`. Public-read origins never get a write.
- The REST adapter is for local and staging only; production stays on Supabase.
- Photos are C5. Contract changes go in the same commit as the route.

## Technical decisions
- **Stack profile (`ST-43`).** Unchanged from C3: PostgreSQL 17 through plain tagged-template SQL (pending ST-03 amendment), a minimal admin session (pending ST-04 amendment), and storage in C5. C4 adds no dependency. The test cookie jar is about 30 lines of test code, not `tough-cookie`. The `CLAUDE.md` profile stays with the roadmap's rule-amendment task (C3 review P3).
- **No migration.** 0006 already grants `housing_app` insert, update and delete on `housing_beneficiaries` and EXECUTE on `housing_change_serial`, `housing_bulk_update_by_serial` and `housing_log_event`. The triggers already assign serials, protect `serial_no`/`project_type`, set `updated_at` and write the activity rows. C4 adds no function, so the default-privileges learning (`docs/learnings/database/postgres-default-privileges-public-execute.md`) needs no new grant. U3's tests still run as `appDb()`, which proves the grants are enough.
- **Before starting:** `git fetch && git log dev-forhad..origin/main -- supabase/sql`. On 2026-10-05 `origin/main` was already in `dev-forhad` with no new SQL. If something lands during C4, port it as 0009 first (migration-notes rule).
- **Layout (`NE-REQ-04`), following C3's split.**
  - `server/src/housing/schemas.ts` gets the body schemas.
  - `server/src/housing/writes.ts` holds the record and bulk SQL.
  - `server/src/housing/activity.ts` holds the activity SQL.
  - `server/src/routes/v1/housing-admin.ts` holds the admin router.
  - Every service function takes `(sql, actor, input)` or `(tx, input)` and never `req`. The route passes `{ id: req.admin.id, email: req.admin.email }`.
- **Admin router and route order (contract §1, `NE-SEC-03`).** `housingAdminRouter(sql)` is mounted on `/api/v1/housing` **before** `housingReadRouter`. It has three parts:
  1. **First:** a deny-by-default guard, `router.use((req, res, next) => SAFE.has(req.method) ? next() : requireAdmin(req, res, next))`, with SAFE = GET, HEAD, OPTIONS. Every POST, PUT or DELETE under `/housing` then gets 401 without a session, even on a path with no route yet (the C5 photo routes). That is what lets the unauthenticated contract test pass while photos are unimplemented. It is not `router.use(requireAdmin)`, which would lock the public reads.
  2. **Then, each route again with `requireAdmin`** (belt and braces, and the only guard on `GET /activity`):
     - `GET /activity` and `POST /activity`
     - `POST /bulk` and `PUT /bulk`
     - `POST /`
     - `POST /:id/serial`
     - `PUT /:id` and `DELETE /:id`
  3. **No GET route besides `/activity`.** `/activity` and `/bulk` are literal paths that this router matches before any `/:id`, and the read router's `GET /:id` is mounted after. A test checks that `GET /housing/activity` reaches the activity handler and not the uuid check, and that `PUT /housing/bulk` reaches the bulk handler.
- **CORS (learning `cors-read-only-origin-list-needs-own-method-check.md`).** `isPublicReadPath` in `server/src/app.ts` excludes `/api/v1/housing/activity`. Today a public-read origin gets credential-less CORS on it, which is harmless (always 401) but wrong in principle. Writes are already excluded by the method check. U5 adds a test.
- **Body limit (`NE-REQ-02`).**
  - **Global parser:** the global `express.json({ limit: '100kb' })` becomes a small wrapper that skips `req.path === '/api/v1/housing/bulk'`.
  - **Bulk routes:** in the route chain, `requireAdmin` comes first and their own `express.json({ limit: '10mb' })` after it, so an anonymous or expired session can't make the server parse 10 MB.
  - **Why 10 MB:** a worst-case valid row is 5,700 characters (name 200 + father 200 + places 300 + address 1000 + 2 × 2000 sources). All in Bangla at 3 bytes each, that is about 17 KB, and 500 such rows are about 8.5 MB. So any valid request fits.
  - **Other paths:** a case or trailing-slash variant of the path skips nothing and keeps the stricter 100kb parser, which is harmless.
- **Row cap → 413.** Before zod runs, the bulk routes check that `Array.isArray(body?.rows) && body.rows.length > 500` and throw `PAYLOAD_TOO_LARGE`. zod's `.max(500)` would give 400, and the contract says 413. Zero rows is a 400.
- **Write body schemas (`NE-REQ-01`, `NE-SEC-09`, contract §3.3).** All are `z.strictObject`, so an unknown key is a 400 `unrecognized_keys`. That covers `serial_no`/`project_type` on update and every `*_photo_url`, `*_thumb_url` and `photo_updated_at` (client never sends them).
  - **`writeText(min, max)`:** `z.string()`, then trim and `.normalize('NFC')`, then a length check. Length is `.length` (UTF-16 units), the same as the form's `maxLength`. Write it next to the read schemas' `textParam`; it doesn't share code with it, because the read schema turns blank into absent and the write schema doesn't.
  - **Fields:**
    - `name`: 1–200 characters
    - `father_or_husband_name`: 0–200, default `''`
    - `division`, `district`, `upazila`: 1–100 each
    - `address`: 0–1000, default `''`
    - `prev_photo_source`, `current_photo_source`: string ≤2000 or null, trimmed, `''` becomes null. There is no URL check: the sheet's links are stored as references, and the UI never renders them as links. A grep on 2026-10-05 found them only in the form, the CSV export and the activity labels.
    - `year`: `z.number().int()` 2000–2100. A JSON string `"2025"` is a 400.
    - `serial_no`: `z.number().int()` 1–2147483647.
    - `project_type`: the enum.
  - **`createBody`:** all of the above, `serial_no` optional.
  - **`updateBody`:** `createBody.omit({ project_type, serial_no }).partial()`, refined to at least one key. `{}` is a 400 with reason `empty`. `null` on a required field is a 400; null on a source clears it.
  - **`changeSerialBody`:** `{ serial_no }`.
  - **`bulkInsertBody`:** `{ project_type, mode: 'assign_serial' | 'use_given_serial', rows: createRow[] }`, where `createRow` is `createBody` without `project_type`.
    - `use_given_serial`: a `superRefine` requires `serial_no` on every row and refuses a duplicate. The issue path is `['rows', i, 'serial_no']`.
    - `assign_serial`: the transform drops `serial_no`.
  - **`bulkUpdateBody`:** `{ project_type, rows }`. Each row has a required `serial_no`, and every other field optional and nullable (null means unchanged).
    - For `name`, `division`, `district` and `upazila`, a blank value after trim is dropped (unchanged). That is exactly what `housing_bulk_update_by_serial` already does, and the import wizard sends `''` for blank cells.
    - Non-blank values get the create rules.
    - `father_or_husband_name`, `address` and the sources pass `''` through, as the function stores it. This is Supabase parity: an update can clear them.
  - **`activityQuery`:**
    - `action` matches `^[a-z_]{1,40}$`
    - `project_type` is the enum
    - `record_id` is a uuid
    - `actor_email` is trimmed, 1–254 characters, blank means absent
    - `from` and `to` are `z.iso.datetime({ offset: true })`. The activity page sends local times without an offset (`HousingActivityPage.tsx:72-73`), so the REST adapter converts them with `new Date(local).toISOString()` (the admin's own day, in the browser's timezone). The server stays strict.
    - `page` and `page_size` reuse C3's `intParam`: page_size 1–100, default 50
  - **`activityBody`:** `{ action, project_type?, details? }`.
    - `action` matches `^[a-z_]{1,40}$`.
    - `details` is `z.record(z.string(), z.json())`, default `{}`, refined to at most 8 KB as `JSON.stringify` UTF-8 bytes (else 400, reason `too_big`). It is stored through `sql.json`; no object is built from its keys in JS. Real `import_run` and `photo_bulk_run` details are a few counts. The cap keeps the audit log from being flooded (doc review 2026-10-05).
- **Row errors name the row.** `AppError` details gain an optional `row_index`. `toAppError` turns a zod path `['rows', 3, 'year']` into `{ row_index: 3, field: 'year', reason }`, which contract §4.9 already promises. The details type stays a fixed set of keys.
- **Postgres error mapping (`NE-ERR-01`, `NE-SEC-11`).** `toAppError` in `server/src/errors.ts` maps `postgres.PostgresError` by SQLSTATE with fixed Bangla messages. Postgres's own text (table names, key values) never reaches the client.
  - `23505` on constraint `housing_beneficiaries_project_serial_key`, **or with no `constraint_name`**, → 409 `CONFLICT`, 'এই সিরিয়াল আগে থেকেই আছে' (the UI's own text, `RecordForm.tsx:223`). The no-constraint case is `housing_change_serial`'s own `raise … using errcode = '23505'` (`0002_serial.sql:152`), which is the common change-serial conflict. A 23505 on any other named constraint stays a 500, because it would be a bug.
  - `P0002` → 404 `NOT_FOUND`, 'রেকর্ড পাওয়া যায়নি'. Only `housing_change_serial` raises it.
  - `23514`, `23502`, `22023`, `22P02` → 400 `VALIDATION_ERROR`, 'ইনপুট সঠিক নয়', reason `constraint`. These are the protect triggers, CHECKs and the bulk function's own checks. zod should make them unreachable, so they are logged at `warn` to surface a schema gap.
  - Everything else, `42501` included, stays the generic 500: a missing grant is our bug, not the client's.
- **Record writes (R1, R5, R6).** Each runs inside `withActor(sql, actor, tx => …)`, one transaction (`DB-TX-01`). Each returns C3's `RECORD_COLUMNS`, never `*` (`DB-Q-05`).
  - **create:** `insert … ${tx(row, columns)} returning <cols>`. The columns come from the parsed body's keys, a fixed set. With no `serial_no` the column is left out and the trigger assigns it.
    - **Explicit `serial_no` (the C1 note):** the contract and the admin form ("হাতে দিন", e2e `record-create.spec.ts` "a hand-entered serial is used as given") both allow an explicit serial on create, and the contract test requires it. The C1 note's concern is that an explicit serial permanently raises the counter, so only a trusted path may send one. Here only an admin can, through the form or the import, and the jump is logged (`create` row with the serial). That is the boundary; nothing narrower is added.
    - 201.
  - **update:** `update housing_beneficiaries set ${tx(patch, keys)} where id = $id returning <cols>`. Zero rows gives 404. `serial_no` and `project_type` can't be in `keys` (strict schema), so the protect trigger is a second guard, never the first.
  - **delete:** `delete … where id = $id returning id`. Zero rows gives 404, success gives 204.
    - **Photo files stay in storage until C5.** The REST server has no photo files before C5, so nothing is orphaned. C5 adds "delete files after commit" (`DB-TX-02`).
  - **changeSerial:** `select <cols> from housing_change_serial($id, $n)`, with P0002 → 404 and 23505 → 409 from the mapper. The same serial returns the record unchanged (200).
    - **Photo URLs are left as they are until C5.** The function doesn't touch them, and the files still live at the old serial's path, which is never reused. So the record keeps showing its photos correctly, and nothing can overwrite them.
    - Refusing records with photos would break `serial-change.spec.ts` (mock record 1 has photos) and the import flow for no safety gain.
    - Rewriting the URLs without moving the files would break the images.
    - C5 adds the file move and URL update. Contract §4.5খ gets a note, and the contract test "changeSerial carries photos" stays a known gap until then.
- **Bulk insert (R2).** One `withActor` transaction runs two statements:
  - **Pre-check (`use_given_serial` only):** `select serial_no from housing_beneficiaries where project_type = $pt and serial_no = any($serials) order by serial_no limit 1`. A hit gives 409 `serial_no N আগে থেকেই আছে` (the mock adapter's text) with `details.row_index`. A concurrent insert that slips past it still hits the unique key → 409 through the mapper.
  - **Insert:** one multi-row `insert … ${tx(rows, columns)}`. It is a single statement, not a loop (`DB-Q-03`). The serial trigger fires per row in VALUES order, so `assign_serial` numbers rows in order (contract test). Every column is listed for every row, with explicit defaults, so all rows have the same column set.
  - **Result:** `{ inserted: n, failed: [] }`. Any error rolls back the whole batch. `failed` stays empty, as contract §4.9 already says for all-or-nothing.
  - **Timing:** 500 rows with per-row triggers take well under C3's 5 s `statement_timeout`. A U4 test inserts 500 rows to prove it, so no `set local statement_timeout` is needed.
- **Bulk update (R2).** `select housing_bulk_update_by_serial($pt, ${tx.json(rows)})` in `withActor`. It returns `{updated, missing}` as parsed jsonb. It is already one statement and all-or-nothing.
- **Activity (R3, `DB-Q-04`).**
  - **GET:** one `where` from fragments, as in C3's `listRecords`.
    - Filters: `action =`, `project_type =`, `record_id =`, `actor_email ilike '%x%' escape '\'` with `\ % _` escaped as in C3's search, `at >= from`, `at <= to`.
    - Order: `at desc, id desc`.
    - The rows and `count(*)::int` queries run with `Promise.all`.
    - A non-uuid `record_id` (for example a hand-edited `?record=` URL) is a 400, which the page shows as its error state.
    - `id` is bigserial, which postgres.js returns as a string. Select `id::float8`, exact below 2^53, so the JSON has a number as the contract says.
    - `meta` is C3's page meta.
  - **POST:** the server refuses with 400 (reason `server_logged`) the actions it writes itself: `login`, `logout`, `create`, `update`, `delete`, `photo_update`, `serial_change` (C2 note).
    - It is a denylist, not an allowlist, so a new client event the other developer adds on Supabase still works (contract regex `^[a-z_]{1,40}$`).
    - Otherwise it runs `select housing_log_event($action, $details, $project_type)` in `withActor` and returns `201 { data: { id } }`.
- **REST adapter (R7).** `src/features/housing/backend/rest/index.ts`:
  - **Writes:** `create`, `update`, `delete`, `changeSerial`, `bulkInsert`, `bulkUpdateBySerial` and `listActivity` call the existing `ENDPOINTS` with `restRequest`.
  - **`bulkInsert` sends one request; no chunking.** The import wizard already sends 200-row chunks (`HousingImportPage.tsx:17`), the server enforces 500, and one request is one transaction. Chunking in the adapter would split all-or-nothing and hide the 413 the contract test expects.
  - **`listActivity`** clamps `page`/`page_size` like `list`, and converts `from`/`to` to ISO UTC with an offset.
  - **`logActivity`:**
    - It sends nothing for `login` or `logout`, because the server already logged them (C2 note; `HousingLoginPage` and `AdminShell` still call it).
    - Otherwise it POSTs. Every error is swallowed, which is the contract's "fails quietly" and the Supabase adapter's behavior, and a comment says why (`NE-ERR-02`: a deliberate, documented choice for a fire-and-forget audit event).
  - **`uploadPhoto` and `deletePhoto`** call the contract §4.10/§4.11 endpoints (multipart / `?kind=`). Until C5 the server answers them with 401 without a session (the guard) and 404 with one. C5 then only has to add the routes.
- **Contract runner (R7).** `tests/contract/rest.contract.test.ts`:
  - **Cookies and Origin in Node.** The runner wraps `globalThis.fetch` with `vi.stubGlobal` in a small cookie jar. The jar:
    - adds `Origin: http://localhost:5173` (originCheck needs it, contract §1)
    - stores cookies from `res.headers.getSetCookie()`, and drops one on an empty value or `Max-Age=0`
    - sends them back as `Cookie`

    The jar is reset in `makeRest()`. The adapter code is unchanged (`TS-16`). In U7, first check that Node's fetch lets the test set `Origin`; if not, use `node:http` inside the wrapper.
  - **Admin.** `makeRest()` inserts one admin with `insertAdmin(owner, { email, passwordHash })`. The hash is computed once in `beforeAll` with the server's `hashPassword`, so per-test cost stays low. The harness gets `admin: { email, password }`.
  - **Non-admin tests.** The server has no non-admin accounts (contract §2). A new `ContractOptions.nonAdminAccounts` (default `true`) skips the two tests that need one when `false`:
    - "Covers AE2: an account outside the admin list is forbidden…"
    - "a logged-in non-admin is forbidden…"

    The skip carries that reason. This is not a weakened assertion (`TS-15`): the behavior doesn't exist on this backend.
  - **Run with `writes: true`.** The unauthenticated-writes gap is removed. `KNOWN_GAPS` becomes the four photo tests, each with `// TODO: C5`:
    - 'changeSerial carries photos to the new serial path'
    - 'uploadPhoto sets the serial-based urls…'
    - 'an over-size photo is too large…'
    - 'every write is logged with before and after values…', which calls `uploadPhoto`; the server's U5 HTTP tests cover the same log behavior meanwhile

    The harness fails the run if any of them starts passing.
- **Admin e2e on rest (R8).**
  - **Database:** `housing_test`, the existing throwaway database. Its guards in `server/test/support/env.ts` refuse anything else, and it already exists in every local volume, while a new `housing_e2e` would need an init-script change that existing volumes never run. It must not run at the same time as `npm --prefix server test` or the contract runner; the docs say so.
  - **Playwright project `admin-rest`:**
    - `testDir: ./e2e/mock`, `testIgnore: ['photo-*.spec.ts']` with a `// C5` comment.
    - Registered only when `E2E_ADMIN_REST=1`.
    - Two `webServer`s:
      - the API: `npx tsx server/src/server.ts`, ready `url: 'http://localhost:3002/api/v1/readyz'`, env `DATABASE_URL` = `housing_app@…/housing_test`, `PORT=3002`, `ALLOWED_ORIGINS=http://localhost:5186`, `COOKIE_SECURE=false`, `LOG_LEVEL=warn`
      - Vite on 5186: `VITE_HOUSING_BACKEND=rest`, `VITE_API_BASE_URL=http://localhost:3002`
  - **Script:** `npm run test:e2e:rest-admin` runs `scripts/e2e-rest-admin.mjs`. It migrates `housing_test` like `scripts/contract-rest.mjs`, then runs `playwright test --project=admin-rest` with `E2E_ADMIN_REST=1`.
  - **Per-test reset (replaces `resetMock` as the seam).** New `e2e/support/backend.ts` exports `test`, extended with an auto fixture.
    - On `admin-rest` the fixture calls `resetRestData()` (`e2e/support/rest-data.ts`, owner connection via `ownerDb()`). Elsewhere it does nothing. `resetRestData()`:
      - runs `resetTestData`
      - inserts the mock fixture records (`seedRecords()` from `backend/mock/fixtures.ts`, same ids, serials and names) with photo URLs set to null, because Vite serves `/__mock-photos/` only in mock mode
      - lets the explicit serials raise the counters, so the next serials are 13 and 7, as the specs expect
      - truncates `housing_activity_log`, so the seed inserts don't show
      - inserts `MOCK_ADMIN` with an argon2 hash computed once per worker
    - Every `e2e/mock` spec changes its import from `@playwright/test` to `../support/backend`. On the `mock` project nothing changes.
    - `login.spec.ts` "an account outside the admin list…" gets `test.skip(project === 'admin-rest', 'the server has only admin accounts (contract §2)')`.
- **OpenAPI (R9).**
  - **`server/src/openapi.ts`:**
    - `paths` widens to `get | post | put | delete`.
    - It adds `components.securitySchemes.adminSession` (`type: apiKey, in: cookie, name: __Host-housing_session`), with a description noting that plain-http dev (`COOKIE_SECURE=false`) uses `housing_session`.
    - `z.json()` emits a `$ref` into a nested `$defs`, which would not resolve inside the document. So `details` is documented by hand as `{ type: 'object' }`, and a test checks that no `#/$defs` ref remains in `openapi.json`.
    - Each admin operation gets `security: [{ adminSession: [] }]`, a request body from the zod schema (`io: 'input'`), and 400/401/403/404/409/413 responses as they apply.
    - `/auth/*` stays out (C3 doc-review decision). The header comment and contract §1 change from "admin routes are left out" to "auth routes are left out; writes are marked admin-only".
  - **Drift test (`server/test/http/openapi.test.ts`):** it collects routes from both `housingReadRouter` and `housingAdminRouter`, so every unit that adds a route must add its entry.
- **Comments (`ORG-CMT-11`, `ORG-CMT-12`).** New files that cite this plan's R/U IDs name the plan path in their header.
- **CSRF.** The session cookie is `SameSite=Lax` (`server/src/auth/cookie.ts:16`), and originCheck requires an allowed `Origin` on every non-GET (contract §1). Both stay as C2 built them; U3 and U4 test the 403.
- **Accepted risk: no write rate limit** (user decision at doc review, 2026-10-05). The REST server serves only local and staging until cutover. SameSite=Lax, the Origin check and the audit log stay. C6 decides on a per-session write limit along with the other in-memory limits, before production.
- **Accepted risk.** An admin disabled by the CLI while a write request is in flight finishes that one write: the session was checked a few milliseconds earlier. The login learning's lock is about creating sessions, and `admin disable` deletes the sessions, so the next request fails.

## Implementation units

### U1. Error mapping and row details
- **Goal:** Postgres errors and bulk zod errors reach the client as the contract's codes, with fixed messages.
- **Requirements:** R1, R2, R5
- **Files:** `server/src/errors.ts`, `server/src/errors.test.ts`
- **Approach:** Extend `toAppError` (line 57) as in Technical decisions. Construct `postgres.PostgresError`-shaped errors in tests the way postgres.js builds them, or trigger real ones through `appDb()` in a DB test.
- **Tests:**
  - 23505 on the serial key → 409 with the fixed message; 23505 with no constraint name (raised by `housing_change_serial`) → 409; 23505 on another constraint → 500
  - P0002 → 404
  - 23514, 23502, 22023, 22P02 → 400 `constraint`; 42501 → 500
  - The Postgres message and detail never appear in the body.
  - A zod issue at `['rows', 3, 'year']` → `{ row_index: 3, field: 'year' }`; a non-row path keeps today's `field`.
- **Done when:** `npm --prefix server test -- errors` is green and typecheck passes.
- **Depends on:** none
- **Status:** done

### U2. Write body schemas
- **Goal:** The zod schemas from Technical decisions for create, update, change-serial, both bulk bodies, and the activity query and body.
- **Requirements:** R1, R2, R3, R5
- **Files:** `server/src/housing/schemas.ts`, `server/src/housing/schemas.test.ts`
- **Approach:** Follow the read schemas in the same file (strict objects, `intParam`, `projectType`). Export `createBody`, `updateBody`, `changeSerialBody`, `bulkInsertBody`, `bulkUpdateBody`, `activityQuery`, `activityBody`, `SERVER_LOGGED_ACTIONS`, `MAX_BULK_ROWS = 500`.
- **Tests:**
  - **create:**
    - defaults `''` for father and address
    - `'  বাড়ি  '` comes out trimmed NFC
    - name `'   '` and 201 characters refused
    - empty division refused
    - year 1999, 2101, 2025.5 and `"2025"` refused
    - `serial_no` 0 and 2147483648 refused
    - unknown key and `prev_photo_url` refused
    - source `''` becomes null; source of 2001 characters refused
  - **update:** `{}` refused; `serial_no` and `project_type` refused; a partial patch keeps only the given keys.
  - **bulk insert:**
    - `use_given_serial` without a serial on row 2 → path `rows.2.serial_no`
    - a duplicate is refused
    - `assign_serial` drops the given serials
  - **bulk update:** blank name dropped, `null` dropped, `''` address kept, missing `serial_no` refused.
  - **activity:**
    - `action` `'Login'` and 41 characters refused
    - `from` without an offset refused (the adapter adds it)
    - `page_size` 101 refused
    - `details` must be an object, and over 8 KB is refused
  - `z.toJSONSchema(…, { io: 'input' })` doesn't throw for each body.
- **Done when:** `npm --prefix server test -- schemas` is green.
- **Depends on:** none
- **Status:** done

### U3. Record writes: create, update, delete, change serial
- **Goal:** The four record routes work as contract §4.5খ and §4.6–§4.8 say, behind the deny-by-default guard.
- **Requirements:** R1, R4, R5, R6, R9
- **Files:**
  - `server/src/housing/writes.ts`
  - `server/src/routes/v1/housing-admin.ts`
  - `server/src/app.ts` (mount before the read router)
  - `server/src/openapi.ts`
  - `server/test/db/writes.test.ts`
  - `server/test/http/housing-writes.test.ts`
  - `server/test/http/cors.test.ts`
  - `server/test/http/openapi.test.ts`
  - `docs/api/API_CONTRACT.md` (v0.12: §1 admin guard and OpenAPI line, §1.2 `row_index`, §3.3 strict bodies and `''` sources, §4.5খ and §4.8 C5 notes)
- **Approach:** Services as in Technical decisions, following `server/src/housing/reads.ts` for SQL style and `RECORD_COLUMNS`. Route handlers follow `server/src/routes/v1/housing.ts`: parse, call, `res.status(201).json({ data })`. HTTP tests follow `server/test/http/auth.test.ts`: `insertAdmin`, login, take the cookie with `sessionCookieFrom`, `.set('origin', ORIGIN)`.
- **Tests (HTTP unless marked DB):**
  - **create:**
    - with no serial: 201 with the next serial and clean defaults
    - with an explicit serial: 201, and next-serial is that serial + 1
    - the same serial again → 409 `CONFLICT`, and the body has no Postgres text
  - **validation:** invalid bodies → 400 with `details.field`, and nothing is written.
  - **update:**
    - changes only the given fields, and `updated_at` moves
    - unknown id → 404; non-uuid id → 400
    - `serial_no` or `project_type` in the body → 400, and the record is unchanged
  - **delete:**
    - 204, then GET → 404, then delete again → 404
    - the next create doesn't reuse the serial
  - **change serial:**
    - 200 with the new serial
    - photo URL columns unchanged (seed a record with URLs)
    - the old serial gives 404 by serial, and the counter is ≥ the new serial
    - a taken serial → 409, with both records unchanged
    - 0 → 400; unknown id → 404; the same serial → 200 unchanged
  - **audit:** each write that changes a field leaves one activity row with `actor_id`/`actor_email` equal to the logged-in admin. A body `actor_email` is refused as an unknown key, so it can't spoof.
  - **refused (`TS-13`):**
    - each route without a session → 401 and nothing written
    - `POST /housing/<uuid>/photo` and `DELETE /housing/<uuid>/photo` without a session → 401; with one → 404
    - an expired or disabled admin's session → 401
    - no `Origin` → 403
    - a public-read origin's preflight for PUT gets no allow-origin
    - a no-op update (same values) → 200 and no new activity row
  - **route order:** `PUT /housing/bulk` doesn't hit `/:id`; `GET /housing/<uuid>` still works without a session.
  - **DB:** `writes.ts` against `appDb()` proves the runtime role's grants suffice.
  - **change-serial conflict through the real function:** returns 409 with the fixed message, not 500.
  - **OpenAPI:** the drift test covers both routers; each write entry has `security`.
- **Done when:** `npm --prefix server test` and typecheck are green, and the contract §4.6–§4.8 text matches the tests.
- **Depends on:** U1, U2
- **Status:** done

### U4. Bulk insert and bulk update
- **Goal:** `POST` and `PUT /housing/bulk` as contract §4.9 and §4.9খ say, with their own body limit.
- **Requirements:** R2, R4, R5, R6, R9
- **Files:**
  - `server/src/housing/writes.ts`
  - `server/src/routes/v1/housing-admin.ts`
  - `server/src/app.ts` (the global-parser skip)
  - `server/src/openapi.ts`
  - `server/test/http/housing-bulk.test.ts`
  - `docs/api/API_CONTRACT.md` (§4.9: 10 MB limit, 413 checked before validation, 409 with `row_index`, one request = one transaction; §4.9খ: blank required text means unchanged)
- **Approach:** As in Technical decisions. `withActor` follows `server/src/db.ts`. The 413 check runs before `bulkInsertBody.parse`.
- **Tests:**
  - **assign_serial:** 3 rows → `{inserted: 3, failed: []}`, with serials next..next+2 in row order.
  - **use_given_serial:**
    - keeps the serials and raises the counter past the largest
    - a serial already in the DB → 409 with `row_index`, and nothing written
    - a duplicate in the batch → 400 with `row_index`, and nothing written
  - **invalid row:** one invalid row (year 1999) → 400 `{row_index: 1, field: 'year'}`, and the total is unchanged.
  - **limits:**
    - 0 rows → 400; 501 rows → 413
    - 500 maximal all-Bangla rows (about 8.5 MB, every field at its cap) → 200 within the timeout
    - over 10 MB → 413
    - a 200 KB body to a non-bulk route → 413 (the global limit still holds)
  - **refused:**
    - an unauthenticated 4 MB POST and PUT, and the same with an expired or disabled admin's cookie → 401, not 413, which proves the guard ran before the 10 MB parser; no row is written
    - bulk POST and PUT with a valid admin cookie but no `Origin`, or a public-read origin → 403, nothing written
    - each create in a batch logs one activity row with the admin
  - **bulk update:**
    - updates given fields, leaves the rest, and reports unknown serials in `missing`
    - a blank name leaves the name unchanged
    - a missing `serial_no` → 400
    - 501 rows → 413
- **Done when:** `npm --prefix server test` is green.
- **Depends on:** U3
- **Status:** done

### U5. Activity log routes
- **Goal:** `GET` and `POST /housing/activity` as contract §4.9গ says, admin-only.
- **Requirements:** R3, R4, R6, R9
- **Files:**
  - `server/src/housing/activity.ts`
  - `server/src/routes/v1/housing-admin.ts`
  - `server/src/app.ts` (`isPublicReadPath` excludes `/activity`)
  - `server/src/openapi.ts`
  - `server/test/http/housing-activity.test.ts`
  - `server/test/http/cors.test.ts`
  - `docs/api/API_CONTRACT.md` (§4.9গ: filter rules, numeric `id`, the refused actions; §1 CORS line)
- **Approach:** The list SQL follows `listRecords` in `server/src/housing/reads.ts` (fragments, `Promise.all` of rows + count, `ilike` escaping).
- **Tests:**
  - **ordering:** after login + create + update + delete, the log is newest first (`delete`, `update`, `create`, `login`) with numeric `id`s.
  - **each filter alone:**
    - `action`
    - `project_type`
    - `record_id`
    - `actor_email` partial, where `%` and `_` match literally
    - `from`/`to` with an injected `at` (insert rows with fixed `at` as owner, `TS-14`)
  - **paging:** `page_size` 1 pages don't overlap; `total` is correct; `page_size` 101 → 400.
  - **date range:** `from`/`to` with offsets filter correctly; one without an offset → 400.
  - **POST:**
    - `import_run` with details and `project_type` → 201 `{id}`, stored with the admin as actor and `record_id` null
    - `login`, `logout` and `create` → 400 `server_logged`
    - `Bad-Action` → 400
    - a body `actor_email` → 400
  - **refused:** without a session, GET → 401 and POST → 401.
  - **CORS:** a public-read origin gets no allow-origin on `GET /housing/activity` but still does on `GET /housing`.
- **Done when:** `npm --prefix server test` is green.
- **Depends on:** U3
- **Status:** done

### U6. REST adapter writes
- **Goal:** The REST `HousingApi` write, photo-call and activity methods call the endpoints.
- **Requirements:** R7
- **Files:**
  - `src/features/housing/backend/rest/index.ts`
  - `src/features/housing/backend/rest/endpoints.ts` (only if a builder is missing)
  - `src/features/housing/backend/rest/housingApi.test.ts`
- **Approach:** Follow the read methods in the same file and `restRequest` in `http.ts`. Unit tests stub `fetch` as the existing `housingApi.test.ts` does.
- **Tests:**
  - each method sends the right method, path and body
  - `bulkInsert` with 501 rows sends one request
  - `logActivity('login')` sends nothing
  - `logActivity('import_run')` with a 401 response resolves
  - `listActivity` clamps `page_size` 500 to 100 and sends `from: '2026-10-05T00:00:00'` as an ISO string with an offset
  - `delete` handles 204
  - the error body maps to `HousingApiError.code`
- **Done when:** `npm test` (root) is green and `npm run build` passes.
- **Depends on:** none (contract shapes); merge after U3–U5
- **Status:** done

### U7. Contract runner with writes
- **Goal:** The shared contract suite runs with `writes: true` against the real server, with only the C5 photo gaps.
- **Requirements:** R7
- **Files:**
  - `tests/contract/rest.contract.test.ts`
  - `tests/contract/harness.ts` (`nonAdminAccounts`)
  - `tests/contract/housingApiContract.ts` (`test.skipIf` on the two non-admin tests)
  - `tests/contract/cookieJarFetch.ts`
- **Approach:** As in Technical decisions. Check that `mock.contract.test.ts` and `supabase.local.contract.test.ts` are untouched in behavior: the default is `true`.
- **Tests:**
  - this unit's tests are the suite itself: `npm run test:contract:rest` passes, and the harness's gap check proves the four photo gaps still fail
  - a small `cookieJarFetch` test: it stores, sends and clears a cookie, and adds `Origin`
  - `npm test` still passes the mock runner unchanged
- **Done when:** `npm run test:contract:rest` and `npm test` are green.
- **Depends on:** U3, U4, U5, U6
- **Status:** done

### U8. Admin Playwright specs on rest
- **Goal:** `e2e/mock` runs against the real server in a new `admin-rest` project with a per-test database reset.
- **Requirements:** R8
- **Files:**
  - `playwright.config.ts`
  - `e2e/support/backend.ts`, `e2e/support/rest-data.ts`
  - `e2e/mock/*.spec.ts` (import line; one skip in `login.spec.ts`)
  - `scripts/e2e-rest-admin.mjs`
  - `package.json` (`test:e2e:rest-admin`)
- **Approach:**
  - The project and webServer entries follow the `public-rest` entries in `playwright.config.ts`.
  - The auto fixture follows `liveWriteGuard` in `e2e/support/test.ts`.
  - The script follows `scripts/contract-rest.mjs`.
  - Check the real config env names in `server/src/config.ts` before writing the webServer env.
- **Tests:**
  - `npm run test:e2e:rest-admin`: every non-photo spec passes, including create, edit, validation, delete with no serial reuse, serial change (conflict and move), import new and update, activity (exactly one `লগইন` row, from the server) and route protection
  - `npm run test:e2e:mock` still green and unchanged
  - Spec failures are sorted as spec, app or environment before anything is changed (`TS-15`; `ae-trace` for traces).
- **Done when:** both commands are green.
- **Depends on:** U3, U4, U5, U6
- **Status:** todo

### U9. Docs and live check
- **Goal:** The docs match C4, and the admin flows work in a real browser against `rest`.
- **Requirements:** R1–R8
- **Files:**
  - `docs/architecture/migration-notes.md` (REST adapter writes done; photos pending; housing_test shared by three runners)
  - `docs/testing/README.md` (the new commands, the `admin-rest` project, what waits for C5)
  - `docs/api/API_CONTRACT.md` changelog row v0.12
  - this plan's "Notes for later chunks"
- **Approach:** `VITE_HOUSING_BACKEND=rest docker compose up -d api web`, then log in as `dev@example.org` in Chrome.
  - Do each of these: create (auto and hand serial), edit, change serial, delete, import a 3-row sheet (new and update modes), then open the activity page.
  - Confirm the activity rows show the dev admin, with one login row.
  - Record the result in the PR.
- **Tests:** none new (docs). The live check above is the check.
- **Done when:** docs are merged with the code, and the live check passes.
- **Depends on:** U1–U8
- **Status:** todo

## Verification
Use Node 22: `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH`. Start the database with `docker compose up -d db`. Run the three `housing_test` users (server tests, contract runner, admin e2e) one after another, never at the same time.

| Command | What it checks |
|---|---|
| `npm --prefix server run typecheck` | server types |
| `npm --prefix server test` | rebuilds `housing_test`; unit, DB and HTTP tests |
| `npm --prefix server run build` | server build |
| `npm run lint` | lint |
| `npm test` | frontend units and the mock contract runner |
| `npm run build` | `tsc -b` and the Vite build |
| `npm run test:contract:rest` | the full contract suite against the server, writes included |
| `npm run test:e2e:mock` | must stay green |
| `npm run test:e2e:rest-admin` | admin specs on `rest` |
| `npm run test:e2e:rest` | public specs on `rest` (compose API with the dev seed) |
| `npm run check:prod-bundle` | the production bundle still uses only the Supabase backend |
| `npm --prefix server audit --omit=dev` | `ST-31` |

Finally, the Chrome check from U9.

## Risks and rollback
- **No migration**, so there is no schema to roll back. Every change is new code behind `VITE_HOUSING_BACKEND=rest`; production (Supabase) is untouched. Reverting the branch is the rollback.
- **Number clash:** none expected (no migration). If `origin/main` adds `supabase/sql` during C4, port it as 0009 first.
- **Explicit serial typo:** a hand-entered 99999 permanently raises the counter, as on Supabase today. The `create` log row shows who did it. It is unchanged behavior, so it's out of scope.
- **Photo URLs after a serial change** point at the old serial's files until C5. They display correctly, because old paths are never reused. If C5 slips past cutover, C7 must not rely on path-from-serial.
- **The guard locks every non-GET under `/housing`.** A future public POST under `/housing` would need an explicit exception. That is deliberate (deny by default).
- **`housing_test` contention:** running two of its users at once gives confusing failures. The docs and the scripts' header comments say so.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
- Contract is v0.12 and matches the server; the REST runner's only known gaps are the four C5 photo tests

## Notes for later chunks
- C5: add `POST /housing/:id/photo` and `DELETE /housing/:id/photo` to `housingAdminRouter`. The guard already returns 401 without a session. Move the files and rewrite the URL columns in change-serial, and delete the files after commit on delete (`DB-TX-02`). Remove the four photo known gaps and the `testIgnore` for `photo-*.spec.ts` in `admin-rest`.
- C6: decide on a per-session write rate limit before production (accepted for staging at C4 doc review).
- C6: CI runs `test:contract:rest` and `test:e2e:rest-admin` against a Postgres service container, one after the other on the same `housing_test`.

## Progress
- **Branch:** `migrate/c4-write-endpoints` (from `migrate/c3-read-endpoints`, which is not yet merged into `dev-forhad`)
- **Updated:** 2026-10-05 16:40
- **Next:** U8: the `admin-rest` Playwright project, `e2e/support/backend.ts` and `rest-data.ts`
- **Uncommitted:** none
- **Notes:** `activityBody.details` uses `z.record(z.string(), z.unknown())`, not `z.json()`. The body is already JSON, and this avoids the `$defs` ref, so the OpenAPI entry needs no hand override. A custom zod check's `params.reason` becomes `details.reason` (`errors.ts`).
  U3 notes:
  - The CORS cases live in `server/test/http/security.test.ts`; there is no separate `cors.test.ts`.
  - The HTTP tests run the app on `appDb()`, which already proves the runtime role's grants, so no separate `test/db/writes.test.ts` was added.
  - `server/test/support/session.ts` (`loginAdmin`) is shared by the admin route tests.
  - `writes.ts` already has `bulkInsert` and `bulkUpdateBySerial`; U4 wires them up and tests them.
  U4 note: the "guard before parser" tests send a small malformed JSON body (401 without a session, 400 `invalid_json` with one), not 4 MB. A multi-MB upload that the server answers early sometimes resets the connection, which made the test flaky.
  U7: `npm run test:contract:rest` gives 35 passed, 4 expected fail (the photo gaps), 2 skipped (non-admin). Node 22's fetch lets the test set `Origin`.
  `origin/main` was already in `dev-forhad` on 2026-10-05, with no new `supabase/sql` to port.
