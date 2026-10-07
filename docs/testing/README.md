# Testing

Diagram: [../diagrams/test-strategy.md](../diagrams/test-strategy.md).

One contract, checked at three layers (unit and server tests, the backend contract, browser specs) against two backends: the Express server on a real PostgreSQL test database, and the in-memory mock. The server is the reference: there is no second implementation to compare against, so a rule counts as tested when a test on the server proves it.

## Commands

| Command | What runs | Needs |
|---|---|---|
| `npm test` | UI unit tests (`src/**/*.test.ts`) and the backend contract on the mock (`tests/contract/mock.contract.test.ts`, the `HousingApi` part) | nothing |
| `npm --prefix server test` | Server tests (`server/src/**/*.test.ts`, `server/test/`): config, errors, every route through Supertest on the real app, photo storage, and the SQL rules (serials, guards, stats, bulk, activity log, role privileges) on a real PostgreSQL. Rebuilds the `housing_test` database from the migrations first, checking that each down section undoes its up section. Photos go to a NAS driver on a temp folder. The S3 driver's tests skip unless `TEST_S3_BUCKET` and `TEST_S3_REGION` (plus `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and, for R2, `TEST_S3_ENDPOINT`) point at a test bucket | `docker compose up -d db` and Node 22 |
| `npm run test:contract:rest` | The whole backend contract, writes included, through the REST adapter against the Express app on `housing_test`: the `HousingApi` part, the `ProjectsApi` part (`tests/contract/projectsApiContract.ts`: registry, fields, covers, custom and private values, field stats, filtered stats, AE1–AE3) and the `AdminUsersApi` part (`tests/contract/adminUsersContract.ts`: the users page and a project user's limits) | `docker compose up -d db` and Node 22 |
| `npm run test:e2e:rest-admin` | Playwright: the admin flows (`e2e/mock/`) and the project-registry flows (`e2e/admin/`: wizard, settings, field and stat-card builders, covers, import with custom and private fields, CSV export, category rename, delete rules, filtered stat cards, the users page and a project user's view), photos included, against an API it starts on `housing_test` (project `admin-rest`), storing photos in `.storage/e2e` | `docker compose up -d db` and Node 22 |
| `npm run test:e2e:rest` | Playwright: the public flows (`e2e/public/`) against the compose API (`VITE_HOUSING_BACKEND=rest`, project `public-rest`) | `docker compose up -d db api` with the dev seed, and the API answering `GET /api/v1/projects` (after `docker compose down -v` the `api` container reinstalls `node_modules` first) |
| `npm run test:e2e:mock` | Playwright: the admin and write flows (`e2e/mock/`, project `mock`) and the public flows (`e2e/public/`, project `public-mock`) on the mock backend | Chromium (`npx playwright install chromium`) |
| `npm run check:prod-bundle` | Builds with `VITE_HOUSING_BACKEND=mock` and fails if the production bundle holds any mock backend code or the word `supabase` | nothing |
| `npm run test:all` | `i18n-check`, `npm test`, `check:prod-bundle`, `test:e2e:mock` | Chromium |
| `npm run test:contract:rest-readonly` | The read contract through the REST adapter against any running site: the compose API by default, or another host with `REST_READONLY_URL=https://<host>`. The fetch underneath refuses anything but GET, HEAD and OPTIONS, and the suite skips the one test that sends refused writes (`writeProbes: false`). Never in CI | a running API with data |
| `npm run dev:mock` | The app on the mock backend, for manual checks. Admin login: see `MOCK_ADMIN` in `src/backend/mock/fixtures.ts` | nothing |

**`npm --prefix server test`, `npm run test:contract:rest` and `npm run test:e2e:rest-admin` all reset `housing_test`. Run them one after another, never at the same time.**

## CI

`.github/workflows/ci.yml` runs on every push and pull request, with no secrets:
- `checks`: lint, shellcheck of the two shell scripts, both typechecks, `i18n-check`, `npm test`, `check:prod-bundle`, and `npm audit --omit=dev --audit-level=high` for both packages.
- `db-suites`, against a `postgres:17` service set up by `server/db/docker-init/01-init.sh`:
  - the three `housing_test` suites one after another (`npm --prefix server test`, `test:contract:rest`, `test:e2e:rest-admin`);
  - then, on the seeded `housing` database, `test:e2e:rest` against the built API.
- `e2e-mock`: `test:e2e:mock`.

The S3 storage tests don't run in CI, which holds no AWS keys. They run once by hand against a test bucket (below).

## S3 storage tests, by hand

The S3 driver is built but unused: dev and tests store photos with the NAS driver. Its contract and smoke tests skip without a bucket, and there is no local S3. Before the S3 driver is ever switched on, run them once against a test bucket, never a real one:

1. Create a test bucket (for example `<org>-housing-photos-test`) with all four public-access blocks on and default encryption.
2. Create a temporary IAM user whose policy allows only `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on the bucket's objects and `s3:ListBucket` on the bucket. `ListBucket` makes S3 answer a missing key with 404; without it S3 answers 403, which the photo route turns into a 500.
3. On a developer machine, with `docker compose up -d db`:

   ```sh
   TEST_S3_BUCKET=<org>-housing-photos-test TEST_S3_REGION=<region> \
   AWS_ACCESS_KEY_ID=<test key> AWS_SECRET_ACCESS_KEY=<test secret> \
   npm --prefix server test
   # the S3 storage tests must run, not skip
   ```

4. Delete the test user's key and empty the test bucket afterwards.

## Rules

- **Assert relationships, not data.** Tests check that filters narrow results, a detail view matches its row and totals add up. They never hard-code names or counts from records that could change.
- **A failing test names a lost behavior.** Don't edit a test to make it pass unless the contract itself changed (`docs/api/PROJECTS_API_CONTRACT.md`).
- **Playwright servers use their own ports (5184 mock, 5185 public-rest, 5186 admin-rest) and are never reused**, so a stray dev server can't answer for the wrong backend.
- **Each Playwright test starts from the seed data.** Every test gets a fresh browser context; the mock seeds itself per context, and on `admin-rest` the auto fixture in `e2e/support/backend.ts` resets the database before each test.
- **A new route lands with its tests:** a server test through the real app, including the refused cases (401, 403, another admin's or a visitor's access), and a contract block if the UI calls it.

## The mock backend

`VITE_HOUSING_BACKEND=mock` selects an in-memory backend (`src/backend/mock/`). It works only in dev and test; a production build contains none of its code. It follows the contract for records: per-project serial counters that never decrease, admin-only writes, deletes for the main admin only, the activity log, and photo paths by serial. Photo bytes are not stored; the dev server answers `/__mock-photos/...` with a placeholder image. It keeps its state across page reloads inside one browser context; `window.__housingMock.reset()` restores the seed and logs out.

**The mock doesn't grow.** It keeps three fixed projects (the housing group, সেমিপাকা and টিন) and refuses project and field edits. The registry's rules (guards, stats, private fields, covers) live in the database, and a TypeScript copy would drift from them. So:
- the contract's `ProjectsApi` and `AdminUsersApi` parts run only on REST: the mock has no `AdminUsersApi` (it answers `NOT_IMPLEMENTED`), and its auth gives every admin every project;
- specs that need the registry go in `e2e/admin/` and run only on `admin-rest`;
- `e2e/mock/` specs run on both `mock` and `admin-rest`, so keep them to what the three fixed projects can do.

## The suites on the server

1. `npm run test:contract:rest` runs the whole contract (`writes: true`) through the REST adapter against the real Express app (`createApp`) on the local `housing_test` database.
   - Before every test, the database is reset to `server/db/seed/dev.sql` plus one main admin, one plain admin and one project user assigned `tin`.
   - A cookie-jar fetch (`tests/contract/cookieJarFetch.ts`) keeps the session cookie and sends the site's `Origin`, as a browser does.
   - The REST runner passes `photoPaths: 'opaque'` (the server's photo URLs carry a file id, not the serial) and `unknownProjectCode: 'NOT_FOUND'` (the project key is in the path).
   - The two non-admin tests are skipped: the server has only admin accounts.
   - Plain `npm test` skips this file.
2. `npm run test:e2e:rest-admin` runs `e2e/mock/` and `e2e/admin/` in the `admin-rest` Playwright project.
   - It starts the API on `housing_test` (port 3002) and the UI with `VITE_HOUSING_BACKEND=rest` (port 5186). The API gets `READ_RATE_LIMIT=100000`, because the whole run is one IP and would hit the 300-a-minute read limit.
   - Before each test the database is reset (`e2e/support/rest-data.ts`): the mock seed, the dev seed's draft `demo` project with custom and private fields (`server/db/seed/demo-project.sql`), the mock admin as main admin, a plain admin (`PLAIN_ADMIN`, may write but not delete) and a project user (`PROJECT_EDITOR`, role `editor`, assigned `tin`).
   - The reset also stores small real WebP files for the seed records that have photos, in the folder the API uses (`E2E_STORAGE_ROOT`, `e2e/support/rest-env.ts`). `scripts/e2e-rest-admin.mjs` empties that folder before each run.
   - The non-admin login spec is skipped.
3. `npm run test:e2e:rest` runs the public specs on the dev database through the compose API.

## Behaviors the specs recorded

- The public list has no sort control; it is always ordered by serial. Sorting by other fields exists only in the API.
- CSV export is an admin feature, so its specs are in `e2e/mock/` and `e2e/admin/`.
- The bulk import wizard validates in the browser and sends only valid rows. A file with an invalid row imports the valid rows and reports the invalid one. The all-or-nothing rule applies to one batch sent to the API: one request is one transaction, and the import page sends 200 rows at a time.
- On the map, the caption counts only records whose district and upazila exist in the map data, so it can be lower than the stat card total.
