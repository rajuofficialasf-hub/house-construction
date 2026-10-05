---
title: C5 Photos
type: migrate
status: done
source: plan
date: 2026-10-05
doc_review: 2026-10-05
---

# C5 Photos

Chunk C5 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R11". It builds on C1–C4 (`docs/plans/2026-10-05-1215-…`, `-1246-…`, `-1352-…`, `-1601-migrate-c4-write-endpoints-plan.md`) and reuses the storage design in `docs/plans/2026-10-04-1607-feat-photo-storage-strategy-plan.md` (the photo plan), checked against the code that exists now. The contract is `docs/api/API_CONTRACT.md` (v0.12 now, v0.13 after this chunk).

## Goal
An admin can upload, replace and delete a record's before and after photos through the new API, one at a time or from the bulk photo page. Anyone can see them, and the photos are always served by the API from S3 or the NAS, never from a bucket URL. The whole admin site, photos included, then works end to end with `VITE_HOUSING_BACKEND=rest`.

## Problem
The server has no photo routes. Its admin guard answers 401 or 404 for them. The REST runner has four photo known gaps, and the `admin-rest` Playwright project skips the photo specs. C6 (deploy) and C7 (cutover) need a complete API with a storage layer that can run on S3 now and move to the NAS later.

## Requirements
- **R1** `POST /housing/:id/photo` stores a `prev` or `current` photo and its thumbnail, replacing any earlier one, and returns the record with new photo URLs and `photo_updated_at`. Errors: 400 for a bad kind, missing photo or a file that isn't a JPEG, PNG or WebP image; 413 over 5 MB; 404 for an unknown record (contract §4.10, roadmap R11).
- **R2** Every stored photo is re-encoded on the server as WebP (full ≤1600 px wide, thumb 400 px) with all EXIF and GPS data removed. The server always makes the thumbnail itself (roadmap R12).
- **R3** `DELETE /housing/:id/photo?kind=` clears that kind's photo and thumbnail and returns the record. It answers 200 when there is nothing to delete and 404 for an unknown record (contract §4.11).
- **R4** `GET /photos/:id` streams a photo to anyone, with no login and no CORS needed for `<img>`. A replaced, deleted or unknown photo is 404. The response is cacheable for a year and safe to embed from the site's and allowlisted apps' origins (roadmap R12).
- **R5** Deleting a record removes its photo files from storage after the delete commits. A serial change keeps the record's photos and URLs as they are (contract §4.5খ, §4.8).
- **R6** No storage call runs inside a database transaction. A removal that fails after commit is retried later by a sweep command, and a failed upload leaves the record unchanged (`DB-TX-02`, `NS-06`).
- **R7** Storage goes through one interface with a NAS driver and an S3 driver chosen by `STORAGE_DRIVER`. Both run the same storage tests: the NAS driver against a temp folder on every run, and the S3 driver against a real bucket when `TEST_S3_*` is set (C6). MinIO's images are no longer available, so there is no local S3 (user decision, 2026-10-05) (roadmap R11).
- **R8** Every photo upload, and every photo delete that removes something, leaves a `photo_update` activity row carrying the acting admin and the changed kinds (roadmap R6).
- **R9** The REST runner has no photo known gaps, and the `admin-rest` Playwright project runs the photo specs, including the bulk photo page (2 uploads at a time) (roadmap R1, R2).
- **R10** `GET /api/v1/openapi.json` documents the photo upload and delete as admin-only and the photo route as public.

## Scope
- In:
  - the storage adapter (`server/src/storage/`, NAS and S3 drivers) and the storage config
  - the `housing_files` table (migration 0009)
  - photo upload, delete and serve routes, with image processing
  - file removal on record delete, and the tombstone sweep command
  - a storage volume in compose
  - contract v0.13, the shared contract suite's photo tests, the REST runner and the `admin-rest` photo specs
  - migration-notes and testing docs
- Out (not now):
  - Copying existing Supabase Storage photos into the new storage, and `scripts/migrate-photos.mjs` (C7 import; C8 removes the script)
  - The driver-to-driver copy script (`NS-50`): nothing needs copying until production switches from S3 to the NAS, which the roadmap puts after this release. Build it with that switch.
  - A sweep for objects with no `housing_files` row (left only by a process crash mid-upload). It needs a `list` operation that `NS-31` doesn't have. Recorded for C6.
  - A write rate limit (C6, accepted at C4 doc review)
  - Any change to the Supabase adapter, `supabase/sql` or UI pages

## Key decisions
From the roadmap and the C5 brief, not reopened here:
- Express 5 with plain SQL through `postgres`; no Prisma. Routes under `/api/v1`, thin, with zod on params, query and body. The contract's error shapes.
- Photo writes are admin-only through `housingAdminRouter`, with `req.admin` into `withActor()`. Serving is public, and the browser never loads a bucket URL.
- S3 driver first for production, NAS driver built and tested now behind the same interface. EXIF and GPS stripped on upload.
- No storage call inside a transaction (`DB-TX-02`).
- The REST adapter is for local and staging only. Production stays on Supabase.
- Contract changes go in the same commit as the route.

## Technical decisions
- **Stack profile (`ST-43`).** C1–C4's profile plus the storage adapter: NAS driver (long term) and S3 driver (`TEMP:`, `NS-35`). New server dependencies, each named in its commit message (`ST-30`):
  - `busboy` (+ `@types/busboy`): streaming multipart parser. `multer` is built on it but buffers in its memory storage.
  - `sharp`: decode, auto-rotate, resize, WebP encode and metadata strip in one pipeline. The root package already uses it (`^0.35.5`), so the server uses the same version.
  - `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` (`NS-42`), imported only in `drivers/s3.ts`.
  - **No `file-type`.** The three allowed formats are checked from their magic bytes in about ten lines (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF????WEBP`), and sharp then fails on anything that isn't a real image. That covers `NS-03`'s "check the bytes" with no dependency (`ST-30`).
  - **Install scripts (`ST-32`).** Before adding each package, run `npm view <pkg>@<version> scripts` and check `hasInstallScript` in `server/package-lock.json`. sharp ≥0.33 ships prebuilt `@img/sharp-*` optional packages, and the dev container already installs with `npm ci --ignore-scripts` (`scripts/docker-dev-entry.sh`). Install on the host with `--ignore-scripts` too, and confirm `node -e "require('sharp')"` works in the api container.
  - The `CLAUDE.md` `## Stack profile` stays with the roadmap's ST-03/ST-04 amendment task, as C3 and C4 decided (open P3).
- **UUID keys and a files table, not serial paths (`NS-01`, `NS-05`, both MUST).** Contract §3.2's serial-based paths with overwrite in place, and §4.5খ's file move on serial change, describe the Supabase version. On the new server they would break `NS-01` (server-generated UUID key) and need a non-transactional move on every serial change. So the photo plan's design stands, and C4's note "move the files on change-serial" is dropped:
  - Each stored file gets the key `housing/<uuid>.webp`. The full photo and the thumb are separate files with separate ids.
  - A serial change touches no file and no URL (no storage call, nothing to fail halfway). C4's `changeSerial` already does exactly this.
  - Contract §3.2, §4.5খ, §4.8, §4.10, §4.11 and §5 get an "own server" rule next to the Supabase one. The UI only renders the URL it's given, so nothing changes for users.
- **`housing_files` table (migration `0009_housing_files.sql`, `DB-MIG-03` additive).** The name starts with `housing_` so `global-setup.ts`'s rollback leftover check covers it.
  ```sql
  create table public.housing_files (
    id             uuid primary key default gen_random_uuid(),
    record_id      uuid references public.housing_beneficiaries(id) on delete set null,
    kind           text not null check (kind in ('prev', 'current')),
    variant        text not null check (variant in ('photo', 'thumb')),
    storage_key    text not null unique,
    storage_driver text not null check (storage_driver in ('nas', 's3')),
    content_type   text not null,
    size_bytes     bigint not null check (size_bytes >= 0),
    original_name  text,                  -- data only, never a path (NS-01); ≤255 chars
    created_by     uuid references public.housing_admins(id) on delete set null,
    created_at     timestamptz not null default now(),
    deleted_at     timestamptz            -- tombstone: the object is still to be removed
  );
  create unique index housing_files_live_slot on public.housing_files (record_id, kind, variant)
    where deleted_at is null and record_id is not null;
  create index housing_files_record_id on public.housing_files (record_id);
  create index housing_files_tombstones on public.housing_files (deleted_at) where deleted_at is not null;
  grant select, insert, update, delete on public.housing_files to housing_app;
  ```
  - **The file row points at the record** (`record_id`, `kind`, `variant`), not the other way round. `housing_beneficiaries` gets no new column, so its schema stays the same as Supabase's and no trigger changes. The partial unique index allows only one live file per slot.
  - **The URL columns stay the source for reads.** Upload writes `<kind>_photo_url` and `<kind>_thumb_url` as `${PUBLIC_API_URL}/api/v1/photos/<file id>`. Every read query, `RECORD_COLUMNS`, the OpenAPI schema and the activity trigger stay unchanged. The trigger in `0005_activity_log.sql:94` already logs `photo_update` with `photo_kinds` when a `*_photo_url` changes. Every upload creates a new URL, so a replace is logged too. On Supabase, overwriting at the same URL logged nothing.
  - **A tombstone (`deleted_at`) is the retry-safe follow-up (`DB-TX-02`).** A replace, a photo delete or a record delete marks the old rows `deleted_at = now()` inside the transaction. After commit it calls `storage.remove(key)` and then `delete from housing_files where id = …`. If the removal fails, the row stays a tombstone, and `npm --prefix server run files:sweep` (U8) retries it. `remove` succeeds on a missing key, so retrying is always safe.
  - **No function is added**, so the default-privileges learning (`docs/learnings/database/postgres-default-privileges-public-execute.md`) needs no new revoke. The grant follows 0006's header rule.
  - **`gen_random_uuid()`** is built into PostgreSQL 13+. 0001 uses it already without `pgcrypto`.
- **Absolute photo URLs from `PUBLIC_API_URL`.** The contract says a photo URL can be shown directly in a browser. The web app runs on another origin than the API (5173 vs 3001 locally), so a relative `/api/v1/photos/…` would hit the web server. A new required config value `PUBLIC_API_URL` (a URL with no trailing slash, `NE-CFG-01`) builds the URL at write time:
  - compose: `http://localhost:3001`
  - the `admin-rest` API: `http://localhost:3002`
  - tests: a fixed value
  - Changing the API's domain later means one `update … set x_url = replace(x_url, old, new)`. Recorded in Risks.
- **Storage adapter (`NS-30`..`NS-35`), with app-level injection.** The folder is `server/src/storage/`, not `apps/api/…`, because an existing app keeps its layout (`ST-20`). It holds `types.ts` (the `NS-31` interface verbatim), `errors.ts` (`StorageNotFoundError`), `index.ts`, `drivers/nas.ts` and `drivers/s3.ts`.
  - The app builds its dependencies in `server.ts` and passes them to `createApp(deps)`. So `index.ts` exports `createStorage(config): StorageDriver` from the `NS-32` map, not a module-level singleton. `AppDeps` gains `storage` and `publicApiUrl`, both required. A new `server/test/support/storage.ts` exports `testStorage()` (a NAS driver on a fresh temp folder, removed in `afterAll`) and `TEST_PUBLIC_API_URL`. U6 updates every `createApp` caller: `server/src/server.ts`, `server/src/app.test.ts`, `server/test/http/{openapi,housing-bulk,security,auth,housing-activity,housing-writes,housing-reads}.test.ts` and `tests/contract/rest.contract.test.ts`. Only `index.ts` knows the drivers (`NS-32`), and no code outside `storage/` imports a driver, `node:fs` for stored files or the S3 client (`NS-33`).
  - **NAS driver (`NS-02`, `NE-SEC-07`).**
    - It refuses a key that is absolute, has a `..` segment, a backslash or a NUL, or resolves outside `path.resolve(STORAGE_ROOT)` (`resolved.startsWith(root + path.sep)`).
    - `put` creates the parent folder, streams to `<final>.<uuid>.tmp` in the same folder and then `rename`s it, so a crash never leaves a half file at the key. On a stream error it unlinks the temp file.
    - `get` opens the file first (`fs.promises.open`) so `ENOENT` turns into `StorageNotFoundError` before any byte is sent, then returns `handle.createReadStream()`.
    - `remove` ignores `ENOENT`.
  - **S3 driver (`NS-40`..`NS-44`, all `TEMP:`).**
    - `put` uses `Upload` from `lib-storage` with `ContentType` and aborts on a stream error.
    - `get` sends `GetObjectCommand` and returns the body as a `Readable`. `NoSuchKey` (or a 404 status) becomes `StorageNotFoundError`.
    - `remove` sends `DeleteObjectCommand`, which already succeeds on a missing key.
    - The client gets `NodeHttpHandler` connection and request timeouts (5 s and 30 s), `forcePathStyle` from config, and credentials from the default AWS chain (`NS-43`).
    - The bucket is private (`NS-40`). Server-side encryption is a bucket setting, not a request header (AWS S3 and R2 encrypt at rest by default). So the driver sends none, and C6 checks that the production bucket blocks public access, has default encryption on, and that its IAM policy covers that one bucket only (`NS-43`).
  - **Config (`NS-34`).** `config.ts` keeps its `z.object(…).superRefine(…)` schema for the existing keys (plus `PUBLIC_API_URL`) and parses a `storageEnv` discriminated union on `STORAGE_DRIVER` (no default) next to it. `loadConfig` runs both `safeParse`s, merges both issue lists into one `ConfigError`, and returns `Config = BaseConfig & StorageConfig`. U1 owns the whole union, the `s3` branch included.
    - `nas` needs `STORAGE_ROOT`.
    - `s3` needs `S3_BUCKET` and `S3_REGION`, plus an optional `S3_ENDPOINT` (url) and `S3_FORCE_PATH_STYLE` (boolean string). These are `TEMP:`.
    - The error names the missing variable and never prints a value (`NE-CFG-03`).
    - Credentials are not config keys: the AWS SDK reads `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (or an IAM role). The S3 tests read the bucket, region, optional endpoint and these two variables from the developer's own environment (`TEST_S3_BUCKET`, `TEST_S3_REGION`, `TEST_S3_ENDPOINT`), never from committed files. Use a test-only bucket and key, never the production ones.
- **Upload pipeline (`NS-03`, `NS-04`, `NE-REQ-02`).** It lives in `server/src/photos/process.ts`, with no DB and no Express in it.
  - **Parsing.** `busboy` reads `req` with these limits: `files: 2`, `fields: 2`, `parts: 4`, `fieldSize: 64`, `fileSize: 5 MB`. The chain is `originCheck` (`server/src/http/origin.ts`, method-based, so it covers multipart too), then the guard, then `requireAdmin`, then the handler, so no cross-origin or anonymous request is parsed. The global `express.json` skips multipart by content type, so `app.ts` needs no `BULK_PATH`-style skip.
  - **Fields.**
    - `kind` must be `prev` or `current` (zod) and may come before or after the files, because keys don't depend on it.
    - `photo` is required.
    - `thumb` is optional and capped at 500 KB by its own byte counter. It is read and thrown away: the server always makes its own thumb (R2), so the client's thumb never brings EXIF in.
    - Any other field or file name is a 400.
  - **Image.**
    - The first ≥12 bytes of `photo` must match one of the three magic numbers; otherwise 400 `reason: unsupported_type`.
    - The stream then pipes into `sharp({ limitInputPixels: 40_000_000, failOn: 'error' })`.
    - Two clones run from it: `.rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 })` and the same at 400 px.
    - sharp drops all metadata unless asked to keep it, so EXIF and GPS go.
    - Each output goes through a byte-counting `PassThrough` into `storage.put(key, …)`, and both puts run in parallel while the input streams in.
    - `sharp.cache(false)` keeps memory flat. A small in-process semaphore in `process.ts` (no dependency) lets at most 2 uploads decode at once. Others wait with their request stream paused, so the bulk page's 2 and the C7 script's 4 simply queue.
    - libvips holds the decoded image itself. The 5 MB and 40 MP caps bound that.
  - **Failure.**
    - A size limit becomes 413 `PAYLOAD_TOO_LARGE`. The cut-off stream also makes sharp fail, so the handler checks busboy's `truncated` flag first and only then maps a sharp error to 400 `reason: invalid_image`; malformed multipart or a non-multipart body becomes 400.
    - On any failure the pipeline is destroyed and both keys are removed (a missing key is fine).
    - Then the rest of the request is drained up to 10 MB before answering, so the client reads the 413 instead of a reset connection (the C4 note about early answers). Past 10 MB, or after 10 s of draining, the response sets `Connection: close` and the socket ends.
  - **Result.** `{ kind, files: [{ variant, key, sizeBytes, originalName }] }`.
- **Upload service (`server/src/photos/service.ts`, `NS-06`, `DB-TX-02`).** It writes in this order:
  1. Run the pipeline above. The files are now in storage.
  2. Run one `withActor(sql, actor, tx => …)` transaction:
     - `select id from housing_beneficiaries where id = $id for update`. No row → `NOT_FOUND`.
     - Tombstone the slot: `update housing_files set deleted_at = now() where record_id = $id and kind = $kind and deleted_at is null returning id, storage_key`.
     - Insert the two new rows, with `storage_driver = storage.name` and `created_by = actor.id`.
     - `update housing_beneficiaries set <kind>_photo_url = …, <kind>_thumb_url = …, photo_updated_at = now() where id = $id returning RECORD_COLUMNS`. The column names come from a fixed `{ prev: …, current: … }` map, never from input.
  3. If the transaction throws (404, or a DB error), remove the new keys and rethrow.
  4. After commit, remove each tombstoned key and delete its row (`Promise.allSettled`; a failure is logged at `warn` and left for the sweep). Return the record.
  - Two uploads to the same slot at once queue on the row lock, the last one wins, and the loser's files end up tombstoned and removed. The `housing_files_live_slot` index guarantees that.
  - Records whose URLs have no file row (old seed data, or C7-imported Supabase URLs before their photos are copied) simply get new URLs.
- **Photo delete.** One transaction: lock the record (no row → 404), tombstone the slot's files, then `update … set <kind>_photo_url = null, <kind>_thumb_url = null, photo_updated_at = now()`, but only if either URL was non-null. With nothing to delete, the record comes back unchanged (200, no activity row). After commit, remove as above.
- **Record delete (R5).** `deleteRecord` takes `storage` too. Inside its transaction it runs `update housing_files set deleted_at = now() where record_id = $id and deleted_at is null returning id, storage_key` before `delete … returning id`; the FK then sets `record_id` to null on the tombstones. After commit it removes them as above, then the route answers 204. A storage failure doesn't change the 204.
- **Serve route `GET /api/v1/photos/:id` (`NS-10`, `NS-11`).**
  - **Router.** A new `photosRouter(sql, storage, photoRateLimit)` is mounted on `/api/v1/photos`, outside `/housing`, so the admin guard and the 300/min housing read limit don't apply.
  - **Lookup.** `:id` is a zod uuid (otherwise 400). `select storage_key, content_type, size_bytes from housing_files where id = $id and deleted_at is null and record_id is not null`. No row → 404. Visibility is the record's visibility. Every `housing_beneficiaries` row is public (contract §1: all GETs are open; the schema has no hidden, draft or soft-deleted state), and only a live file attached to a record is served (`NE-SEC-03`). If a hidden state is ever added, this lookup must join the record and apply the same filter as the reads.
  - **Streaming.** `storage.get`. `StorageNotFoundError` → 404, logged at `warn` (row without an object). It sends with `stream.pipeline(body, res)`; an error mid-stream destroys the response instead of hanging it.
  - **Headers.**
    - `Content-Type` from the row (`image/webp`) and `Content-Length`.
    - `Cache-Control: public, max-age=31536000, immutable`: a file id never changes content, so `?v=` is harmless and stays in the UI.
    - `X-Content-Type-Options: nosniff` (helmet), and `Content-Disposition: inline` (a safe image, `NS-11`).
    - `Cross-Origin-Resource-Policy: cross-origin`. helmet's default `same-origin` would block the site's `<img>` on another port and other apps' embeds.
  - **CORS.** `isPublicReadPath` in `app.ts` adds `/api/v1/photos/…`, so `PUBLIC_READ_ORIGINS` get credential-less GET/HEAD CORS for `fetch()`. `<img>` needs none. Follow the read-only CORS learning (`cors-read-only-origin-list-needs-own-method-check.md`): the method check and `Vary` stay unconditional.
  - **Rate limit.** Its own in-memory limiter, 1200 requests per IP per minute, with the same `express-rate-limit` setup as the read limit (`routes/v1/housing.ts:40-49`) and injectable for tests. A list page loads up to 50 thumbs, and the immutable cache keeps repeats rare. C6 revisits it behind nginx with `TRUST_PROXY`.
- **Routes and OpenAPI (`NE-REQ-04`, R10).**
  - `housingAdminRouter` gets `POST /:id/photo` and `DELETE /:id/photo` with `requireAdmin`.
  - `deletePhotoQuery` is `{ kind }` with C3's query rules (a repeated `kind` → 400).
  - `openapi.ts` gets both routes, admin-only with `adminSession`. The POST request body is hand-written as `multipart/form-data` with `kind`, `photo` and `thumb` (binary). It also gets `GET /photos/{id}` (public, `image/webp` binary, 400/404/429).
  - Paths in the document are relative to `servers: /api/v1`, so the route is documented as `/photos/{id}`, and `openapi.test.ts`'s drift check adds `routesOf('/photos', photosRouter(…))` next to the existing `''` and `'/housing'` prefixes (`openapi.test.ts:54-57`). Update its `housingAdminRouter(…)` call if that signature changes.
- **Shared contract suite (`tests/contract/housingApiContract.ts`).** The photo tests become backend-neutral:
  - **Real image bytes.** The `webp()` helper returns a real 2×2 WebP (a base64 constant) instead of text. The 6 MB over-size case keeps a real WebP header followed by padding; the size limit fires before decoding.
  - **Serial paths only where they exist.** A new `ContractOptions.photoPaths?: 'serial' | 'opaque'` defaults to `'serial'`. The serial-path assertions run only for `'serial'` (mock, supabase-local). The REST runner passes `'opaque'`.
  - **Renamed tests.**
    - "uploadPhoto sets the photo urls and the timestamp; deletePhoto clears them and is idempotent". Both modes check that the URL is non-null and changes on a replace in either path or `?v=` source (`photo_updated_at` changes), that the thumb URL is set, and that the other kind stays null.
    - "changeSerial keeps the record's photos". Both modes check the URLs are non-null after the change; the serial mode also checks the new path.
  - `rest.contract.test.ts` drops all four `KNOWN_GAPS` and passes `photoPaths: 'opaque'`. It builds the app in-process (`createApp` at `:51`, port 0), so it creates a temp NAS driver with `testStorage()`, passes it and `publicApiUrl` (the listening URL) to `createApp`, and removes the folder in `afterAll`. `scripts/contract-rest.mjs` doesn't change.
  - "every write is logged with before and after values, newest first, and filterable" keeps its name. It uploads through the `webp()` helper, so it passes once the helper returns real image bytes, and leaves `KNOWN_GAPS` with the others.
- **e2e (`admin-rest`).**
  - `playwright.config.ts` drops the `testIgnore`. The `admin-rest` API env gains `STORAGE_DRIVER=nas`, `STORAGE_ROOT=<repo>/.storage/e2e` and `PUBLIC_API_URL=http://localhost:3002`. The absolute storage root and the API URL are defined once in `e2e/support/rest-env.ts` and imported by both `playwright.config.ts` and `rest-data.ts`, so the API and the seeding can't diverge. `scripts/e2e-rest-admin.mjs` empties that folder once before the run. `.storage/` is added to `.gitignore`.
  - `e2e/support/rest-data.ts` keeps the reset's other steps. For each seed record that has photos in the mock seed, it writes a small real WebP (photo and thumb) through `createStorage` with the same NAS config, inserts the `housing_files` rows, and sets the URL columns to `http://localhost:3002/api/v1/photos/<id>`. Old files from earlier tests stay as harmless unreferenced objects in the temp folder.
  - `e2e/mock/photo-upload.spec.ts` "replacing an existing photo keeps the record on the same photo path" becomes "replacing an existing photo shows the new one": `src` changes after the save. The same-path assertion is Supabase/mock behavior and isn't kept. This edits a spec shared with the mock project, which passes either way.
  - `photo-bulk.spec.ts` needs no change. It drives `HousingPhotoBulkPage` (`UPLOAD_CONCURRENCY = 2`), which calls `api.uploadPhoto` per file and `logActivity('photo_bulk_run')` (an allowed client event).
- **REST adapter.** `uploadPhoto` and `deletePhoto` already call the endpoints (`rest/index.ts:133-137`). The UI never calls `getImageStorage` (only the adapters use `ImageStorage` internally), so `createRestImageStorage` stays a `NOT_IMPLEMENTED` stub. Its comment changes to say photos go through `uploadPhoto` and `deletePhoto`, and that the stub goes with the `ImageStorage` interface in C8. `photoSrc`'s `?v=` stays.
- **Local Docker (`NS-20`).** `compose.yaml` changes:
  - The api service gets `STORAGE_DRIVER=nas`, `STORAGE_ROOT=/data/storage` on a named volume `housing-storage` (writable; the other api mounts are read-only), and `PUBLIC_API_URL=http://localhost:3001`.
  - No local S3 service: MinIO's public images are gone (Docker Hub has no repo, quay.io needs a login), and the user chose to test S3 against a real bucket in C6 instead of a substitute.
  - `server/.env.example` gets the storage and `PUBLIC_API_URL` lines, with the S3 block commented as `TEMP:`.
- **How tests run each driver (R7).** `server/test/storage/storageContract.ts` exports `runStorageContract(name, makeDriver)`, following `tests/contract/housingApiContract.ts`.
  - `nas.test.ts` runs it on a fresh temp folder.
  - `s3.test.ts` runs it against a real bucket only when `TEST_S3_BUCKET` and `TEST_S3_REGION` are set; otherwise `describe.skipIf` skips it, and the skip reason names the variables. This skip is the user's decision, not a weakened test (`TS-15`).
  - Always, with no bucket: the S3 driver's timeout test against a local TCP server that accepts and never answers, and `createStorage` building an s3 driver from config.
  - The route tests run on the NAS driver. One upload-serve-delete smoke test also runs with the S3 driver.

- **Diagram:** `docs/diagrams/backend-architecture.md` (Mermaid), the target flow now shows the photo routes, the storage adapter with NAS and S3 drivers, and the photo rules.

## Implementation units

### U1. Storage config and local Docker
- **Goal:** `STORAGE_DRIVER`, `STORAGE_ROOT`, `S3_*` and `PUBLIC_API_URL` are parsed at startup, and compose gives the API a storage volume.
- **Requirements:** R7
- **Files:** `server/src/config.ts`, `server/src/config.test.ts` (update the `valid` fixture, the whole-config `toEqual` and the "applies defaults" env), `server/.env.example`, `server/.env` (local, by hand), `compose.yaml`, `.gitignore`, `README.md` (local setup lines). `server.ts` wiring moves to U6, where `createApp` accepts the deps.
- **Approach:** the `NS-34` union next to the existing schema, as in Technical decisions. Compose follows the existing `db` service (loopback port, healthcheck, named volume).
- **Tests:**
  - Each of these fails and names the variable: a missing `STORAGE_DRIVER`, `STORAGE_DRIVER=ftp`, `nas` without `STORAGE_ROOT`, `s3` without `S3_BUCKET`, `PUBLIC_API_URL` missing, and `PUBLIC_API_URL` not a URL or with a trailing slash.
  - Valid `nas` and `s3` configs parse.
  - A secret value (`AWS_SECRET_ACCESS_KEY` in env) never shows in an error.
- **Done when:** the config tests pass and `loadConfig` accepts the compose api env. The api container starting with the new env is checked in U6, when `server.ts` reads it.
- **Depends on:** none
- **Status:** done

### U2. Storage interface, NAS driver and storage contract suite
- **Goal:** `StorageDriver` exists with a path-safe NAS driver that passes a shared driver suite.
- **Requirements:** R6, R7
- **Files:** `server/src/storage/types.ts`, `server/src/storage/errors.ts`, `server/src/storage/drivers/nas.ts`, `server/src/storage/index.ts` (`createStorage`, `nas` only for now), `server/test/storage/storageContract.ts`, `server/test/storage/nas.test.ts`
- **Approach:** `NS-31` verbatim. Shared-suite pattern from `tests/contract/housingApiContract.ts` and `mock.contract.test.ts`.
- **Tests:**
  - **Contract (both drivers):**
    - put then get returns the same bytes;
    - putting the same key again replaces the content;
    - get on a missing key throws `StorageNotFoundError`;
    - remove then get throws;
    - removing a missing key resolves;
    - a 20 MB generated stream round-trips without being collected into one buffer;
    - a body stream that errors mid-way makes `put` reject and leaves no readable object at the key.
  - **NAS only:**
    - the keys `../x`, `/etc/passwd`, `a/../../x`, `a\\b`, `a%2F..%2F..%2Fx` (decoded) and one with a NUL are refused before any fs call;
    - a failed write leaves no `.tmp` file behind;
    - a symlinked `STORAGE_ROOT` still resolves correctly.
- **Done when:** the NAS contract run passes and `createStorage({ STORAGE_DRIVER: 'nas', … })` returns the driver.
- **Depends on:** U1
- **Status:** done

### U3. S3 driver (temporary)
- **Goal:** `STORAGE_DRIVER=s3` works against AWS S3 or R2 (or any S3-compatible service) through config, added as one file plus one registry line.
- **Requirements:** R7
- **Files:** `server/src/storage/drivers/s3.ts`, one line in `server/src/storage/index.ts`, `server/package.json` and lock (`@aws-sdk/client-s3`, `@aws-sdk/lib-storage`), `server/test/support/env.ts` (`TEST_S3_*`), `server/test/storage/s3.test.ts`
- **Approach:** `NS-40`..`NS-44` as in Technical decisions, every line `TEMP:`. Check install scripts first (`ST-32`).
- **Tests:**
  - the full `runStorageContract` against a real bucket, when `TEST_S3_*` is set;
  - a client pointed at a port that accepts but never answers rejects within the request timeout instead of hanging;
  - without `TEST_S3_*` the contract run is skipped with a message naming the variables.
- **Done when:** both driver runs pass, and the commit that adds S3 touches only `drivers/s3.ts`, one `index.ts` line, package files, `test/support/env.ts` and its tests (U1 already parses the `s3` config).
- **Depends on:** U2
- **Status:** done

### U4. `housing_files` migration
- **Goal:** Each stored photo has a DB row tied to its record slot, and `housing_app` can use it.
- **Requirements:** R5, R6
- **Files:** `server/db/migrations/0009_housing_files.sql` (up and down), `server/test/support/db.ts` (`resetTestData` adds `housing_files` to the same `truncate` statement as `housing_beneficiaries` and `housing_admins`; a separate statement fails on the FK), `server/test/db/files.test.ts`, `server/test/db/privileges.test.ts`, `docs/architecture/migration-notes.md` (table row "none → 0009")
- **Approach:** the SQL in Technical decisions; follow `0008_read_indexes.sql` and 0006's grant style. Down: `drop table public.housing_files` (indexes and grants go with it).
- **Tests (real Postgres, `TS-02`, as `appDb()`):**
  - `housing_app` can insert, select, update and delete rows;
  - a second live row for the same (record, kind, variant) fails with 23505, while a tombstoned one plus a live one is allowed;
  - deleting the record sets `record_id` to null and keeps the row;
  - a bad `kind`, `variant` or `storage_driver` fails the check;
  - `housing_app` has no other new privilege;
  - `global-setup.ts`'s rollback check passes (no leftovers).
- **Done when:** `npm --prefix server test` passes from an empty `housing_test`, and `db:rollback` then `db:migrate` work on the dev database.
- **Depends on:** none (can run in parallel with U1–U3)
- **Status:** done

### U5. Photo processing pipeline
- **Goal:** A multipart request becomes two stripped, resized WebP files in storage, or a contract error with nothing left behind.
- **Requirements:** R1, R2, R6
- **Files:** `server/src/photos/process.ts`, `server/src/photos/sniff.ts`, `server/package.json` and lock (`busboy`, `@types/busboy`, `sharp`), `server/test/photos/process.test.ts`
- **Approach:** the upload pipeline in Technical decisions. Tests drive it through a minimal Express app with supertest `.attach()` and a NAS driver on a temp folder. Images are made in the test with sharp, so there is no binary fixture.
- **Tests:**
  - A 3000×2000 JPEG with EXIF GPS (`withExif`) and orientation 6 gives a full image 1600 wide (after rotation) and a 400-wide thumb, both WebP, both with no EXIF (`sharp(out).metadata()`: `exif` undefined).
  - A PNG and a WebP are accepted. A 300 px image isn't enlarged.
  - `kind` sent after the file works.
  - **Refused, with storage empty afterwards:**
    - PDF bytes sent as `image/jpeg` (400 `unsupported_type`);
    - a truncated JPEG (400 `invalid_image`);
    - a GIF or SVG (400);
    - a missing `photo` or `kind`, or `kind=side` (400);
    - an extra file field (400);
    - a 6 MB photo or a 600 KB thumb (413, and the client reads the 413 rather than a reset);
    - a JSON body (400);
    - a 50 MP image within 5 MB (400).
  - A storage `put` that rejects (stub driver) removes the other key and surfaces a 500.
  - A third concurrent upload waits until one of two in-flight uploads finishes (a stub driver that holds `put` open), then succeeds.
  - A client that keeps sending after a 413 is cut off within the 10 s drain window (fake timers or a short injected timeout).
- **Done when:** the tests pass, and `npm view` checks for the new packages are noted in the commit message.
- **Depends on:** U2
- **Status:** done

### U6. Photo upload and delete routes, record delete removes files
- **Goal:** `POST` and `DELETE /housing/:id/photo` work as contract §4.10 and §4.11 say, and a record delete removes its files after commit.
- **Requirements:** R1, R3, R5, R6, R8, R10
- **Files:**
  - `server/src/photos/service.ts`
  - `server/src/housing/writes.ts` (`deleteRecord` takes storage, tombstones and removes)
  - `server/src/housing/schemas.ts` (`deletePhotoQuery`)
  - `server/src/routes/v1/housing-admin.ts`
  - `server/src/app.ts` (`AppDeps.storage`, `publicApiUrl`), `server/src/server.ts` (`createStorage(config)`)
  - `server/test/support/storage.ts` (`testStorage`, `TEST_PUBLIC_API_URL`) and every `createApp` caller listed under Storage adapter
  - `server/src/openapi.ts`
  - `server/test/http/housing-photos.test.ts` and `server/test/http/housing-writes.test.ts` (replace the C5 TODO test at :189-192; keep :175-176 and :133-138)
  - `server/test/http/openapi.test.ts`
  - `docs/api/API_CONTRACT.md` §3.2, §4.5খ, §4.8, §4.10, §4.11, changelog v0.13
- **Approach:** the upload service, photo delete and record delete in Technical decisions. The route shape follows the existing `DELETE /:id` in `housing-admin.ts`. `actorOf(req)` is passed into the service.
- **Tests:**
  - An admin upload of `current` returns 200 with both `current_*_url` set to `${publicApiUrl}/api/v1/photos/<uuid>`, `photo_updated_at` set and `prev_*` still null; two live `housing_files` rows exist with `storage_driver = 'nas'` and `created_by` = the admin.
  - Replace: new URLs; the old two objects are gone from storage and their rows deleted; one `photo_update` activity row per upload with `photo_kinds: ['current']` and the admin's id and email.
  - Delete photo: URLs null, files gone, a `photo_update` row. A second delete answers 200 with no new activity row.
  - Unknown record on upload: 404 and nothing left in storage. Unknown record on delete: 404. Bad id: 400. `kind` missing or repeated on DELETE: 400.
  - No session: 401 for POST and DELETE before any parsing (a 6 MB body still gets 401).
  - CSRF: a multipart POST and a DELETE with a valid admin cookie but a foreign or missing `Origin` get 403, and nothing is stored.
  - **Failure paths:**
    - a DB failure after the puts (stub `sql` that throws in the transaction) removes the new objects;
    - a `remove` that fails after commit leaves the old row as a tombstone and the response is still 200;
    - two concurrent uploads to the same slot leave exactly one live pair, and the loser's files are tombstoned or removed.
  - Record delete: a record with both kinds' photos answers 204 and all four objects are removed; a failing `remove` still gives 204 and leaves tombstones.
  - changeSerial on a record with photos keeps the URLs and files (the existing test).
  - The S3 smoke test: one upload, then a delete, with the S3 driver, when `TEST_S3_*` is set.
  - OpenAPI drift passes with both routes marked `adminSession`.
- **Done when:** the tests pass and the contract text matches the behavior.
- **Depends on:** U3, U4, U5
- **Status:** done

### U7. Photo serve route
- **Goal:** `GET /api/v1/photos/:id` streams a live photo to anyone with the right headers, and nothing else.
- **Requirements:** R4, R10
- **Files:** `server/src/photos/serve.ts` (lookup), `server/src/routes/v1/photos.ts`, `server/src/app.ts` (mount, `isPublicReadPath`, limiter), `server/src/openapi.ts`, `server/test/http/photos.test.ts`, `server/test/http/security.test.ts` (CORS cases), `server/test/http/openapi.test.ts`, `docs/api/API_CONTRACT.md` §1 (CORS, rate limit lines), §4 table and §5
- **Approach:** the serve route in Technical decisions. Mounting and the limiter follow `housingReadRouter(sql, readRateLimit)`.
- **Tests:**
  - An anonymous GET of an uploaded photo returns 200 with the processed bytes and these headers: `image/webp`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable`, `nosniff`, `Cross-Origin-Resource-Policy: cross-origin`. HEAD answers 200 with no body.
  - A malformed id is 400. An unknown uuid is 404. A replaced (tombstoned) file and a file of a deleted record are 404 for anonymous and admin alike (`TS-13`). A row whose object was removed out of band is 404 with a `warn` log.
  - A `PUBLIC_READ_ORIGINS` origin gets credential-less CORS on GET and none on POST. A site origin gets credentialed CORS. `Vary: Origin` is always sent.
  - The limiter answers 429 `RATE_LIMITED` after the injected limit.
  - A storage stream that errors mid-way ends the response (the client sees an aborted body, and the server doesn't hang).
  - OpenAPI drift passes with the public photo route.
- **Done when:** the tests pass, and in the UI on `rest` (compose) a record's photos show in the list, the card and the edit form.
- **Depends on:** U6
- **Status:** done

### U8. Tombstone sweep command
- **Goal:** A command finishes any photo removal that failed after commit.
- **Requirements:** R6
- **Files:** `server/scripts/files-sweep.ts`, `server/src/photos/sweep.ts`, `server/package.json` (`files:sweep`), `server/test/photos/sweep.test.ts`
- **Approach:** `select id, storage_key from housing_files where deleted_at is not null order by deleted_at limit 500`, then for each: `storage.remove`, then delete the row. A failure is logged and the row kept. Print a count summary. Follow `server/scripts/db-seed.ts` for script setup and config loading. C6 schedules it.
- **Tests:**
  - tombstones are removed from storage and the DB;
  - live rows are untouched;
  - a failing `remove` keeps that row and still processes the others;
  - a second run does nothing.
- **Done when:** `npm --prefix server run files:sweep` runs against the dev database and the tests pass.
- **Depends on:** U6
- **Status:** done

### U9. Contract suite, REST runner and admin-rest photo specs
- **Goal:** The shared photo contract tests pass on mock, supabase-local and REST, and the photo Playwright specs pass on `admin-rest`.
- **Requirements:** R9
- **Files:**
  - `tests/contract/harness.ts` (`photoPaths`), `tests/contract/housingApiContract.ts` (real WebP helper, renamed and neutral photo tests), `tests/contract/rest.contract.test.ts` (no `KNOWN_GAPS`, `photoPaths: 'opaque'`, in-process temp storage)
  - `playwright.config.ts` (drop `testIgnore`, API storage env), `e2e/support/rest-env.ts` (shared storage root and API URL), `scripts/e2e-rest-admin.mjs` (empty `.storage/e2e`), `e2e/support/rest-data.ts` (seed photo files), `e2e/mock/photo-upload.spec.ts` (replace test)
  - `src/features/housing/backend/rest/index.ts` (stub comment only)
- **Approach:** as in Technical decisions. Check whether `mock.contract.test.ts` or the supabase runners list a renamed test in their own known gaps, and rename them there too.
- **Tests:** this unit is the tests. Run order (never in parallel): `npm --prefix server test`, `npm run test:contract:rest`, `npm run test:e2e:rest-admin`, `npm run test:e2e:rest`, then `npm run test` (mock contract) and `npm run test:e2e:mock`.
- **Done when:**
  - all six commands pass;
  - the REST runner shows no `test.fails`;
  - `admin-rest` runs `photo-upload.spec.ts` and `photo-bulk.spec.ts` green.
- **Depends on:** U7
- **Status:** done

### U10. Docs and live check
- **Goal:** The docs describe the photo storage that now exists, and the photo flows are checked once in a real browser.
- **Requirements:** R1–R10
- **Files:**
  - `docs/architecture/migration-notes.md`: the Known facts photo bullets; Decision 3 settled in C5 (UUID keys, files table, no move, tombstones, serve route, `PUBLIC_API_URL`)
  - `docs/testing/README.md`: how to run the S3 tests against a real bucket (`TEST_S3_*`), the driver runs and the storage folder for e2e
  - the roadmap C5 row (done, plan link; the copy script moves to the NAS switch)
  - a status note at the top of the photo plan saying which parts C5 built and what changed (file-to-record direction, tombstones, copy script and orphan cleanup deferred)
  - this plan's "Notes for later chunks" (fill in what was built differently)
- **Approach:** `VITE_HOUSING_BACKEND=rest docker compose up -d api web`, log in as `dev@example.org`, then use Chrome:
  - upload a phone photo with GPS, replace it, delete it;
  - change the serial of a record with photos;
  - delete a record with photos;
  - run the bulk photo page with 4 files.
  - Confirm with `docker compose exec api ls /data/storage/housing` that removed files are gone, and download a served photo to check it has no EXIF.
- **Tests:** none beyond the live check.
- **Done when:** no doc still says the new server moves photos on a serial change or keeps files on delete, and the live check passes.
- **Depends on:** U9
- **Status:** done

## Verification
- `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH` for every server command.
- `docker compose up -d db`
- `npm --prefix server run typecheck` and `npm --prefix server run build`
- `npm --prefix server test` (rebuilds `housing_test`, runs both storage drivers)
- `npm run lint`, `npm run build` (runs `tsc -b`), `npm test`
- `npm run test:contract:rest`, then `npm run test:e2e:rest-admin`, then `npm run test:e2e:rest` (U9's order). These run one after another, never in parallel: they share `housing_test`.
- `npm run test:e2e:mock`
- `npm audit --omit=dev` in `server/` after adding `busboy`, `sharp` and `@aws-sdk/*` (`ST-31`)
- The U10 live check.

## Risks and rollback
- **Migration 0009** is additive. Before production holds photos, the undo is `npm --prefix server run db:rollback` (drops `housing_files`). After real uploads exist, rolling back orphans the stored objects and leaves URLs that 404. So never roll back on an environment with real photos. Fix forward instead (`DB-MIG-05`).
- **`PUBLIC_API_URL` is baked into stored URLs.** Moving the API to a new domain needs one `update housing_beneficiaries set x_url = replace(x_url, '<old>', '<new>')` per URL column, run by the owner role. C6 fixes the production value before any upload, and C7's import writes URLs with the production value.
- **sharp's native binary.** If the prebuilt binary is missing for the container's platform, the API won't start. The dev container's install uses `--ignore-scripts` and optional packages. U5 checks `require('sharp')` in the container, and C6 checks it on the PM2 box.
- **Memory.** sharp decodes up to 40 MP per upload. The bulk page sends 2 at a time, and the C7 import script sends 4 (contract §4.10). With `sharp.cache(false)` and at most 2 decodes at a time, peak memory stays around a few hundred MB. C6 sizes the box for it.
- **Orphans from a crash** between `put` and commit can't be found without a `list` operation (out of scope). They cost only storage, not correctness.
- **S3 removal later:** search `TEMP:` and delete `drivers/s3.ts`, its registry line, its config branch, its env lines, its compose services and its tests (`NS-35`).

## Notes for later chunks
- C6: set `TRUST_PROXY` to the exact hop count before the photo route is reachable beyond local and staging. Without it every client shares the proxy's IP in the photo limiter, and with a loose value `X-Forwarded-For` can be spoofed past it.
- C6: run `npm --prefix server test` once with `TEST_S3_*` pointing at a test bucket on the chosen provider (S3 or R2), so the S3 contract and smoke tests run. Then check the production bucket: public access blocked, default encryption on, an IAM policy for that one bucket only (`NS-40`, `NS-43`). Set `PUBLIC_API_URL` to the production value before the first upload.
- C6: schedule `npm --prefix server run files:sweep` (PM2 cron), allow the API origin in the web app's CSP `img-src`, and check `require('sharp')` on the box.
- C6: objects left with no `housing_files` row by a crash mid-upload need a `list` operation to find. Decide whether to add one to `NS-31`.
- C7: import Supabase photos through `storage.put` plus `housing_files` rows, writing URLs with the production `PUBLIC_API_URL`. `scripts/migrate-photos.mjs` stays until C8.
- Later (NAS switch): build the `NS-50` copy script from the photo plan's U7.
- C6: photo responses are cached for a year (`immutable`), so a replaced or deleted photo stays visible to any browser or CDN that already holds it, even though the API answers 404. Decide before production whether that is acceptable or whether `max-age` should drop (for example to a day, as on Supabase) or a CDN purge should run on delete.
- C6: there is no local S3. The S3 driver's contract and smoke tests run only with `TEST_S3_*` set; run them once against the chosen provider before cutover.
- Built as planned, with these differences:
  - The tombstone sweep CLI is `server/src/cli/files-sweep.ts` (only `src/` is built), not `server/scripts/`.
  - The "401 before parsing" test sends a small upload and checks that no storage write happened; a 6 MB body answered early reset the connection.
  - busboy refuses a raw control character in a file name as a malformed part (400), so names are only cut to 255 characters.
  - The `.gitignore` rule `photos/` (photo-migration data) got exceptions for `server/src/photos/` and `server/test/photos/`.
- Review (2026-10-05): one P1 and one P2, both fixed:
  - **P1:** a photo part that busboy emitted after the request had already failed was still processed. That could hang the upload or leave orphan files; it is now drained.
  - **P2:** record delete now takes the photo writes' row lock, so a racing upload can't leave live files without a record.
  - **P3s fixed:** the plan path on R12, comments on the magic-number check, the S3 bucket encryption, the 0009 down section, and the exact storage count in the race test.
  - **No change needed:** an unauthenticated DELETE photo test was asked for, but `housing-writes.test.ts` already has one.
  - **Still open:** P3 `CLAUDE.md` `## Stack profile` (`ST-43`), with the roadmap's rule-amendment task as before.
- Live check (2026-10-05, compose on `rest`): a JPEG with GPS EXIF and orientation 6 came back as a 1600×2133 WebP with no EXIF; replace gave a new URL and the old one 404s; a serial change kept the URLs; a record delete removed all four files; the bulk page uploaded 4 of 4. The dev database now has photos on five semi_pucca/tin records, and record 1's serial went to 900 and back, so the semi_pucca counter is at 900. `docker compose down -v` resets it.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
