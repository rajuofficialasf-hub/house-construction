---
title: C3 Read Endpoints
type: migrate
status: in-progress
source: plan
date: 2026-10-05
doc_review: 2026-10-05
---

# C3 Read Endpoints

Chunk C3 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R14". It builds on `docs/plans/2026-10-05-1215-migrate-c1-server-skeleton-db-port-plan.md` (the C1 plan) and `docs/plans/2026-10-05-1246-migrate-c2-admin-login-plan.md` (the C2 plan). The contract is `docs/api/API_CONTRACT.md` (v0.10 now, v0.11 after this chunk).

## Goal
Anyone can read housing records, stats, years, filter options and the next serial from the new API under `/api/v1`, with no login. The site works against it with `VITE_HOUSING_BACKEND=rest`, and other As-Sunnah apps on a listed origin can call the same reads from the browser. An OpenAPI spec describes it.

## Problem
C4 (writes) and C6 (deploy) need a working read API, and the shared contract suite has never run against the real server. The REST adapter's reads still throw `NOT_IMPLEMENTED`. Roadmap R14 promises other apps a public read API with CORS and an OpenAPI spec. The contract has no filter-options endpoint, and its CORS rule allows only credentialed origins.

## Requirements
- **R1** `GET /api/v1/housing` returns the filtered, searched, sorted page and its `meta` as contract §4.1 says. The order is stable, so pages never overlap or skip records (roadmap R1).
- **R2** Detail by id, by serial, by serials, stats, years and next-serial return the contract §4.2–§4.5a shapes, with 404 and 400 where the contract (v0.11) says (roadmap R1).
- **R3** `GET /api/v1/housing/filter-options` returns the years, divisions, districts and upazilas present, optionally for one project type (roadmap R14).
- **R4** Every read works without a session and never calls `requireAdmin`. A request with an admin session gets the same body as one without (roadmap R3).
- **R5** Invalid query or path values are refused with `400 VALIDATION_ERROR` before any SQL runs, and the error names the field (`NE-REQ-01`).
- **R6** An origin in `PUBLIC_READ_ORIGINS` can make CORS GET requests to the housing reads and the spec, without credentials. It gets no CORS answer for writes or `/auth/*`. `ALLOWED_ORIGINS` stays the only credentialed list (roadmap R14, `NE-SEC-02`).
- **R7** `GET /api/v1/openapi.json` serves an OpenAPI 3.1 spec of every public `/api/v1` route (housing reads, health, the spec), built from the same zod schemas the routes use (roadmap R14).
- **R8** The REST adapter's read methods call these endpoints, and the shared contract read suite passes against `createApp` on the test database (roadmap R1).
- **R9** The public pages work against `rest` in the browser: list, filters, search, paging, detail and stats map (roadmap R1).

## Scope
- In:
  - read routes, the read SQL service and the query schemas
  - one index migration
  - the public-read CORS list, a read rate limit and the OpenAPI spec
  - REST adapter reads, the REST contract runner and a `public-rest` Playwright project
  - contract v0.11 and the migration-notes update
- Out (not now):
  - write routes and the REST adapter writes (C4)
  - photo upload and serving, and any change to photo URL values (C5; reads return the stored columns as they are)
  - trigram or full-text search indexes
  - response caching or ETag tuning
  - a docs UI (Swagger UI and the like)
  - any change to the Supabase adapter or `supabase/sql`

## Key decisions
From the roadmap and the C3 brief, not reopened here:
- Express 5 with plain SQL through `postgres` tagged templates; no Prisma.
- Routes under `/api/v1`, thin, with zod on params and query.
- The contract's error shapes; capped pagination.
- Reads are public. The REST adapter is for local and staging only; production stays on Supabase.
- Contract changes go in the same commit as the route.

## Technical decisions
- **Stack profile (`ST-43`).** There is no repo `CLAUDE.md`. The profile is the roadmap's Key decisions:
  - Database: PostgreSQL 17 through plain tagged-template SQL (a pending ST-03 amendment).
  - Auth: a minimal admin session (a pending ST-04 amendment).
  - Storage: the adapter, in C5.

  C3 adds nothing to the stack and no dependency: zod 4's built-in `z.toJSONSchema` covers OpenAPI, and `express-rate-limit` and `cors` are already installed (`ST-30`). The `CLAUDE.md` profile is left to the roadmap's rule-amendment task, so no unit writes it here.
- **Layout (`NE-REQ-04`).** Follow C2's split (`server/src/auth/service.ts` + `server/src/routes/v1/auth.ts`):
  - `server/src/housing/schemas.ts`: the zod query/param schemas and response schemas.
  - `server/src/housing/reads.ts`: the SQL. Every function takes `sql` and parsed input only. None takes `req` or the admin, so a session can't change results (R4).
  - `server/src/routes/v1/housing.ts`: validate, call, `res.json({ data, meta? })`.
- **Integers in query and path.** A shared `intParam(min, max)` accepts only `^[0-9]{1,10}$` strings, then checks the range. It does not use `z.coerce.number`, so `""`, `1e3`, `0x10` and `1.0` are refused. The max is 2147483647, the int4 limit, so Postgres never raises a 500 for an out-of-range value. Ranges:
  - `serial_no`: 1 to max.
  - `year`: 2000–2100, the table's CHECK range. A year outside it can match nothing, so it gets a 400.
  - `page`: 1 to max.
  - `page_size`: 1–100.
- **Query handling.**
  - Unknown query params are ignored (zod strips them), so other apps' cache-busters don't break.
  - A repeated param (`?year=1&year=2`) becomes an array under Express 5's simple query parser. The string schemas then refuse it with 400.
  - Text filters (`division`, `district`, `upazila`) are trimmed and NFC-normalized, max 100 characters. An empty value counts as absent, as in the Supabase adapter.
- **Pagination (`DB-Q-04`, `NE-REQ-05`).**
  - The server is strict: `page_size` 0 or 101 is a 400 (contract §4.1, "invalid gives 400").
  - The REST adapter clamps `page` and `page_size` before sending, exactly like `supabase/housingApi.ts` lines 81–82. The `HousingApi` behavior (the contract test "page_size above the cap is clamped to 100") stays the same on every backend.
  - A page past the end returns `data: []` with the real `total`.
  - `total_pages = max(1, ceil(total / page_size))`.
- **List SQL (`DB-Q-01`, `DB-Q-05`).** One `where` fragment is built from `sql` fragments and shared by two queries:
  - `select <columns> … order by … limit … offset …`
  - `select count(*)::int …`

  Both run together with `Promise.all`. The two can disagree by a write that lands between them, which is acceptable for a public listing; a transaction isn't worth it.

  `<columns>` is one `RECORD_COLUMNS` list of exactly the contract §3.2 fields, never `*`, so a future internal column can't leak.
- **Search.**
  - `q` is trimmed, NFC-normalized and max 100 characters after trimming. An empty `q` means no search.
  - The server escapes `\`, `%` and `_`, then matches `name ilike $p escape '\' or father_or_husband_name ilike … or address ilike …` with `$p = '%' || q || '%'`.
  - This differs from the Supabase adapter, which strips `, ( ) % \` as a PostgREST workaround. The REST server matches those characters literally, which is what contract §4.1 says. Record the difference in the contract.
  - `serial_no` and `q` both apply when both are given, as in Supabase.
- **Sort.**
  - `sort` is a zod enum mapped to a fixed column (`sql(column)` on an enum value only, never raw input). `order` maps to the `asc` or `desc` fragment.
  - The tie-breakers are `serial_no asc, project_type asc, id asc`. Without a project filter, both project types reuse serial numbers, so `serial_no` alone left the order undefined and could repeat or skip records across pages. Contract v0.11 states the full order.
- **Indexes (`DB-MIG-07`).** Migration `0008_read_indexes.sql` adds `housing_beneficiaries(serial_no)` and `(created_at)`:
  - `serial_no` is the default sort with no project filter.
  - `created_at` is a sort option and has no index today.
  - year, name, division, district, upazila and `(project_type, year)` are already indexed by 0001.
  - Plain `create index` inside dbmate's transaction, not `CONCURRENTLY` (`DB-MIG-06` is a SHOULD): the table holds a few thousand rows, and no production database runs these migrations before cutover.
  - No trigram index. `%q%` on a few thousand rows is a fast sequential scan. Revisit with `pg_trgm` if the list query passes ~50 ms at real volume (C7 rehearsal).
  - No new function, so no grant change. The C2 learning `docs/learnings/database/postgres-default-privileges-public-execute.md` doesn't apply, but U2's ACL check proves it.
- **Detail and serial routes.**
  - `:id` must pass `z.uuid()`, else 400. That also catches a literal path registered in the wrong order.
  - `:project_type` is the enum.
  - `nos` is a comma list of 1–100 integers (1 to max). Empty, a non-integer entry, or more than 100 is a 400. Duplicates are allowed; the schema dedupes and sorts ascending.
  - The result is ordered by `serial_no`; missing serials are left out.
  - The REST adapter keeps Supabase's `HousingApi` behavior: it drops non-integer or <1 values, dedupes, returns `[]` with no request when nothing is left, and chunks by 100.
- **Stats, years, next-serial.** These call the ported functions `housing_stats`, `housing_years` and `housing_next_serial` (0003, 0002), which `housing_app` may already execute (0006). `project_type` is optional for stats and years and required for next-serial; an invalid value is a 400. The stats jsonb is returned as postgres.js parses it; no object is built from DB keys in JS (`NE-SEC-09`).
- **Filter options (R3).** A new contract §4.5গ (§4.6 is taken by create), `GET /housing/filter-options?project_type=` returns `{data:{years, divisions, districts, upazilas}}`:
  - One SQL statement with four `array(select distinct …)` subqueries.
  - `years` newest first.
  - Text lists sorted in Node with one module-level `new Intl.Collator('bn')`, matching the Supabase adapter's `localeCompare(a, b, 'bn')`, so the dropdowns read the same on both backends.
  - The REST adapter's `filterOptions` calls it instead of building from stats and years.
- **Route order (contract §1).** All literal paths (`stats`, `years`, `next-serial`, `filter-options`) and `/:project_type/serial/:serial_no` and `/:project_type/serials` are registered before `/:id`. A test calls each literal path and checks it gets its own shape.
- **Read rate limit (`NE-SEC-04`).** List search and stats scan the table and are now open to other origins. One `express-rate-limit` limiter on the housing read router allows 300 requests per minute per IP. It uses the C2 handler pattern (`server/src/routes/v1/auth.ts` lines 32–42): `RATE_LIMITED`, draft-8 headers. The store is in memory, correct for one process (the C2 note for C6 already covers it). The limit is set high so the site (list + stats + years per view) never hits it.
  - It does not stop bulk copying: at `page_size=100` one IP can read the whole table in minutes. That is accepted (user decision at doc review): the same names and addresses are already public on the site, and the limit is there to protect capacity, not to keep the data secret.
  - It keys on `req.ip`, so C6 must set `TRUST_PROXY` to the real hop count for this limiter as well as the login one. With the wrong value, either every user shares the proxy's bucket or a spoofed `X-Forwarded-For` bypasses the limit.
- **Statement timeout (`NE-SEC-04`, `NE-ERR-06`).** `createDb` sets `connection: { statement_timeout }` (default 5000 ms; an optional `statementTimeoutMs` argument, the same injected-option style as C2's `now`). Without it, a flood of `%q%` searches or stats calls could hold all 10 pool connections and slow admin login on the same pool. A cancelled query (SQLSTATE 57014) reaches `errorHandler` as an unknown error and gives the generic 500. The timeout applies to every query, writes included; if a C4 bulk write needs longer, it raises it with `set local statement_timeout` inside its own transaction.
- **CORS split (R6, `NE-SEC-02`).**
  - New optional env `PUBLIC_READ_ORIGINS`: comma-separated, same `origin` check as `ALLOWED_ORIGINS`, default empty.
  - Config refuses an origin listed in both, so no origin's role is ambiguous.
  - `app.ts` swaps the single `cors()` for one `cors` options delegate:
    - an origin in `ALLOWED_ORIGINS` gets the current credentialed config;
    - an origin in `PUBLIC_READ_ORIGINS` gets `{ origin: true, credentials: false, methods: ['GET','HEAD'] }` only when the path is `/api/v1/housing…` or `/api/v1/openapi.json` **and** the method is GET or HEAD, or the method is OPTIONS with `access-control-request-method` GET or HEAD. The `cors` package never checks the requested method itself, so without this check a POST preflight would get an allow-origin. `origin: true` echoes only after an exact match against the list, never an unchecked Origin; a comment in the code says so.
    - anything else gets `{ origin: false }`.
    - The delegate always calls `res.vary('Origin')`, because `cors` sets no `Vary` header on the `origin: false` branch, and a shared cache could otherwise serve a no-CORS answer to an allowed origin.
  - `originCheck` keeps using only `ALLOWED_ORIGINS`, so a public origin can never write.
  - `compose.yaml` and `server/.env.example` get `PUBLIC_READ_ORIGINS=` (empty).
- **Cache headers.** The housing router sends no `cache-control` (Express's default ETag stays). Reads are public, so `no-store` isn't needed. Without `Last-Modified` or `max-age`, browsers revalidate, so an admin edit shows on the next load.
- **OpenAPI (R7).** `server/src/openapi.ts` builds the document once at startup:
  - `openapi: '3.1.0'`.
  - `paths` written by hand: one entry per route, with summary, parameters and responses.
  - Parameter and response schemas come from the route zod schemas through `z.toJSONSchema(schema, { io: 'input' })`, so query params show as the strings with patterns that the server accepts. `$schema` keys are dropped. Response schemas (`HousingRecord`, `Page`, `HousingStats`, `FilterOptions`, `Error`) go under `components.schemas`.
  - Only public routes are documented: the housing reads, `/healthz`, `/readyz` and `openapi.json` itself. `/auth/*` is left out (user decision at doc review), because only this site uses it, and the public spec shouldn't map the admin login. C4 adds the housing writes, marked admin-only with the cookie security scheme.

  It is served by `GET /api/v1/openapi.json`, public, under public-read CORS. There is no UI, and nothing in the repo is generated from it.

  Drift guard: a test reads the housing and health routers' `stack` (each layer's `route.path` and `route.methods`) and checks that each route has a spec entry and each spec entry has a route. `/auth/*` is outside both routers, so it needs no exclusion list. The route tests parse happy-path bodies with the same response zod schemas, so spec and server can't disagree on shape. Hand-writing the whole spec was rejected because it drifts silently.
- **Contract runner (R8).** `tests/contract/rest.contract.test.ts` lives in the root package, next to the other runners. It can't live in `server/test/`, because the harness imports the root `vitest`, and two vitest installs can't share one test run.
  - It imports `createApp` from `server/src/app.ts` and the test DB helpers from `server/test/support/{env,db}.ts`. Their bare imports resolve from `server/node_modules`.
  - In `beforeAll`: `createApp(...).listen(0)` on `127.0.0.1`, with `baseUrl` from the port.
  - `makeHarness` (run in `beforeEach`): `resetTestData(owner)`, load `server/db/seed/dev.sql`, then build the REST adapter.
  - `writes: false` for C3, `seeded: true`.
  - The read test "without a session every write is refused as unauthenticated, before anything is written" calls write methods that stay stubs until C4. It goes in `knownGaps` and runs as `test.fails`, so it turns red the moment C4 makes it pass and someone forgets to remove the gap (`TS-15`).
  - It runs only when `REST_CONTRACT=1`, like the Supabase runners' env gate.
  - `npm run test:contract:rest` (`scripts/contract-rest.mjs`, modelled on `scripts/contract-supabase-local.mjs`) checks that the DB is up, runs `npm --prefix server run db:migrate` with `DATABASE_MIGRATION_URL` set to the test owner URL, then runs the runner with the env set. The helpers' `_test` and localhost guard (`server/test/support/env.ts`) still applies (`TS-03`).
- **Comments (ORG-CMT-11, ORG-CMT-12).** Code that cites this plan's R or U IDs names the plan path in the file header.

## Implementation units

### U1. Query and response schemas
- **Goal:** One zod schema per read route's params and query, plus the response schemas, as described in Technical decisions.
- **Requirements:** R5, R7
- **Files:** `server/src/housing/schemas.ts`, `server/src/housing/schemas.test.ts`
- **Approach:** Follow `server/src/config.ts` for zod style (trim, refine, transform). Export `listQuery`, `idParams`, `serialParams`, `serialsQuery`, `projectTypeQuery` (optional), `nextSerialQuery` (required), and the response schemas `housingRecord`, `page`, `housingStats`, `filterOptions`.
- **Tests:**
  - defaults: page 1, page_size 50, sort serial_no, order asc
  - integer edge cases: `""`, `1e3`, `0x10`, `1.0`, `-1`, `0`, 2147483648, `page_size=101`, all refused; `100` accepted
  - `year` 1999 and 2101 refused
  - repeated param (array) refused
  - unknown keys stripped
  - `q`: 101 characters refused; whitespace-only becomes absent; NFD input comes out NFC
  - `division=` (empty) becomes absent
  - `nos`: `""`, `1,a`, `1,,2` and 101 entries refused; `3,1,3` becomes `[1,3]`
  - bad `project_type` refused; uuid refused when malformed
  - `z.toJSONSchema(listQuery, { io: 'input' })` does not throw
- **Done when:** `npm --prefix server test -- schemas` is green and typecheck passes.
- **Depends on:** none
- **Status:** done

### U2. Migration 0008: read indexes
- **Goal:** Index `serial_no` and `created_at` for the list sorts.
- **Requirements:** R1
- **Files:** `server/db/migrations/0008_read_indexes.sql`, `server/test/db/read-indexes.test.ts` (the ACL checks already live in `server/test/db/privileges.test.ts`)
- **Approach:** Same up/down layout as `0005_activity_log.sql`. Down drops both indexes. Before writing it, check `origin/main` for a new `supabase/sql` file that would also claim 0008 (migration-notes rule). If one exists, port it first and renumber this one.
- **Tests:**
  - both indexes exist after up
  - global-setup's rollback pass leaves nothing behind (already automatic)
  - `housing_app` still has no CREATE on `public` and nothing went to PUBLIC
- **Done when:** `npm --prefix server test` is green, rebuilding `housing_test` from nothing.
- **Depends on:** none
- **Status:** done

### U3. Read service (SQL)
- **Goal:** The read functions the routes call, with the SQL from Technical decisions.
- **Requirements:** R1, R2, R3, R4
- **Files:** `server/src/housing/reads.ts`, `server/test/db/reads.test.ts`, `server/test/support/db.ts` (`insertRecord`)
- **Approach:**
  - Functions: `listRecords(sql, query)`, `getRecordById`, `getRecordBySerial`, `getRecordsBySerials`, `getStats`, `getYears`, `getNextSerial`, `getFilterOptions`.
  - Return `null` for not found; the route maps it to `AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')`, the Supabase adapter's message.
  - Build the `where` from fragments the way `server/src/auth/service.ts` composes queries; `sql(column)` only on enum values.
  - Tests use `appDb()` (the runtime role, so grants are proven), `resetTestData` and `insertRecord`. Extend `insertRecord` with `father_or_husband_name`, `address` and `created_at` so search and sort cases can be set up.
- **Tests:**
  - every filter alone and combined
  - `q` hits name, father name and address; case-insensitive on Latin text; NFD/NFC equivalence
  - `q='%'` and `q='_'` match only records containing those literal characters
  - `q` with `(` `,` `\` doesn't error
  - each sort in both orders
  - same `serial_no` in both project types: pages of size 1 across both cover every record exactly once (the tie-breaker)
  - page past the end: `[]` with the real total
  - empty table: `total_pages` 1
  - by-serials: order, omission, dedupe
  - stats and years for an empty table and for one project type
  - next-serial after inserts
  - filter-options: Bengali collation order, years descending, project filter
  - the response only has contract fields (`Object.keys` equals the §3.2 list)
- **Done when:** `npm --prefix server test -- reads` is green.
- **Depends on:** U1, U2
- **Status:** done

### U4. Read routes, rate limit and contract v0.11
- **Goal:** Mount the read router at `/api/v1/housing` with the route order, validation, rate limit and error mapping; update the contract in the same commit.
- **Requirements:** R1, R2, R3, R4, R5
- **Files:**
  - `server/src/routes/v1/housing.ts`
  - `server/src/app.ts` (mount before `notFoundHandler`)
  - `server/src/db.ts` (statement timeout)
  - `server/test/http/housing-reads.test.ts`
  - `docs/api/API_CONTRACT.md`
- **Approach:** Same as `server/src/routes/v1/auth.ts`: a `Router()` factory taking `{ sql }`, `schema.parse(req.query)` in async handlers. Express 5 sends rejections to `errorHandler`, which already maps `ZodError` to `VALIDATION_ERROR` with `details.field`. HTTP tests follow `server/test/http/auth.test.ts`: a fresh `createApp` per test, supertest.

  Contract v0.11 changes:
  - §1: unknown params ignored, repeated params give 400, integers are decimal digits only; the read rate limit; the route order list gains `filter-options`. (The CORS wording is U5's; the `openapi.json` line is U6's.)
  - §4.1: the full sort order; literal `%`, `_` and `\` in `q`; empty `q` ignored; out-of-range page or page_size gives 400 (the adapter clamps).
  - §4.2: a non-uuid id gives 400.
  - §4.3a: `nos` rules.
  - §4.4 and §4.5: invalid `project_type` gives 400.
  - New §4.5গ: filter-options.
  - Bump the version line.
- **Tests:**
  - each route's happy path, with the body parsed by the U1 response schema
  - every record-returning route (list, by id, by serial, by serials) returns records whose keys equal exactly the contract §3.2 field list. §3.2 holds no phone, NID or other private column; its fields are the ones the current public site already shows
  - each literal path (`stats`, `years`, `next-serial`, `filter-options`) gets its own shape, not `/:id`'s 400
  - 400 with `details.field` for: bad page_size, bad sort, bad uuid, bad project_type, missing next-serial `project_type`, 101 `nos`
  - 404 for an unknown id and serial
  - **the same GET with and without a live admin session cookie returns an identical body** (session via `insertAdmin` + login, as `auth.test.ts` does) (R4)
  - no `Origin` header is needed for GET
  - the 301st request in a minute gets 429 `RATE_LIMITED`. Set the window and limit through a router option so the test runs fast, without a production flag (`TS-16`: an injected option in the same factory signature as C2's `now`)
  - a DB failure gives a generic 500 (one route with a closed `sql`)
  - a query that passes the statement timeout gives the generic 500 and doesn't hang: build the app on `createDb(testUrl, { statementTimeoutMs: 100 })`, hold `lock table housing_beneficiaries in access exclusive mode` in an owner transaction, then call the list route (a held lock, not timing; see `docs/learnings/security/login-must-recheck-credentials-inside-session-transaction.md`)
  - `show statement_timeout` on a default `createDb` connection is `5s`
- **Done when:** `npm --prefix server test` is green and `curl localhost:3001/api/v1/housing?page_size=5` returns seeded data in compose.
- **Depends on:** U3
- **Status:** done

### U5. Public-read CORS
- **Goal:** Add `PUBLIC_READ_ORIGINS` and the CORS options delegate described in Technical decisions.
- **Requirements:** R6
- **Files:**
  - `server/src/config.ts`, `server/src/config.test.ts`
  - `server/src/app.ts` (`createApp` takes `publicReadOrigins`), `server/src/server.ts`
  - `server/test/http/security.test.ts`
  - `server/.env.example`, `compose.yaml`
  - `docs/architecture/migration-notes.md` (decision 2: the two lists)
  - `docs/api/API_CONTRACT.md` §1 CORS lines (the two lists; this unit owns the wording)
- **Approach:** Extend the existing `cors` call and `security.test.ts` cases from C2. Keep `originCheck` unchanged.
- **Tests:**
  - config:
    - `PUBLIC_READ_ORIGINS` absent gives `[]`
    - a bad origin is refused by name
    - an origin in both lists is refused
  - public origin:
    - GET `/api/v1/housing` has `access-control-allow-origin` equal to it and no `access-control-allow-credentials`
    - GET `/api/v1/openapi.json` (after U6) is allowed
    - GET `/api/v1/auth/me` and GET `/api/v1/healthz` get no ACAO
    - a preflight for POST `/api/v1/housing` gets no ACAO
    - POST `/api/v1/auth/logout` is still 403 from `originCheck`
  - a public origin's preflight for GET `/api/v1/housing` is allowed
  - credentialed origin unchanged (credentials true on both auth and housing)
  - an unknown origin gets no ACAO
  - `vary: Origin` is present on every branch, including the unknown-origin one
- **Done when:** the tests are green, and compose starts with `PUBLIC_READ_ORIGINS` empty or set.
- **Depends on:** U4
- **Status:** done

### U6. OpenAPI spec
- **Goal:** `GET /api/v1/openapi.json` serves the spec of the public routes, built from the U1 schemas, with a drift test.
- **Requirements:** R7
- **Files:** `server/src/openapi.ts`, `server/src/routes/v1/openapi.ts`, `server/src/app.ts`, `server/test/http/openapi.test.ts`
- **Approach:** As described in Technical decisions. Build the document once in `createApp`, not per request (`NE-ERR-06`). Include the housing reads, health and the spec route; not `/auth/*`. `nos` loses its array shape and max-100 in `z.toJSONSchema` (it is a string transformed to a list), so give it a hand-written `description`.
- **Tests:**
  - the body has `openapi: '3.1.0'`, no `$schema` keys, and every `$ref` resolves inside the document
  - drift: the set of `METHOD path` pairs from the housing and health routers equals the spec's `paths` × methods, with Express `:param` turned into `{param}`
  - no `/auth` path appears in the spec
  - the `listQuery` parameters include `page_size` with its pattern and description
  - served without a session
- **Done when:** `npm --prefix server test` is green and `curl localhost:3001/api/v1/openapi.json | jq .paths` lists every route.
- **Depends on:** U4 (U5 for its CORS case)
- **Status:** done

### U7. REST adapter reads
- **Goal:** The REST adapter's read methods call the new endpoints, keeping `HousingApi` behavior the same as the Supabase adapter's.
- **Requirements:** R8
- **Files:**
  - `src/features/housing/backend/rest/index.ts`
  - `src/features/housing/backend/rest/endpoints.ts`
  - `src/features/housing/backend/rest/housingApi.test.ts` (new)
- **Approach:**
  - `endpoints.ts`: add `filterOptions`; give `list`, `stats`, `years` and `filterOptions` a `URLSearchParams` argument.
  - `list`:
    - clamps `page` and `page_size` as `supabase/housingApi.ts` lines 81–82 do
    - drops undefined and empty values
    - returns the body's `{ data, meta }`
  - `getBySerials`: the clean, dedupe, empty-returns-`[]`, chunk-by-100 rules from Technical decisions; results merged in serial order.
  - `nextSerial` returns `data.next_serial`.
  - `filterOptions` returns `data`.
  - Write methods stay `NOT_IMPLEMENTED`.
  - Tests stub `fetch` like `rest/authProvider.test.ts`.
- **Tests:**
  - the list query string for a full `ListParams`
  - `page_size: 1000` sends 100; `page: 0` sends 1
  - empty `q` is not sent
  - `getBySerials([])` makes no request
  - 150 serials make two requests, merged in order
  - a 404 body becomes `HousingApiError('NOT_FOUND')`
  - `byId` encodes the id
- **Done when:** `npm test -- rest` is green and `npm run build` typechecks.
- **Depends on:** U4 (the endpoint shapes)
- **Status:** done

### U8. Contract suite against the real server
- **Goal:** Run the shared contract read suite through the REST adapter against `createApp` on `housing_test`.
- **Requirements:** R8
- **Files:** `tests/contract/rest.contract.test.ts`, `scripts/contract-rest.mjs`, `package.json` (`test:contract:rest`), `docs/testing/README.md` (replace "how to add one" with how to run it)
- **Approach:** As described in Technical decisions. The known-gap test creates all nine write promises before awaiting them, so on REST the eight after the first are never handled once the first assertion fails. If vitest reports them as unhandled rejections, change that test in `tests/contract/housingApiContract.ts` to `Promise.allSettled` and then assert each result; the change has no effect on the mock and Supabase runners. Use the exact test name for the known gap, and add a `// TODO: docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md - C4 removes this gap` (ORG-CMT-30). Close the server and both DB connections in `afterAll`. If root vitest can't import the server's `.js`-suffixed TS imports, fix it in the root `vitest.config.ts` and not in the server code.
- **Tests:** the suite itself: every read case passes, and the one known gap fails as expected. Plain `npm test` without the env skips the file and stays green.
- **Done when:** `npm run test:contract:rest` passes with the DB from `docker compose up -d db`.
- **Depends on:** U5, U7
- **Status:** done

### U9. Public pages on `rest`, and the live check
- **Goal:** Prove the public site works against the API in a browser, and keep it proven with a `public-rest` Playwright project.
- **Requirements:** R9
- **Files:** `playwright.config.ts` (a `public-rest` project with `e2e/live` specs, registered only when `E2E_REST_API_URL` is set, with its own port and webServer env `VITE_HOUSING_BACKEND=rest`, `VITE_API_BASE_URL=$E2E_REST_API_URL`), `package.json` (`test:e2e:rest`), `README.md` (how to run it)
- **Approach:** Same as the `live` project's conditional registration. The API must run with dev seed data (`docker compose up -d db api`, `npm --prefix server run db:seed`) and with `ALLOWED_ORIGINS` including the e2e port's origin. It must be `ALLOWED_ORIGINS`, not `PUBLIC_READ_ORIGINS`, because the adapter always fetches with `credentials: 'include'`, and the browser refuses an answer that has no credentials header.
  - If a spec fails only because seed records have no photos (C5), exclude that one spec from `public-rest` with `testIgnore` and an ORG-CMT-30 TODO pointing at C5, and record it in Progress notes. Any other failure is a real defect to fix (`TS-15`).
  - Then one short pass in Chrome with `VITE_HOUSING_BACKEND=rest docker compose up -d api web` (the Playwright project is the lasting check; user decision at doc review): the list page and a detail page load, network shows `/api/v1/housing…` answering 200, and the console shows no errors.
- **Tests:** the `e2e/live` specs under `public-rest`.
- **Done when:** `npm run test:e2e:rest` is green (minus any documented C5 exclusion), `npm run test:e2e:mock` is still green, and the Chrome check is recorded in Progress.
- **Depends on:** U8
- **Status:** todo

## Verification
Use Node 22: `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH`. Start the database with `docker compose up -d db`.

| Command | What it checks |
|---|---|
| `npm --prefix server run typecheck` | server types |
| `npm --prefix server test` | rebuilds `housing_test`; unit, DB and HTTP tests |
| `npm run lint` | lint |
| `npm test` | frontend units and contract runners; the REST runner is skipped without its env |
| `npm run build` | `tsc -b` and the Vite build |
| `npm run test:contract:rest` | the contract suite against the real server |
| `npm run test:e2e:mock` | must stay green |
| `npm run test:e2e:rest` | the public specs on `rest` |
| `npm run check:prod-bundle` | the production bundle still uses only the Supabase backend |
| `npm --prefix server audit --omit=dev` | `ST-31` |

Finally, the Chrome check from U9.

## Risks and rollback
- **Migration 0008:** it only adds indexes. Rollback is `npm --prefix server run db:rollback`, which drops both. Nothing is lost (`DB-MIG-05`).
- **Number clash:** the other developer may port a `supabase/sql` file as 0008 first. U2 checks `origin/main` first; renumber before merging if needed.
- **Open CORS by mistake:** a wrong delegate could echo any origin, or add credentials for public origins. U5's tests cover each combination. `PUBLIC_READ_ORIGINS` is empty by default, so a deploy without it behaves exactly like C2.
- **Behavior differences from Supabase:** strict 400s on the server, literal `%` and `_` in search, and the third and fourth sort keys. The `HousingApi` behavior stays the same through the adapter; other apps calling the API directly see the stricter contract, which v0.11 documents. Production is unaffected (still Supabase).
- **Rate limit:** in memory, one process. If 300 per minute ever blocks a shared office IP, raise it in config; C6 reviews it with the C2 login limit.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
- Contract is v0.11 and matches the server; `docs/architecture/migration-notes.md` records the CORS split

## Progress
- **Branch:** `migrate/c3-read-endpoints`
- **Updated:** 2026-10-05 14:10
- **Next:** U9, the `public-rest` project in `playwright.config.ts`, then `npm run test:e2e:rest` with the compose API seeded
- **Uncommitted:** none
- **Notes:** `origin/main` had nothing new at start (no `supabase/sql` to port), so 0008 is free. The REST adapter also cuts `q` to 100 characters (the server's limit), sorts serials before chunking so merged by-serials results stay in order (Supabase sorts per chunk only), and drops serials above int4. The shared contract suite's unauthenticated-write test now attaches `code()` to every call at once (`.map(code)`), because on REST the stub rejections were reported as unhandled.
