# Architecture notes

How the housing site is built today, and the decisions behind it. The API contract is [../api/PROJECTS_API_CONTRACT.md](../api/PROJECTS_API_CONTRACT.md); the pictures are in [../diagrams/backend-architecture.md](../diagrams/backend-architecture.md). The project started on Supabase and moved to this stack; that history, and where to restore anything removed, is in [../history/README.md](../history/README.md).

## The stack

- **UI:** React 19 and Vite (`src/`). Pages talk to the backend only through the adapters in `src/backend/`, which `src/backend/factory.ts` picks from `VITE_HOUSING_BACKEND`: `rest` (the default) calls the API, and `mock` (dev and tests only) keeps everything in memory.
- **API:** Express 5 and TypeScript (`server/`), mounted at `/api/v1`. The OpenAPI document is served at `/api/v1/openapi.json`.
- **Database:** PostgreSQL 17 through postgres.js tagged templates, with dbmate SQL migrations in `server/db/migrations/`. Migrations run as `housing_owner`; the API runs as `housing_app`, which may read everything but writes only what `0006` and later migrations grant.
- **Photos:** the storage adapter in `server/src/storage/`. The NAS driver is used in dev and tests; the S3 driver is built but unused.

## Decisions

1. **Sessions:** an opaque token in an HttpOnly cookie, not a JWT. Only its SHA-256 is stored. Sessions end after 8 hours idle or 7 days in all. Admins are rows in `housing_admins`, created and changed only by the admin CLI (`npm --prefix server run admin -- …`). Passwords are argon2id; no other hash scheme is accepted.
2. **Roles:** `admin` and `main_admin`, at most one `main_admin` (`0012`). Every delete (records, photos, projects, fields, covers, private values) needs `main_admin`, and the API checks it (`requireMainAdmin`). A database guard keyed to a session setting could be switched off by the app role (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`), so who may do what lives in the API.
3. **Visibility:** a visitor sees only published projects whose group is also published (`housing_public_project_keys()`), and only their public fields. An admin session also sees drafts and private fields. A draft's records, stats, files and cover are 404 to a visitor. Any response whose body depends on the session sends `Cache-Control: private, no-store` (admins) or `Vary: Cookie` (visitors).
4. **Rules in the database:** field-value checks, record validation and the project and field guards are triggers (`0013`, `0015`). They raise our own SQLSTATE `HC400` or `HC409` with fixed Bangla text, and `server/src/errors.ts` passes only that class's message and field key (`details.field`) to the client. Every other database error keeps a fixed message.
5. **Private values** (phone, NID and other admin-only fields) live in `housing_beneficiary_private`, apart from the public record. They are read and written only through the admin routes, never logged (the activity log records the changed key names only), and redacted from request logs.
6. **CORS:** the site's own origins (`ALLOWED_ORIGINS`) get credentialed CORS. Other apps' origins (`PUBLIC_READ_ORIGINS`) get credential-less CORS on the public GET routes listed in `PUBLIC_READ_ROUTES` (`server/src/app.ts`), photos and `openapi.json` only, and never pass the write Origin check. An origin may be on only one list.
7. **Rate limits**, counted in memory per process: login failures per IP, public reads 300 per IP per minute (`READ_RATE_LIMIT` raises it where one IP is many users), photos 1200 per IP per minute, and writes 120 per admin per minute (a bulk request counts as one).
8. **Writes:** every write needs an admin session, checked before the body is read, and an allowed Origin. The acting admin for the activity log always comes from the session (`withActor()`), never from the request. Bodies are capped at 100 KB, except the bulk import (up to 500 rows in one transaction, 10 MB) and the photo uploads.
9. **Serials:** each project has its own counter from 1. A serial is never reused, even after a delete, and a serial change moves no file.
10. **Photos:** every upload gets server-made UUID keys and rows in `housing_files`; a record's photo columns hold `PUBLIC_API_URL/api/v1/photos/<file id>`, and a project's `cover_path` holds its cover's URL. The server re-encodes every upload as WebP with all metadata removed and makes the thumbnail. A replaced or deleted photo is marked in the transaction and removed from storage after commit; `npm --prefix server run files:sweep` retries any removal that failed. Visitors may cache a public photo for a day.

## Migrations

Each migration has a down section that undoes its up section; the server's test setup runs every down section to prove it. A new rule or table is always a new migration, never an edit of one that has run.

| Migration | What it holds |
|---|---|
| `0001_housing_schema` | The records table, `housing_beneficiaries` |
| `0002_serial` | Per-project serial counters and serial changes |
| `0003_stats` | Single-project stats and years (dropped by `0018`) |
| `0004_bulk_update` | Bulk update by serial (replaced by `0014`'s v2) |
| `0005_activity_log` | The activity log and its triggers |
| `0006_app_role_grants` | What `housing_app` may do; nothing is granted to `PUBLIC` |
| `0007_admin_auth` | Admins and their login sessions |
| `0008_read_indexes` | Indexes for the records list's sorts |
| `0009_housing_files` | Stored photo files, one row per object in storage |
| `0010_search_and_activity_indexes` | Trigram indexes for the list search and the activity log's filters |
| `0011_projects_registry` | Projects, their fields, private values, and `union_name` and `extra` on records |
| `0012_admin_roles` | The `admin` and `main_admin` roles |
| `0013_record_rules` | Field-value and record checks |
| `0014_record_functions_v2` | Leaf keys, bulk insert and update v2, the activity log v2 |
| `0015_project_guards` | Project and field guards, project creation, reorders, field usage and value rename, covers |
| `0016_project_stats` | A project's stats and the home-page overview |
| `0017_photo_mode_guard_count` | The photo-mode guard's record count |
| `0018_drop_housing_stats_years` | Drops the unused `0003` functions |

## Working rules

1. The UI calls the backend only through `src/backend/` adapters.
2. A new route lands with its contract section in `docs/api/PROJECTS_API_CONTRACT.md`, its OpenAPI entry, its REST adapter method and its tests, in the same change. A server test checks that every OpenAPI path appears in the contract.
3. Database changes are new numbered migrations with a down section and explicit `housing_app` grants.
4. The mock backend doesn't grow: it keeps three fixed projects for fast UI work and the `mock` specs. Features that need the project registry are tested against the server (`docs/testing/README.md`).

## Hosting requirements

The repo has no deploy tooling. Whoever hosts the app must provide these protections, which live outside the app's code. They were last applied by the nginx config that `git show pre-p9:deploy/nginx/` holds.

- **Security headers on the UI** (the API sets its own with helmet):
  - `Strict-Transport-Security: max-age=31536000`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`. This assumes the API is served at `/api/v1` on the UI's own origin, so photo URLs (`PUBLIC_API_URL/api/v1/photos/<id>`) are same-origin.
- **Request body limits at the proxy**, so an oversized body is refused before it reaches Node:
  - 1 MB for everything else
  - 11 MB for the bulk import (`POST`/`PUT /api/v1/projects/:key/records/bulk`, which the API caps at 10 MB of JSON) and the uploads (`PUT /api/v1/records/:id/photos/:slot` and `PUT /api/v1/projects/:key/cover`: two parts of up to 5 MB each)
- **Client IP:** the proxy in front of the API overwrites `X-Forwarded-For` with the address it saw, never appends to it. `TRUST_PROXY` is set to the number of proxy hops in front of the API (1 for a single nginx). Otherwise a client-sent `X-Forwarded-For` reaches the login and write rate limiters, and anyone can dodge them.
- **Cookies:** `COOKIE_SECURE=true` whenever the site is served over HTTPS, so the session cookie is never sent in clear text.
