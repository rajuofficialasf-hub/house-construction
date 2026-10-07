# Developer guide

How to run the project, add a feature end to end, and test it. Read this first; it links out for the details.

The app is a React UI (`src/`) and an Express API with PostgreSQL (`server/`). The UI reaches the API only through the adapters in `src/backend/`. The rules every change follows are in [CLAUDE.md](../CLAUDE.md); the API is described in [api/PROJECTS_API_CONTRACT.md](api/PROJECTS_API_CONTRACT.md), and the architecture and its decisions in [architecture/migration-notes.md](architecture/migration-notes.md).

## 1. Before you start

- **Docker Desktop**, running. It is enough to run the app.
- **Node 22** (the version is in `.nvmrc`). You need it for tests and for running the API or UI outside Docker.
- **git**, and a clone of the repo.

## 2. Run it

From the repo root:

```bash
docker compose up
```

This starts four containers. They are reachable only from this machine:

| Container | What it does | Address |
|---|---|---|
| `db` | PostgreSQL 17. A fresh volume gets the roles and two databases: `housing` (dev) and `housing_test` (tests) | `127.0.0.1:5432` |
| `s3` | The local S3 that holds the photos: SeaweedFS's S3 gateway (MinIO no longer publishes a server image), with the buckets `housing-photos` (the API's) and `housing-photos-test` (tests). Production uses a private S3 bucket; the NAS driver is the next step | `127.0.0.1:8333` |
| `api` | Runs the migrations, then seeds a database that has never had records (20 sample records and a draft `demo` project), then starts the API and reloads it when you save | http://localhost:3001 |
| `web` | The UI on the REST backend, reloading when you save | http://localhost:5173 |

The first start takes a few minutes, because each Node container runs `npm ci` into its own volume. The stack is ready when the `api` log shows `housing API listening` and http://localhost:3001/api/v1/readyz answers. The home page then shows the published projects.

No `.env` file is needed; `compose.yaml` holds the local settings. To run the UI on the in-memory mock backend instead of the API: `VITE_HOUSING_BACKEND=mock docker compose up`.

### Create your login

There is no sign-up page. Admins are made with the server's CLI. In a second terminal:

```bash
docker compose exec api npm run admin -- create --email you@example.org --name "Your Name" --role main_admin
```

It asks for the password twice. Type a dev-only password at the prompt; never put it on the command line. Then log in at http://localhost:5173/admin/login.

There are three roles:

| Role | Who | Can |
|---|---|---|
| `main_admin` | One login only, set only by the CLI | Everything, including every delete and the users page (`/admin/users`) |
| `admin` | Staff | Every project: add, edit, import, project settings. No deletes (the UI also hides replacing a photo, emptying a filled value and changing a serial) |
| `editor` | A project user | Add and fill in records only in the projects the main admin gives it on `/admin/users` (or "all projects"). No deletes, replacing a photo, emptying a filled value, serial changes or project settings |

Only one `main_admin` can exist. If one already exists in your database, create yourself with `--role admin`, or move the role with `set-role`. The other commands are `set-role`, `set-password`, `disable`, `enable` and `list`:

```bash
docker compose exec api npm run admin -- list
docker compose exec api npm run admin -- set-role --email you@example.org --role admin
```

[ADMIN_GUIDE.md](ADMIN_GUIDE.md) (Bangla) explains the admin panel itself.

### Start over

```bash
docker compose down -v
```

This deletes the database, the uploaded photos and the containers' `node_modules`. The next `docker compose up` migrates and seeds again, and you create your login again.

### Running the API or the UI on your machine

Use this when you want your editor's debugger, or faster restarts. The database stays in Docker:

```bash
npm ci && npm --prefix server ci
cp server/.env.example server/.env    # matches compose.yaml's local values
cp .env.example .env.local            # the UI: REST backend, API at http://localhost:3001
docker compose up -d db s3              # Postgres and the local S3 for photos
npm --prefix server run db:migrate
npm --prefix server run db:seed       # safe to run again
npm --prefix server run dev           # API on http://localhost:3001
npm run dev                           # UI on http://localhost:5173, in another terminal
```

From here the CLI runs as `npm --prefix server run admin -- …`. If the `api` container is running, stop it first (`docker compose stop api`), because both want port 3001. `npm run dev:mock` runs the UI with no API on an in-memory mock backend (login: `MOCK_ADMIN` in `src/backend/mock/fixtures.ts`). `npm run build` type-checks and builds the production bundle into `dist/`.

### The pages

| Path | What | Login |
|---|---|---|
| `/` | Home: a card for every published project, with total projects, beneficiaries and districts | no |
| `/<group>` (for example `/housing`) | Group landing: its sub-projects' cards | no |
| `/<project>` or `/<group>/<project>` (for example `/self-reliance`, `/housing/semi-pucca`) | The list: stat cards, map, filters (`?year=&division=&district=&upazila=&union=&f_<field>=&q=&page=`), table or cards | no |
| `…/<project>/<serial>` | Detail (a modal): a before-and-after slider, or one photo for after-only projects; ←/→ move between records | no |
| `/admin/login` | Admin login | — |
| `/admin` | Dashboard | admin |
| `/admin/projects`, `/admin/projects/new`, `/admin/projects/<key>?tab=general\|fields\|stats\|photos\|display` | Project list, the new-project wizard, settings (fields, stat cards, photos, display, cover, publish) | admin |
| `/admin/records/<key>`, `…/new`, `…/<serial>/edit` | Records: list, add, edit; CSV export | admin (deletes: main admin) |
| `/admin/import?project=<key>` | Bulk import (add new, or update by serial) | admin |
| `/admin/photos?project=<key>` | Bulk photo upload, matched by file name | admin |
| `/admin/activity` | Activity log | admin |
| `/admin/users` | Users: change a role, give a project user its projects, disable and enable logins (new logins come from the CLI) | main admin |
| `/housing/admin/...` | Old links, redirected to `/admin/...` | — |

A draft project's pages are shown only to admins (with a yellow "খসড়া" banner); a visitor gets "not found".

## 3. Add a feature end to end

Work through these steps in order. The worked example is user management (`/admin/users`): the `editor` role and the main admin's users page. Open its files next to this list.

1. **Migration.** Create `server/db/migrations/00NN_<name>.sql` by hand with the next free number (the last one is in `ls server/db/migrations`). Example: `server/db/migrations/0019_editor_role.sql`.
   - It has `-- migrate:up` and `-- migrate:down`, and the down section removes everything the up adds. The server tests roll every migration back, so a broken down section fails them.
   - A new table gets `revoke all … from public` and explicit grants to `housing_app`, the role the API runs as. A new function gets `grant execute … to housing_app`, because `0006_app_role_grants.sql` revokes PUBLIC execute by default. Index every foreign key.
   - Never edit a migration that has already run, even only on your machine. Write a new one.
   - Try it: `docker compose exec api npm run db:migrate`, then `db:rollback`, then `db:migrate` again (or `npm --prefix server run …` on the host flow).
2. **Database tests** in `server/test/db/` for the rules the migration enforces, and who may do what. Example: `server/test/db/editor-role.test.ts`.
3. **Route** in `server/src/routes/v1/`. Example: `server/src/routes/v1/admin-users.ts`, with its zod schemas in `server/src/auth/userSchemas.ts` and its queries in `server/src/auth/users.ts`.
   - Each route names its own guard: `requireAdmin`, or a main-admin guard such as `requireMainAdminForUsers` (they are all built by `mainAdminOnly` in `server/src/auth/middleware.ts`). A write to a project's data also calls `requireProjectScope` (`server/src/auth/scope.ts`), so an `editor` stays in its projects.
   - Validate every input with zod. Refuse with `AppError` (`server/src/errors.ts`). Queries are postgres.js tagged templates only.
   - A response that only admins see uses `privateNoStore` (`server/src/routes/v1/shared.ts`).
   - Mount the router in `server/src/app.ts`. A new public `GET` also goes in `PUBLIC_READ_ROUTES` there; nothing else is open to other sites.
4. **OpenAPI and the contract.** Add the path to `server/src/openapi.ts` and a line to [api/PROJECTS_API_CONTRACT.md](api/PROJECTS_API_CONTRACT.md). `server/test/http/openapi.test.ts` fails if a path is missing from the contract, or if a guarded route lists no 403.
5. **Server HTTP test** through the real app and the real test database. Include the refusals: 401 for a visitor, 403 for the wrong role, and another user's or another project's data. Example: `server/test/http/admin-users.test.ts`. The helpers are in `server/test/support/` (`resetTestData`, `insertAdmin`, `loginAdmin`).
6. **UI adapter.** Add the method to the interface in `src/backend/interfaces/`, the REST call in `src/backend/rest/endpoints.ts` and `src/backend/rest/index.ts`, and the wiring in `src/backend/factory.ts`.
   - **The mock doesn't grow.** Anything about the project registry or user management answers `NOT_IMPLEMENTED` in the mock (see `notInMock` in `factory.ts`), and its specs run only against the server.
7. **Contract block** in `tests/contract/`, run against the server by `tests/contract/rest.contract.test.ts`. Example: `tests/contract/adminUsersContract.ts`.
8. **The page** under `src/features/`. It calls the API only through `src/backend` (the example's `src/features/admin/users/AdminUsersPage.tsx` uses `getAdminUsersApi()`). The project list comes from the registry store's hooks (`useProjects` in `src/features/projects/registry/`). The UI text is Bangla, and each string also gets its English entry in `src/i18n/en.ts` (`npm run i18n-check` finds missing ones).
9. **Playwright spec** in `e2e/admin/` (it runs only against the server). Example: `e2e/admin/admin-users.spec.ts`. Import `test` from `e2e/support/backend.ts`, which resets the test database before each test, and log in with `e2e/support/auth.ts` and the logins in `e2e/support/rest-data.ts`.

Before you write SQL or a guard, read these lessons in `docs/learnings/`:
- [database/postgres-default-privileges-public-execute.md](learnings/database/postgres-default-privileges-public-execute.md)
- [database/raised-sqlstate-has-no-constraint-name.md](learnings/database/raised-sqlstate-has-no-constraint-name.md)
- [database/postgres-js-helper-breaks-after-table-alias.md](learnings/database/postgres-js-helper-breaks-after-table-alias.md)
- [security/postgres-session-setting-guards-are-spoofable.md](learnings/security/postgres-session-setting-guards-are-spoofable.md)

## 4. Test it

Install once: `npm ci`, `npm --prefix server ci`, and the Playwright browser with `npx playwright install chromium`. The suites marked "db" need `docker compose up -d db` (the full `docker compose up` works too).

| When you changed | Run |
|---|---|
| Anything | `npm run lint`, `npx tsc -b`, `npm test` |
| Server code or a migration | `npm --prefix server run typecheck`, `npm --prefix server test` (db) |
| Photo storage (`server/src/storage/`) | `npm --prefix server test` with `docker compose up -d db s3` and the `TEST_S3_*` settings in [testing/README.md](testing/README.md#s3-storage-tests), so the S3 tests run instead of skipping |
| A route or an adapter method | `npm run test:contract:rest` (db) |
| An admin page or flow | `npm run test:e2e:rest-admin` (db); also `npm run test:e2e:mock` if you touched `e2e/mock/` or the mock |
| A public page | `npm run test:e2e:rest`, with `docker compose up -d db api` running and `GET http://localhost:3001/api/v1/projects` answering |
| Before you push | `npm run test:all` and `npm run build` |

**`npm --prefix server test`, `npm run test:contract:rest` and `npm run test:e2e:rest-admin` all reset the `housing_test` database. Run them one after another, never at the same time.** They don't touch your dev data in `housing`.

### Other checks and tools

```bash
npm run i18n-check                # Bangla UI text with no English entry in src/i18n/en.ts
npm run check:prod-bundle         # no mock code and no old-system code in the production build
npm run field-types-check         # field types: parse, format and CSV
npm run geo-check                 # geography and unions, the unions chunk and the bundle size
npm run build-unions -- --check   # is the unions list up to date
npm run build-map -- --in gadm41_BGD_3.json   # rebuild the upazila map's TopoJSON
```

### What CI checks

Every push and pull request runs `.github/workflows/ci.yml`. It has three jobs:

- **`checks`:** `npm run lint`, shellcheck on the two shell scripts, `npm run build`, the server typecheck, `npm run i18n-check`, `npm test`, `npm run check:prod-bundle` (no mock code and no old-system code in the production bundle), and `npm audit` for both packages.
- **`db-suites`:** on a PostgreSQL 17 service, the server tests, `test:contract:rest` and `test:e2e:rest-admin`. Then it migrates and seeds the dev database, starts the built API and runs `test:e2e:rest`.
- **`e2e-mock`:** `npm run test:e2e:mock`.

Test details and rules, including how each suite resets its data and the S3 storage tests and the real-bucket check you run by hand, are in [testing/README.md](testing/README.md).

---

Looking for something the old version had? [history/README.md](history/README.md) says where each removed part can be restored from.
