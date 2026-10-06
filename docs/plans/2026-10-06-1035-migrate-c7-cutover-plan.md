---
title: C7 Data Import and Cutover
type: migrate
status: in-progress
source: plan
date: 2026-10-06
doc_review: 2026-10-06
---

# C7 Data Import and Cutover

Chunk C7 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R10". It builds on C1–C6 (`docs/plans/2026-10-05-1215-…`, `-1246-…`, `-1352-…`, `-1601-…`, `-1722-…`, `2026-10-06-0925-migrate-c6-deploy-plan.md`). Its cutover sequence comes from U10 of `docs/plans/2026-10-04-1357-housing-service-own-stack-plan.md` (the own-stack plan), checked against the code that exists now.

## Goal
Production runs on the new API and a `rest` UI with every Supabase record, serial counter, serial change, activity-log row, admin (with their current password) and photo copied over and proven equal, while Supabase stays frozen read-only as the rollback for 14 days.

## Problem
Everything the new stack needs exists on staging and is prepared for production (C6), but production's data is still only in Supabase. Nothing copies it, nothing proves a copy is complete, and nobody has written down how to switch the public site over, how long writes must stop, or how to go back. Several earlier chunks also left items for "C7": the REST adapter's `fetchMe`, the bcrypt timing gap, search and activity-log indexes, and production's nginx, UI build and monitoring.

## Requirements
- **R1** One server CLI copies Supabase's records (same ids and serials), serial counters (exact values), serial changes, activity log (same ids and actors) and admins into an empty target database in one transaction, and never writes to Supabase (roadmap R4, R16).
- **R2** Imported admins keep their id and log in with their current Supabase password; an admin whose email or hash can't be used is imported disabled and reported (roadmap R10).
- **R3** Every Supabase photo a record points at is copied through the storage adapter with a server-made key, gets its `housing_files` row, and its record URL becomes `PUBLIC_API_URL/api/v1/photos/<file id>`; a photo that can't be fetched is reported, never silently dropped (roadmap R13).
- **R4** A verify command compares Supabase and the new database (counts per project, counters, max serial against counter, serial changes, activity log, admins, photo slots, and checksums of the key columns) and checks that every photo URL answers 200; any difference fails it (roadmap R16).
- **R5** The public read contract suite and the public Playwright specs can run against any deployed origin, and refuse to send a write.
- **R6** The REST UI tells "logged out" apart from "couldn't reach the server": only a 401 from `/auth/me` logs the admin out.
- **R7** Search and the activity-log filters stay fast at production volume (list and search under ~50 ms on the rehearsal data).
- **R8** The runbook holds a timed cutover: the staging rehearsal (production data on staging only for that day, locked to operators, without password hashes), the write freeze, import and verify, the switch of production's nginx and UI, smoke tests, monitoring, the 14-day read-only window and rollback, with who does what.

## Scope
- In:
  - `server/src/cli/import-supabase.ts` (import and verify), its tests and a source-database fixture
  - a migration for the search and activity-log indexes
  - the `fetchMe` fix and the admin guard's error state
  - a read-only REST contract runner and a write guard for the public specs on `rest`
  - a local end-to-end import check against the local Supabase stack (the proof of R2 against real Supabase hashes)
  - `admin list` showing each admin's hash type
  - runbook, deploy README, migration notes, testing guide and roadmap updates
- Out (not now):
  - removing Supabase, its adapter, `supabase/`, `scripts/migrate-photos.mjs` (C8)
  - copying writes made on the new stack back to Supabase automatically (rollback re-enters them by hand, below)
  - a maintenance-mode feature in the UI
  - the NAS switch and its copy script
  - running anything against the box, AWS, Cloudflare or live Supabase from this session (no access; those are runbook steps)

## Key decisions
- **Admin hashes come over a direct Postgres connection to Supabase** (user decision, 2026-10-06): the person running the cutover can get the database connection string, so `auth.users.encrypted_password` (bcrypt) is read directly and nobody resets a password. Governs R2.
- **The write freeze is enforced in Supabase, not by asking people**: replacing `public.is_housing_admin()` with one that returns `false` stops every admin write through the API at once (the RLS write policies, the security-definer RPCs for serial changes, bulk updates and client activity events, and the storage policies all call it), keeps public reads working, and is undone by restoring the definition saved from live just before. The same freeze is the read-only window. Governs R8.
- **Rollback re-enters writes by hand**: in the 14-day window the new stack takes writes. Going back means freezing the new stack, switching nginx back, unfreezing Supabase and re-entering the writes listed by the new activity log. Rollback is planned for the first 72 hours; after that, fix forward. Governs R8.
- **Copy photo bytes as they are when they are already clean WebP; re-encode otherwise**: Supabase photos were made WebP in the browser, so a second lossy encode would only lose quality. Anything with metadata, trailing bytes or another format goes through the upload pipeline's encoder. Governs R3.
- **The rehearsal runs on staging, hardened** (user decision, 2026-10-06): no password hashes, staging locked to operators for the day, backups paused, a signed wipe. Real-hash logins are proven by the local Supabase check and on cutover day. Governs R8.
- **The bcrypt window closes on cutover day** (user decision, 2026-10-06): any admin still on a bcrypt hash at the end of cutover day is disabled until they ask for `set-password`. Governs R2.

## Technical decisions

**Diagram:** `docs/diagrams/backend-architecture.md`, a new "Import and cutover (C7)" page (Mermaid, like the rest of the file): Supabase (read-only role, public bucket) → the import CLI on the box → production Postgres and the S3 photo bucket, then the nginx switch; and the "Deployment (C6)" caption updated for production after cutover. Written in U8.

**Stack profile.** Unchanged from the roadmap: Express 5, PostgreSQL 17 through `postgres` + dbmate (no Prisma), the minimal admin session (no auth-core), and the storage adapter with the S3 driver (`ST-05`, temporary). C7 adds no runtime dependency; `pg_trgm` is a PostgreSQL contrib extension. The repo still has no `CLAUDE.md` `## Stack profile` (`ST-43`); that stays with the roadmap's ST-03/ST-04 amendment task.

**Where the import lives and how it runs**
- `server/src/cli/import-supabase.ts`, built to `server/dist/cli/import-supabase.js` like `admin.ts` and `files-sweep.ts`, with `npm --prefix server run import:supabase` for local use (`tsx --env-file-if-exists=.env`). Two subcommands: `import` and `verify`. Errors follow `admin.ts`: one error class, caught at the bottom, message to stderr, exit 1.
- On the box it runs as the environment user with both env files, **deploy.env first**, and with any AWS identity from the shell removed:

  ```sh
  env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE \
    node --env-file=/etc/housing/<env>/deploy.env --env-file=/etc/housing/<env>/api.env \
    server/dist/cli/import-supabase.js import …
  ```

  A later `--env-file` wins over an earlier one, so the AWS keys are the app's photo-bucket keys from `api.env`, not the backup keys, and `DATABASE_MIGRATION_URL` comes from `deploy.env`. Node never overrides a variable already in the process environment, hence the `env -u`. The CLI prints the access key id it will use (never the secret) and the target database host/name before it starts.
- Its own zod schema (`NE-CFG-01`) reads only what it needs: `DATABASE_MIGRATION_URL` (target, owner role), `PUBLIC_API_URL`, and the storage settings. Export `storageSchema` from `server/src/config.ts` (it is module-private today) and reuse it with `createStorage()`; `loadConfig()` itself needs runtime settings the CLI has nothing to do with.
- **Target as `housing_owner`**: the app role can't write counters, serial changes, the log or admins (0006, 0007), and only the table owner can disable a trigger. The owner is not a superuser, so `session_replication_role` is not available (and not needed).

**Reading Supabase**
- **Credential**: a temporary read-only role the Supabase owner creates for the cutover, not `postgres`:
  - `create role housing_export login password '…' valid until '<cutover + 2 days>'`, `grant usage on schema public, auth`, `select` on `public.housing_beneficiaries`, `housing_serial_counters`, `housing_serial_changes`, `housing_activity_log`, `housing_admins`, and `select (id, email, encrypted_password, raw_user_meta_data, created_at, deleted_at, banned_until)` on `auth.users`. It needs `bypassrls` or a select policy, because the housing tables have RLS (exact SQL in the runbook; the Supabase owner runs it, never this session).
  - If Supabase refuses the grant on `auth.users`, the fallback is the `postgres` string, with its password reset after the rehearsal and again after the cutover.
  - The role is dropped (or the password reset) after the final verify, so the credential lives no longer than the cutover.
  - Connect through the **Session pooler** string (IPv4, session mode; the user becomes `housing_export.<ref>`); the direct `db.<ref>.supabase.co` host is IPv6-only on some plans.
- **It is prompted for, never stored**: hidden on a TTY, one stdin line when piped. It is never an argument, an env file entry or a log line, so it can't land in shell history or `ps` (`NE-CFG-02`, `NE-CFG-03`). The prompt is the only stdin read the CLI does; the `--replace` confirmation is a flag (below). Move `readPassword()` from `server/src/cli/admin.ts` into `server/src/cli/prompt.ts` and use it from both.
- **TLS**: `--source-ca <file>` (Supabase's CA certificate from the dashboard) gives `verify-full`; the CLI refuses a non-localhost source without it and checks the file is readable before prompting, because the connection carries the password and personal data.
- **Read-only, twice over**: the source connection asks for `default_transaction_read_only=on` and `TimeZone=UTC` as startup options, and every source transaction also runs `begin isolation level repeatable read read only` followed by `set local time zone 'UTC'`, because a pooler may drop startup parameters. Any write attempt fails in Postgres. A test proves an insert through the source connection is refused, and the CLI logs `show timezone` from both sides.
- **The snapshot is closed after the read**: one repeatable-read transaction reads all source tables (step 2 below) and commits. Photos are copied from that in-memory snapshot, and `verify` opens its own fresh read-only transaction, so no transaction stays open on the pooler during the photo copy. At cutover Supabase is frozen, so the two reads see the same data; during the rehearsal (not frozen) a difference shows as drift in the verify output, which is expected there.
- **Source checks before anything is written**:
  - the source has `public.housing_beneficiaries`, `housing_serial_counters`, `housing_serial_changes`, `housing_activity_log`, `housing_admins` and `auth.users`;
  - for the four copied tables (`housing_beneficiaries`, `housing_serial_counters`, `housing_serial_changes`, `housing_activity_log`), the source's column names equal the target's (`information_schema.columns`). A column the other developer added in a new `supabase/sql/NN_*.sql` stops the import with "port it first" (migration-notes working rule 4);
  - `public.housing_admins` has `user_id` and `email`, and `auth.users` has the columns listed above; the admin tables are mapped, not compared;
  - source and target URLs differ.
- The live `housing_log_record_change()` check (`array_append`, C1 note) is a runbook pre-check SQL line, not CLI code.

**What it copies, in which order**
1. **Guards on the target**: required tables exist (migrations through 0010 applied), and the target is empty: no rows in `housing_beneficiaries`, `housing_files`, `housing_serial_changes`, `housing_activity_log` or `housing_admins`, and both counters at 0. Otherwise it refuses, unless `--replace --confirm-db <target database name>` is given:
   - `--replace` truncates those tables with `restart identity cascade` and zeroes the counters inside the import transaction; the live `housing_files` keys it removed are deleted from storage after commit (`DB-TX-02`).
   - It refuses when the target's activity log has rows newer than the newest row the source has (new-stack writes exist), unless `--discard-new-writes` is also given. That flag is only for a second cutover after a rollback, once those writes were re-entered on Supabase (runbook).
   - It is used by every staging rehearsal run (staging has its own admins and photos) and by a second cutover attempt.
2. **Read the snapshot** (one source transaction, then commit): records, counters, serial changes, activity log, and admins as `public.housing_admins` joined to `auth.users` on `user_id`.
3. **Photos, before the database transaction** (`DB-TX-02`, `NS-06`), below. Every key written is remembered.
4. **One target transaction** (`set local statement_timeout = 0`), in `server/src/import/target.ts`, which takes the snapshot plus a photo result (a map of record and slot to URL, and the `housing_files` rows; empty until U4, so URLs are null):
   - `alter table public.housing_beneficiaries disable trigger housing_beneficiaries_activity_log`. `ALTER TABLE` is transactional, so a failed import leaves the trigger enabled. Without this, every insert would add a fake `create` row with `actor_email = housing_owner`.
   - Records in batches of 500 with every column given: `id`, `serial_no`, `created_at`, `updated_at`, `photo_updated_at`, the `*_source` columns as they are, and the `*_url` values from the photo result. The `updated_at` trigger is `BEFORE UPDATE` only, so the timestamps stay. The serial trigger keeps an explicit `serial_no` and raises the counter to it (the C1 note: only the import may send one). `housing_protect_serial` is `UPDATE` only and needs no bypass, so no session-setting guard is touched (`docs/learnings/security/postgres-session-setting-guards-are-spoofable.md`).
   - `housing_files` rows: `record_id`, `kind`, `variant`, `storage_key`, `storage_driver = storage.name`, `content_type = image/webp`, `size_bytes`, `original_name` = the Supabase object path, `created_by` null.
   - Serial changes and activity log with their ids, then `setval` both sequences to `max(id)`. Actor columns are copied as they are; `actor_id` is the Supabase user id, which is the imported admin's id.
   - Admins, below.
   - Counters: `update housing_serial_counters set last_serial = <source value>`. Abort if a source counter is below the target's (that would mean a source serial above its own counter), then check `max(serial_no) <= last_serial` per project.
   - Re-enable the trigger, commit.
5. **If anything fails** after photos were written, remove every key it wrote and print any key it couldn't remove (`NS-06`). Nothing in the target changed, because the transaction rolled back.
6. **Run `verify`** (a fresh source read) and print the summary and report.

**Admins**
- `id = auth.users.id`, `email = lower(auth.users.email)`, `password_hash = encrypted_password`, `name` from `raw_user_meta_data` (`name`, then `full_name`, else null), `created_at` from `auth.users`.
- Imported **disabled** (`disabled_at = now()`) and listed in the report:
  - a user deleted (`deleted_at`) or banned (`banned_until > now()`) in Supabase;
  - an email that fails the login rule (`emailSchema` from `server/src/auth/credentials.ts`);
  - a hash that isn't bcrypt (`^\$2[aby]\$\d\d\$`), stored as the unusable `!` (the login treats a malformed hash as a wrong password). The fix is `admin set-password` and `admin enable`.
- `--without-passwords` (rehearsal only) stores `!` for every admin and imports all of them disabled, so no real hash reaches staging.
- Two users with the same lower-cased email stop the import.
- Passwords over 200 characters can't exist: GoTrue limits passwords to 72 characters.
- **The bcrypt timing gap** (C2 note, user decision): until an imported admin logs in once, their bcrypt check takes a different time from the argon2id dummy for unknown emails. The login already rehashes to argon2id on success (`needsUpgrade()` in `server/src/auth/password.ts`). `admin list` gains a `hash` column (`argon2id`, `bcrypt` or `none`). Before the switch, the Supabase owner confirms each active admin in the report (stale ones are disabled). Every admin logs in on cutover day; at the end of the day the operator disables anyone still on `bcrypt`, who gets `set-password` + `enable` on request. A bcrypt dummy would only move the gap to the argon2id admins, so it isn't built.

**Photos**
- **Which photos**: each non-null `prev_photo_url`, `prev_thumb_url`, `current_photo_url`, `current_thumb_url` on the snapshot's records (the bucket is never listed; objects no record points at stay behind and go with the project in C8).
- **Fetching** (no service key: the bucket is public, `05_storage.sql`):
  - `--photo-base <url>` must have the form `https://<ref>.supabase.co/storage/v1/object/public/housing-photos/` (or `http://127.0.0.1|localhost:<port>/storage/v1/object/public/housing-photos/` for the local stack); anything else is refused.
  - Each record URL is parsed with `new URL`. It is fetched only when its origin equals the base's origin, it has no userinfo, and its decoded path segments start with the base's segments and contain no `.`, `..` or encoded `%2e`/`%2f` segment. The query (`?v=`) is dropped.
  - `fetch` with `redirect: 'manual'`; any 3xx is a failure. 30-second timeout, three retries on a network error or 5xx, a 5 MB cap while reading.
- **Copy or re-encode**: every body is fully decoded with `sharp(buffer, { limitInputPixels: <the upload limit>, failOn: 'error' })` first; a body that doesn't decode is a failure. It is stored byte for byte only when it sniffs as WebP (`server/src/photos/sniff.ts`), the RIFF length in its header equals the body length (no trailing bytes), and `metadata()` shows no EXIF, XMP, IPTC or ICC. Anything else goes through the upload encoder. Export that encoder from `server/src/photos/process.ts` as `encodeVariant(image: sharp.Sharp, variant: PhotoVariant): sharp.Sharp` (`rotate()`, resize to `FULL_WIDTH`/`THUMB_WIDTH` without enlargement, `webp({ quality: WEBP_QUALITY })`), with those constants exported. The upload path calls it on each clone, as now; the importer calls it on its decoded buffer.
- **Gaps and generated thumbs**: a 404 or a URL outside `--photo-base` leaves that slot null and adds it to the report as a `gap`. A photo whose thumb slot is null or a gap gets a thumb made from the photo, reported as `generated`. Any other failure (a 5xx after retries, a 3xx, an oversize or undecodable body, a storage error) stops the import before the database transaction. A gap is therefore something already broken on Supabase today; the rehearsal surfaces gaps so admins can re-upload those photos in the Supabase UI before cutover.
- Keys are `housing/<uuid>.webp` (`NS-01`), file ids are `randomUUID()`, and URLs come from `photoUrl()` in `server/src/photos/service.ts`.
- **Visibility**: imported photos are public by unguessable id through `GET /api/v1/photos/:id`, exactly like uploaded ones (beneficiary photos are public on Supabase today); a file that isn't live returns 404 (`NS-10`).
- **Concurrency 4** (the contract's §4.10 figure). Each worker holds at most one 5 MB body plus sharp's working memory bounded by `limitInputPixels`.

**Report and logs**
- The report is JSON on stdout after the summary: record ids, project, serial and slot for photo gaps and generated thumbs; admin ids with a reason code for admins imported disabled. No names, addresses, emails, hashes or column values.
- Verify failures name the check and, where it applies, the row id; never the differing values.
- Logs carry counts and ids only. A test checks the prompted URL, emails and hashes never appear in stdout or stderr.
- The operator saves the report to the environment user's home with mode 600 and deletes it with the cutover checklist.

**Verify** (`verify`, also run at the end of `import`)
- Both sides use UTC (above), so timestamps print the same.
- It compares, and fails on any difference:
  - records per `project_type`: count and `max(serial_no)`;
  - counters, and `max(serial_no) <= last_serial` on both sides;
  - serial changes and the activity log: count, `max(id)`, and per-action counts for the log;
  - checksums: `md5(string_agg(concat_ws('|', <columns>), E'\n' order by id))` over
    - records: every column except the four `*_url` columns;
    - serial changes: every column;
    - activity log: `id, at, actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details::text`;
  - admins: the same ids and lower-cased emails, and the same hashes for admins not imported disabled;
  - photos: per slot, source non-null + generated = target non-null + gaps (the report from `import` is passed with `--report <file>`; without it the photo equation is skipped with a warning); every target URL has a live `housing_files` row for the same record, kind and variant; live `housing_files` rows = non-null target URLs.
- `--photos` GETs every target photo URL (concurrency 4, waits on a 429's `Retry-After`) and expects 200 with `image/webp`. `--photos-via <origin>` swaps `PUBLIC_API_URL` for another origin, so the check can hit `http://127.0.0.1:3201` before nginx serves `/api/`, and `https://<host>` after the switch. Verify always runs on the box, as the operator.
- Exit 0 only when everything matches.

**Indexes (R7)**
- New migration `0010_search_and_activity_indexes.sql`, add-only (`DB-MIG-02`, `DB-MIG-07`):
  - `create extension if not exists pg_trgm`. It is a trusted extension in PostgreSQL 17, so `housing_owner` (the database owner) can create it. Needs `postgresql17-contrib` on the box (runbook section 1); the `postgres:17` image in compose and CI already has it.
  - GIN `gin_trgm_ops` indexes on `name`, `father_or_husband_name` and `address`. The search (`server/src/housing/reads.ts`) is `ilike '%q%'` on those three, which a btree can't serve; the planner can combine three GIN indexes with a BitmapOr.
  - `housing_activity_log (project_type, at desc)` for the project filter, and a `gin_trgm_ops` index on `actor_email` for its `ilike` filter (`server/src/housing/activity.ts`).
  - Plain `create index`, not `concurrently`: production's tables are empty when it runs (the import comes after), staging's are small, and dbmate runs each migration in a transaction (`DB-MIG-06` is about large live tables).
  - Down section drops the indexes and the extension.
- The extension's functions are created by the owner, so the database-wide `revoke execute … from public` default applies (`docs/learnings/database/postgres-default-privileges-public-execute.md`). `ilike` and the index's support functions don't need `EXECUTE` grants; the server tests, which query as `housing_app`, prove the search still works.
- `deploy/sql/perf-check.sql`: `explain (analyze, buffers)` for the default list, a search, and an activity page filtered by project and by actor. The rehearsal runs it on staging with production's data; over 50 ms on any of them is a finding to fix before cutover.

**`fetchMe` (R6)**
- `src/features/housing/backend/rest/authProvider.ts`: return `null` (and cache it) only for `HousingApiError` code `UNAUTHENTICATED`. Any other error leaves the cache unknown (`undefined`) and is rethrown, so the next call asks again. The `BroadcastChannel` handler catches and ignores it.
- `src/features/housing/hooks/useAuth.ts`: `status` gains `'error'`. A `CONFIG_ERROR` still means "ready, logged out" (current behavior). The Supabase and mock providers never throw for "logged out", so they don't change.
- `src/features/housing/components/RequireAdmin.tsx`: on `'error'`, show "সার্ভারে সংযোগ করা যাচ্ছে না" with a retry button instead of redirecting to the login page.
- `src/features/housing/pages/HousingLoginPage.tsx`: treats `'error'` as logged out and shows the form (check its current `status` handling; change it only if it waits on `'ready'`).

**Read-only checks against a deployed origin (R5)**
- `tests/contract/readonlyFetch.ts`: a `fetch` wrapper that throws before sending anything but GET, HEAD and OPTIONS, plus the URL check (`https:`, or `http:` only for localhost). Its unit test `tests/contract/readonlyFetch.test.ts` runs in `npm test`.
- `tests/contract/rest.readonly.contract.test.ts`: the contract with `writes: false` through `createRestHousingApi`/`createRestAuthProvider` and that wrapper (the same idea as `supabase.readonly.contract.test.ts`). Enabled by `REST_READONLY_URL`. Script `npm run test:contract:rest-readonly`.
- `e2e/support/test.ts`: in the `public-rest` and `edge-rest` projects, a context-level route (`context.route('**/*')`) blocks every request that isn't GET, HEAD or OPTIONS to the site's origin, whatever the path, as `liveWriteGuard` does for Supabase. Then `E2E_EDGE_URL=https://<host> npx playwright test --project=edge-rest` is safe against production and also checks its CSP. Nothing in `e2e/live/` depends on dev-seed data (the specs already run against live Supabase) or uses `page.request` for writes.
- A host allow-list isn't added: the URL is typed by the verifier for one run, and the guard already makes any host read-only.
- These are run by a person from a developer machine, never in CI (`TS-03`: CI never points at real data).

**Tests never touch real data (`TS-03`)**
- The import's tests use a source database `housing_source_test` on the compose/CI cluster, created by `server/db/docker-init/01-init.sh` and owned by `housing_owner`, loaded from `server/test/fixtures/supabase-source.sql`: a hand-written copy of the Supabase table shapes (`public.housing_*` from `supabase/sql/01, 02, 03, 09`, and a cut-down `auth.users`), without RLS, grants or functions. Writing a fixture avoids needing Supabase's roles and `auth`/`storage` schemas in the dev cluster. Existing local volumes need the database added once (`docker compose exec db createdb -U postgres -O housing_owner housing_source_test`, in the testing guide); the test refuses with that command if it's missing.
- The target is `housing_test` through `testOwnerUrl`. These tests run inside `npm --prefix server test`, so they stay in the one-after-another `housing_test` sequence.
- Photos come from a local `http` server in the test serving fixture images made with sharp (a clean WebP, a WebP with EXIF, a WebP with trailing bytes, a JPEG with GPS EXIF, a redirect), stored with the NAS driver in a temp dir (`server/test/support/storage.ts`).
- Real Supabase shape: `scripts/import-supabase-local.mjs` (`npm run test:import:supabase-local`) starts the local Supabase stack (ports 55420-55429), creates two admins with known passwords through its auth admin API (refusing any non-localhost URL, as `contract-supabase-local.mjs` does), uploads photos for a few seeded records through Storage, changes one serial, then imports into a scratch database `housing_import_check` on the compose cluster (created and dropped through the compose superuser) with `STORAGE_DRIVER=nas`, runs `verify --photos`, and logs both admins in through the new login service. This is the proof that real GoTrue bcrypt hashes work (R2), since the rehearsal imports none. It needs Docker and the Supabase CLI, so it isn't in CI; it also times a run.

**The rehearsal (staging, hardened)**
- The same CLI, against live Supabase (read-only; no freeze), into staging's database and bucket, with staging's `PUBLIC_API_URL`: `import --replace --confirm-db housing --without-passwords …`. `--replace` wipes staging's own admins and photos; they are recreated afterwards.
- Production's personal data stays on staging for that day only, under these controls:
  - **Access**: before the run, a Cloudflare WAF rule blocks the staging host for everyone but the operators' IPs; only the operator has a shell on the box that day. Removed after the wipe.
  - **No copies**: stop `housing-backup-staging` and `housing-sweep-staging` (`pm2 stop`); no manual `pg_dump`; confirm the staging cluster has no WAL archiving (`show archive_mode`); the importer's logs carry ids and counts only.
  - **Wipe**, the same day: truncate the housing tables and admins and zero the counters as `housing_owner` (SQL in the runbook), `vacuum full` those tables, remove every object **and every noncurrent version** under `housing/` in the staging photo bucket (an AWS admin; the app's key can't delete versions), delete the saved report, recreate staging's own admins, start the two PM2 jobs again, remove the WAF rule.
  - **Sign-off**: a named person runs `select count(*)` on every housing table and `aws s3api list-object-versions` on the prefix, and signs the checklist line.
- It measures each step's time (import, verify `--photos`, a `backup.sh` run and the restore drill on a staging backup taken before the import) to size the freeze, runs `perf-check.sql`, and runs the read-only contract and `edge-rest` against staging from an operator IP.

**Cutover runbook** (new runbook section 19; times from the rehearsal)
- **T−7 days**: rehearsal on staging; report reviewed; admins re-upload any reported photo gaps on Supabase; the Supabase owner reviews the admin list.
- **T−2 days**: announce the freeze window to the admins (public users see no change). Agree with the other developer that no script using the Supabase service-role key (which bypasses RLS) runs from the freeze on.
- **T−1 day** (no public change):
  - Cloudflare: origin certificate for the production host, Authenticated Origin Pulls (already zone-wide if staging shares the zone), the login WAF rule for the production host;
  - box: `postgresql17-contrib` installed; `build.env` switched to `VITE_HOUSING_BACKEND=rest` and `VITE_API_BASE_URL=https://<prod host>`; `deploy/deploy.sh production <sha>` (builds the `rest` UI into `current/dist`, takes a backup, migrates to 0010; the public vhost still serves the Supabase UI);
  - render production's nginx files into `/etc/nginx/housing/production/` without including them yet;
  - copy the current Supabase UI server block to `/etc/nginx/housing/supabase-ui.conf.bak` and note its UI directory (both stay untouched for rollback);
  - Supabase owner: create the `housing_export` role (above); download the CA certificate to the box.
- **Cutover day** (roles: *operator* on the box, *Supabase owner*, *Cloudflare admin*, *verifier* on a developer machine, *admins*):
  1. Supabase owner: save the live definition (`select pg_get_functiondef('public.is_housing_admin'::regproc)`) to a file, then freeze (`create or replace function public.is_housing_admin() … select false`, exact SQL in the runbook). Check it as an admin would see it: `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<an admin user_id>","role":"authenticated"}'; select public.is_housing_admin(); rollback;` returns `false` (before the freeze it returns `true`). Note the UI still *shows* admin rights (`housing_current_admin()` doesn't call `is_housing_admin()`); its writes fail. Record `count(*)` of the log and `max(updated_at)` of the records.
  2. Operator: `import-supabase import --photo-base … --source-ca …` (production: no `--replace`, no `--without-passwords`); save and read the report.
  3. Operator: `verify --report <file> --photos --photos-via http://127.0.0.1:3201`. Supabase owner: the step 1 counts are unchanged.
  4. Supabase owner: confirm each active admin in the report; operator disables any not confirmed.
  5. Operator: `deploy/backup.sh production`, then the restore drill on that backup (C6 note).
  6. Operator: switch nginx (remove the old server block's include, add production's include, `nginx -t`, reload; on a failing `-t`, put the old one back). Cloudflare admin: purge the host's cache.
  7. Operator: `verify --report <file> --photos --photos-via https://<host>`. Verifier: `REST_READONLY_URL=https://<host> npm run test:contract:rest-readonly`; `E2E_EDGE_URL=https://<host> npx playwright test --project=edge-rest`; the Authenticated Origin Pulls and WAF checks from runbook section 8.
  8. Admins: each logs in once (R2; the login rehashes to argon2id) and opens the activity log. No test write in production: a create would use up a real serial.
  9. Operator: production's `readyz` and `/` in the uptime monitor. Announce that writes are open.
  10. End of day: `admin list`; disable anyone still on `bcrypt`.
- **Freeze length** = steps 1–8; the rehearsal's times give the number for the announcement.
- **After**:
  - Supabase owner, the same day, off the critical path (Supabase is frozen, so the data is what was imported): a final dump of `public.housing_*` (no `auth.users`) through the Session pooler, staged to a temp file, encrypted with age to the existing backup recipient (private key offline with the two named holders, C6) and uploaded to `s3://<org>-housing-backups/supabase-final/` under the same IAM and Object Lock rules, so it expires 30 days later on its own (following `docs/learnings/tooling/streamed-backup-uploads-truncated-dump-on-failure.md`).
  - Supabase owner: drop `housing_export` (or reset the `postgres` password, if that fallback was used).
  - Watch `pm2 logs`, the uptime monitor and the activity log daily for the first week. Supabase stays frozen until C8 (14 days).

**Rollback during the window** (runbook section 19)
- **Before step 6** nothing public has changed: unfreeze Supabase (restore the definition saved in step 1), fix, and retry later with `import --replace --confirm-db housing`.
- **After step 6, within 72 hours**:
  1. Stop new-stack writes: `admin disable` for each admin (it also ends their sessions).
  2. List what changed since the cutover: a runbook SQL query over `housing_activity_log where at > <cutover time>` (creates, updates, deletes, serial changes and photo changes, with record ids and serials).
  3. Restore the Supabase UI server block, `nginx -t`, reload, purge the Cloudflare cache.
  4. Unfreeze Supabase (the saved definition).
  5. Admins re-enter the listed changes in the Supabase UI, in the same order. Supabase's counters are where the import left them, so creates entered in the same order get the same serials; photos are re-uploaded. Password changes made on the new stack don't carry back.
  6. A second cutover later starts from `import --replace --confirm-db housing --discard-new-writes`.
- **After 72 hours**: fix forward on the new stack. Supabase stays frozen as a read-only reference until C8.

**What needs a person vs what the repo does**
- **Repo**: the import, verify, the indexes, the `fetchMe` fix, the read-only checks, the local end-to-end check, the nginx templates (C6) and `deploy.sh`/`backup.sh`/`restore-drill.sh` (C6).
- **A person** (runbook section 19, checklist section 20): the export role, CA file, freeze, final dump and role drop; the rehearsal, its access rule and the signed staging wipe (including bucket versions); Cloudflare for the production host; `build.env`, the production deploy, nginx switch and cache purge; the read-only checks against production; admin confirmation and logins; the uptime monitor; rollback if needed.

## Implementation units

### U1. `fetchMe` separates "logged out" from "server unreachable"
- **Goal:** Only a 401 from `/auth/me` logs the admin out in the REST UI; other errors show a retry message.
- **Requirements:** R6
- **Files:** `src/features/housing/backend/rest/authProvider.ts`, `src/features/housing/backend/rest/authProvider.test.ts`, `src/features/housing/hooks/useAuth.ts`, `src/features/housing/components/RequireAdmin.tsx`, `src/features/housing/pages/HousingLoginPage.tsx` (only if needed, see Technical decisions), a test next to `RequireAdmin.tsx` (or `useAuth`), `src/i18n/en.ts`
- **Approach:** Technical decisions, `fetchMe`. Characterization first (`TS-22`): pin today's behavior for 200 and 401 in `authProvider.test.ts` before changing it. Follow the existing component tests' setup for `RequireAdmin`.
- **Tests:**
  - `/auth/me` 200 → user, cached; 401 → `null`, cached.
  - 500, network error → `currentUser()` rejects, nothing is cached, and the next call fetches again and succeeds.
  - A `BroadcastChannel` message while the server is down doesn't emit `null` or throw unhandled.
  - `useAuth`: `CONFIG_ERROR` → ready and logged out; another error → `'error'`.
  - `RequireAdmin`: `'error'` shows the retry message and doesn't navigate to login; retry with the server back shows the admin shell.
  - The login page shows the form on `'error'`.
- **Done when:** `npm test`, `npm run lint`, `npm run build` and `npm run i18n-check` (Node 24) pass, and `npm run test:e2e:rest-admin` stays green.
- **Depends on:** none
- **Status:** done

### U2. Search and activity-log indexes
- **Goal:** Search and the activity filters use indexes, with a perf check the rehearsal can run.
- **Requirements:** R7
- **Files:** `server/db/migrations/0010_search_and_activity_indexes.sql`, `deploy/sql/perf-check.sql`, a server test next to the existing read tests (e.g. `server/test/housing/reads.test.ts` or the migration tests), `docs/architecture/migration-notes.md` (table row: "none → 0010"), runbook section 1 (`postgresql17-contrib`)
- **Approach:** Technical decisions, Indexes. Follow `0008_read_indexes.sql` for shape and the down section.
- **Tests:**
  - The migration applies up, down and up again (the existing migration check in `server/test/support/global-setup.ts`).
  - As `housing_app`: a search on name, father's name and address still returns the right rows; an activity query filtered by project and by actor email still works.
  - With `enable_seqscan = off` in the test's transaction, `explain` of the search and the actor filter names the new indexes (proves they are usable, not that the planner picks them on tiny data).
- **Done when:** `npm --prefix server test` and `npm run test:contract:rest` pass, and `psql -f deploy/sql/perf-check.sql` runs on the dev database.
- **Depends on:** none
- **Status:** done

### U3. Import CLI: records, counters, serial changes, activity log, admins
- **Goal:** `import-supabase import` copies everything but photos from a read-only snapshot into an empty target in one transaction.
- **Requirements:** R1, R2
- **Files:** `server/src/cli/import-supabase.ts`, `server/src/import/` (`source.ts` for the snapshot and checks, `target.ts` for the guarded transaction taking the photo result, `admins.ts` for the admin mapping, `report.ts`), `server/src/cli/prompt.ts` (`readPassword()` moved from `admin.ts`), `server/src/config.ts` (export `storageSchema`), `server/src/cli/admin.ts` (`list` shows hash type), `server/package.json` (`import:supabase` script), `server/db/docker-init/01-init.sh` (`housing_source_test`), `server/test/fixtures/supabase-source.sql`, `server/test/support/source.ts` (refuses anything not local and not `*_test`, like `server/test/support/db.ts`), `server/test/import/import.test.ts`, `server/test/cli/admin.test.ts`
- **Approach:** Technical decisions, "Where the import lives", "Reading Supabase", "What it copies", "Admins" and "Report and logs". The storage driver is built here (from `storageSchema` and `createStorage()`), because `--replace` removes the wiped keys after commit; U3 passes an empty photo result, so imported URLs are null until U4. Shape the CLI on `server/src/cli/admin.ts` (zod env, `AdminCliError`-style error, exit codes) and test it the same way (`execFile` of tsx with piped stdin) for argument and prompt handling; test the import logic by calling its functions directly. Use postgres.js's `sql(rows, columns)` for batch inserts.
- **Tests:**
  - Happy path: ids, serials, timestamps, counters (including a counter above the max serial after a delete), serial changes and the log arrive equal; sequences continue after `max(id)`; no `create` row was added by the trigger, and the trigger is enabled afterwards.
  - A record created through the app after the import gets counter+1, never a reused serial.
  - An imported admin logs in with the fixture's bcrypt password, and the hash becomes argon2id; `admin list` shows `bcrypt` before and `argon2id` after.
  - Admins: upper-case email is lower-cased; a deleted, banned, bad-email or non-bcrypt user is imported disabled and reported by id and reason; two users with the same lower-cased email stop the import; `--without-passwords` stores `!` and disables everyone.
  - Refusals: a non-empty target (each table, and a non-zero counter) without `--replace`; `--replace` without `--confirm-db` or with the wrong name (nothing changes); `--replace` when the target has newer log rows than the source, without `--discard-new-writes`; a copied-table column the target lacks; a missing source table or admin column; source URL equal to target URL; a non-local source without `--source-ca`.
  - `--replace --confirm-db <right name>` wipes, re-imports and removes the old live keys from storage.
  - The source connection refuses an insert (read-only proof), and the source transaction reports `UTC`.
  - A failure mid-transaction (inject a bad row) leaves the target empty and the trigger enabled.
  - The prompted URL, admin emails and hashes never appear in stdout, stderr or an error message.
- **Done when:** `npm --prefix server test` passes, including the new tests, and `npm --prefix server run build` emits `dist/cli/import-supabase.js`.
- **Depends on:** U2 (the target must be at 0010 for the required-tables check)
- **Status:** done

### U4. Import CLI: photos
- **Goal:** Every photo slot is copied through the storage adapter, recorded in `housing_files` and pointed at by the record's URL, with gaps reported.
- **Requirements:** R3
- **Files:** `server/src/import/photos.ts`, `server/src/photos/process.ts` (export `encodeVariant` and its constants), `server/src/cli/import-supabase.ts`, `server/test/import/photos.test.ts`, `server/test/photos/` (the upload tests stay green)
- **Approach:** Technical decisions, Photos. The order follows `savePhoto` in `server/src/photos/service.ts` (storage first, rows in the transaction, cleanup on failure), with the transaction being U3's `target.ts` fed the photo result.
- **Tests:**
  - A clean WebP is stored byte for byte; a WebP with EXIF, a WebP with trailing bytes and a JPEG with GPS EXIF come out as re-encoded WebP with no metadata; each slot has a `housing_files` row and a `PUBLIC_API_URL/api/v1/photos/<id>` URL that `GET /api/v1/photos/:id` serves; an unknown or non-live file id returns 404.
  - A photo without a thumb gets a generated thumb, reported as `generated`.
  - A 404 and a URL outside `--photo-base` leave the slot null, appear in the report as `gap`, and the import still succeeds.
  - SSRF: a 3xx (to a private address), a `..` or `%2e%2e` path, a userinfo URL (`https://<ref>.supabase.co@evil/…`), another port, and a `--photo-base` of the wrong form are refused, and no request reaches the other target.
  - A 5xx (after retries), an oversize body and an undecodable body stop the import before the transaction and remove every object already written.
  - A failing database transaction removes every object written.
  - No more than 4 fetches are in flight at once.
- **Done when:** `npm --prefix server test` passes.
- **Depends on:** U3
- **Status:** done

### U5. Verify command
- **Goal:** `import-supabase verify` proves the target equals the source and every photo URL answers.
- **Requirements:** R4
- **Files:** `server/src/import/verify.ts`, `server/src/cli/import-supabase.ts`, `server/test/import/verify.test.ts`
- **Approach:** Technical decisions, Verify. The same SQL text runs on both sides, so a checksum difference can only come from data. `import` calls it at the end with its own report.
- **Tests:**
  - After an import: every check passes, and the photo checks pass with `--photos` against a test app (`createApp` on the target, as `server/test/http/` does) through `--photos-via`.
  - Each kind of drift fails with a message naming the check and row id, never the values: one changed record field, one extra log row, a changed counter, a serial above its counter, a changed admin hash, a photo URL without a live file row, a photo object removed from storage (404).
  - A source write after the import (in the fixture database) shows up as a difference.
  - Gaps and generated thumbs from the report balance the photo equation; without `--report` the equation is skipped with a warning.
- **Done when:** `npm --prefix server test` passes.
- **Depends on:** U4
- **Status:** done

### U6. Read-only checks against a deployed origin
- **Goal:** The public contract suite and the public specs can run against staging or production and can't send a write.
- **Requirements:** R5
- **Files:** `tests/contract/readonlyFetch.ts`, `tests/contract/readonlyFetch.test.ts`, `tests/contract/rest.readonly.contract.test.ts`, `package.json` (`test:contract:rest-readonly`), `e2e/support/test.ts`, `docs/testing/README.md`
- **Approach:** Technical decisions, "Read-only checks". Copy the structure of `tests/contract/supabase.readonly.contract.test.ts`.
- **Tests:**
  - `readonlyFetch.test.ts` (in `npm test`): POST, PUT, PATCH and DELETE throw before any request; GET, HEAD and OPTIONS pass; an `http:` URL that isn't localhost is refused.
  - `REST_READONLY_URL=http://localhost:3001 npm run test:contract:rest-readonly` passes against the compose API with the dev seed.
  - A spec-level check in `public-rest` that a POST to a non-`/api/v1/` path on the site's origin is blocked.
  - `npm run test:e2e:rest` and `npm run test:e2e:edge` stay green with the new guard.
- **Done when:** the commands above pass, and the testing guide lists the new command and the production usage.
- **Depends on:** none
- **Status:** todo

### U7. Local end-to-end import check against the local Supabase stack
- **Goal:** One command proves the import against Supabase's real schema, auth hashes and storage, and times it.
- **Requirements:** R1–R4
- **Files:** `scripts/import-supabase-local.mjs`, `package.json` (`test:import:supabase-local`), `docs/testing/README.md`
- **Approach:** Technical decisions, "Tests never touch real data", last item. Reuse the start and status code from `scripts/contract-supabase-local.mjs` (move it to `scripts/lib/` if both need it).
- **Tests:** the script itself: it exits 0 after `verify --photos` passes and both admins log in with their Supabase passwords, and the scratch database and storage folder are gone afterwards. Run it once with a deliberately broken photo URL in the source to see the gap reported.
- **Done when:** `npm run test:import:supabase-local` passes locally (Docker and the Supabase CLI), and its timing is written in `docs/testing/README.md` next to the command and in the runbook's section 19 time column as the local baseline.
- **Depends on:** U5
- **Status:** todo

### U8. Runbook, checklist and docs
- **Goal:** A person can rehearse, cut over, verify, monitor and roll back from the runbook alone.
- **Requirements:** R8
- **Files:** `docs/diagrams/backend-architecture.md` (the C7 page and caption), `docs/operations/runbook.md` (new section 19 "Cutover" and section 20 "Cutover checklist"; updates to the intro, sections 1, 5, 7, 8, 10, 12, 16 and 18), `deploy/README.md`, `docs/architecture/migration-notes.md` (Decision 6: import and cutover; working rules end at cutover), `docs/testing/README.md`, the roadmap (C7 row, open question answered), `server/.env.example` (if the CLI adds settings)
- **Approach:** Technical decisions, "The rehearsal", "Cutover runbook", "Rollback during the window" and "What needs a person". Write every SQL the person runs in full (the `housing_log_record_change()` `array_append` pre-check, the export role and its drop, freeze with the saved definition, the as-admin freeze check, unfreeze, staging wipe and its sign-off counts, the changes-since-cutover query, the `supabase-final` dump), every command with its `env -u` and env-file order, and a time column filled from U7 and, later, from the rehearsal. Section 20 carries every C7 item from the earlier chunks' notes (C1 live function check, C2 admin checks and timing gap, C3/C4 indexes, C5 photo URLs, C6 vhost, UI build, uptime monitor and restore drill) plus the rehearsal sign-off.
- **Tests:** none (docs). Check that every command in sections 19–20 exists in the repo (`npm run`, `server/dist/cli/*`, `deploy/*.sh`) and every flag matches the CLI's help.
- **Done when:** a reader can follow section 19 from T−7 to T+14 days without asking, and every "C7" note from C1–C6 is either done in code or a checklist line.
- **Depends on:** U1–U7
- **Status:** todo

## Verification
- `npm run lint`, `npm run build`, `npm --prefix server run typecheck`, `npm run i18n-check` (Node 24)
- `npm test`, `npm run check:prod-bundle`
- One after another: `npm --prefix server test`, `npm run test:contract:rest`, `npm run test:e2e:rest-admin`
- `docker compose up -d db api` with the dev seed, then `npm run test:e2e:rest` and `REST_READONLY_URL=http://localhost:3001 npm run test:contract:rest-readonly`
- `npm run build:edge`, `docker compose --profile edge up -d edge`, then `npm run test:e2e:edge`
- `npm run test:e2e:mock`
- `npm run test:import:supabase-local` (local only: Docker and the Supabase CLI)
- `npm audit --omit=dev --audit-level=high` in the root and `server/`; `shellcheck deploy/*.sh`
- A green `ci.yml` run on the pushed branch (pushing needs the user's go-ahead)

Server commands run with Node 22: `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH`; `i18n-check` needs Node 24. Existing local volumes need `housing_source_test` created once (U3).

## Risks and rollback
- **An incomplete or wrong copy**: the import is one transaction from one snapshot, and `verify` checks counts, checksums and photos before the public switch. A failed verify means nothing public changed: unfreeze Supabase and retry with `--replace`.
- **Serials reused or reset** (roadmap R4): counters are copied exactly and checked against the max serial on both sides; a test creates a record after import and checks it gets counter+1.
- **Writes slip past the freeze** (the service-role key bypasses RLS): the other developer agrees not to run such scripts, and step 3 compares the counts recorded at the freeze.
- **The freeze runs long**: the rehearsal times every step. If the photo copy dominates, the freeze announcement uses that number; a pre-copy of photos is a later option, not built now.
- **Personal data left on staging**: no hashes, access locked to operators, backups and the sweep paused, a same-day wipe including bucket versions, and a signed checklist line.
- **The Supabase credential leaks**: a temporary read-only role with an expiry, prompted, never stored or logged, TLS verified, and dropped after the cutover.
- **A malicious URL in a record steers the importer**: origin and segment checks, no redirects, the base URL's form checked.
- **`--replace` wipes live data**: it needs the database name typed as a flag, and refuses when the target has newer writes than the source unless `--discard-new-writes`.
- **nginx switch breaks other vhosts**: `nginx -t` before every reload, the old server block kept as a file, and the templates already pass `nginx -t` on 1.20 in CI.
- **A bad day after the switch**: rollback within 72 hours as above; after that, fix forward. Supabase stays frozen and a final encrypted dump stays 30 days in the backup bucket.
- **0010 needs to be undone**: it only adds an extension and indexes; its down section drops them, and no code depends on them.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
- The cutover itself (rehearsal, freeze, switch) is a runbook procedure for the people with box, Supabase, AWS and Cloudflare access; its checklist (section 20) is the hand-off, not part of this session's done

## Progress
- **Branch:** `migrate/c7-cutover`
- **Updated:** 2026-10-06 11:10
- **Next:** U6, write `tests/contract/readonlyFetch.ts` and its unit test
- **Uncommitted:** none
- **Notes:**
  - `origin/main` was not ahead; `dev-forhad` already equals `migrate/c6-deploy` (`7397bbb`), so there was nothing to merge or port.
  - Photo bodies are streamed to a private temp file (not held in memory) before the sharp checks and `storage.put`, to keep `NS-04`; the plan's "holds at most one 5 MB body" means that file.
  - `i18n-check` runs under the installed Node 26 (needs ≥ 24).
  - U1: the repo has no React component test setup (no jsdom/testing-library), so the `RequireAdmin` and login-page checks are a Playwright test in `e2e/mock/route-protection.spec.ts` that runs only in `admin-rest`. The retry button reloads the page. `HousingLoginPage.tsx` needed no change: it only redirects on `ready` + admin.
  - U2: `pg_trgm` lives in its own `extensions` schema, not `public`. A trusted extension is installed as the bootstrap superuser, so its functions keep PUBLIC `EXECUTE` and the owner can't revoke it; `server/test/db/privileges.test.ts` caught that. The test reset in `server/test/support/global-setup.ts` now drops `extensions` too. Indexes reference `extensions.gin_trgm_ops`.
  - U3: rows travel as `to_jsonb` text and load with `jsonb_populate_recordset` in one statement per table (no 500-row batches), so timestamps keep their microseconds and `details` keeps exact numbers; the serial-change and log JSON is never parsed in JS. Bind that text as `${json}::text::jsonb`: a JS string bound straight to `::jsonb` is JSON-encoded a second time. The report goes to `--report <file>` (mode 600, never overwritten), not stdout. Existing local volumes need `housing_source_test` (`docker compose exec db createdb -U postgres -O housing_owner housing_source_test`). A staging re-run needs `--discard-new-writes` too, because staging's own log rows are newer than the source's.
  - U4: `encodeVariant(image, variant)` plus `VARIANT_WIDTHS`, `WEBP_QUALITY` and `MAX_INPUT_PIXELS` are exported from `server/src/photos/process.ts`. Supabase answers a missing public object with HTTP 400 and a "not found" body, so 400 + "not found" counts as a gap like 404 (to confirm against the local stack in U7). `copyPhotos` stops all workers at the first failure before removing what they wrote.
  - U5: verify compares per-row md5s keyed by id instead of one aggregate checksum, so a failure names the differing ids. An admin hash that is now argon2id counts as matching: a login with the imported hash replaced it. The end-of-import verify runs without `--photos`; a failed check sets exit code 1.
