---
title: Pluggable Photo Storage (S3 and NAS) for the Housing API
type: feat
status: ready
date: 2026-10-04
---

# Pluggable Photo Storage (S3 and NAS) for the Housing API

## Goal
The housing API can store and serve photos on S3 (including S3-compatible services like Cloudflare R2) or on the local NAS. Switching between them is an env change plus one copy-script run, and existing records and UI links keep working.

## Problem
Photos go to Supabase Storage today. The plan is to move them to S3 and then to the organization's NAS (`docs/plans/2026-10-04-1357-housing-service-own-stack-plan.md`). Without a common storage layer, each move means rewriting upload, delete and serve code and rewriting every stored URL. The NAS standard also requires that only the API touches files (`NS-10`), so this layer must live on the server.

## Requirements
- **R1** The server has one storage interface that every route and service uses for photos. No code outside a driver file imports an S3 client or touches the filesystem for photos.
- **R2** An S3 driver implements the interface and works with AWS S3 and S3-compatible services (R2, MinIO) through endpoint, bucket and credentials in config.
- **R3** A NAS driver implements the interface and stores files under `STORAGE_ROOT`. It rejects any key that resolves outside that root (`NS-02`) and streams reads and writes (`NS-04`).
- **R4** The `STORAGE_DRIVER` env var (`s3` | `nas`) picks the active driver. The server refuses to start if the value is unknown or that driver's config is missing or invalid.
- **R5** Adding a driver means adding one driver file and one line in the driver registry. Removing a driver means deleting the file and its line. No other code changes.
- **R6** Every stored file gets a key that the server generates, like `housing/<uuid>.webp` (`NS-01`). The housing record stores the key, never a full URL.
- **R7** The browser always loads photos from one API route (for example `GET /api/v1/photos/<key>`), which streams the file from the active driver. The URL shape does not depend on the driver.
- **R8** The photo route lets a viewer see a photo exactly when they could see its housing record (`NS-10`). It sends `X-Content-Type-Options: nosniff` and correct caching headers (`NS-11`).
- **R9** Changing a record's serial number does not move or rename any stored file.
- **R10** A CLI script copies every file from one configured driver to another (for example S3 → NAS). It skips files already copied, verifies each copy by size or checksum, and reports any missing or failed files. Running it again after an interruption is safe.
- **R11** In local development the NAS driver runs against a local folder, so uploads work without S3 or the real NAS (`NS-20`).
- **R12** The same backend-contract test suite runs against every driver. Each driver passes the same upload, read, delete and not-found cases.

## Scope
- In: the server-side storage interface, the S3 and NAS drivers, the env-based registry, the photo-serving route, the record-stores-key change, and the driver-to-driver copy script.
- Out (not now):
  - Changing the browser-side Supabase adapter (`src/features/housing/backend/supabase/imageStorage.ts`). It stays as it is until the Supabase migration.
  - A server-side Supabase Storage driver.
  - Moving photos out of Supabase into the first server driver. That belongs to the own-stack plan's import step, though it can reuse R10's script shape.
  - Image processing (re-encode, thumbnails, EXIF strip). That stays in the own-stack plan's U6 and sits above this layer.
  - Using more than one driver at the same time (for example, reading from both during a switch).

## Key decisions
- **Server-side only. Supabase stays in the browser as it is**: Supabase is going away soon, and S3 secrets and NAS access can't live in the browser (`NS-10`). Governs R1 and the scope.
- **Store keys, serve every photo through the API**: switching drivers then needs no DB rewrite and no UI change. Governs R6, R7 and R8.
- **Env var plus a registry for selection**: switching drivers is a config change, not a code edit. A new driver is one file plus one line. Governs R4 and R5.
- **UUID keys instead of serial-based paths**: follows `NS-01`, and drivers no longer need a `move` operation because serial changes don't touch files. Governs R6 and R9.
- **A generic copy script is part of this work**: each future switch becomes one env change plus one script run. Governs R10.
- **Supersedes part of the own-stack plan**: this replaces D7's public R2 custom-domain URLs (photos are now served through the API, not straight from the bucket) and the storage part of U6. That plan should be updated to point here.

## Success criteria
- Moving from S3 to NAS in staging needs only the copy script, an env change and a restart. No code change, DB migration or UI change.
- The contract suite (R12) passes for both drivers in CI. The S3 driver runs against MinIO or a similar local S3 service.

## Open questions
- ~~**Photo route performance**~~ (answered in Technical decisions: each upload gets a new UUID key, so photo responses are immutable and Cloudflare can cache them at the edge for a long time.)

## Technical decisions
- **Follow `storage.md` exactly** (`NS-30`..`NS-35`): `types.ts` (`StorageDriver` with `put`/`get`/`remove`, streams in and out), `index.ts` (a registry map plus the exported `storage`), `drivers/nas.ts`, `drivers/s3.ts`. The folder is `server/src/storage/`, not `apps/api/src/storage/`, because the own-stack plan (D8) keeps the API in `server/` (`ST-20`: an existing app keeps its layout).
- **No `move` and no `list` on the interface**: UUID keys mean a serial change never touches files (R9). The copy script (R10) walks DB rows, not the bucket (`NS-50`).
- **A `files` table holds every stored file** (`NS-05`): `id uuid, storage_key, storage_driver, content_type, size_bytes, original_name, created_by, created_at`. Housing records reference it with nullable FK columns `prev_photo_file_id`, `prev_thumb_file_id`, `current_photo_file_id`, `current_thumb_file_id`. This is how R6's "the record stores the key" works: the key lives on the file row, and the record points to it.
- **The API response shape stays the same**: the server keeps returning `prev_photo_url` and the other `*_url` fields, now computed as `/api/v1/photos/<file id>`. The UI (`photoSrc`, `PhotoField` and the rest) and the REST adapter need no changes for URLs. The route uses the file id rather than the raw key, so the browser never holds a storage key (`storage.md` intro and `NS-41`).
- **Photos are immutable**: replacing a photo writes a new file with a new key and then removes the old one. The route sends `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff` and `Content-Type: image/webp` (`NS-11`). The `?v=` cache-buster becomes harmless but is no longer needed. Leave it in place.
- **Photos are public**: the same visibility as housing reads (API_CONTRACT: `GET /api/housing` is public). A file is served only if a housing record currently references it. Unreferenced files (replaced, orphaned or never attached) return 404. That 404 is the "refused" case (`NE-SEC-03`, `TS-13`).
- **Upload order** (`NS-06`, `DB-TX-02`): write the new files, then update the record and insert the file rows in one DB transaction. After commit, remove the old files. If the transaction fails, remove the new files. Storage calls never run inside the transaction.
- **Streaming upload** (`NS-03`, `NS-04`): parse multipart with `busboy` (stream) instead of the own-stack plan's `multer` memory storage. Check type with `file-type` on the first bytes, enforce the size limit on the stream, and pipe through `sharp` (full and thumb from one input via `clone()`) into `storage.put`. This replaces the "multer memory storage" line in own-stack U6. Its EXIF-strip and re-encode rules still apply.
- **S3 driver** (`NS-40`..`NS-44`): `@aws-sdk/client-s3` plus `@aws-sdk/lib-storage` `Upload`, imported only in `drivers/s3.ts`. Config: `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` (for R2 and MinIO). Credentials come from the standard AWS env vars or an IAM role. Request timeouts go on the client. The bucket is private. Every S3 line and env var carries a `TEMP:` comment (`NS-35`). This replaces `aws4fetch` in the own-stack plan.
- **Config** (`NE-CFG-01`, `NS-34`): the server's zod env schema gets the `STORAGE_DRIVER` discriminated union, with no default. The process exits on a bad or incomplete storage config.
- **NAS driver** (`NS-02`, `NE-SEC-07`): resolve `path.resolve(STORAGE_ROOT, key)` and reject anything outside the root. Write to a temp file in the same folder and then `rename`, so a crashed upload never leaves a half-written file at the real key. `get` maps `ENOENT` to `NotFoundError`, and `remove` ignores `ENOENT`.
- **One contract suite for all drivers** (R12): `server/tests/storage/storageContract.ts` exports `runStorageContract(name, makeDriver)`, mirroring `tests/contract/housingApiContract.ts` and `harness.ts`. The NAS run uses a temp dir, and the S3 run uses MinIO from local Docker.

## Implementation units
### U0. Local Docker with Postgres, NAS folder and MinIO
- **Status:** todo
- **Goal:** One command starts what the server and its tests need, including a local S3.
- **Requirements:** R11, R12
- **Files:** `docker-compose.yml`, `.env.example`, `README.md`
- **Approach:** run `ae-docker-setup`. Add a `minio` service plus a one-shot bucket-create container (private bucket, `TEMP:` comment) next to Postgres and the `./.storage` folder mounted at `STORAGE_ROOT`.
- **Tests:** none (infra). Check that `docker compose up -d` brings all services to healthy.
- **Done when:** Postgres, MinIO and the storage folder are up from one command, and the README says how.
- **Depends on:** own-stack U1 (server skeleton and config). Skip any part U1/U2 already created.

### U1. Storage interface and NAS driver
- **Status:** todo
- **Goal:** `StorageDriver` exists with a working, path-safe NAS driver and a shared contract suite.
- **Requirements:** R1, R3, R12
- **Files:** `server/src/storage/types.ts`, `server/src/storage/errors.ts` (`NotFoundError`), `server/src/storage/drivers/nas.ts`, `server/tests/storage/storageContract.ts`, `server/tests/storage/nas.test.ts`
- **Approach:** the `NS-31` interface verbatim. Pattern: `tests/contract/housingApiContract.ts` (shared suite) plus `mock.contract.test.ts` (one runner per implementation).
- **Tests:** contract: put then get returns the same bytes; put with the same key overwrites; get on a missing key throws `NotFoundError`; remove then get throws; removing a missing key succeeds; a large (about 20 MB) stream round-trips without buffering (check via stream piping, not memory). NAS-only: keys `../x`, `/etc/passwd`, `a/../../x` and a URL-encoded traversal are rejected; a failed write leaves no file at the key.
- **Done when:** the NAS contract run passes.
- **Depends on:** U0

### U2. Config and driver registry
- **Status:** todo
- **Goal:** `STORAGE_DRIVER` picks the driver at startup, and bad config stops the process.
- **Requirements:** R4, R5
- **Files:** `server/src/config.ts`, `server/src/storage/index.ts`, `server/.env.example`, `server/tests/storage/config.test.ts`
- **Approach:** the `NS-32` map with only `nas` for now, plus the `NS-34` discriminated union merged into the U1 config schema.
- **Tests:** a missing `STORAGE_DRIVER` fails; `STORAGE_DRIVER=ftp` fails; `nas` without `STORAGE_ROOT` fails; valid `nas` config parses; the error message names the missing variable and never prints secret values (`NE-CFG-03`).
- **Done when:** the server starts with `STORAGE_DRIVER=nas` and refuses to start with each bad config above.
- **Depends on:** U1

### U3. S3 driver (temporary)
- **Status:** todo
- **Goal:** `STORAGE_DRIVER=s3` works against AWS S3, R2 or MinIO. Adding it took one file plus one registry line.
- **Requirements:** R2, R5, R12
- **Files:** `server/src/storage/drivers/s3.ts`, one line in `server/src/storage/index.ts`, the `s3` branch in `server/src/config.ts`, `server/.env.example`, `server/tests/storage/s3.test.ts`
- **Approach:** `NS-40`..`NS-44`. `Upload` from `lib-storage` for `put`, `GetObjectCommand` body as a `Readable` for `get`, `NoSuchKey` mapped to `NotFoundError`, and a client request timeout. Everything is marked `TEMP:`.
- **Tests:** the full `runStorageContract` against MinIO; config tests for the `s3` branch (missing bucket or region fails); a timeout surfaces as an error, not a hang (MinIO paused, or a fake endpoint that never answers).
- **Done when:** the contract suite passes for both drivers, and `git diff` for adding S3 touches only `drivers/s3.ts`, one line in `index.ts`, and config and env.
- **Depends on:** U2

### U4. Files table and record references
- **Status:** todo
- **Goal:** Each stored file has a DB row with its key and driver, and housing records point at file rows.
- **Requirements:** R6, R9
- **Files:** a new migration in the server's migration folder (from own-stack U2), `server/src/services/files.ts`, `server/tests/services/files.test.ts`
- **Approach:** create the `files` table and the four nullable `*_file_id` FK columns (`ON DELETE SET NULL`) on the housing table. This is additive only (`DB-MIG-03`). The old `*_photo_url` and `*_thumb_url` columns stay until the Supabase photo import (own-stack U10) has filled the file columns. A later migration drops them. Add an index on `files(storage_driver)` for the copy script.
- **Tests:** real Postgres (`TS-02`). Insert a file and attach it; deleting the file row nulls the record column; changing a serial leaves the `*_file_id` values and file keys untouched (R9).
- **Done when:** the migration applies from empty and from the own-stack U2 schema, and the tests pass.
- **Depends on:** own-stack U2, U0

### U5. Photo upload and delete through the adapter
- **Status:** todo
- **Goal:** Uploading or deleting a record's photo uses only `storage` plus `files`, streaming end to end.
- **Requirements:** R1, R6, R9
- **Files:** `server/src/services/photos.ts`, `server/src/routes/v1/photos.ts` (POST and DELETE), `server/tests/routes/photos.write.test.ts`
- **Approach:** the upload order and streaming decisions above. Each upload generates the keys `housing/<uuid>.webp` and `housing/<uuid>_thumb.webp` (`NS-01`). Admin-only, behind the own-stack U3 identity and origin check. `changeSerial` in own-stack U5 must not call storage (R9).
- **Tests:** an admin upload stores two files, attaches them, and returns `*_url` = `/api/v1/photos/<id>`; replacing a photo removes the old files from storage and leaves the new ones; a non-image (bytes say PDF, header says `image/jpeg`) returns 400 and leaves nothing stored; an oversize upload returns 413 and leaves nothing stored; not signed in returns 401; a non-admin returns 403; a DB failure after put (injected) removes the new files; a storage failure on put leaves the record unchanged; delete clears the columns and removes the files; GPS EXIF is stripped (own-stack U6 check).
- **Done when:** the tests pass with `STORAGE_DRIVER=nas` and with `s3`.
- **Depends on:** U3, U4, own-stack U3

### U6. Photo serving route
- **Status:** todo
- **Goal:** Browsers load every photo from `GET /api/v1/photos/:id`, whichever driver is active.
- **Requirements:** R7, R8
- **Files:** `server/src/routes/v1/photos.ts` (GET), `server/src/services/photos.ts`, `server/tests/routes/photos.read.test.ts`
- **Approach:** zod-validate `:id` as a UUID (`NE-REQ-01`). The service looks up the file and checks that a record references it, then the route pipes `storage.get(key)` to the response with the headers above. `NotFoundError` maps to 404. Errors in the middle of the stream destroy the response, never hang it.
- **Tests:** a public GET of an attached photo returns 200 with the right bytes, `nosniff`, `image/webp` and an immutable cache header; a malformed id returns 400; an unknown id returns 404; a replaced (unreferenced) file returns 404 for anonymous and admin users alike (`TS-13`); a file row whose object is missing from storage returns 404 and logs a warning; passes on both drivers.
- **Done when:** the UI, pointed at the server, shows photos with no frontend change.
- **Depends on:** U5

### U7. Driver-to-driver copy script
- **Status:** todo
- **Goal:** One command moves every file from the old driver to the new one, safely and resumably.
- **Requirements:** R10
- **Files:** `server/scripts/copy-storage.ts`, `server/tests/scripts/copy-storage.test.ts`
- **Approach:** `NS-50`. Build both drivers from explicit `--from` and `--to` names using the same driver factories and config schema. For each `files` row with `storage_driver = from`: `get` → `put` → verify the size, compared against `size_bytes` with a re-read size check → update the row's driver. Shape and flags (`--dry-run`, `--concurrency` default 4, `--limit`, failure report) borrowed from `scripts/migrate-photos.mjs`. It never deletes source files. Removing them is a separate, later manual step.
- **Tests:** NAS → MinIO and MinIO → NAS copy all rows and flip their driver; a re-run copies nothing; a run stopped halfway, then re-run, completes; a missing source object is reported and its row stays unchanged; `--dry-run` changes nothing.
- **Done when:** a staging switch works by running the script, changing `STORAGE_DRIVER` and restarting, with all photos still loading (the success criterion).
- **Depends on:** U4

### U8. Orphan cleanup job
- **Status:** todo
- **Goal:** Files without a referencing record and file rows without an object are cleaned up regularly (`NS-06`).
- **Requirements:** R1 (`NS-06` compliance)
- **Files:** `server/scripts/cleanup-files.ts`, a PM2 cron entry in `deploy/ecosystem.config.cjs`, `server/tests/scripts/cleanup-files.test.ts`
- **Approach:** delete `files` rows that no record references and that are older than 24 h (grace period for in-flight uploads), calling `storage.remove` first. It works from DB rows only, so it works on any driver.
- **Tests:** an unreferenced old file is removed from storage and the DB; a referenced file is kept; a file younger than the grace period is kept; a storage failure keeps the row for the next run.
- **Done when:** the job runs locally and the tests pass.
- **Depends on:** U4

### U9. Update docs and the own-stack plan
- **Status:** todo
- **Goal:** Contract and plan docs describe the new storage model, so no one builds against the old one.
- **Requirements:** R6, R7, R9
- **Files:** `docs/api/API_CONTRACT.md` (lines about 112, 113, 126, 151-152, 226, 303-327), `docs/plans/2026-10-04-1357-housing-service-own-stack-plan.md` (D7, U6, layout, `aws4fetch`/`multer`), `docs/architecture/migration-notes.md`
- **Approach:** photo URLs are API URLs; keys are UUIDs; serial changes don't move files; photos are immutable with an immutable cache. Point the own-stack D7 and U6 entries to this plan.
- **Tests:** none (docs). Check that `npm run i18n-check` still passes if any UI strings were touched (none expected).
- **Done when:** no doc still says photos are public bucket URLs or serial-based paths, except where it describes the current Supabase behavior.
- **Depends on:** none (can go first)

## Verification
- Root (existing): `npm run lint`, `npm test`, `npm run build`
- Server (scripts created by own-stack U1): `npm --prefix server run typecheck`, `npm --prefix server run lint`, `npm --prefix server test`
- Driver matrix: `docker compose up -d`, then `STORAGE_DRIVER=nas npm --prefix server test` and `STORAGE_DRIVER=s3 npm --prefix server test`
- `npm audit --omit=dev` in `server/` (`ST-31`) after adding `@aws-sdk/*`, `busboy`, `file-type` and `sharp`

## Risks and rollback
- **Dependency on the own-stack plan**: U0 and U4–U6 need own-stack U1–U3 (skeleton, DB port, identity). U1–U3 here can be built right after own-stack U1. U9 can go at any time.
- **Migration (U4)** is additive only. Undo: drop the four `*_file_id` columns and the `files` table. Nothing else reads them before U5 ships. The later drop of the `*_url` columns is destructive and needs its own undo note (`DB-MIG-05`).
- **Copy script (U7)** never deletes source files, so a bad switch is undone by setting `STORAGE_DRIVER` back. Rows already flipped need a reverse run (`--from` new `--to` old). Keep the old driver in the registry until the copy is verified (`NS-50`).
- **Standards conflict outside this plan**: the own-stack plan uses plain SQL with dbmate, while `ST-03` requires Prisma. U4 follows whatever migration tool own-stack U2 settles on. Resolve that conflict in the own-stack plan, not here.
- **S3 removal later**: search for `TEMP:` and delete `drivers/s3.ts`, its registry line, its config branch, its env vars and its tests (`NS-35`).

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
