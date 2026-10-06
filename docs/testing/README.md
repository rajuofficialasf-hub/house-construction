# Testing

Plan: [../plans/2026-10-04-1129-test-migration-safety-net-plan.md](../plans/2026-10-04-1129-test-migration-safety-net-plan.md). Diagram: [../diagrams/test-strategy.md](../diagrams/test-strategy.md).

The suite exists so that nothing is lost when the backend moves from Supabase to Express and PostgreSQL. It has three layers.

## Commands

| Command | What runs | Needs |
|---|---|---|
| `npm test` | Unit tests (`src/**/*.test.ts`) and backend-contract tests (`tests/contract/`) | nothing |
| `npm run test:e2e:mock` | Playwright: admin and write flows on the mock backend (`e2e/mock/`) plus the public flows on the mock backend (project `public-mock`, files in `e2e/live/`) | Chromium (`npx playwright install chromium`) |
| `npm run test:contract:supabase-local` | The full backend-contract suite, writes included, against a local Supabase stack built from `supabase/sql` (`supabase/config.toml` loads the files as seeds). Resets the local database first; `-- --no-reset` keeps it. Ports 55420-55429 | Docker and the Supabase CLI |
| `npm run test:e2e:live` | Playwright: the public read-only flows against the live Supabase project (`e2e/live/`). Skips cleanly without credentials | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` |
| `npm run check:prod-bundle` | Builds with `VITE_HOUSING_BACKEND=mock` and fails if any mock backend code is in the production bundle | nothing |
| `npm run test:all` | `i18n-check`, `npm test`, `check:prod-bundle`, `test:e2e:mock` | Chromium |
| `npm --prefix server test` | Server tests (`server/src/**/*.test.ts`, `server/test/`): config, errors, routes, photo storage and the ported SQL (serials, stats, bulk update, activity log, role privileges) on a real PostgreSQL. Rebuilds the `housing_test` database from the migrations first, checking that each down section undoes its up section. Photos go to a NAS driver on a temp folder. The S3 driver's contract and smoke tests are skipped unless `TEST_S3_BUCKET` and `TEST_S3_REGION` (plus `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and, for R2, `TEST_S3_ENDPOINT`) point at a test bucket; there is no local S3 because MinIO no longer publishes images | `docker compose up -d db` and Node 22 |
| `npm run test:contract:rest` | The full backend-contract suite, writes included, through the REST adapter against the Express app on `housing_test` | `docker compose up -d db` and Node 22 |
| `npm run test:e2e:rest` | Playwright: the public flows (`e2e/live/`) against the compose API (`VITE_HOUSING_BACKEND=rest`, project `public-rest`) | `docker compose up -d db api` with the dev seed |
| `npm run test:e2e:rest-admin` | Playwright: the admin flows (`e2e/mock/`), photos included, against an API it starts on `housing_test` (project `admin-rest`), storing photos in `.storage/e2e` | `docker compose up -d db` and Node 22 |
| `npm run test:e2e:edge` | Playwright: the public flows (`e2e/live/`) through nginx 1.20 with the box's locations, security headers and CSP (project `edge-rest`). Any CSP violation fails the test; the dev seed's `https://example.com/` photo placeholders are the only exception | `npm run build:edge`, then `docker compose --profile edge up -d db api edge` on a database whose photo URLs use the edge origin: a fresh seed, not one with photos uploaded through `:3001` |
| `npm run dev:mock` | The app on the mock backend, for manual checks. Admin login: see `MOCK_ADMIN` in `src/features/housing/backend/mock/fixtures.ts` | nothing |

## CI

`.github/workflows/ci.yml` runs on every push and pull request, with no secrets:
- `checks`: lint, both typechecks, `i18n-check`, `npm test`, `check:prod-bundle`, and `npm audit --omit=dev --audit-level=high` for both packages.
- `db-suites`, against a `postgres:17` service set up by `server/db/docker-init/01-init.sh`:
  - the three `housing_test` suites one after another (`npm --prefix server test`, `test:contract:rest`, `test:e2e:rest-admin`);
  - then, on the seeded `housing` database, `test:e2e:rest` against the built API, and `test:e2e:edge` through nginx 1.20.
- `e2e-mock`: `test:e2e:mock`.
- `deploy-config`: shellcheck, the PM2 file, and `nginx -t` on nginx 1.20 for every rendered vhost.

The S3 storage tests don't run in CI, which holds no AWS keys. They run once by hand against a test bucket (`docs/operations/runbook.md`, section 11).

## Rules

- **Live Supabase is read-only.** Serial counters never go down, so any create on live permanently skips a real serial number, and every admin login or logout adds activity-log rows. Live runs therefore cover only public read flows. The live contract runner (`tests/contract/supabase.readonly.contract.test.ts`) also blocks any request that could write, so a mistake fails the test instead of changing data.
- **Assert relationships, not data.** Tests check that filters narrow results, a detail view matches its row and totals add up. They never hard-code names or counts from real records.
- **Playwright servers use their own ports (5183 live, 5184 mock) and are never reused**, so a stray dev server cannot answer for the wrong backend. Live specs also block any non-read request to Supabase in the browser (`e2e/support/test.ts`).
- **Each Playwright test starts from the seed data.** Every test gets a fresh browser context, and the mock seeds itself per context, so tests do not depend on each other.

## The mock backend

`VITE_HOUSING_BACKEND=mock` selects an in-memory backend (`src/features/housing/backend/mock/`). It implements the same three interfaces as Supabase and follows [../api/API_CONTRACT.md](../api/API_CONTRACT.md): per-project serial counters that never decrease, admin-only writes, activity log, photo paths by serial. It works only in dev and test; a production build contains none of its code. Photo bytes are not stored; the dev server answers `/__mock-photos/...` with a placeholder image.

The mock keeps its state across page reloads inside one browser context. `window.__housingMock.reset()` restores the seed and logs out.

## Re-pointing the suite at the new backend

1. The REST `HousingApi` (`src/features/housing/backend/rest/index.ts`) calls the Express server for everything: reads, writes, photos and the activity log.
2. `npm run test:contract:rest` runs the whole suite (`writes: true`) through the REST adapter against the real Express app (`createApp`) on the local `housing_test` database.
   - Before every test, the database is reset to `server/db/seed/dev.sql` plus one admin.
   - A cookie-jar fetch (`tests/contract/cookieJarFetch.ts`) keeps the session cookie and sends the site's `Origin`, as a browser does.
   - The REST runner passes `photoPaths: 'opaque'`: the server's photo URLs carry a file id, not the serial, so the serial-path checks run only on the mock and Supabase.
   - Photos go to a NAS driver on a temp folder.
   - The two non-admin tests are skipped: the server has only admin accounts (contract §2).
   - Plain `npm test` skips this file.
3. `npm run test:e2e:rest-admin` runs the admin specs (`e2e/mock/`) in the `admin-rest` Playwright project.
   - The project starts the API on `housing_test` (port 3002) and the UI with `VITE_HOUSING_BACKEND=rest` (port 5186).
   - Before each test, the auto fixture in `e2e/support/backend.ts` resets the database to the mock seed and the mock admin (`e2e/support/rest-data.ts`). On the mock project the fixture does nothing.
   - The reset also stores small real WebP files for the seed records that have photos, in the same folder the API uses (`E2E_STORAGE_ROOT`, `e2e/support/rest-env.ts`). `scripts/e2e-rest-admin.mjs` empties that folder before each run.
   - The non-admin login spec is skipped.
4. `npm --prefix server test`, `npm run test:contract:rest` and `npm run test:e2e:rest-admin` all reset `housing_test`. Run them one after another, never at the same time.
5. A failing test names the lost behavior. Do not edit a test to make it pass unless the contract itself changed.

## Checked against real Supabase (local stack)

`npm run test:contract:supabase-local` runs every contract test, writes included, against Supabase itself: the same SQL, RLS, triggers and storage policies as the live project, in Docker. It never touches the live project. The test refuses any URL that is not localhost, because it holds a service key. That makes the contract a recording of how Supabase really behaves, not only of how we read the SQL. Serial rules, admin-only writes, the activity log, bulk validation and photo moves are all checked there.

### Known gaps on Supabase

These contract tests are expected to fail on Supabase (`KNOWN_GAPS` in `tests/contract/supabase.local.contract.test.ts`). The Supabase backend does not enforce these rules; only the UI does. The Express server must pass them. If one starts passing on Supabase, or a listed name stops matching a test, the run fails.

| Contract test | What Supabase does | What protects users today |
|---|---|---|
| over-long name, empty division, serial 0 | Accepts a 201-character name and an empty division. Treats serial 0 as "no serial" and assigns the next one | `RecordForm`: `maxLength=200`, required-field and serial checks (`e2e/mock/record-validation.spec.ts`) |
| text is trimmed and NFC-normalized on write | Stores the text as sent | `RecordForm` sends `nfc()` values (same spec) |
| more than 500 rows is too large | Accepts any size and saves in chunks of 200 | The import wizard sends batches of 200 |

### Found by this run

- `09_activity_log.sql` used `photo_kinds || 'prev'`, which Postgres reads as an array literal, so the trigger threw `malformed array literal` on any photo change. On Supabase that broke every photo upload, photo delete and serial change of a record with photos. The mock hid it. The file now uses `array_append`. **The live project needs the corrected `housing_log_record_change()` function applied** (re-run `09_activity_log.sql`), unless it was already fixed there by hand.
- The NFC contract test used text that was already NFC, so it could not fail. It now writes U+09DC, which NFC turns into ড + nukta.

## Behaviors the specs recorded

- The public list has no sort control; it is always ordered by serial. Sorting by other fields exists only in the API.
- CSV export is an admin feature (`/housing/admin/semi-pucca`), so its spec is in `e2e/mock/`.
- The bulk import wizard validates in the browser and sends only valid rows. A file with an invalid row imports the valid rows and reports the invalid one. The all-or-nothing rule applies to one batch sent to the API and is checked in the contract suite.
- The Supabase adapter splits a bulk insert into chunks of 200 and can stop after earlier chunks were saved. The contract in section 4.9 says one transaction. On the Express server, one request is one transaction, and the REST adapter doesn't split (C4). The import page already sends 200 rows at a time.
- On the map, the caption counts only records whose district and upazila exist in the map data, so it can be lower than the stat card total.
