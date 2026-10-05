---
title: C2 Admin Login
type: migrate
status: in-progress
date: 2026-10-05
---

# C2 Admin Login

Chunk C2 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R4". It builds on `docs/plans/2026-10-05-1215-migrate-c1-server-skeleton-db-port-plan.md` (the C1 plan). The old plan `docs/plans/2026-10-04-1357-housing-service-own-stack-plan.md` ("Security Baseline → Authentication and sessions") is still the reference for the session design.

## Goal
A few admins can log in to the new API with email and password, stay logged in through an HttpOnly cookie, and log out. Every login and logout leaves an activity row naming the admin. Admins are managed only from a server command line.

## Problem
C3–C5 add admin write routes, and those need a signed-in admin to check and to name in the activity log. Supabase Auth goes away at cutover, so the server needs its own login before any write route exists.

## Requirements
- **R1** `POST /api/v1/auth/login` with a valid email and password returns 200 with the contract's user, sets the session cookie, and returns no token in the body (roadmap R7).
- **R2** Every login failure (unknown email, wrong password, disabled admin, invalid body shape aside) returns `401 UNAUTHENTICATED` with the same message, and takes about the same time (roadmap R9, `AU-10`).
- **R3** Repeated failed logins from one IP get `429 RATE_LIMITED` until the window passes (roadmap R9, `NE-SEC-04`, `AU-13`).
- **R4** `GET /api/v1/auth/me` returns the admin for a live session and `401` for a missing, unknown, idle-expired, absolutely-expired or disabled-admin session.
- **R5** `POST /api/v1/auth/logout` ends the session in the database, clears the cookie, and returns 204.
- **R6** A successful login and a logout each write one `housing_activity_log` row with the admin's id and email (roadmap R6).
- **R7** One middleware turns the cookie into `req.admin`. A `requireAdmin` guard refuses requests without it, ready for C3–C5 (roadmap R3, `AU-21`).
- **R8** A request that changes state and comes from an origin outside the allowlist, or has no `Origin`, is refused with 403. CORS answers only allowlisted origins, with credentials (`NE-SEC-02`, `NE-SEC-05`).
- **R9** A server CLI creates an admin, sets a new password, disables and re-enables an admin, and lists admins. It reads passwords only from a prompt. Disabling or setting a password ends that admin's sessions (roadmap R8).
- **R10** A stored bcrypt hash (as exported from Supabase) logs in, and the hash is replaced by argon2id in the same login (roadmap R10).
- **R11** The REST auth adapter works only through the cookie: no token in `localStorage`, and it calls `/api/v1/auth/*` (`RE-SEC-03`).

## Scope
- In: admins and sessions tables, password hashing, session middleware, login/logout/me routes, login rate limit, CORS and Origin check, admin CLI, the REST auth adapter, and contract and migration-notes updates.
- Out (not now): housing routes and `POST /api/v1/housing/activity` (C3/C4), importing the real Supabase admins and hashes (C7), password reset by email, per-account throttling, 2FA, a session cleanup job (expired rows are deleted at login instead).

## Key decisions
From the roadmap and the C2 brief (not reopened here): minimal admin login with no auth-core and no Prisma; argon2id, with bcrypt verified then upgraded; an opaque token in an HttpOnly cookie with only its hash stored; idle and absolute timeouts; one failure message; per-IP rate limit; Origin check; login and logout logged through `housing_log_event` inside `withActor()`; admin ids are uuids; only `withActor()` sets `app.actor_*`; no signup; the adapter is cookie-only; new tables get explicit grants and nothing goes to `PUBLIC`.

## Technical decisions
- **Tables (`DB-MIG-02`, `DB-MIG-07`).** Migration `0007_admin_auth.sql`:
  - `housing_admins(id uuid pk default gen_random_uuid(), email text not null unique check (email = lower(email)), name text, password_hash text not null, disabled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`. The id is a uuid so it fits `actor_id`. C7 imports Supabase admins with their `auth.users.id`, so old `housing_serial_changes.changed_by` values keep pointing at the same person. Emails are stored lower-cased, so lookups use the unique index.
  - `housing_admin_sessions(token_hash bytea pk check (octet_length(token_hash) = 32), admin_id uuid not null references housing_admins(id) on delete cascade, created_at timestamptz not null, last_seen_at timestamptz not null, expires_at timestamptz not null)`, with an index on `admin_id`. The token hash is the session id, so a database dump holds nothing a browser could replay.
  - Both names start with `housing_`, so the leftover check in `server/test/support/global-setup.ts` covers them.
- **Grants (the 0006 rule; `docs/learnings/database/postgres-default-privileges-public-execute.md`).** Revoke everything on both tables from `PUBLIC`. `housing_app` gets `select` on `housing_admins` and `update (password_hash, updated_at)` only (for the bcrypt upgrade), plus `select, insert, update, delete` on `housing_admin_sessions`. The API role therefore cannot create, enable or rename admins; only the CLI can, because it connects as the owner. The migration adds no functions.
- **Hashing libraries (`ST-30`, `ST-32`, `NE-ERR-06`).** `@node-rs/argon2` and `@node-rs/bcrypt`. They ship prebuilt binaries through optional dependencies, with no install scripts and no node-gyp. Hashing runs off the main thread. Argon2id uses m = 19456 KiB, t = 2, p = 1 (OWASP minimum, same as the old plan). A hash needs an upgrade when it doesn't start with `$argon2id$v=19$m=19456,t=2,p=1$`, so stronger parameters later upgrade automatically too.
- **Equal-cost failures (`AU-10`).** For an unknown or disabled email, the service verifies the password against a dummy argon2id hash made once at startup, then fails. The pino log records why it failed (`unknown`, `bad_password`, `disabled`) with the request id but not the email or password (`NE-LOG-02`, `NE-LOG-03`).
- **Token and cookie (`NE-SEC-05`, `AU-20`).** The token is 32 bytes from `crypto.randomBytes`, base64url in the cookie, and SHA-256 in the database. With `COOKIE_SECURE=true` (the default) the cookie is `__Host-housing_session; HttpOnly; Secure; SameSite=Lax; Path=/`. With `COOKIE_SECURE=false` (only set in compose and `.env.example` for http://localhost) it is `housing_session` with the same attributes minus `Secure`, because browsers refuse a `__Host-` cookie without `Secure`. `Max-Age` equals the absolute lifetime. Each login creates a new token.
- **Timeouts.** Idle 8 hours, absolute 7 days (the old plan's values; the contract proposed 7 days). They are constants in `server/src/auth/session.ts`, not env, because there are few admins and no need to tune them. One `update … returning` statement checks and slides a session: it matches only if the admin is enabled, `last_seen_at > now − 8 h` and `expires_at > now`, sets `last_seen_at = now`, and returns the admin. `now` comes from an injected clock (`TS-14`). Login deletes that admin's expired sessions, so the table stays small with no job.
- **Middleware and `req.admin` (`AU-21`, `NE-SEC-03`).** `sessionMiddleware` runs on every `/api/v1` request. It reads the cookie with a five-line `readCookie` in `server/src/auth/cookie.ts`. Express 5 has no cookie parser, and the token is base64url, so nothing needs decoding and no dependency is needed (`ST-30`). It sets `req.admin = { id, email, name }` and `req.sessionId` (the token hash) for a live session, and otherwise sets nothing. `requireAdmin` throws `AppError('UNAUTHENTICATED')`. Routes never read cookies. The types live in `server/src/auth/types.ts` with a module augmentation of Express's `Request`. `AdminPrincipal` is the roadmap's `Principal` seam: a host-app login added later fills the same shape.
- **Activity rows (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`).** Login runs `withActor(sql, admin, tx => …)`. In one transaction it upgrades the hash if needed, deletes expired sessions, inserts the session and calls `select housing_log_event('login')`. Logout does the same with delete + `'logout'`. A failed login writes no activity row, because there is no admin to name; the pino log records it. The actor comes only from the admin row just verified, never from the request.
- **Logout without a session.** It returns 204 and clears the cookie anyway, so an expired tab can always log out. This is an addition to contract §2, which lists logout as admin-only. No activity row is written, because nobody is logged in.
- **CORS (`NE-SEC-02`).** Uses the `cors` package with `origin: config.allowedOrigins` (exact-match array, never reflected), `credentials: true`, and methods `GET, POST, PUT, DELETE`. `ALLOWED_ORIGINS` is a comma-separated, required env var. Each entry must equal `new URL(entry).origin` (scheme + host + port, no path or slash). Production lists the site's own origin, which the Origin check needs even though nginx serves the UI and API from one origin. Compose sets `http://localhost:5173`. C3 adds the other apps' origins (roadmap R14).
- **Origin check (`NE-SEC-05`).** Middleware on `POST`, `PUT`, `PATCH` and `DELETE` requires an `Origin` header that is in `allowedOrigins`. Otherwise it returns `403 FORBIDDEN`. Login is covered too, which stops login CSRF. A missing `Origin` is refused because every browser sends it on these methods. Non-browser callers (the contract suite in C3/C4) set it.
- **Rate limit (`NE-SEC-04`).** `express-rate-limit` on the login route only: 10 failed attempts per IP per 15 minutes (`skipSuccessfulRequests: true`), keyed by `req.ip`, which C1's `trust proxy` makes correct (`NE-SEC-10`). The limit is 10, not the old plan's 5, because the office shares one NAT address. State lives in the library's memory store. The API runs as one process, so memory is accurate. A restart only resets counters, and Postgres would add a table and a write per attempt for no gain. If the API ever runs more than one process, this must move to a shared store (see Risks). The limiter is built inside `createApp`, so each test app starts at zero. A limited request gets `429 RATE_LIMITED`, a new code added to `ERROR_STATUS`, contract §1.2 and the frontend's error codes. It has its own message ("অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন"), which says nothing about the account, so it stays within `AU-10`.
- **Middleware order in `createApp`.** Order: x-powered-by off, trust proxy, pino-http, helmet, cors, origin check, express.json, session middleware, routers, notFound, errorHandler. CORS runs before the Origin check so preflights (OPTIONS) are answered. The Origin check runs before body parsing, so a refused request costs nothing more.
- **Admin CLI (`NE-SEC-06`, `NE-CFG-03`).** `server/src/cli/admin.ts` lives under `src`, so it compiles to `dist/cli/admin.js` and runs in production (`node dist/cli/admin.js …`). `npm --prefix server run admin -- …` runs it with tsx in development. It uses `node:util` `parseArgs` (strict, so `--password` is an unknown-option error) and connects as the owner through `DATABASE_MIGRATION_URL`:
  ```
  admin create --email a@example.org [--name "নাম"]
  admin set-password --email a@example.org
  admin disable --email a@example.org
  admin enable --email a@example.org
  admin list
  ```
  `create` and `set-password` prompt for the password: hidden and asked twice on a TTY, one line from stdin otherwise (for tests and piping). The password must be 12–200 characters. `create` refuses an existing email. `set-password` and `disable` delete the admin's sessions in the same transaction. Each change writes an activity row (`admin_create`, `admin_password_set`, `admin_disable`, `admin_enable`, details `{ email }`) through `housing_log_event`. The CLI sets no actor, so `actor_email` falls back to `session_user` (`housing_owner`), which honestly says "done from the server". `list` prints id, email, name, disabled and created, and never the hash. Exit code is 0 on success and 1 with a one-line message otherwise.
- **Path prefix.** The contract lists `/api/...`, and roadmap R1 puts every operation under `/api/v1`. C2 adds one line to contract §0 ("the server serves every path below under `/api/v1`") rather than rewriting every path. `ENDPOINTS` in `src/features/housing/backend/rest/endpoints.ts` gets a single `API = '/api/v1'` prefix for all entries. That is safe because the REST `HousingApi` is still a stub and production uses Supabase.
- **REST adapter (`RE-SEC-03`).** Remove `TOKEN_KEY`, `getToken`, `setToken`, the `auth` option and the `Authorization` header from `http.ts`, and `access_token` from `LoginResponse`. Requests keep `credentials: 'include'`. `onAuthChange` across tabs uses a `BroadcastChannel('housing-auth')` (posted on login and logout, guarded by `typeof BroadcastChannel`) instead of the `storage` event. `429` maps to `RATE_LIMITED`. `HousingLoginPage` shows the server's message for `RATE_LIMITED`. That message is already in Bangla; check whether the page needs a branch or already shows `error.message`.
- **Client-side login/logout events.** `HousingLoginPage` and `AdminShell` also call `logActivity('login' | 'logout')`. In REST mode `logActivity` is a no-op today. C4 must refuse or ignore `login`/`logout` on `POST /api/v1/housing/activity` so they aren't logged twice. This goes in "Notes for later chunks". C2 does not change the pages (the "add, don't remove" rule in `docs/architecture/migration-notes.md`).
- **Comments (`ORG-CMT-11`, `ORG-CMT-12`).** Code that cites this plan's R/U IDs names the plan path in the file header.

## Implementation units

### U1. Config: allowed origins and cookie security
- **Goal:** The server reads `ALLOWED_ORIGINS` and `COOKIE_SECURE` from env, and dev setups provide them.
- **Requirements:** R8 (config side)
- **Files:** `server/src/config.ts`, `server/src/config.test.ts`, `server/.env.example`, `compose.yaml` (api env), `server/test/support/env.ts` if tests build config there
- **Approach:** Extend the one zod schema in `server/src/config.ts` (`NE-CFG-01`). Parse `ALLOWED_ORIGINS` into a non-empty `string[]`, each entry checked equal to `new URL(x).origin`. `COOKIE_SECURE` uses `z.enum(['true','false'])` → boolean, default `true`, so a missing value is the safe one. Compose sets `ALLOWED_ORIGINS=http://localhost:${WEB_PORT:-5173}` and `COOKIE_SECURE=false`.
- **Tests:** valid list of two origins parses; trailing slash, path, `*` and empty are rejected with the field named and the value not echoed; `COOKIE_SECURE` missing → true, `false` → false, `yes` → error.
- **Done when:** config tests pass and `docker compose up api` still starts.
- **Depends on:** none
- **Status:** done

### U2. Migration 0007: admins and sessions
- **Goal:** The two tables exist with the grants above, and rollback is clean.
- **Requirements:** R4, R9, R10 (storage side)
- **Files:** `server/db/migrations/0007_admin_auth.sql`, `server/test/support/db.ts` (`resetTestData` truncates `housing_admin_sessions, housing_admins`, plus an `insertAdmin(owner, {email, name?, passwordHash, disabled?})` helper), `server/test/db/privileges.test.ts`, `server/test/db/admin-auth.test.ts`
- **Approach:** Follow `0005_activity_log.sql` for layout and `0006_app_role_grants.sql` for revoke/grant, with a `-- migrate:down` that drops both tables. Before writing it, `git fetch && git log origin/main -- supabase/sql` to confirm no new Supabase SQL has claimed 0007 (C1 plan risk).
- **Tests:** as `housing_app`: can select admins, can update `password_hash`, cannot insert/delete admins or update `email`/`disabled_at` (expect `42501`); full CRUD on sessions. `PUBLIC` has no privilege on either table. Upper-case email insert fails the check. Session with a 31-byte hash fails. Deleting an admin cascades its sessions. `global-setup` rollback loop still passes (it counts migration files).
- **Done when:** `npm --prefix server test` passes, including the up/down round trip.
- **Depends on:** none
- **Status:** done

### U3. Password hashing
- **Goal:** One module hashes with argon2id, verifies argon2id or bcrypt, and says when to upgrade.
- **Requirements:** R2, R10
- **Files:** `server/src/auth/password.ts`, `server/src/auth/password.test.ts`, `server/package.json` (+ `@node-rs/argon2`, `@node-rs/bcrypt`), lockfile
- **Approach:** `hashPassword(pw)`, `verifyPassword(hash, pw): Promise<boolean>` (dispatch on `$argon2id$` / `$2a$|$2b$|$2y$`; unknown format → false, never throw), `needsUpgrade(hash)`, `verifyDummy(pw)` against a lazily made dummy hash. Check `npm ls` / package contents for install scripts before adding (`ST-32`) and give the reason in the commit (`ST-30`).
- **Tests:** hash then verify true; wrong password false; a fixed bcrypt hash made outside this code (e.g. `$2a$10$…` for `correct horse battery staple`, generated once with `htpasswd -bnBC 10` and pasted as a literal, `TS-11`) verifies true and `needsUpgrade` true; a fresh argon2id hash `needsUpgrade` false; an argon2id hash with `t=1` needs upgrade; garbage hash → false.
- **Done when:** tests pass and `npm --prefix server ci` in the node:22 container installs with no build step.
- **Depends on:** none
- **Status:** done

### U4. Auth service: login, session lookup, logout
- **Goal:** Plain functions that do the database work for login, `authenticate(tokenHash)` and logout, including activity rows.
- **Requirements:** R1, R2, R4, R5, R6, R10
- **Files:** `server/src/auth/session.ts` (token make/hash, constants, `authenticate`), `server/src/auth/service.ts` (`login`, `logout`), `server/src/auth/types.ts` (`AdminPrincipal`), `server/test/auth/service.test.ts`
- **Approach:** Services take `{ sql, now: () => Date }`. Write SQL with tagged templates like `server/src/db.ts` callers (`DB-Q-01`), selecting only needed columns so `password_hash` never leaves the service (`DB-Q-05`). Login returns `{ ok: true, admin, token, expiresAt } | { ok: false, reason }`. The route maps every `ok: false` to the same error. Use `withActor` exactly as `server/test/db/activity-log.test.ts` does.
- **Tests (real DB, injected clock):**
  - Correct password → session row with `sha256(token)` and timestamps from the clock; one `login` activity row with the admin's id and email.
  - Wrong password, unknown email and disabled admin → `ok: false`, no session, no activity row.
  - Bcrypt admin logs in and the stored hash now starts with `$argon2id$`.
  - `authenticate`: live → admin and `last_seen_at` moved; idle 8 h + 1 s → null; absolute 7 d + 1 s even with recent activity → null; admin disabled after login → null; unknown hash → null.
  - Logout deletes only that session (a second session of the same admin survives) and writes a `logout` row.
  - Login deletes that admin's expired sessions but not another admin's.
- **Done when:** service tests pass.
- **Depends on:** U2, U3
- **Status:** done

### U5. HTTP security middleware: CORS, Origin check, session, requireAdmin
- **Goal:** Every `/api/v1` request has CORS and the Origin rule applied, plus `req.admin` when the cookie is valid.
- **Requirements:** R7, R8
- **Files:** `server/src/auth/middleware.ts` (`sessionMiddleware`, `requireAdmin`), `server/src/http/origin.ts` (`originCheck`), `server/src/app.ts` (new deps `allowedOrigins`, `cookieSecure`, `now`), `server/src/server.ts`, `server/src/app.test.ts`, `server/test/http/security.test.ts`, `server/src/auth/cookie.ts`, `server/package.json` (+ `cors`, `@types/cors`)
- **Approach:** Keep `createApp`'s deps object pattern. Put the order from Technical decisions in `server/src/app.ts`. For tests only, mount a tiny router in the test file (not production code, `TS-16`) that uses `requireAdmin`, to prove the guard.
- **Tests:**
  - Preflight from an allowlisted origin → `Access-Control-Allow-Origin` equal to it plus `Allow-Credentials: true`; from another origin → no ACAO header.
  - POST with no `Origin` → 403; with an unlisted `Origin` → 403; GET with an unlisted `Origin` → passes (CORS still hides the body from the browser).
  - Guarded test route: no cookie → 401 `UNAUTHENTICATED`; cookie with a random token → 401; valid session → 200 with the admin id.
  - Another admin's disabled account: their old cookie → 401 (`TS-13` form for auth: one admin's state never authenticates another's request).
- **Done when:** tests pass and the existing health tests still pass with the new middleware.
- **Depends on:** U1, U4
- **Status:** done

### U6. Auth routes and login rate limit
- **Goal:** `/api/v1/auth/login|logout|me` behave as R1–R6 describe, with the per-IP limit.
- **Requirements:** R1, R2, R3, R4, R5, R6
- **Files:** `server/src/routes/v1/auth.ts`, `server/src/errors.ts` (+ `RATE_LIMITED: 429` and its message), `server/src/app.ts`, `server/test/http/auth.test.ts`, `server/package.json` (+ `express-rate-limit`)
- **Approach:** Router factory like `server/src/routes/v1/health.ts`. The zod body is `{ email: z.email().max(254), password: z.string().min(1).max(200) }` and the email is lower-cased and trimmed (`NE-REQ-01`). The route stays thin: validate, call the service, set or clear the cookie, respond (`NE-REQ-04`). The response is `{ data: { expires_at, user: { id, email, name, role: 'admin' } } }`. The limiter's `handler` passes `new AppError('RATE_LIMITED', …)` to `next` so the error body has the usual shape.
- **Tests (Supertest, real DB, `Origin` header set):**
  - Login 200: body has no `access_token`. `Set-Cookie` has `HttpOnly`, `SameSite=Lax`, `Path=/` and `Max-Age=604800`, plus `Secure` and the `__Host-` name when `cookieSecure` is true and neither when it is false.
  - Unknown email, wrong password and disabled admin → identical status, code and message (compare the three bodies to each other and to the literal "ইমেইল বা পাসওয়ার্ড সঠিক নয়").
  - Bad body (no email, 201-character password) → 400 `VALIDATION_ERROR`.
  - The 11th failed login from one IP → 429 `RATE_LIMITED`, even with the right password. A different IP (`trust proxy` 1 + `X-Forwarded-For`) is not limited. Successful logins don't count toward the limit.
  - `/me` with the login cookie → the user; without it → 401.
  - Logout → 204, `Set-Cookie` clears the cookie, the next `/me` with the old cookie → 401, and the activity log holds `login` then `logout` for that admin.
  - Logout with no cookie → 204 and no activity row.
  - The response and logs never contain the password or token: assert on the body, and on a pino destination captured in the test.
- **Done when:** tests pass; `curl` against `docker compose up` shows the cookie flow.
- **Depends on:** U5
- **Status:** done

### U7. Admin CLI
- **Goal:** An operator can create, re-password, disable, enable and list admins from the server.
- **Requirements:** R9
- **Files:** `server/src/cli/admin.ts` (arg parsing, prompt, exit codes), `server/src/auth/admins.ts` (`createAdmin`, `setPassword`, `setDisabled`, `listAdmins`, all taking an owner `Sql`), `server/test/auth/admins.test.ts`, `server/test/cli/admin.test.ts`, `server/package.json` (`"admin": "tsx --env-file-if-exists=.env src/cli/admin.ts"`)
- **Approach:** Follow `server/scripts/db-seed.ts` for the owner connection and error exit. Do not call `assertLocalDatabaseUrl`, because this must run in production. Write the hidden TTY prompt with `node:readline` by muting output; no dependency. Each mutation and its activity row go in one `sql.begin`.
- **Tests:**
  - `admins.test.ts` (owner DB): create → row with argon2id hash and lower-cased email; duplicate email → error; `setPassword` replaces the hash and deletes that admin's sessions only; `setDisabled(true)` deletes sessions and the API's `authenticate` now refuses; enable restores login with the old password; each writes its activity row with `actor_email = 'housing_owner'`; `listAdmins` output has no hash.
  - `cli/admin.test.ts` (spawn `tsx src/cli/admin.ts` against the test DB, password on stdin): `create` exits 0 and the admin can log in through `login`; `--password x` → exit 1 "unknown option"; a 5-character password → exit 1 and no row; unknown command → exit 1 with usage.
- **Done when:** tests pass, and `npm --prefix server run admin -- create --email dev@example.org` works against the compose DB followed by a curl login.
- **Depends on:** U2, U3 (U4 for the "can log in" assertions)
- **Status:** done

### U8. REST auth adapter in cookie mode
- **Goal:** The frontend REST adapter logs in, checks and logs out through the cookie only, on `/api/v1`.
- **Requirements:** R11, R3 (client mapping)
- **Files:** `src/features/housing/backend/rest/http.ts`, `.../rest/authProvider.ts`, `.../rest/endpoints.ts`, `.../interfaces/types.ts` (+ `'RATE_LIMITED'` in `ApiErrorCode`), `src/features/housing/pages/HousingLoginPage.tsx` (only if it doesn't already show `error.message` for unknown codes), `src/features/housing/backend/rest/authProvider.test.ts`
- **Approach:** Remove the token path listed in Technical decisions and update the header comments to match (`ORG-CMT-05`). Use one `API` prefix constant in `endpoints.ts`. Tests use `vi.stubGlobal('fetch', …)` in the root Vitest node environment, which has `BroadcastChannel` but no `localStorage`. That proves nothing touches storage, because the code would throw there.
- **Tests:** login posts `{email (trimmed), password}` to `${base}/api/v1/auth/login` with `credentials: 'include'` and no `authorization` header, and resolves to the user; a 401 body → `HousingApiError` `UNAUTHENTICATED` with the server's message; 429 → `RATE_LIMITED`; `currentUser` on 401 → null; logout posts and emits null even if the request fails; a second provider instance on the same channel receives the login event.
- **Done when:** root `npm test`, `npm run lint` and `npm run build` pass, and `npm run check:prod-bundle` still passes. `grep -rn housing_rest_token src` finds nothing.
- **Depends on:** U6 (paths and shapes)
- **Status:** done

### U9. Docs and live check
- **Goal:** The contract and migration notes describe what C2 built, and the login works in a real browser.
- **Requirements:** all (documentation and live proof)
- **Files:** `docs/api/API_CONTRACT.md` (§0 `/api/v1` line; §1.2 add 429 `RATE_LIMITED`; §2 cookie mode chosen, cookie name, timeouts, one 401 message (no 403 "not in admin list", since only admins exist), logout always 204, Origin rule, rate limit; §6 change-log row; §7 close TBD 1 and the rate-limit half of 2), `docs/architecture/migration-notes.md` (Decisions 1 and 2 settled; the `03_rls.sql` row now points at `0007_admin_auth.sql`; new "none → 0007" detail), the C2 plan's "Notes for later chunks"
- **Approach:** Update the contract in the same commit as the route behavior, per the migration-notes rule. Live check: `VITE_HOUSING_BACKEND=rest docker compose up`, create an admin with the CLI in the api container, then in Chrome log in at :5173. Check the cookie is HttpOnly in DevTools and `document.cookie` doesn't show it, reload stays logged in, logout returns to the login page, and a wrong password shows the one message. Other admin pages will show REST "not implemented" errors until C3/C4; that is expected.
- **Tests:** none new (docs); the live check above is recorded in the PR.
- **Done when:** docs merged with the code, and the live check passes.
- **Depends on:** U6, U7, U8
- **Status:** todo

## Verification
- `docker compose up -d db`
- `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH npm --prefix server ci && npm --prefix server run typecheck && npm --prefix server test && npm --prefix server run build`
- `npm --prefix server audit --omit=dev` (`ST-31`)
- Root: `npm run lint && npm run build && npm test && npm run check:prod-bundle`
- `npm run test:e2e:mock` (mock backend login specs must stay green; C2 changes no page behavior)
- Live check from U9.

## Risks and rollback
- **Migration 0007:** it only adds tables, so rollback is `npm --prefix server run db:rollback`, which drops both and with them every admin and session (`DB-MIG-05`). No production database runs it before cutover.
- **Number clash:** the other developer may port a new `supabase/sql` file as 0007 first. Check `origin/main` before U2 and renumber before merging if needed (the migration-notes working rule).
- **Memory rate limit:** correct only for one API process. If C6 runs PM2 in cluster mode, switch to a Postgres store before go-live. C6 must check this.
- **Native binaries:** if `@node-rs/*` has no prebuilt binary for the production box's platform, install fails loudly. The fallback is `argon2` + `bcryptjs`, which needs an install-script review.
- **Cross-site dev cookie:** UI :5173 and API :3001 are the same site (localhost), so `SameSite=Lax` cookies flow with `credentials: 'include'`. If a staging setup puts the UI and API on different sites, the cookie won't be sent. Keep them same-site (nginx `/api/v1` proxy).

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Notes for later chunks
- C3/C4: put `requireAdmin` on every write route, and pass `req.admin` (never request input) to `withActor()`.
- C4: `POST /api/v1/housing/activity` must not accept `login`/`logout` from the client, because the server already logs them and `HousingLoginPage`/`AdminShell` still call `logActivity` for both.
- C3: add other apps' origins to `ALLOWED_ORIGINS`. That allowlist is credentialed today; if public reads need uncredentialed CORS for more origins, split the two lists.
- C6: one API process (memory rate limit); set `COOKIE_SECURE=true` (default) and `TRUST_PROXY` to the real proxy count.
- C7: import admins with `id = auth.users.id`, `email` lower-cased, `password_hash = auth.users.encrypted_password`. If the export isn't possible, run `admin set-password` for each at cutover.

## Progress
- **Branch:** `migrate/c2-admin-login` (from `migrate/c1-server-db`)
- **Updated:** 2026-10-05 13:14
- **Next:** U9, update docs/api/API_CONTRACT.md §0, §1.2, §2, §6, §7 and docs/architecture/migration-notes.md, then the live check
- **Uncommitted:** none
- **Notes:** The local server/.env (gitignored) needs ALLOWED_ORIGINS and COOKIE_SECURE added by hand, like .env.example. U5: the cors package sends Allow-Credentials even to disallowed origins; harmless without Allow-Origin, and the test asserts only Allow-Origin. Cookie parsing is hand-written (no cookie dependency). U7: the hidden TTY prompt was checked by hand through a pseudo-terminal (not in the suite); in compose run the CLI with docker compose exec api npm run admin -- <command>. U8: HousingLoginPage already shows error.message for unknown codes, so it needed no change for RATE_LIMITED.
